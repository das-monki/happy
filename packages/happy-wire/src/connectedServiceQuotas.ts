import * as z from 'zod';

export const QuotaVendorSchema = z.enum(['openai', 'anthropic', 'gemini']);
export type QuotaVendor = z.infer<typeof QuotaVendorSchema>;

export const QuotaUnitV1Schema = z.enum([
    'count',
    'tokens',
    'credits',
    'usd',
    'requests',
    'unknown',
]);
export type QuotaUnitV1 = z.infer<typeof QuotaUnitV1Schema>;

export const QuotaMeterV1Schema = z.object({
    meterId: z.string().min(1),
    label: z.string().min(1),
    used: z.number().finite().nullable(),
    limit: z.number().finite().nullable(),
    unit: QuotaUnitV1Schema,
    utilizationPct: z.number().finite().min(0).max(100).nullable(),
    resetsAt: z.number().int().nonnegative().nullable(),
    status: z.enum(['ok', 'unavailable', 'estimated']),
    details: z
        .object({
            note: z.string().min(1).nullable().optional(),
        })
        .optional()
        .default({}),
});
export type QuotaMeterV1 = z.infer<typeof QuotaMeterV1Schema>;

export const QuotaSnapshotV1Schema = z.object({
    v: z.literal(1),
    vendor: QuotaVendorSchema,
    fetchedAt: z.number().int().nonnegative(),
    staleAfterMs: z.number().int().min(1),
    planLabel: z.string().min(1).nullable(),
    accountLabel: z.string().min(1).nullable(),
    meters: z.array(QuotaMeterV1Schema),
});
export type QuotaSnapshotV1 = z.infer<typeof QuotaSnapshotV1Schema>;

export const SealedQuotaSnapshotFormatSchema = z.enum(['nacl_box_v1', 'legacy_secretbox_v1']);
export type SealedQuotaSnapshotFormat = z.infer<typeof SealedQuotaSnapshotFormatSchema>;

export const SealedQuotaSnapshotSchema = z.object({
    format: SealedQuotaSnapshotFormatSchema,
    ciphertext: z.string().min(1),
});
export type SealedQuotaSnapshot = z.infer<typeof SealedQuotaSnapshotSchema>;
