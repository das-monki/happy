import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import type { QuotaMeterV1 } from '@slopus/happy-wire';
import { clampQuotaPct, deriveQuotaUtilizationPct } from '@/sync/domains/quotas/deriveQuotaUtilizationPct';

function formatResetCountdown(nowMs: number, resetsAtMs: number | null): string | null {
    if (!resetsAtMs) return null;
    const delta = resetsAtMs - nowMs;
    if (!Number.isFinite(delta) || delta <= 0) return 'now';

    const totalMinutes = Math.floor(delta / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
    const minutes = totalMinutes - days * 60 * 24 - hours * 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export const QuotaMeterRow = React.memo(function QuotaMeterRow(props: Readonly<{
    meter: QuotaMeterV1;
    nowMs: number;
    pinned: boolean;
    onTogglePin: () => void;
}>) {
    const { theme } = useUnistyles();

    const utilization = deriveQuotaUtilizationPct(props.meter);
    const remaining = utilization === null ? null : clampQuotaPct(100 - utilization);
    const remainingText = remaining === null ? '—' : `${Math.round(remaining)}%`;
    const resetText = formatResetCountdown(props.nowMs, props.meter.resetsAt);
    const right = resetText ? `${remainingText}  ${resetText}` : remainingText;

    const usageText =
        typeof props.meter.used === 'number' && typeof props.meter.limit === 'number'
            ? `${props.meter.used}/${props.meter.limit}`
            : null;

    return (
        <View style={[styles.container, { borderBottomColor: theme.colors.divider }]}>
            <Text style={[styles.label, { color: theme.colors.text }]}>{props.meter.label}</Text>
            <View style={styles.subtitleRow}>
                <View style={[styles.barOuter, { backgroundColor: theme.colors.surfacePressedOverlay }]}>
                    <View style={[styles.barInner, { width: `${utilization ?? 0}%`, backgroundColor: theme.colors.success }]} />
                </View>
                <Text style={[styles.rightText, { color: theme.colors.textSecondary }]}>{right}</Text>
            </View>
            {usageText ? <Text style={[styles.usageText, { color: theme.colors.textSecondary }]}>{usageText}</Text> : null}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 0.5,
    },
    label: {
        fontSize: 15,
        fontWeight: '500',
        marginBottom: 6,
    },
    subtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    barOuter: {
        flex: 1,
        height: 6,
        borderRadius: 999,
        overflow: 'hidden',
    },
    barInner: {
        height: 6,
        borderRadius: 999,
    },
    usageText: {
        fontSize: 12,
        lineHeight: 16,
        marginTop: 4,
    },
    rightText: {
        minWidth: 74,
        textAlign: 'right',
        fontSize: 12,
        lineHeight: 16,
    },
});
