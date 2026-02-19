import type { QuotaFetcher } from '../types';

export function createGeminiQuotaFetcher(): QuotaFetcher {
    return {
        vendor: 'gemini',
        fetch: async () => null,
    };
}
