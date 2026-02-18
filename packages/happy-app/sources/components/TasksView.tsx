import * as React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTasks, useArchivedTasks, useTaskState, useSetting } from '@/sync/storage';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useHappyAction } from '@/hooks/useHappyAction';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';

import { Typography } from '@/constants/Typography';
import { t } from '@/text';

import type { DecryptedTask, TaskState } from '@/sync/taskTypes';

/** Extract project name from the task directory (last path segment). */
function projectName(task: DecryptedTask): string | null {
    const dir = task.directory;
    if (!dir) return null;
    const trimmed = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    const last = trimmed.split('/').pop();
    return last && last !== '~' ? last : null;
}

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

/**
 * Wraps TaskRow in a Swipeable for completed/failed tasks (native only).
 * Swiping left reveals an amber "Archive" action.
 */
const SwipeableTaskRow = React.memo(function SwipeableTaskRow({ task }: { task: DecryptedTask }) {
    const state = useTaskState(task.id);
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web' && (state === 'completed' || state === 'failed');

    const [archiving, performArchive] = useHappyAction(async () => {
        await sync.updateTaskHeader(task.id, { archived: true });
    });

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.alert(
            t('tasks.archiveConfirmTitle'),
            t('tasks.archiveConfirmMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('tasks.archive'),
                    onPress: performArchive,
                },
            ],
        );
    }, [performArchive]);

    if (!swipeEnabled) {
        return <TaskRow task={task} />;
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={handleArchive}
            disabled={archiving}
        >
            <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText}>{t('tasks.archive')}</Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!archiving}
        >
            <TaskRow task={task} />
        </Swipeable>
    );
});

interface TasksViewProps {
    directoryFilter?: string | null;
}

export const TasksView = React.memo(function TasksView({ directoryFilter = null }: TasksViewProps) {
    const { theme } = useUnistyles();
    const tasks = useTasks();
    const archivedTasks = useArchivedTasks();
    const showArchivedTasks = useSetting('showArchivedTasks');

    /** Group tasks by directory, sorted alphabetically by display name. */
    const groups = React.useMemo(() => {
        const filtered = directoryFilter
            ? tasks.filter(task => task.directory === directoryFilter)
            : tasks;
        const map = new Map<string, { displayName: string; tasks: DecryptedTask[] }>();
        for (const task of filtered) {
            const dir = task.directory || '';
            if (!map.has(dir)) {
                const name = projectName(task);
                map.set(dir, { displayName: name || t('tasks.title'), tasks: [] });
            }
            map.get(dir)!.tasks.push(task);
        }
        return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [tasks, directoryFilter]);

    /** Archived tasks filtered by directory. */
    const filteredArchivedTasks = React.useMemo(() => {
        if (!showArchivedTasks) return [];
        return directoryFilter
            ? archivedTasks.filter(task => task.directory === directoryFilter)
            : archivedTasks;
    }, [showArchivedTasks, archivedTasks, directoryFilter]);

    if (tasks.length === 0 && filteredArchivedTasks.length === 0) {
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
                {groups.map((group) => (
                    <ItemGroup key={group.displayName} title={group.displayName}>
                        {group.tasks.map(task => (
                            <SwipeableTaskRow key={task.id} task={task} />
                        ))}
                    </ItemGroup>
                ))}
                {filteredArchivedTasks.length > 0 && (
                    <ItemGroup title={t('tasks.archivedGroup')}>
                        {filteredArchivedTasks.map(task => (
                            <TaskRow key={task.id} task={task} />
                        ))}
                    </ItemGroup>
                )}
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
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FF9500',
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));
