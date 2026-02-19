import type { QuotaFetcher } from '../types';
import type { QuotaSnapshotV1 } from '@slopus/happy-wire';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function normalizePct(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(100, num));
}

function normalizeResetAtMs(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    // Heuristic: usage APIs commonly return unix seconds.
    return num > 1_000_000_000_000 ? Math.trunc(num) : Math.trunc(num * 1000);
}

export function createOpenAiQuotaFetcher(params?: Readonly<{
    usageUrl?: string;
    staleAfterMs?: number;
    userAgent?: string;
}>): QuotaFetcher {
    const usageUrl = params?.usageUrl ?? 'https://chatgpt.com/backend-api/wham/usage';
    const staleAfterMs =
        typeof params?.staleAfterMs === 'number' && Number.isFinite(params.staleAfterMs)
            ? Math.max(1, Math.trunc(params.staleAfterMs))
            : 300_000;
    const userAgent = params?.userAgent ?? 'happy';

    return {
        vendor: 'openai',
        fetch: async ({ token, now, signal }): Promise<QuotaSnapshotV1 | null> => {
            // OpenAI usage API requires OAuth tokens, not plain API keys
            if (token.startsWith('sk-')) return null;

            const response = await fetch(usageUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'User-Agent': userAgent,
                },
                signal,
            });

            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`OpenAI usage fetch failed (${response.status}): ${body || response.statusText}`);
            }

            const json: unknown = await response.json();
            const data = isRecord(json) ? json : {};

            const planLabel = normalizeNonEmptyString(data.plan_type);
            const rateLimit = isRecord(data.rate_limit) ? data.rate_limit : null;
            const primary = rateLimit && isRecord(rateLimit.primary_window) ? rateLimit.primary_window : null;
            const secondary = rateLimit && isRecord(rateLimit.secondary_window) ? rateLimit.secondary_window : null;

            const sessionPct = normalizePct(primary?.used_percent);
            const weeklyPct = normalizePct(secondary?.used_percent);

            return {
                v: 1,
                vendor: 'openai',
                fetchedAt: now,
                staleAfterMs,
                planLabel,
                accountLabel: null,
                meters: [
                    {
                        meterId: 'session',
                        label: 'Session',
                        used: null,
                        limit: null,
                        unit: 'unknown',
                        utilizationPct: sessionPct,
                        resetsAt: normalizeResetAtMs(primary?.reset_at),
                        status: sessionPct === null ? 'unavailable' : 'ok',
                        details: {},
                    },
                    {
                        meterId: 'weekly',
                        label: 'Weekly',
                        used: null,
                        limit: null,
                        unit: 'unknown',
                        utilizationPct: weeklyPct,
                        resetsAt: normalizeResetAtMs(secondary?.reset_at),
                        status: weeklyPct === null ? 'unavailable' : 'ok',
                        details: {},
                    },
                ],
            };
        },
    };
}
