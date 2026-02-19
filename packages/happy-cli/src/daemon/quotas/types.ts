import type { QuotaVendor, QuotaSnapshotV1 } from '@slopus/happy-wire';

export type { QuotaVendor };

export type QuotaFetcher = Readonly<{
    vendor: QuotaVendor;
    fetch: (params: Readonly<{
        token: string;
        now: number;
        signal: AbortSignal;
    }>) => Promise<QuotaSnapshotV1 | null>;
}>;
