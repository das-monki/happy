import * as React from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSocketStatus, useRealtimeStatus, useWaitingTasks, useTasks } from '@/sync/storage';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useIsTablet } from '@/utils/responsive';
import { useRouter } from 'expo-router';
import { EmptySessionsTablet } from './EmptySessionsTablet';
import { SessionsList } from './SessionsList';
import { FABWide } from './FABWide';
import { TabBar, TabType } from './TabBar';
import { InboxView } from './InboxView';
import { TasksView } from './TasksView';
import { SessionsListWrapper } from './SessionsListWrapper';
import { Header } from './navigation/Header';
import { HeaderLogo } from './HeaderLogo';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';
import { StatusDot } from './StatusDot';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { DirectoryFilterDropdown, DirectoryOption } from './DirectoryFilterDropdown';
import { AssistantButton } from './AssistantButton';
import { AssistantOverlay } from './AssistantOverlay';
import { useAssistantSession } from '@/hooks/useAssistantSession';
import { useAssistantToolHandler } from '@/hooks/useAssistantToolHandler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MainViewProps {
    variant: 'phone' | 'sidebar';
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    phoneContainer: {
        flex: 1,
    },
    sidebarContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
    loadingContainerWrapper: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 32,
    },
    tabletLoadingContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        flexDirection: 'column',
        backgroundColor: theme.colors.groupped.background,
    },
    emptyStateContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    titleText: {
        fontSize: 17,
        color: theme.colors.header.tint,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -2,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    headerButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#007AFF',
        marginLeft: 4,
    },
}));

// Tab header configuration
const TAB_TITLES = {
    sessions: 'tabs.sessions',
    inbox: 'tabs.inbox',
    tasks: 'tabs.tasks',
} as const;

// Active tabs
type ActiveTabType = 'sessions' | 'inbox' | 'tasks';

// Header title component with connection status and optional directory filter
const HeaderTitle = React.memo(({
    activeTab,
    directories,
    directoryFilter,
    onDirectoryFilterChange,
}: {
    activeTab: ActiveTabType;
    directories: DirectoryOption[];
    directoryFilter: string | null;
    onDirectoryFilterChange: (directory: string | null) => void;
}) => {
    const { theme } = useUnistyles();
    const socketStatus = useSocketStatus();

    const connectionStatus = React.useMemo(() => {
        const { status } = socketStatus;
        switch (status) {
            case 'connected':
                return {
                    color: theme.colors.status.connected,
                    isPulsing: false,
                    text: t('status.connected'),
                };
            case 'connecting':
                return {
                    color: theme.colors.status.connecting,
                    isPulsing: true,
                    text: t('status.connecting'),
                };
            case 'disconnected':
                return {
                    color: theme.colors.status.disconnected,
                    isPulsing: false,
                    text: t('status.disconnected'),
                };
            case 'error':
                return {
                    color: theme.colors.status.error,
                    isPulsing: false,
                    text: t('status.error'),
                };
            default:
                return {
                    color: theme.colors.status.default,
                    isPulsing: false,
                    text: '',
                };
        }
    }, [socketStatus, theme]);

    const showFilter = activeTab === 'inbox' || activeTab === 'tasks';

    const titleContent = (
        <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
                <Text style={styles.titleText}>
                    {t(TAB_TITLES[activeTab])}
                </Text>
                {showFilter && (
                    <>
                        <Ionicons
                            name="chevron-down"
                            size={14}
                            color={theme.colors.header.tint}
                            style={{ marginLeft: 4 }}
                        />
                        {directoryFilter !== null && (
                            <View style={styles.filterDot} />
                        )}
                    </>
                )}
            </View>
            {connectionStatus.text && (
                <View style={styles.statusContainer}>
                    <StatusDot
                        color={connectionStatus.color}
                        isPulsing={connectionStatus.isPulsing}
                        size={6}
                        style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.statusText, { color: connectionStatus.color }]}>
                        {connectionStatus.text}
                    </Text>
                </View>
            )}
        </View>
    );

    if (!showFilter) {
        return titleContent;
    }

    return (
        <DirectoryFilterDropdown
            directories={directories}
            selected={directoryFilter}
            onSelect={onDirectoryFilterChange}
        >
            {titleContent}
        </DirectoryFilterDropdown>
    );
});

// Header right button - varies by tab
const HeaderRight = React.memo(({ activeTab }: { activeTab: ActiveTabType }) => {
    const router = useRouter();
    const { theme } = useUnistyles();

    if (activeTab === 'sessions') {
        return (
            <Pressable
                onPress={() => router.push('/new')}
                hitSlop={15}
                style={styles.headerButton}
            >
                <Ionicons name="add-outline" size={28} color={theme.colors.header.tint} />
            </Pressable>
        );
    }

    if (activeTab === 'tasks') {
        return (
            <Pressable
                onPress={() => router.push('/task/create')}
                hitSlop={15}
                style={styles.headerButton}
            >
                <Ionicons name="add-outline" size={28} color={theme.colors.header.tint} />
            </Pressable>
        );
    }

    // Empty view to maintain header centering
    return <View style={styles.headerButton} />;
});

