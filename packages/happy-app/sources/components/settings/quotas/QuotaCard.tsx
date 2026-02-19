import * as React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Text } from '@/components/StyledText';
import { useAuth } from '@/auth/AuthContext';
import { getQuotaSnapshotSealed, requestQuotaSnapshotRefresh } from '@/sync/apiQuotas';
import { sync } from '@/sync/sync';
import type { QuotaSnapshotV1, QuotaVendor } from '@slopus/happy-wire';

import { QuotaMeterRow } from './QuotaMeterRow';

function formatTimestamp(ms: number): string {
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return String(ms);
    }
}

function sleep(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const QuotaCard = React.memo(function QuotaCard(props: Readonly<{
    vendor: QuotaVendor;
    title: string;
    pinnedMeterIds: ReadonlyArray<string>;
    onSetPinnedMeterIds: (next: ReadonlyArray<string>) => void;
}>) {
    const auth = useAuth();
    const credentials = auth.credentials;

    const [snapshot, setSnapshot] = React.useState<QuotaSnapshotV1 | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const loadPromiseRef = React.useRef<Promise<QuotaSnapshotV1 | null> | null>(null);

    const load = React.useCallback(async (): Promise<QuotaSnapshotV1 | null> => {
        if (!credentials) return null;
        setLoading(true);
        setError(null);
        try {
            const sealed = await getQuotaSnapshotSealed(credentials, props.vendor);
            if (!sealed) {
                setSnapshot(null);
                return null;
            }
            if (!sync.encryption) {
                setSnapshot(null);
                return null;
            }
            const opened = await sync.encryption.decryptSealedQuotaPayload(sealed.sealed.ciphertext);
            setSnapshot(opened);
            return opened;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSnapshot(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, [credentials, props.vendor]);

    const loadTracked = React.useCallback(() => {
        const promise = load();
        loadPromiseRef.current = promise;
        return promise;
    }, [load]);

    React.useEffect(() => {
        void loadTracked();
    }, [loadTracked]);

    const requestRefreshAndReload = React.useCallback(async () => {
        if (!credentials) return;
        const inFlightFetchedAt = (await loadPromiseRef.current
            ?.then((s) => s?.fetchedAt ?? 0)
            .catch(() => 0)) ?? 0;
        const sinceFetchedAt = Math.max(snapshot?.fetchedAt ?? 0, inFlightFetchedAt);
        try {
            await requestQuotaSnapshotRefresh(credentials, props.vendor);
        } catch {
            // Best-effort only.
        }
        const delaysMs = [0, 250, 500, 1_000, 2_000, 3_000, 4_000];
        for (const delayMs of delaysMs) {
            await sleep(delayMs);
            const opened = await loadTracked();
            if (opened && opened.fetchedAt > sinceFetchedAt) break;
        }
    }, [credentials, props.vendor, loadTracked, snapshot?.fetchedAt]);

    const nowMs = Date.now();
    const isStale = snapshot ? nowMs - snapshot.fetchedAt > snapshot.staleAfterMs : false;

    const togglePin = (meterId: string) => {
        const existing = props.pinnedMeterIds ?? [];
        if (existing.includes(meterId)) {
            props.onSetPinnedMeterIds(existing.filter((id) => id !== meterId));
            return;
        }
        props.onSetPinnedMeterIds([...existing, meterId]);
    };

    return (
        <ItemGroup title={props.title}>
            <Item
                title="Refresh"
                subtitle={loading ? 'Loading…' : error ? `Error: ${error}` : snapshot ? `Last updated: ${formatTimestamp(snapshot.fetchedAt)}${isStale ? ' • stale' : ''}` : 'No quota data yet'}
                icon={<Ionicons name="refresh-outline" size={22} color="#007AFF" />}
                onPress={() => void requestRefreshAndReload()}
                showChevron={false}
            />

            {snapshot?.planLabel ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}>
                    <Text style={{ opacity: 0.7 }}>{`Plan: ${snapshot.planLabel}`}</Text>
                </View>
            ) : null}

            {snapshot?.meters?.filter((m) => m.status !== 'unavailable').map((meter) => (
                <QuotaMeterRow
                    key={meter.meterId}
                    meter={meter}
                    nowMs={nowMs}
                    pinned={(props.pinnedMeterIds ?? []).includes(meter.meterId)}
                    onTogglePin={() => togglePin(meter.meterId)}
                />
            ))}
        </ItemGroup>
    );
});
