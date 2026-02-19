import { randomBytes } from 'node:crypto';
import type { Credentials } from '@/persistence';
import type { QuotaFetcher, QuotaVendor } from './types';
import type { QuotaSnapshotV1 } from '@slopus/happy-wire';
import { sealQuotaSnapshot } from '@/api/quotaEncryption';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { discoverLocalTokens } from './discoverLocalTokens';

type QuotaSnapshotResponse = Readonly<{
    sealed: Readonly<{ format: string; ciphertext: string }>;
    metadata: Readonly<{
        fetchedAt: number;
        staleAfterMs: number;
        status: string;
        refreshRequestedAt?: number;
    }>;
}> | null;

type FailureState = Readonly<{
    consecutiveFailures: number;
    nextAllowedAt: number;
}>;

function deriveQuotaSnapshotStatus(snapshot: QuotaSnapshotV1): 'ok' | 'unavailable' | 'estimated' {
    const meters = Array.isArray(snapshot.meters) ? snapshot.meters : [];
    if (meters.length === 0) return 'ok';
    const statuses = meters.map((m) => m.status);
    if (statuses.every((s) => s === 'unavailable')) return 'unavailable';
    if (statuses.some((s) => s === 'estimated')) return 'estimated';
    return 'ok';
}

export class QuotaCoordinator {
    private readonly credentials: Credentials;
    private readonly fetchersByVendor: Map<QuotaVendor, QuotaFetcher>;
    private readonly fetchTimeoutMs: number;
    private readonly failureBackoffMinMs: number;
    private readonly failureBackoffMaxMs: number;
    private readonly failureStateByVendor = new Map<QuotaVendor, FailureState>();

    constructor(params: Readonly<{
        credentials: Credentials;
        fetchers: ReadonlyArray<QuotaFetcher>;
        fetchTimeoutMs?: number;
        failureBackoffMinMs?: number;
        failureBackoffMaxMs?: number;
    }>) {
        this.credentials = params.credentials;
        this.fetchersByVendor = new Map(params.fetchers.map((f) => [f.vendor, f]));
        this.fetchTimeoutMs = params.fetchTimeoutMs ?? 15_000;
        this.failureBackoffMinMs = params.failureBackoffMinMs ?? 30_000;
        this.failureBackoffMaxMs = params.failureBackoffMaxMs ?? 10 * 60_000;
    }

    private computeJitteredBackoffMs(baseMs: number): number {
        const bytes = randomBytes(4);
        const u32 = ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
        const normalized = (u32 >>> 0) / 0xffffffff;
        const factor = 0.8 + normalized * 0.4; // ±20% jitter
        return Math.max(1, Math.trunc(baseMs * factor));
    }

    private applyFailureBackoff(vendor: QuotaVendor, now: number): void {
        const existing = this.failureStateByVendor.get(vendor);
        const consecutiveFailures = Math.min((existing?.consecutiveFailures ?? 0) + 1, 30);
        const expMs = this.failureBackoffMinMs * Math.pow(2, consecutiveFailures - 1);
        const cappedMs = Math.min(expMs, this.failureBackoffMaxMs);
        const jitteredMs = this.computeJitteredBackoffMs(cappedMs);
        this.failureStateByVendor.set(vendor, {
            consecutiveFailures,
            nextAllowedAt: now + jitteredMs,
        });
    }

    async tickOnce(): Promise<void> {
        const now = Date.now();
        const serverUrl = configuration.serverUrl;
        const token = this.credentials.token;

        // List registered vendor tokens from server
        let registeredVendors: Array<{ vendor: string; token: string }>;
        try {
            const response = await fetch(`${serverUrl}/v1/connect/tokens`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json() as { tokens: Array<{ vendor: string; token: string }> };
            registeredVendors = data.tokens ?? [];
        } catch {
            return;
        }

        // Merge locally discovered OAuth tokens (from Claude Code keychain, Codex auth.json, etc.)
        const localTokens = discoverLocalTokens();
        const vendorTokenMap = new Map<string, string>();
        for (const entry of registeredVendors) {
            if (entry.token) vendorTokenMap.set(entry.vendor, entry.token);
        }
        for (const entry of localTokens) {
            if (!vendorTokenMap.has(entry.vendor)) {
                vendorTokenMap.set(entry.vendor, entry.token);
            }
        }
        registeredVendors = Array.from(vendorTokenMap.entries()).map(([vendor, vendorToken]) => ({ vendor, token: vendorToken }));

        for (const { vendor: vendorRaw, token: vendorToken } of registeredVendors) {
            const vendor = vendorRaw as QuotaVendor;
            const fetcher = this.fetchersByVendor.get(vendor);
            if (!fetcher) continue;
            if (!vendorToken) continue;

            try {
                // Check existing snapshot for staleness
                let existing: QuotaSnapshotResponse = null;
                try {
                    const res = await fetch(`${serverUrl}/v1/connect/${vendor}/quotas`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}` },
                    });
                    if (res.ok) {
                        existing = await res.json() as QuotaSnapshotResponse;
                    }
                } catch {
                    // Best-effort
                }

                const forcedRefresh = (() => {
                    const fetchedAt = Number(existing?.metadata?.fetchedAt ?? 0);
                    const refreshRequestedAt = Number(existing?.metadata?.refreshRequestedAt ?? 0);
                    return Number.isFinite(refreshRequestedAt) && refreshRequestedAt > 0 && refreshRequestedAt > fetchedAt;
                })();

                // Check failure backoff
                const failureState = this.failureStateByVendor.get(vendor);
                if (!forcedRefresh && failureState && now < failureState.nextAllowedAt) {
                    continue;
                }

                // Check freshness
                if (!forcedRefresh && existing?.metadata) {
                    const fetchedAt = Number(existing.metadata.fetchedAt ?? 0);
                    const staleAfterMs = Number(existing.metadata.staleAfterMs ?? 0);
                    if (Number.isFinite(fetchedAt) && Number.isFinite(staleAfterMs) && fetchedAt > 0 && staleAfterMs > 0) {
                        if (now < fetchedAt + staleAfterMs) {
                            this.failureStateByVendor.delete(vendor);
                            continue;
                        }
                    }
                }

                // Fetch quota with timeout
                const controller = new AbortController();
                let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                    try { controller.abort('quota-fetch-timeout'); } catch { /* ignore */ }
                }, this.fetchTimeoutMs);
                (timeoutHandle as unknown as { unref?: () => void })?.unref?.();

                let snapshot: QuotaSnapshotV1 | null;
                try {
                    snapshot = await fetcher.fetch({ token: vendorToken, now, signal: controller.signal });
                } finally {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }

                if (!snapshot) continue;

                // Seal and upload
                const sealed = sealQuotaSnapshot(this.credentials, snapshot);
                const status = deriveQuotaSnapshotStatus(snapshot);

                await fetch(`${serverUrl}/v1/connect/${vendor}/quotas`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        sealed: { format: sealed.format, ciphertext: sealed.ciphertext },
                        metadata: { fetchedAt: snapshot.fetchedAt, staleAfterMs: snapshot.staleAfterMs, status },
                    }),
                });

                this.failureStateByVendor.delete(vendor);
                logger.debug(`[QUOTA] Updated quota snapshot for ${vendor}`);
            } catch (error) {
                this.applyFailureBackoff(vendor, now);
                logger.debug(`[QUOTA] Error fetching quota for ${vendor}:`, error);
                continue;
            }
        }
    }
}