/** Extract display name from a directory path (last path segment). */
function directoryDisplayName(directory: string): string {
    const trimmed = directory.endsWith('/') ? directory.slice(0, -1) : directory;
    const last = trimmed.split('/').pop();
    return last && last !== '~' ? last : directory;
}

export const MainView = React.memo(({ variant }: MainViewProps) => {
    const { theme } = useUnistyles();
    const sessionListViewData = useVisibleSessionListViewData();
    const isTablet = useIsTablet();
    const router = useRouter();
    const realtimeStatus = useRealtimeStatus();
    const waitingTasks = useWaitingTasks();
    const allTasks = useTasks();

    // Tab state management
    // NOTE: Zen tab removed - the feature never got to a useful state
    const [activeTab, setActiveTab] = React.useState<TabType>('inbox');

    // Directory filter state — persists across tab switches
    const [directoryFilter, setDirectoryFilter] = React.useState<string | null>(null);

    // Assistant overlay
    const [assistantVisible, setAssistantVisible] = React.useState(false);
    const assistant = useAssistantSession();
    useAssistantToolHandler(assistant.sessionId);
    const safeArea = useSafeAreaInsets();

    // Compute unique directories from all tasks
    const directories = React.useMemo<DirectoryOption[]>(() => {
        const seen = new Map<string, string>();
        for (const task of allTasks) {
            const dir = task.directory;
            if (dir && !seen.has(dir)) {
                seen.set(dir, directoryDisplayName(dir));
            }
        }
        return [...seen.entries()]
            .map(([directory, displayName]) => ({ directory, displayName }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [allTasks]);

    const handleNewSession = React.useCallback(() => {
        router.push('/new');
    }, [router]);

    const handleTabPress = React.useCallback((tab: TabType) => {
        setActiveTab(tab);
    }, []);

    const handleAssistantOpen = React.useCallback(() => {
        setAssistantVisible(true);
    }, []);
    const handleAssistantClose = React.useCallback(() => {
        setAssistantVisible(false);
    }, []);

    // Regular phone mode with tabs - define this before any conditional returns
    const renderTabContent = React.useCallback(() => {
        switch (activeTab) {
            case 'inbox':
                return <InboxView directoryFilter={directoryFilter} />;
            case 'tasks':
                return <TasksView directoryFilter={directoryFilter} />;
            case 'sessions':
            default:
                return <SessionsListWrapper />;
        }
    }, [activeTab, directoryFilter]);

    // Sidebar variant
    if (variant === 'sidebar') {
        // Loading state
        if (sessionListViewData === null) {
            return (
                <View style={styles.sidebarContentContainer}>
                    <View style={styles.tabletLoadingContainer}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                </View>
            );
        }

        // Empty state
        if (sessionListViewData.length === 0) {
            return (
                <View style={styles.sidebarContentContainer}>
                    <View style={styles.emptyStateContainer}>
                        <EmptySessionsTablet />
                    </View>
                </View>
            );
        }

        // Sessions list
        return (
            <View style={styles.sidebarContentContainer}>
                <SessionsList />
            </View>
        );
    }

    // Phone variant
    // Tablet in phone mode - special case (when showing index view on tablets, show empty view)
    if (isTablet) {
        // Just show an empty view on tablets for the index view
        // The sessions list is shown in the sidebar, so the main area should be blank
        return <View style={styles.emptyStateContentContainer} />;
    }

    // Regular phone mode with tabs
    return (
        <>
            <View style={styles.phoneContainer}>
                <View style={{ backgroundColor: theme.colors.groupped.background }}>
                    <Header
                        title={
                            <HeaderTitle
                                activeTab={activeTab as ActiveTabType}
                                directories={directories}
                                directoryFilter={directoryFilter}
                                onDirectoryFilterChange={setDirectoryFilter}
                            />
                        }
                        headerRight={() => <HeaderRight activeTab={activeTab as ActiveTabType} />}
                        headerLeft={() => <HeaderLogo />}
                        headerShadowVisible={false}
                        headerTransparent={true}
                    />
                    {realtimeStatus !== 'disconnected' && (
                        <VoiceAssistantStatusBar variant="full" />
                    )}
                </View>
                {renderTabContent()}
            </View>
            <AssistantButton
                onPress={handleAssistantOpen}
                bottom={50 + safeArea.bottom + 32}
            />
            <TabBar
                activeTab={activeTab}
                onTabPress={handleTabPress}
                inboxBadgeCount={waitingTasks.length}
            />
            <AssistantOverlay
                visible={assistantVisible}
                onClose={handleAssistantClose}
                assistant={assistant}
            />
        </>
    );
});
