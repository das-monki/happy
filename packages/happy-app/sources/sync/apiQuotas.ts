import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';

import type { SealedQuotaSnapshotFormat } from '@slopus/happy-wire';

export type QuotaSnapshotSealedResponse = Readonly<{
    sealed: Readonly<{ format: SealedQuotaSnapshotFormat; ciphertext: string }>;
    metadata: Readonly<{
        fetchedAt: number;
        staleAfterMs: number;
        status: 'ok' | 'unavailable' | 'estimated' | 'error';
        refreshRequestedAt?: number;
    }>;
}>;

export async function getQuotaSnapshotSealed(
    credentials: AuthCredentials,
    vendor: string,
): Promise<QuotaSnapshotSealedResponse | null> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(
            `${API_ENDPOINT}/v1/connect/${encodeURIComponent(vendor)}/quotas`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${credentials.token}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (response.status === 404) return null;

        if (!response.ok) {
            throw new Error(`Failed to load quotas for ${vendor}: ${response.status}`);
        }

        return await response.json() as QuotaSnapshotSealedResponse;
    });
}

export async function requestQuotaSnapshotRefresh(
    credentials: AuthCredentials,
    vendor: string,
): Promise<boolean> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(
            `${API_ENDPOINT}/v1/connect/${encodeURIComponent(vendor)}/quotas/refresh`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${credentials.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            },
        );

        if (response.status === 404) return false;

        if (!response.ok) {
            throw new Error(`Failed to request quota refresh for ${vendor}: ${response.status}`);
        }

        return true;
    });
}
