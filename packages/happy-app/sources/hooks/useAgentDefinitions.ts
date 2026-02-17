import * as React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { kvGetByPrefix, kvSet, kvDelete, KvItem } from '@/sync/apiKv';
import { randomUUID } from 'expo-crypto';
import { encodeBase64, decodeBase64 } from '@/encryption/base64';

/**
 * Agent definition stored in KV store with key pattern `agent:{uuid}`.
 * Value is encrypted JSON containing the agent's configuration.
 */
export interface AgentDefinition {
    id: string; // UUID portion of the key
    name: string;
    description: string;
    promptTemplate: string;
    model?: string;
    color?: string;
    version: number; // KV version for OCC
}

interface AgentDefinitionsState {
    agents: AgentDefinition[];
    loading: boolean;
    refresh: () => Promise<void>;
    createAgent: (def: Omit<AgentDefinition, 'id' | 'version'>) => Promise<string>;
    updateAgent: (id: string, def: Partial<Omit<AgentDefinition, 'id' | 'version'>>) => Promise<void>;
    deleteAgent: (id: string) => Promise<void>;
}

/**
 * Hook for managing agent definitions stored in the server-side KV store.
 * Agent keys follow the pattern `agent:{uuid}`.
 * Values are encrypted JSON with agent configuration.
 */
export function useAgentDefinitions(): AgentDefinitionsState {
    const { credentials } = useAuth();
    const [agents, setAgents] = React.useState<AgentDefinition[]>([]);
    const [loading, setLoading] = React.useState(true);

    const refresh = React.useCallback(async () => {
        if (!credentials) return;

        try {
            const items = await kvGetByPrefix(credentials, 'agent:');
            const parsed: AgentDefinition[] = [];

            for (const item of items) {
                try {
                    const bytes = decodeBase64(item.value);
                    const jsonStr = new TextDecoder().decode(bytes);
                    const data = JSON.parse(jsonStr);
                    const id = item.key.replace('agent:', '');
                    parsed.push({
                        id,
                        name: data.name || '',
                        description: data.description || '',
                        promptTemplate: data.promptTemplate || '',
                        model: data.model,
                        color: data.color,
                        version: item.version,
                    });
                } catch {
                    // Skip invalid entries
                }
            }

            setAgents(parsed.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error('Failed to fetch agent definitions:', error);
        } finally {
            setLoading(false);
        }
    }, [credentials]);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    const createAgent = React.useCallback(async (def: Omit<AgentDefinition, 'id' | 'version'>): Promise<string> => {
        if (!credentials) throw new Error('Not authenticated');

        const id = randomUUID();
        const key = `agent:${id}`;
        const jsonStr = JSON.stringify({
            name: def.name,
            description: def.description,
            promptTemplate: def.promptTemplate,
            model: def.model,
            color: def.color,
        });
        const value = encodeBase64(new TextEncoder().encode(jsonStr));

        await kvSet(credentials, key, value, -1);
        await refresh();
        return id;
    }, [credentials, refresh]);

    const updateAgent = React.useCallback(async (id: string, def: Partial<Omit<AgentDefinition, 'id' | 'version'>>): Promise<void> => {
        if (!credentials) throw new Error('Not authenticated');

        const existing = agents.find(a => a.id === id);
        if (!existing) throw new Error('Agent not found');

        const key = `agent:${id}`;
        const jsonStr = JSON.stringify({
            name: def.name ?? existing.name,
            description: def.description ?? existing.description,
            promptTemplate: def.promptTemplate ?? existing.promptTemplate,
            model: def.model ?? existing.model,
            color: def.color ?? existing.color,
        });
        const value = encodeBase64(new TextEncoder().encode(jsonStr));

        await kvSet(credentials, key, value, existing.version);
        await refresh();
    }, [credentials, agents, refresh]);

    const deleteAgent = React.useCallback(async (id: string): Promise<void> => {
        if (!credentials) throw new Error('Not authenticated');

        const existing = agents.find(a => a.id === id);
        if (!existing) throw new Error('Agent not found');

        await kvDelete(credentials, `agent:${id}`, existing.version);
        await refresh();
    }, [credentials, agents, refresh]);

    return { agents, loading, refresh, createAgent, updateAgent, deleteAgent };
}
