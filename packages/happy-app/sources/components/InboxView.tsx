import * as React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useWaitingTasks, useRealtimeStatus, useTaskSessions } from '@/sync/storage';
import { t } from '@/text';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { UpdateBanner } from './UpdateBanner';
import { Typography } from '@/constants/Typography';
import { useRouter } from 'expo-router';
import { layout } from '@/components/layout';
import { useIsTablet } from '@/utils/responsive';
import { Header } from './navigation/Header';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';
import type { DecryptedTask } from '@/sync/taskTypes';

/** Extract project name from the task directory (last path segment). */
function projectName(task: DecryptedTask): string | null {
    const dir = task.directory;
    if (!dir) return null;
    const trimmed = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    const last = trimmed.split('/').pop();
    return last && last !== '~' ? last : null;
}

/**
 * Row for a waiting task in the inbox.
 * Tapping navigates directly to the first idle session (most recently updated).
 */
const WaitingTaskRow = React.memo(function WaitingTaskRow({ task }: { task: DecryptedTask }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const linkedSessions = useTaskSessions(task.id);
    const project = projectName(task);

    const handlePress = React.useCallback(() => {
        const idleSession = linkedSessions.find(s => !s.thinking);
        if (idleSession) {
            router.push(`/session/${idleSession.id}`);
        } else {
            router.push(`/task/${task.id}`);
        }
    }, [linkedSessions, task.id, router]);

    return (
        <Item
            title={task.title || t('tasks.untitled')}
            subtitle={project || task.description || undefined}
            icon={<Ionicons name="time-outline" size={24} color="#FF9500" />}
            detail={t('tasks.stateWaiting')}
            detailStyle={{ color: '#FF9500' }}
            onPress={handlePress}
        />
    );
});

interface InboxViewProps {
}

// Header components for tablet mode only (phone mode header is in MainView)
function HeaderTitleTablet() {
    const { theme } = useUnistyles();
    return (
        <Text style={{
            fontSize: 17,
            color: theme.colors.header.tint,
            fontWeight: '600',
            ...Typography.default('semiBold'),
        }}>
            {t('tabs.inbox')}
        </Text>
    );
}

export const InboxView = React.memo(({}: InboxViewProps) => {
    const { theme } = useUnistyles();
    const isTablet = useIsTablet();
    const realtimeStatus = useRealtimeStatus();
    const waitingTasks = useWaitingTasks();

    const isEmpty = waitingTasks.length === 0;

    if (isEmpty) {
        return (
            <View style={styles.container}>
                {isTablet && (
                    <View style={{ backgroundColor: theme.colors.groupped.background }}>
                        <Header
                            title={<HeaderTitleTablet />}
                            headerLeft={() => null}
                            headerShadowVisible={false}
                            headerTransparent={true}
                        />
                        {realtimeStatus !== 'disconnected' && (
                            <VoiceAssistantStatusBar variant="full" />
                        )}
                    </View>
                )}
                <UpdateBanner />
                <View style={styles.emptyContainer}>
                    <Image
                        source={require('@/assets/images/brutalist/Brutalism 10.png')}
                        contentFit="contain"
                        style={[{ width: 64, height: 64 }, styles.emptyIcon]}
                        tintColor={theme.colors.textSecondary}
                    />
                    <Text style={styles.emptyTitle}>{t('inbox.emptyTitle')}</Text>
                    <Text style={styles.emptyDescription}>{t('inbox.emptyDescription')}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {isTablet && (
                <View style={{ backgroundColor: theme.colors.groupped.background }}>
                    <Header
                        title={<HeaderTitleTablet />}
                        headerLeft={() => null}
                        headerShadowVisible={false}
                        headerTransparent={true}
                    />
                    {realtimeStatus !== 'disconnected' && (
                        <VoiceAssistantStatusBar variant="full" />
                    )}
                </View>
            )}
            <ScrollView contentContainerStyle={{
                maxWidth: layout.maxWidth,
                alignSelf: 'center',
                width: '100%'
            }}>
                <UpdateBanner />
                <ItemGroup title={t('inbox.waitingTasks')}>
                    {waitingTasks.map((task) => (
                        <WaitingTaskRow key={task.id} task={task} />
                    ))}
                </ItemGroup>
            </ScrollView>
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
}));
