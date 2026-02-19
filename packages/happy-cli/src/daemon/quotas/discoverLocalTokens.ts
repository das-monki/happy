import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';

import type { QuotaVendor } from './types';

type LocalToken = { vendor: QuotaVendor; token: string };

/**
 * Reads the Anthropic OAuth token from the macOS Keychain (Claude Code credentials).
 * Returns null if unavailable.
 */
function readAnthropicOAuthToken(): string | null {
    try {
        const raw = execFileSync(
            'security',
            ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
            { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const accessToken = parsed?.claudeAiOauth?.accessToken;
        if (typeof accessToken === 'string' && accessToken.length > 0) return accessToken;
        return null;
    } catch {
        return null;
    }
}

/**
 * Reads the OpenAI OAuth token from ~/.codex/auth.json (Codex CLI credentials).
 * Returns null if unavailable.
 */
function readOpenAiOAuthToken(): string | null {
    try {
        const authPath = join(homedir(), '.codex', 'auth.json');
        const raw = readFileSync(authPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const accessToken = parsed?.tokens?.access_token;
        if (typeof accessToken === 'string' && accessToken.length > 0) return accessToken;
        return null;
    } catch {
        return null;
    }
}

/**
 * Discovers locally stored OAuth tokens from CLI tool credential stores.
 * Returns tokens found for each vendor.
 */
export function discoverLocalTokens(): LocalToken[] {
    const tokens: LocalToken[] = [];

    const anthropicToken = readAnthropicOAuthToken();
    if (anthropicToken) {
        logger.debug('[QUOTA] Discovered local Anthropic OAuth token');
        tokens.push({ vendor: 'anthropic', token: anthropicToken });
    }

    const openAiToken = readOpenAiOAuthToken();
    if (openAiToken) {
        logger.debug('[QUOTA] Discovered local OpenAI OAuth token');
        tokens.push({ vendor: 'openai', token: openAiToken });
    }

    return tokens;
}
