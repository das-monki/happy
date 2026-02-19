import * as React from 'react';

import { useAuth } from '@/auth/AuthContext';
import { getQuotaSnapshotSealed } from '@/sync/apiQuotas';
import { computeQuotaSummaryBadges } from '@/sync/domains/quotas/computeQuotaBadges';
import { sync } from '@/sync/sync';
import type { QuotaSnapshotV1, QuotaVendor } from '@slopus/happy-wire';

const QUOTA_BADGES_POLL_MS = 30_000;
const QUOTA_BADGES_MISS_RETRY_MS = 30_000;
const QUOTA_BADGES_ERROR_BACKOFF_MIN_MS = 30_000;
const QUOTA_BADGES_ERROR_BACKOFF_MAX_MS = 5 * 60_000;

type SnapshotCacheEntry = Readonly<{
    snapshot: QuotaSnapshotV1 | null;
    nextFetchAtMs: number;
    consecutiveErrors: number;
}>;

function computeErrorBackoffMs(consecutiveErrors: number): number {
    const exp = QUOTA_BADGES_ERROR_BACKOFF_MIN_MS * Math.pow(2, Math.max(0, consecutiveErrors - 1));
    return Math.max(QUOTA_BADGES_ERROR_BACKOFF_MIN_MS, Math.min(QUOTA_BADGES_ERROR_BACKOFF_MAX_MS, Math.trunc(exp)));
}

/**
 * Polls quota snapshots for the given vendors and computes badge text.
 * Returns a record keyed by vendor with badge arrays.
 */
export function useQuotaBadges(
    vendors: ReadonlyArray<QuotaVendor>,
    pinnedMeterIdsByVendor: Readonly<Record<string, ReadonlyArray<string>>>,
): Record<string, Array<{ meterId: string; text: string }>> {
    const auth = useAuth();
    const credentials = auth.credentials;

    const [pollSeq, setPollSeq] = React.useState(0);
    React.useEffect(() => {
        if (!credentials) return;
        const handle = setInterval(() => setPollSeq((value) => value + 1), QUOTA_BADGES_POLL_MS);
        return () => clearInterval(handle);
    }, [credentials]);

    const [cacheByVendor, setCacheByVendor] = React.useState<Record<string, SnapshotCacheEntry>>({});
    const cacheByVendorRef = React.useRef(cacheByVendor);
    React.useEffect(() => {
        cacheByVendorRef.current = cacheByVendor;
    }, [cacheByVendor]);

    React.useEffect(() => {
        if (!credentials) return;

        const now = Date.now();
        const toFetch: Array<{ vendor: QuotaVendor }> = [];
        for (const vendor of vendors) {
            const pinned = pinnedMeterIdsByVendor[vendor] ?? [];
            if (pinned.length === 0) continue;
            const cached = cacheByVendorRef.current[vendor];
            if (cached && now < cached.nextFetchAtMs) continue;
            toFetch.push({ vendor });
        }
        if (toFetch.length === 0) return;

        const controller = new AbortController();
        void (async () => {
            if (!sync.encryption) return;

            await Promise.all(toFetch.map(async (entry) => {
                try {
                    const sealed = await getQuotaSnapshotSealed(credentials, entry.vendor);
                    let opened: QuotaSnapshotV1 | null = null;
                    if (sealed && sync.encryption) {
                        opened = await sync.encryption.decryptSealedQuotaPayload(sealed.sealed.ciphertext);
                    }
                    if (controller.signal.aborted) return;
                    setCacheByVendor((prev) => {
                        const nextFetchAtMs = opened
                            ? now + Math.max(QUOTA_BADGES_POLL_MS, Math.trunc(opened.staleAfterMs ?? QUOTA_BADGES_POLL_MS))
                            : now + QUOTA_BADGES_MISS_RETRY_MS;
                        return {
                            ...prev,
                            [entry.vendor]: {
                                snapshot: opened,
                                nextFetchAtMs,
                                consecutiveErrors: 0,
                            },
                        };
                    });
                } catch {
                    if (controller.signal.aborted) return;
                    setCacheByVendor((prev) => {
                        const existing = prev[entry.vendor];
                        const consecutiveErrors = (existing?.consecutiveErrors ?? 0) + 1;
                        return {
                            ...prev,
                            [entry.vendor]: {
                                snapshot: existing?.snapshot ?? null,
                                nextFetchAtMs: now + computeErrorBackoffMs(consecutiveErrors),
                                consecutiveErrors,
                            },
                        };
                    });
                }
            }));
        })();

        return () => controller.abort();
    }, [credentials, vendors, pinnedMeterIdsByVendor, pollSeq]);

    const badgesByVendor: Record<string, Array<{ meterId: string; text: string }>> = {};
    for (const vendor of vendors) {
        const pinnedMeterIds = pinnedMeterIdsByVendor[vendor] ?? [];
        if (pinnedMeterIds.length === 0) {
            badgesByVendor[vendor] = [];
            continue;
        }
        badgesByVendor[vendor] = computeQuotaSummaryBadges({
            snapshot: cacheByVendor[vendor]?.snapshot ?? null,
            pinnedMeterIds,
        });
    }

    return badgesByVendor;
}
