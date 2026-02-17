import * as React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
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
 * Renders a linked session row with name, active status, and navigation.
 */
const LinkedSessionRow = React.memo(function LinkedSessionRow({ session }: { session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();

    const isActive = session.active;
    const name = getSessionName(session);

    return (
        <Item
            title={name}
            detail={isActive ? t('tasks.sessionActive') : t('tasks.sessionInactive')}
            detailStyle={{ color: isActive ? '#34C759' : theme.colors.textSecondary }}
            icon={<Ionicons name="terminal-outline" size={20} color={isActive ? '#34C759' : theme.colors.textSecondary} />}
            onPress={() => router.push(`/session/${session.id}`)}
        />
    );
});

/**
 * Modal component for selecting an agent from the available list.
 * Includes a "No Agent" option for running without a prompt template.
 */
const AgentPickerModal = React.memo(function AgentPickerModal({
    agents,
    selectedAgentKey,
    onSelect,
    onClose,
}: {
    agents: { id: string; name: string; description: string }[];
    selectedAgentKey: string | null;
    onSelect: (agentKey: string | null) => void;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={pickerStyles.container}>
            <Text style={[pickerStyles.title, { color: theme.colors.text }]}>
                {t('tasks.fieldAgent')}
            </Text>
            <ScrollView style={pickerStyles.list} bounces={false}>
                <Pressable
                    onPress={() => { onSelect(null); onClose(); }}
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
                    const isSelected = selectedAgentKey === `agent:${agent.id}`;
                    return (
                        <Pressable
                            key={agent.id}
                            onPress={() => { onSelect(`agent:${agent.id}`); onClose(); }}
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
 * Returns the display name for a machine: displayName > host > truncated id.
 */
function machineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || machine.id.slice(0, 8);
}

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

    // Selected machine & directory for running
    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(null);
    const [selectedDirectory, setSelectedDirectory] = React.useState<string>('~');

    // Auto-select the first online machine if none is selected
    React.useEffect(() => {
        if (selectedMachineId) return;
        const online = machines.find(m => m.active);
        if (online) {
            setSelectedMachineId(online.id);
            setSelectedDirectory(online.metadata?.homeDir || '~');
        } else if (machines.length > 0) {
            setSelectedMachineId(machines[0].id);
            setSelectedDirectory(machines[0].metadata?.homeDir || '~');
        }
    }, [machines, selectedMachineId]);

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

    // Find the agent name from the agentKey
    const agentName = React.useMemo(() => {
        if (!task?.agentKey) return null;
        const agentId = task.agentKey.replace('agent:', '');
        const agent = agents.find(a => a.id === agentId);
        return agent?.name ?? agentId;
    }, [task?.agentKey, agents]);

    const handlePickAgent = React.useCallback(() => {
        Modal.show({
            component: AgentPickerModal,
            props: {
                agents,
                selectedAgentKey: task?.agentKey ?? null,
                onSelect: (agentKey: string | null) => {
                    sync.updateTaskHeader(id!, { agentKey });
                },
            },
        });
    }, [id, agents, task?.agentKey]);

    const handlePickMachine = React.useCallback(() => {
        Modal.show({
            component: MachinePickerModal,
            props: {
                machines,
                selectedMachineId,
                onSelect: (machine: Machine) => {
                    setSelectedMachineId(machine.id);
                    setSelectedDirectory(bestDirectoryForMachine(machine.id));
                },
            },
        });
    }, [machines, selectedMachineId, bestDirectoryForMachine]);

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
        }
    }, [pathParam]); // intentionally omit selectedDirectory to avoid loops

    // Run task on the selected machine
    const [running, doRun] = useHappyAction(React.useCallback(async () => {
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

        // Find agent prompt template if an agent is assigned
        let promptTemplate = '';
        if (task.agentKey) {
            const agentId = task.agentKey.replace('agent:', '');
            const agent = agents.find(a => a.id === agentId);
            promptTemplate = agent?.promptTemplate || '';
        }

        // Build the prompt that will be sent as the initial message
        const taskPrompt = promptTemplate
            ? promptTemplate
                .replace('{{title}}', task.title || '')
                .replace('{{description}}', task.description || '')
            : `${task.title || ''}${task.description ? '\n\n' + task.description : ''}`;

        // Spawn a new session on the machine
        const result = await machineSpawnNewSession({
            machineId: selectedMachineId,
            directory: selectedDirectory,
            agent: 'claude',
        });

        if ('sessionId' in result && result.sessionId) {
            await sync.refreshSessions();

            // Send the task prompt as the initial message
            if (taskPrompt.trim()) {
                await sync.sendMessage(result.sessionId, taskPrompt);
            }

            // Navigate to the session
            router.push(`/session/${result.sessionId}`);
        } else {
            const errorMsg = 'errorMessage' in result ? result.errorMessage : t('tasks.runFailed');
            throw new Error(errorMsg);
        }
    }, [task, selectedMachineId, selectedDirectory, agents, router]));

    // Mark task as completed
    const [, doComplete] = useHappyAction(React.useCallback(async () => {
        await sync.updateTaskHeader(id!, { status: 'completed' });
    }, [id]));

    // Mark task as failed
    const [, doFail] = useHappyAction(React.useCallback(async () => {
        await sync.updateTaskHeader(id!, { status: 'failed' });
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
                />
                {task.description && (
                    <Item
                        title={t('tasks.fieldDescription')}
                        subtitle={task.description}
                    />
                )}
                <Item
                    title={t('tasks.fieldState')}
                    detail={stateLabel(state)}
                    detailStyle={{ color: stateColor(state) }}
                />
            </ItemGroup>

            {/* Execution config */}
            <ItemGroup>
                <Item
                    title={t('tasks.fieldAgent')}
                    detail={agentName || t('tasks.noAgent')}
                    onPress={handlePickAgent}
                />
                <Item
                    title={t('tasks.fieldMachine')}
                    detail={selectedMachine ? `${machineName(selectedMachine)}${selectedMachine.active ? '' : ` (${t('status.offline')})`}` : t('tasks.noMachines')}
                    detailStyle={selectedMachine && !selectedMachine.active ? { color: '#FF3B30' } : undefined}
                    onPress={machines.length > 0 ? handlePickMachine : undefined}
                />
                <Item
                    title={t('tasks.fieldDirectory')}
                    detail={selectedDirectory}
                    onPress={selectedMachineId ? handlePickDirectory : undefined}
                />
            </ItemGroup>

            {/* Run button */}
            {!isTerminal && (
                <ItemGroup>
                    <Item
                        title={running ? t('tasks.running') : t('tasks.run')}
                        titleStyle={{ color: '#007AFF', textAlign: 'center' }}
                        onPress={doRun}
                    />
                </ItemGroup>
            )}

            {/* Linked sessions */}
            {linkedSessions.length > 0 && (
                <ItemGroup title={t('tasks.sessions')}>
                    {linkedSessions.map(session => (
                        <LinkedSessionRow key={session.id} session={session} />
                    ))}
                </ItemGroup>
            )}

            {/* Actions */}
            <ItemGroup>
                {!isTerminal && (
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
