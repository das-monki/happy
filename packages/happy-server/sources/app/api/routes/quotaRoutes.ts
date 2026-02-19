import { z } from "zod";
import { type Fastify } from "../types";
import { db } from "@/storage/db";

const VendorParamsSchema = z.object({
    vendor: z.enum(['openai', 'anthropic', 'gemini']),
});

const MAX_QUOTA_SNAPSHOT_CIPHERTEXT_CHARS = 200_000;

const quotaSnapshotEncoder = new TextEncoder();
const quotaSnapshotDecoder = new TextDecoder();

function toPrismaBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    if (bytes.buffer instanceof ArrayBuffer) {
        const sliced = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        return new Uint8Array(sliced);
    }
    const buffer = new ArrayBuffer(bytes.byteLength);
    const copy = new Uint8Array(buffer);
    copy.set(bytes);
    return copy;
}

function encodeQuotaSnapshotBytes(ciphertext: string): Uint8Array<ArrayBuffer> {
    return toPrismaBytes(quotaSnapshotEncoder.encode(ciphertext));
}

function decodeQuotaSnapshotCiphertext(bytes: Uint8Array): string {
    return quotaSnapshotDecoder.decode(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function quotaRoutes(app: Fastify) {

    // Upload sealed quota snapshot
    app.post("/v1/connect/:vendor/quotas", {
        preHandler: app.authenticate,
        schema: {
            params: VendorParamsSchema,
            body: z.object({
                sealed: z.object({
                    format: z.enum(['nacl_box_v1', 'legacy_secretbox_v1']),
                    ciphertext: z.string().min(1).max(MAX_QUOTA_SNAPSHOT_CIPHERTEXT_CHARS),
                }),
                metadata: z.object({
                    fetchedAt: z.number().int().nonnegative(),
                    staleAfterMs: z.number().int().nonnegative(),
                    status: z.enum(["ok", "unavailable", "estimated", "error"]),
                }),
            }),
            response: { 200: z.object({ success: z.literal(true) }) },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const vendor = request.params.vendor;
        const sealed = request.body.sealed;
        const meta = request.body.metadata;

        const metadata: Record<string, unknown> = { v: 1, format: sealed.format };

        await db.serviceAccountQuotaSnapshot.upsert({
            where: { accountId_vendor: { accountId: userId, vendor } },
            update: {
                updatedAt: new Date(),
                snapshot: encodeQuotaSnapshotBytes(sealed.ciphertext),
                status: meta.status,
                fetchedAt: new Date(meta.fetchedAt),
                staleAfterMs: meta.staleAfterMs,
                metadata,
            },
            create: {
                accountId: userId,
                vendor,
                snapshot: encodeQuotaSnapshotBytes(sealed.ciphertext),
                status: meta.status,
                fetchedAt: new Date(meta.fetchedAt),
                staleAfterMs: meta.staleAfterMs,
                metadata,
            },
        });

        return reply.send({ success: true });
    });

    // Fetch sealed quota snapshot
    app.get("/v1/connect/:vendor/quotas", {
        preHandler: app.authenticate,
        schema: {
            params: VendorParamsSchema,
            response: {
                200: z.object({
                    sealed: z.object({
                        format: z.enum(['nacl_box_v1', 'legacy_secretbox_v1']),
                        ciphertext: z.string(),
                    }),
                    metadata: z.object({
                        fetchedAt: z.number().int().nonnegative(),
                        staleAfterMs: z.number().int().nonnegative(),
                        status: z.enum(["ok", "unavailable", "estimated", "error"]),
                        refreshRequestedAt: z.number().int().nonnegative().optional(),
                    }),
                }),
                404: z.object({ error: z.string() }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const vendor = request.params.vendor;

        const row = await db.serviceAccountQuotaSnapshot.findUnique({
            where: { accountId_vendor: { accountId: userId, vendor } },
            select: { snapshot: true, fetchedAt: true, staleAfterMs: true, status: true, metadata: true },
        });
        if (!row) return reply.code(404).send({ error: "quotas_not_found" });

        const rowMetadata = isRecord(row.metadata) ? row.metadata : null;
        const format = rowMetadata?.format === "nacl_box_v1" ? "nacl_box_v1" as const
            : rowMetadata?.format === "legacy_secretbox_v1" ? "legacy_secretbox_v1" as const
            : "nacl_box_v1" as const;
        const refreshRequestedAt =
            typeof rowMetadata?.refreshRequestedAt === "number"
                ? Math.max(0, Math.trunc(rowMetadata.refreshRequestedAt))
                : undefined;
        const status =
            row.status === "ok" || row.status === "unavailable" || row.status === "estimated" || row.status === "error"
                ? row.status
                : "ok";

        const ciphertext = decodeQuotaSnapshotCiphertext(row.snapshot);
        if (!ciphertext.trim()) {
            return reply.code(404).send({ error: "quotas_not_found" });
        }

        return reply.send({
            sealed: { format, ciphertext },
            metadata: {
                fetchedAt: row.fetchedAt ? row.fetchedAt.getTime() : Date.now(),
                staleAfterMs: typeof row.staleAfterMs === "number" ? row.staleAfterMs : 0,
                status,
                ...(refreshRequestedAt !== undefined ? { refreshRequestedAt } : {}),
            },
        });
    });

    // Request quota refresh
    app.post("/v1/connect/:vendor/quotas/refresh", {
        preHandler: app.authenticate,
        schema: {
            params: VendorParamsSchema,
            response: {
                200: z.object({ success: z.literal(true) }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const vendor = request.params.vendor;

        const where = { accountId_vendor: { accountId: userId, vendor } };
        const existing = await db.serviceAccountQuotaSnapshot.findUnique({ where, select: { metadata: true } });

        const baseMetadata = isRecord(existing?.metadata) ? existing?.metadata : {};
        const nextMetadata: Record<string, unknown> = {
            ...baseMetadata,
            v: 1,
            format: baseMetadata.format ?? "nacl_box_v1",
            refreshRequestedAt: Date.now(),
        };

        await db.serviceAccountQuotaSnapshot.upsert({
            where,
            update: {
                updatedAt: new Date(),
                metadata: nextMetadata,
            },
            create: {
                accountId: userId,
                vendor,
                snapshot: encodeQuotaSnapshotBytes(""),
                status: null,
                fetchedAt: null,
                staleAfterMs: 0,
                metadata: nextMetadata,
            },
        });

        return reply.send({ success: true });
    });

    // Delete quota snapshot
    app.delete("/v1/connect/:vendor/quotas", {
        preHandler: app.authenticate,
        schema: {
            params: VendorParamsSchema,
            response: {
                200: z.object({ success: z.literal(true) }),
                404: z.object({ error: z.string() }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const vendor = request.params.vendor;

        const existing = await db.serviceAccountQuotaSnapshot.findUnique({
            where: { accountId_vendor: { accountId: userId, vendor } },
            select: { id: true },
        });
        if (!existing) return reply.code(404).send({ error: "quotas_not_found" });

        await db.serviceAccountQuotaSnapshot.delete({ where: { id: existing.id } });
        return reply.send({ success: true });
    });
}
