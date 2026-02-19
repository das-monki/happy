import * as React from 'react';
import { View, Text, ScrollView, Platform, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useWaitingTasks, useRealtimeStatus, useTaskSessions, useSessionMessages } from '@/sync/storage';
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
import type { Session } from '@/sync/storageTypes';
import { useAgentDefinitions } from '@/hooks/useAgentDefinitions';
import { sync } from '@/sync/sync';

/** Extract project name from the task directory (last path segment). */
function projectName(task: DecryptedTask): string | null {
    const dir = task.directory;
    if (!dir) return null;
    const trimmed = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    const last = trimmed.split('/').pop();
    return last && last !== '~' ? last : null;
}

/** Extracts the last sentence from the most recent agent message in a session. */
const IdleSessionRow = React.memo(function IdleSessionRow({
    session,
    agentLabel,
}: {
    session: Session;
    agentLabel: string | null;
}) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { messages, isLoaded } = useSessionMessages(session.id);

    // Pre-fetch messages so the inbox shows session text on initial load
    React.useEffect(() => {
        if (!isLoaded) {
            sync.onSessionVisible(session.id);
        }
    }, [session.id, isLoaded]);

    const lastLine = React.useMemo(() => {
        // Messages are ordered most-recent-first; find the first agent-text
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.kind === 'agent-text') {
                const stripped = msg.text.replace(/<options>[\s\S]*?<\/options>/g, '').trim();
                const sentences = stripped.split(/(?<=[.!?])\s+/).filter(s => s.trim());
                return sentences[sentences.length - 1]?.trim() || null;
            }
        }
        return null;
    }, [messages]);

    return (
        <Pressable
            onPress={() => router.push(`/session/${session.id}`)}
            style={({ pressed }) => [
                pressed && Platform.OS === 'ios' && { backgroundColor: theme.colors.surfacePressedOverlay },
            ]}
        >
            <View style={idleSessionStyles.row}>
                <View style={idleSessionStyles.icon}>
                    <Ionicons name="terminal-outline" size={20} color={theme.colors.textSecondary} />
                </View>
                <View style={idleSessionStyles.content}>
                    {(agentLabel || session.metadata?.agentKey) && (
                        <View style={[idleSessionStyles.badge, !agentLabel && { opacity: 0 }]}>
                            <Text style={[idleSessionStyles.badgeText, { color: theme.colors.textSecondary }]}>{agentLabel || ' '}</Text>
                        </View>
                    )}
                    <Text style={idleSessionStyles.message} numberOfLines={1}>
                        {lastLine || t('tasks.stateWaiting')}
                    </Text>
                </View>
                <Ionicons
                    name="chevron-forward"
                    size={Platform.select({ ios: 17, default: 24 })}
                    color={theme.colors.groupped.chevron}
                    style={{ marginLeft: 4 }}
                />
            </View>
        </Pressable>
    );
});

/**
 * Row for a waiting task in the inbox.
 * Tapping the task row navigates to the task detail screen.
 * Idle sessions are always shown below, each navigating to that session.
 */
const WaitingTaskRow = React.memo(function WaitingTaskRow({
    task,
    agentNameMap,
}: {
    task: DecryptedTask;
    agentNameMap: Map<string, string>;
}) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const linkedSessions = useTaskSessions(task.id);
    const project = projectName(task);

    const idleSessions = React.useMemo(
        () => linkedSessions.filter(s => s.active && !s.thinking),
        [linkedSessions],
    );

    const handleTaskPress = React.useCallback(() => {
        router.push(`/task/${task.id}`);
    }, [task.id, router]);

    return (
        <>
            <Item
                title={task.title || t('tasks.untitled')}
                subtitle={project || task.description || undefined}
                icon={<Ionicons name="time-outline" size={24} color="#FF9500" />}
                detail={t('tasks.stateWaiting')}
                detailStyle={{ color: '#FF9500' }}
                onPress={handleTaskPress}
                showDivider={idleSessions.length === 0}
            />
            {idleSessions.length > 0 && (
                <View style={{ height: Platform.select({ ios: 0.33, default: 0 }), backgroundColor: theme.colors.divider }} />
            )}
            {idleSessions.map((session) => (
                <IdleSessionRow
                    key={session.id}
                    session={session}
                    agentLabel={session.metadata?.agentKey ? (agentNameMap.get(session.metadata.agentKey) ?? null) : null}
                />
            ))}
        </>
    );
});

interface InboxViewProps {
    directoryFilter?: string | null;
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

export const InboxView = React.memo(({ directoryFilter = null }: InboxViewProps) => {
    const { theme } = useUnistyles();
    const isTablet = useIsTablet();
    const realtimeStatus = useRealtimeStatus();
    const waitingTasks = useWaitingTasks();
    const { agents } = useAgentDefinitions();

    const agentNameMap = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const a of agents) {
            map.set(`agent:${a.id}`, a.name);
        }
        return map;
    }, [agents]);

    const filteredTasks = React.useMemo(
        () => directoryFilter
            ? waitingTasks.filter(task => task.directory === directoryFilter)
            : waitingTasks,
        [waitingTasks, directoryFilter],
    );

    const isEmpty = filteredTasks.length === 0;

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
                    {filteredTasks.map((task) => (
                        <WaitingTaskRow key={task.id} task={task} agentNameMap={agentNameMap} />
                    ))}
                </ItemGroup>
            </ScrollView>
        </View>
    );
});

const idleSessionStyles = StyleSheet.create((theme) => ({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 48,
        paddingRight: 16,
        paddingVertical: 8,
        minHeight: 34,
    },
    icon: {
        marginRight: 12,
        width: Platform.select({ ios: 29, default: 32 }),
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        flexDirection: 'column',
        gap: 2,
    },
    badge: {
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
    },
    badgeText: {
        fontSize: 11,
        ...Typography.default(),
    },
    message: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: Platform.select({ ios: 15, default: 14 }),
        lineHeight: 20,
        letterSpacing: Platform.select({ ios: -0.24, default: 0.1 }),
    },
}));

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
