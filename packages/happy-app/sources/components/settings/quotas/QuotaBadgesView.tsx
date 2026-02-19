import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';

export const QuotaBadgesView = React.memo(function QuotaBadgesView(props: Readonly<{
    badges: ReadonlyArray<{ meterId: string; text: string }>;
}>) {
    const { theme } = useUnistyles();

    if (!props.badges || props.badges.length === 0) return null;

    return (
        <View style={styles.container}>
            {props.badges.map((badge) => (
                <View key={badge.meterId} style={[styles.badge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
                    <Text style={[styles.text, { color: theme.colors.textSecondary }]}>{badge.text}</Text>
                </View>
            ))}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 6,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
    },
    text: {
        fontSize: 12,
        lineHeight: 16,
    },
});
