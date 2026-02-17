import * as React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTasks, useTaskState } from '@/sync/storage';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { layout } from '@/components/layout';
import type { DecryptedTask, TaskState } from '@/sync/taskTypes';

/**
 * Badge colors and labels for each derived task state.
 */
function getStateBadge(state: TaskState, theme: any): { color: string; label: string } {
    switch (state) {
        case 'running':
            return { color: '#007AFF', label: t('tasks.stateRunning') };
        case 'waiting_input':
            return { color: '#FF9500', label: t('tasks.stateWaiting') };
        case 'completed':
            return { color: '#34C759', label: t('tasks.stateCompleted') };
        case 'failed':
            return { color: '#FF3B30', label: t('tasks.stateFailed') };
        case 'pending':
        default:
            return { color: theme.colors.textSecondary, label: t('tasks.statePending') };
    }
}

/**
 * Single task row showing derived state badge.
 */
const TaskRow = React.memo(function TaskRow({ task }: { task: DecryptedTask }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const state = useTaskState(task.id);
    const badge = getStateBadge(state, theme);

    return (
        <Item
            title={task.title || t('tasks.untitled')}
            subtitle={task.description || undefined}
            subtitleLines={1}
            rightElement={
                <View style={styles.badgeRow}>
                    <View style={[styles.stateDot, { backgroundColor: badge.color }]} />
                    <Text style={[styles.badgeLabel, { color: badge.color }]}>{badge.label}</Text>
                </View>
            }
            dividerInset={-16}
            onPress={() => router.push(`/task/${task.id}`)}
        />
    );
});

export const TasksView = React.memo(function TasksView() {
    const { theme } = useUnistyles();
    const tasks = useTasks();

    if (tasks.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.emptyContainer}>
                    <Image
                        source={require('@/assets/images/brutalist/Brutalism 44.png')}
                        contentFit="contain"
                        style={[{ width: 64, height: 64 }, styles.emptyIcon]}
                        tintColor={theme.colors.textSecondary}
                    />
                    <Text style={styles.emptyTitle}>{t('tasks.emptyTitle')}</Text>
                    <Text style={styles.emptyDescription}>{t('tasks.emptyDescription')}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ItemList style={{ paddingTop: 0 }}>
                <ItemGroup title={t('tasks.title')}>
                    {tasks.map(task => (
                        <TaskRow key={task.id} task={task} />
                    ))}
                </ItemGroup>
            </ItemList>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyDescription: {
        fontSize: 16,
        ...Typography.default(),
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stateDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    badgeLabel: {
        ...Typography.default('regular'),
        fontSize: 15,
    },
}));
