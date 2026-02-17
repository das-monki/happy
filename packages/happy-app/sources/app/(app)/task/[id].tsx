import * as React from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTask, useTaskState, useTaskSessions, useAllMachines, useAllSessions } from '@/sync/storage';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { sync } from '@/sync/sync';
import { machineSpawnNewSession } from '@/sync/ops';
import { useAgentDefinitions } from '@/hooks/useAgentDefinitions';
import { useHappyAction } from '@/hooks/useHappyAction';
import { Modal } from '@/modal';
import { getSessionName } from '@/utils/sessionUtils';
import type { TaskState } from '@/sync/taskTypes';
import type { Machine, Session } from '@/sync/storageTypes';

function stateLabel(state: TaskState): string {
    switch (state) {
        case 'running': return t('tasks.stateRunning');
        case 'waiting_input': return t('tasks.stateWaiting');
        case 'completed': return t('tasks.stateCompleted');
        case 'failed': return t('tasks.stateFailed');
        case 'pending':
        default: return t('tasks.statePending');
    }
}

function stateColor(state: TaskState): string {
    switch (state) {
        case 'running': return '#007AFF';
        case 'waiting_input': return '#FF9500';
        case 'completed': return '#34C759';
        case 'failed': return '#FF3B30';
        case 'pending':
        default: return '#8E8E93';
    }
}

/**
 * Renders a linked session row with name, agent label, active status, and navigation.
 */
const LinkedSessionRow = React.memo(function LinkedSessionRow({
    session,
    agentLabel,
}: {
    session: Session;
    agentLabel: string | null;
}) {
    const { theme } = useUnistyles();
    const router = useRouter();

    const isActive = session.active;
    const name = getSessionName(session);

    return (
        <Item
            title={name}
            subtitle={agentLabel || undefined}
            detail={isActive ? t('tasks.sessionActive') : t('tasks.sessionInactive')}
            detailStyle={{ color: isActive ? '#34C759' : theme.colors.textSecondary }}
            icon={<Ionicons name="terminal-outline" size={20} color={isActive ? '#34C759' : theme.colors.textSecondary} />}
            onPress={() => router.push(`/session/${session.id}`)}
        />
    );
});

/**
 * Returns the display name for a machine: displayName > host > truncated id.
 */
function machineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || machine.id.slice(0, 8);
}

/**
 * Modal for creating a new session on the task.
 * Shows agent picker list, then a Create/Cancel button row.
 */
const AddSessionModal = React.memo(function AddSessionModal({
    agents,
    onCreateSession,
    onClose,
}: {
    agents: { id: string; name: string; description: string; promptTemplate: string }[];
    onCreateSession: (agentKey: string | null) => void;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [selectedAgentKey, setSelectedAgentKey] = React.useState<string | null>(null);

    return (
        <View style={pickerStyles.container}>
            <Text style={[pickerStyles.title, { color: theme.colors.text }]}>
                {t('tasks.addSession')}
            </Text>
            <ScrollView style={pickerStyles.list} bounces={false}>
                <Pressable
                    onPress={() => setSelectedAgentKey(null)}
                    style={({ pressed }) => [
                        pickerStyles.row,
                        { backgroundColor: pressed ? theme.colors.surfaceRipple : 'transparent' },
                    ]}
                >
                    <Ionicons name="close-circle-outline" size={20} color={theme.colors.textSecondary} />
                    <Text style={[pickerStyles.rowText, { color: theme.colors.text }]}>
                        {t('tasks.noAgent')}
                    </Text>
                    {!selectedAgentKey && (
                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                    )}
                </Pressable>
                {agents.map(agent => {
                    const key = `agent:${agent.id}`;
                    const isSelected = selectedAgentKey === key;
                    return (
                        <Pressable
                            key={agent.id}
                            onPress={() => setSelectedAgentKey(key)}
                            style={({ pressed }) => [
                                pickerStyles.row,
                                { backgroundColor: pressed ? theme.colors.surfaceRipple : 'transparent' },
                            ]}
                        >
                            <Ionicons name="hardware-chip-outline" size={20} color="#FF6B35" />
                            <View style={{ flex: 1 }}>
                                <Text style={[pickerStyles.rowText, { color: theme.colors.text }]} numberOfLines={1}>
                                    {agent.name}
                                </Text>
                                {agent.description ? (
                                    <Text style={{ fontSize: 13, color: theme.colors.textSecondary }} numberOfLines={1}>
                                        {agent.description}
                                    </Text>
                                ) : null}
                            </View>
                            {isSelected && (
                                <Ionicons name="checkmark" size={20} color="#007AFF" />
                            )}
                        </Pressable>
                    );
                })}
            </ScrollView>
            <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: theme.colors.divider }}>
                <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [
                        { flex: 1, paddingVertical: 14, borderRightWidth: 0.5, borderRightColor: theme.colors.divider, opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <Text style={{ fontSize: 17, textAlign: 'center', color: '#007AFF' }}>
                        {t('common.cancel')}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={() => { onCreateSession(selectedAgentKey); onClose(); }}
                    style={({ pressed }) => [
                        { flex: 1, paddingVertical: 14, opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <Text style={{ fontSize: 17, fontWeight: '600', textAlign: 'center', color: '#007AFF' }}>
                        {t('common.create')}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
});

/**
 * Modal component for selecting a machine from the available list.
 * Shows machine name, online/offline status with color indicator.
 */
const MachinePickerModal = React.memo(function MachinePickerModal({
    machines,
    selectedMachineId,
    onSelect,
    onClose,
}: {
    machines: Machine[];
    selectedMachineId: string | null;
    onSelect: (machine: Machine) => void;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={pickerStyles.container}>
            <Text style={[pickerStyles.title, { color: theme.colors.text }]}>
                {t('tasks.fieldMachine')}
            </Text>
            <ScrollView style={pickerStyles.list} bounces={false}>
                {machines.map(machine => {
                    const isSelected = machine.id === selectedMachineId;
                    return (
                        <Pressable
                            key={machine.id}
                            onPress={() => { onSelect(machine); onClose(); }}
                            style={({ pressed }) => [
                                pickerStyles.row,
                                { backgroundColor: pressed ? theme.colors.surfaceRipple : 'transparent' },
                            ]}
                        >
                            <View style={[pickerStyles.dot, { backgroundColor: machine.active ? '#34C759' : '#FF3B30' }]} />
                            <Text
                                style={[pickerStyles.rowText, { color: theme.colors.text }]}
                                numberOfLines={1}
                            >
                                {machineName(machine)}
                            </Text>
                            {isSelected && (
                                <Ionicons name="checkmark" size={20} color="#007AFF" />
                            )}
                        </Pressable>
                    );
                })}
            </ScrollView>
            <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                    pickerStyles.cancelButton,
                    { opacity: pressed ? 0.7 : 1 },
                ]}
            >
                <Text style={[pickerStyles.cancelText, { color: '#007AFF' }]}>
                    {t('common.cancel')}
                </Text>
            </Pressable>
        </View>
    );
});

/**
 * Modal for editing a single text field. Shows a title, text input, and save/cancel buttons.
 */
const TextEditModal = React.memo(function TextEditModal({
    title,
    value,
    placeholder,
    multiline,
    onSave,
    onClose,
}: {
    title: string;
    value: string;
    placeholder: string;
    multiline?: boolean;
    onSave: (value: string) => void;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [text, setText] = React.useState(value);

    return (
        <View style={pickerStyles.container}>
            <Text style={[pickerStyles.title, { color: theme.colors.text }]}>
                {title}
            </Text>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={placeholder}
                    placeholderTextColor={theme.colors.textSecondary}
                    style={{
                        fontSize: 16,
                        color: theme.colors.text,
                        minHeight: multiline ? 100 : undefined,
                        maxHeight: multiline ? 200 : undefined,
                        textAlignVertical: multiline ? 'top' : undefined,
                    }}
                    multiline={multiline}
                    autoFocus
                />
            </View>
            <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: theme.colors.divider }}>
                <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [
                        { flex: 1, paddingVertical: 14, borderRightWidth: 0.5, borderRightColor: theme.colors.divider, opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <Text style={{ fontSize: 17, textAlign: 'center', color: '#007AFF' }}>
                        {t('common.cancel')}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={() => { onSave(text.trim()); onClose(); }}
                    style={({ pressed }) => [
                        { flex: 1, paddingVertical: 14, opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <Text style={{ fontSize: 17, fontWeight: '600', textAlign: 'center', color: '#007AFF' }}>
                        {t('common.save')}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
});

const TaskDetailScreen = React.memo(function TaskDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const task = useTask(id!);
    const state = useTaskState(id!);
    const linkedSessions = useTaskSessions(id!);
    const machines = useAllMachines();
    const allSessions = useAllSessions();
    const { agents } = useAgentDefinitions();
    const { theme } = useUnistyles();
    const router = useRouter();

    // Machine & directory: persisted on the task header, local state is optimistic overlay.
    // A ref ensures we only initialize once per mount.
    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(null);
    const [selectedDirectory, setSelectedDirectory] = React.useState<string>('~');
    const didInit = React.useRef(false);

    React.useEffect(() => {
        if (didInit.current) return;
        if (task?.machineId) {
            // Task has persisted machine — use it
            setSelectedMachineId(task.machineId);
            setSelectedDirectory(task.directory || '~');
            didInit.current = true;
        } else if (machines.length > 0) {
            // No persisted machine — auto-select first online machine
            const online = machines.find(m => m.active);
            const m = online || machines[0];
            setSelectedMachineId(m.id);
            setSelectedDirectory(m.metadata?.homeDir || '~');
            didInit.current = true;
        }
    }, [task?.machineId, task?.directory, machines]);

    const selectedMachine = React.useMemo(
        () => machines.find(m => m.id === selectedMachineId) ?? null,
        [machines, selectedMachineId]
    );

    /**
     * Returns the most recently used directory on the given machine,
     * falling back to the machine's home directory.
     */
    const bestDirectoryForMachine = React.useCallback((machineId: string): string => {
        const machine = machines.find(m => m.id === machineId);
        const defaultDir = machine?.metadata?.homeDir || '~';
        const match = allSessions.find(s => s.metadata?.machineId === machineId && s.metadata?.path);
        return match?.metadata?.path || defaultDir;
    }, [machines, allSessions]);

    /** Shorten an absolute directory path by replacing the home dir prefix with ~ */
    const displayDirectory = React.useMemo(() => {
        const homeDir = selectedMachine?.metadata?.homeDir;
        if (homeDir && selectedDirectory.startsWith(homeDir)) {
            const rel = selectedDirectory.slice(homeDir.length);
            return rel ? '~' + rel : '~';
        }
        return selectedDirectory;
    }, [selectedDirectory, selectedMachine?.metadata?.homeDir]);

    /** Map from agent key to agent name for displaying on session rows */
    const agentNameMap = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const a of agents) {
            map.set(`agent:${a.id}`, a.name);
        }
        return map;
    }, [agents]);

    const handlePickMachine = React.useCallback(() => {
        Modal.show({
            component: MachinePickerModal,
            props: {
                machines,
                selectedMachineId,
                onSelect: (machine: Machine) => {
                    const dir = bestDirectoryForMachine(machine.id);
                    setSelectedMachineId(machine.id);
                    setSelectedDirectory(dir);
                    sync.updateTaskHeader(id!, { machineId: machine.id, directory: dir }).catch(e => console.error('Failed to persist machine:', e));
                },
            },
        });
    }, [id, machines, selectedMachineId, bestDirectoryForMachine]);

    const handlePickDirectory = React.useCallback(() => {
        if (!selectedMachineId) return;
        router.push({
            pathname: '/new/pick/path',
            params: { machineId: selectedMachineId, selectedPath: selectedDirectory },
        });
    }, [selectedMachineId, selectedDirectory, router]);

    // Listen for path returned from the path picker screen
    const { path: pathParam } = useLocalSearchParams<{ id: string; path?: string }>();
    React.useEffect(() => {
        if (typeof pathParam !== 'string') return;
        const trimmed = pathParam.trim();
        if (trimmed && trimmed !== selectedDirectory) {
            setSelectedDirectory(trimmed);
            sync.updateTaskHeader(id!, { directory: trimmed }).catch(e => console.error('Failed to persist directory:', e));
        }
    }, [pathParam]); // intentionally omit selectedDirectory to avoid loops

    // Spawn a session with a given agent
    const doCreateSession = React.useCallback(async (agentKey: string | null) => {
        if (!task) return;

        if (!selectedMachineId) {
            Modal.alert(t('common.error'), t('tasks.noMachines'));
            return;
        }

        const machine = machines.find(m => m.id === selectedMachineId);
        if (machine && !machine.active) {
            Modal.alert(t('common.error'), t('tasks.noMachinesOnline'));
            return;
        }

        // Build prompt from agent template or just title+description
        let promptTemplate = '';
        if (agentKey) {
            const agentId = agentKey.replace('agent:', '');
            const agent = agents.find(a => a.id === agentId);
            promptTemplate = agent?.promptTemplate || '';
        }

        const taskPrompt = promptTemplate
            ? promptTemplate
                .replace('{{title}}', task.title || '')
                .replace('{{description}}', task.description || '')
            : `${task.title || ''}${task.description ? '\n\n' + task.description : ''}`;

        const result = await machineSpawnNewSession({
            machineId: selectedMachineId,
            directory: selectedDirectory,
            agent: 'claude',
            taskId: id!,
        });

        if ('sessionId' in result && result.sessionId) {
            await sync.refreshSessions();

            if (taskPrompt.trim()) {
                await sync.sendMessage(result.sessionId, taskPrompt);
            }

            router.push(`/session/${result.sessionId}`);
        } else {
            const errorMsg = 'errorMessage' in result ? result.errorMessage : t('tasks.runFailed');
            throw new Error(errorMsg);
        }
    }, [task, selectedMachineId, selectedDirectory, agents, router, id]);

    const handleAddSession = React.useCallback(() => {
        Modal.show({
            component: AddSessionModal,
            props: {
                agents,
                onCreateSession: (agentKey: string | null) => {
                    doCreateSession(agentKey).catch(e => {
                        Modal.alert(t('common.error'), e instanceof Error ? e.message : t('tasks.runFailed'));
                    });
                },
            },
        });
    }, [agents, doCreateSession]);

    // Mark task as completed
    const [, doComplete] = useHappyAction(React.useCallback(async () => {
        await sync.updateTaskHeader(id!, { status: 'completed' });
    }, [id]));

    // Mark task as failed
    const [, doFail] = useHappyAction(React.useCallback(async () => {
        await sync.updateTaskHeader(id!, { status: 'failed' });
    }, [id]));

    // Reopen a completed/failed task (clears explicit status)
    const [, doReopen] = useHappyAction(React.useCallback(async () => {
        await sync.updateTaskHeader(id!, { status: null });
    }, [id]));

    // Delete task
    const handleDelete = React.useCallback(() => {
        Modal.alert(
            t('tasks.deleteTitle'),
            t('tasks.deleteMessage', { name: task?.title || t('tasks.untitled') }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        await sync.removeTask(id!);
                        router.back();
                    }
                }
            ]
        );
    }, [id, task, router]);

    const handleEditTitle = React.useCallback(() => {
        Modal.show({
            component: TextEditModal,
            props: {
                title: t('tasks.fieldTitle'),
                value: task?.title || '',
                placeholder: t('tasks.titlePlaceholder'),
                onSave: (value: string) => {
                    sync.updateTaskHeader(id!, { title: value || null }).catch(e => console.error('Failed to persist title:', e));
                },
            },
        });
    }, [id, task?.title]);

    const handleEditDescription = React.useCallback(() => {
        router.push({ pathname: '/task/edit-description', params: { taskId: id! } });
    }, [id, router]);

    if (!task) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>
                    {t('tasks.notFound')}
                </Text>
            </View>
        );
    }

    const isTerminal = state === 'completed' || state === 'failed';

    return (
        <ItemList style={{ paddingTop: 0 }}>
            {/* Task details */}
            <ItemGroup title={t('tasks.details')}>
                <Item
                    title={t('tasks.fieldTitle')}
                    detail={task.title || t('tasks.untitled')}
                    onPress={handleEditTitle}
                />
                <Item
                    title={t('tasks.fieldDescription')}
                    subtitle={task.description || undefined}
                    subtitleLines={2}
                    onPress={handleEditDescription}
                />
                <Item
                    title={t('tasks.fieldState')}
                    detail={stateLabel(state)}
                    detailStyle={{ color: stateColor(state) }}
                />
            </ItemGroup>

            {/* Execution config */}
            <ItemGroup>
                <Item
                    title={t('tasks.fieldMachine')}
                    detail={selectedMachine ? `${machineName(selectedMachine)}${selectedMachine.active ? '' : ` (${t('status.offline')})`}` : t('tasks.noMachines')}
                    detailStyle={selectedMachine && !selectedMachine.active ? { color: '#FF3B30' } : undefined}
                    onPress={machines.length > 0 ? handlePickMachine : undefined}
                />
                <Item
                    title={t('tasks.fieldDirectory')}
                    detail={displayDirectory}
                    onPress={selectedMachineId ? handlePickDirectory : undefined}
                />
            </ItemGroup>

            {/* Sessions list with Add Session button */}
            <ItemGroup title={t('tasks.sessions')}>
                {linkedSessions.map(session => (
                    <LinkedSessionRow
                        key={session.id}
                        session={session}
                        agentLabel={task.agentKey ? (agentNameMap.get(task.agentKey) ?? null) : null}
                    />
                ))}
                {!isTerminal && (
                    <Item
                        title={t('tasks.addSession')}
                        titleStyle={{ color: '#007AFF', textAlign: 'center' }}
                        onPress={handleAddSession}
                    />
                )}
            </ItemGroup>

            {/* Actions */}
            <ItemGroup>
                {isTerminal ? (
                    <Item
                        title={t('tasks.reopen')}
                        titleStyle={{ color: '#007AFF', textAlign: 'center' }}
                        onPress={doReopen}
                    />
                ) : (
                    <>
                        <Item
                            title={t('tasks.markCompleted')}
                            titleStyle={{ color: '#34C759', textAlign: 'center' }}
                            onPress={doComplete}
                        />
                        <Item
                            title={t('tasks.markFailed')}
                            titleStyle={{ color: '#FF9500', textAlign: 'center' }}
                            onPress={doFail}
                        />
                    </>
                )}
                <Item
                    title={t('common.delete')}
                    titleStyle={{ color: '#FF3B30', textAlign: 'center' }}
                    onPress={handleDelete}
                />
            </ItemGroup>
        </ItemList>
    );
});

export default TaskDetailScreen;

const pickerStyles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        borderRadius: 14,
        width: 300,
        maxHeight: 400,
        overflow: 'hidden',
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'center',
        paddingVertical: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.divider,
    },
    list: {
        maxHeight: 300,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 10,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    rowText: {
        fontSize: 16,
        flex: 1,
    },
    cancelButton: {
        paddingVertical: 14,
        borderTopWidth: 0.5,
        borderTopColor: theme.colors.divider,
    },
    cancelText: {
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'center',
    },
}));
