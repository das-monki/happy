import * as React from 'react';
import { View, Text, TextInput, ScrollView, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { storage, useSetting, useTask, useTaskState, useTaskSessions, useAllMachines, useAllSessions, useTaskArtifacts } from '@/sync/storage';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { sync } from '@/sync/sync';
import { getAvailablePermissionModes, getAvailableModels, getDefaultPermissionModeKey, getDefaultModelKey, resolveCurrentOption } from '@/components/modelModeOptions';
import type { PermissionMode, ModelMode } from '@/components/modelModeOptions';
import { machineSpawnNewSession, sessionKill, sessionDelete } from '@/sync/ops';
import { deleteArtifact } from '@/sync/apiArtifacts';
import { useAgentDefinitions } from '@/hooks/useAgentDefinitions';
import { useHappyAction } from '@/hooks/useHappyAction';
import { Modal } from '@/modal';
import { getSessionName } from '@/utils/sessionUtils';
import { FloatingOverlay } from '@/components/FloatingOverlay';
import type { TaskState } from '@/sync/taskTypes';
import type { Machine, Session } from '@/sync/storageTypes';
import type { DecryptedArtifact } from '@/sync/artifactTypes';

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
        case 'running': return '#34C759';
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

    const handleLongPress = React.useCallback(() => {
        if (isActive) {
            Modal.alert(t('sessionInfo.archiveSession'), t('sessionInfo.archiveSessionConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('tasks.archive'), style: 'destructive', onPress: () => sessionKill(session.id) },
            ]);
        } else {
            Modal.alert(t('sessionInfo.deleteSession'), t('sessionInfo.deleteSessionWarning'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => sessionDelete(session.id) },
            ]);
        }
    }, [session.id, isActive]);

    return (
        <Item
            title={name}
            subtitle={agentLabel || undefined}
            detail={isActive ? t('tasks.sessionActive') : t('tasks.sessionInactive')}
            detailStyle={{ color: isActive ? '#34C759' : theme.colors.textSecondary }}
            icon={<Ionicons name="terminal-outline" size={20} color={isActive ? '#34C759' : theme.colors.textSecondary} />}
            onPress={() => router.push(`/session/${session.id}`)}
            onLongPress={handleLongPress}
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
    taskArtifacts,
    initialPermissionModeKey,
    initialModelModeKey,
    onCreateSession,
    onClose,
}: {
    agents: { id: string; name: string; description: string; promptTemplate: string }[];
    taskArtifacts: DecryptedArtifact[];
    initialPermissionModeKey: string | null;
    initialModelModeKey: string | null;
    onCreateSession: (agentKey: string | null, userMessage: string, selectedArtifactIds: string[], permissionModeKey: string, modelModeKey: string | null) => void;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [selectedAgentKey, setSelectedAgentKey] = React.useState<string | null>(null);
    const [userMessage, setUserMessage] = React.useState('');
    const [selectedArtifactIds, setSelectedArtifactIds] = React.useState<Set<string>>(new Set());

    // Permission mode & model mode options (always claude flavor for task sessions)
    const availableModes = React.useMemo(() => getAvailablePermissionModes('claude', null, t), []);
    const availableModels = React.useMemo(() => getAvailableModels('claude', null, t), []);

    const [selectedPermissionMode, setSelectedPermissionMode] = React.useState<PermissionMode>(() =>
        resolveCurrentOption(availableModes, [initialPermissionModeKey, getDefaultPermissionModeKey('claude')]) ?? availableModes[0]
    );
    const [selectedModelMode, setSelectedModelMode] = React.useState<ModelMode>(() =>
        resolveCurrentOption(availableModels, [initialModelModeKey, getDefaultModelKey('claude')]) ?? availableModels[0]
    );

    const [showSettings, setShowSettings] = React.useState(false);

    const toggleArtifact = React.useCallback((artifactId: string) => {
        setSelectedArtifactIds(prev => {
            const next = new Set(prev);
            if (next.has(artifactId)) next.delete(artifactId);
            else next.add(artifactId);
            return next;
        });
    }, []);

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
                {taskArtifacts.length > 0 && (
                    <>
                        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {t('tasks.includeArtifacts')}
                            </Text>
                        </View>
                        {taskArtifacts.map(artifact => {
                            const isChecked = selectedArtifactIds.has(artifact.id);
                            return (
                                <Pressable
                                    key={artifact.id}
                                    onPress={() => toggleArtifact(artifact.id)}
                                    style={({ pressed }) => [
                                        pickerStyles.row,
                                        { backgroundColor: pressed ? theme.colors.surfaceRipple : 'transparent' },
                                    ]}
                                >
                                    <Ionicons name={isChecked ? 'checkbox' : 'square-outline'} size={20} color={isChecked ? '#007AFF' : theme.colors.textSecondary} />
                                    <Text style={[pickerStyles.rowText, { color: theme.colors.text }]} numberOfLines={1}>
                                        {artifact.title || artifact.id.slice(0, 8)}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </>
                )}

            </ScrollView>
            <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.divider, paddingHorizontal: 16, paddingVertical: 10 }}>
                <TextInput
                    value={userMessage}
                    onChangeText={setUserMessage}
                    placeholder={t('tasks.additionalInstructions')}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    style={{
                        fontSize: 15,
                        color: theme.colors.text,
                        minHeight: 36,
                        maxHeight: 80,
                    }}
                />
            </View>
            {/* Button row with settings gear */}
            <View style={{ position: 'relative' }}>
                {/* Settings overlay — slides up above buttons */}
                {showSettings && (
                    <>
                        <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
                            <View style={{ position: 'absolute', top: -1000, left: -1000, right: -1000, bottom: -1000, zIndex: 999 }} />
                        </TouchableWithoutFeedback>
                        <View style={{ position: 'absolute', bottom: '100%', left: 8, right: 8, marginBottom: 4, zIndex: 1000 }}>
                            <FloatingOverlay maxHeight={300}>
                                {/* Permission Mode */}
                                <View style={{ paddingVertical: 8 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, paddingHorizontal: 16, paddingBottom: 4 }}>
                                        {t('agentInput.permissionMode.title')}
                                    </Text>
                                    {availableModes.map(mode => {
                                        const isSelected = selectedPermissionMode.key === mode.key;
                                        return (
                                            <Pressable
                                                key={mode.key}
                                                onPress={() => setSelectedPermissionMode(mode)}
                                                style={({ pressed }) => ({
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    paddingHorizontal: 16,
                                                    paddingVertical: 8,
                                                    backgroundColor: pressed ? theme.colors.surfaceRipple : 'transparent',
                                                })}
                                            >
                                                <View style={{
                                                    width: 16, height: 16, borderRadius: 8,
                                                    borderWidth: 2,
                                                    borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                                                }}>
                                                    {isSelected && (
                                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.radio.dot }} />
                                                    )}
                                                </View>
                                                <Text style={{ flex: 1, fontSize: 14, color: isSelected ? theme.colors.radio.active : theme.colors.text }} numberOfLines={1}>
                                                    {mode.name}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                                <View style={{ height: 1, backgroundColor: theme.colors.divider, marginHorizontal: 16 }} />
                                {/* Model */}
                                <View style={{ paddingVertical: 8 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, paddingHorizontal: 16, paddingBottom: 4 }}>
                                        {t('agentInput.model.title')}
                                    </Text>
                                    {availableModels.map(model => {
                                        const isSelected = selectedModelMode.key === model.key;
                                        return (
                                            <Pressable
                                                key={model.key}
                                                onPress={() => setSelectedModelMode(model)}
                                                style={({ pressed }) => ({
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    paddingHorizontal: 16,
                                                    paddingVertical: 8,
                                                    backgroundColor: pressed ? theme.colors.surfaceRipple : 'transparent',
                                                })}
                                            >
                                                <View style={{
                                                    width: 16, height: 16, borderRadius: 8,
                                                    borderWidth: 2,
                                                    borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                                                }}>
                                                    {isSelected && (
                                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.radio.dot }} />
                                                    )}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, color: isSelected ? theme.colors.radio.active : theme.colors.text }} numberOfLines={1}>
                                                        {model.name}
                                                    </Text>
                                                    {model.description ? (
                                                        <Text style={{ fontSize: 11, color: theme.colors.textSecondary }} numberOfLines={1}>
                                                            {model.description}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </FloatingOverlay>
                        </View>
                    </>
                )}
                {/* Gear row */}
                <Pressable
                    onPress={() => setShowSettings(prev => !prev)}
                    style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderTopWidth: 0.5,
                        borderTopColor: theme.colors.divider,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Ionicons name="settings-outline" size={18} color={theme.colors.textSecondary} />
                    <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginLeft: 6 }}>
                        {selectedPermissionMode.name} · {selectedModelMode.name}
                    </Text>
                </Pressable>
                {/* Cancel / Create row */}
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
                        onPress={() => { onCreateSession(selectedAgentKey, userMessage.trim(), [...selectedArtifactIds], selectedPermissionMode.key, selectedModelMode?.key ?? null); onClose(); }}
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
    const taskArtifacts = useTaskArtifacts(id!);
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

    // Spawn a session with a given agent, optionally including artifact content
    const doCreateSession = React.useCallback(async (agentKey: string | null, userMessage?: string, selectedArtifactIds?: string[], permissionModeKey?: string, modelModeKey?: string | null) => {
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

        // Get raw agent prompt template (passed as system prompt, not mixed into user message)
        let agentSystemPrompt: string | null = null;
        if (agentKey) {
            const agentId = agentKey.replace('agent:', '');
            const agent = agents.find(a => a.id === agentId);
            agentSystemPrompt = agent?.promptTemplate || null;
        }

        // Build the first user message from a template with task context
        const title = task.title || '';
        const description = task.description || '';
        let taskMessage = `I have a task I'm working on:\n\n**${title}**`;
        if (description) {
            taskMessage += `\n\n${description}`;
        }
        if (userMessage) {
            taskMessage += `\n\n---\n\n${userMessage}`;
        }

        // Reference selected artifacts so the agent can access them via MCP tools
        if (selectedArtifactIds && selectedArtifactIds.length > 0) {
            const artifactRefs: string[] = [];
            for (const artifactId of selectedArtifactIds) {
                const artifact = storage.getState().artifacts[artifactId];
                if (artifact) {
                    artifactRefs.push(`- "${artifact.title || 'Untitled'}" (id: ${artifactId})`);
                }
            }
            if (artifactRefs.length > 0) {
                taskMessage += `\n\nThe following artifacts are available for this task (use read_artifact to access them):\n${artifactRefs.join('\n')}`;
            }
        }

        const result = await machineSpawnNewSession({
            machineId: selectedMachineId,
            directory: selectedDirectory,
            agent: 'claude',
            taskId: id!,
            agentKey,
            agentSystemPrompt,
        });

        if ('sessionId' in result && result.sessionId) {
            await sync.refreshSessions();

            // Apply permission mode and model mode
            if (permissionModeKey) {
                storage.getState().updateSessionPermissionMode(result.sessionId, permissionModeKey);
            }
            if (modelModeKey) {
                storage.getState().updateSessionModelMode(result.sessionId, modelModeKey);
            }

            // Persist last-used values
            sync.applySettings({
                lastUsedPermissionMode: permissionModeKey ?? null,
                lastUsedModelMode: modelModeKey ?? null,
            });

            if (taskMessage.trim()) {
                await sync.sendMessage(result.sessionId, taskMessage);
            }

            router.push(`/session/${result.sessionId}`);
        } else {
            const errorMsg = 'errorMessage' in result ? result.errorMessage : t('tasks.runFailed');
            throw new Error(errorMsg);
        }
    }, [task, selectedMachineId, selectedDirectory, agents, router, id]);

    const lastUsedPermissionMode = useSetting('lastUsedPermissionMode');
    const lastUsedModelMode = useSetting('lastUsedModelMode');

    const handleAddSession = React.useCallback(() => {
        Modal.show({
            component: AddSessionModal,
            props: {
                agents,
                taskArtifacts,
                initialPermissionModeKey: lastUsedPermissionMode,
                initialModelModeKey: lastUsedModelMode,
                onCreateSession: (agentKey: string | null, userMessage: string, selectedArtifactIds: string[], permissionModeKey: string, modelModeKey: string | null) => {
                    doCreateSession(agentKey, userMessage || undefined, selectedArtifactIds, permissionModeKey, modelModeKey).catch(e => {
                        Modal.alert(t('common.error'), e instanceof Error ? e.message : t('tasks.runFailed'));
                    });
                },
            },
        });
    }, [agents, taskArtifacts, lastUsedPermissionMode, lastUsedModelMode, doCreateSession]);

    // Mark task as completed — archive active sessions first
    const handleComplete = React.useCallback(() => {
        const activeSessions = linkedSessions.filter(s => s.active);
        if (activeSessions.length > 0) {
            Modal.alert(
                t('tasks.completeTitle'),
                t('tasks.archiveSessionsWarning', { count: activeSessions.length }),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('tasks.completeConfirm'), style: 'destructive', onPress: async () => {
                        for (const s of activeSessions) await sessionKill(s.id);
                        await sync.updateTaskHeader(id!, { status: 'completed' });
                    }},
                ]
            );
        } else {
            sync.updateTaskHeader(id!, { status: 'completed' });
        }
    }, [id, linkedSessions]);

    // Mark task as failed — archive active sessions first
    const handleFail = React.useCallback(() => {
        const activeSessions = linkedSessions.filter(s => s.active);
        if (activeSessions.length > 0) {
            Modal.alert(
                t('tasks.failTitle'),
                t('tasks.archiveSessionsWarning', { count: activeSessions.length }),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('tasks.failConfirm'), style: 'destructive', onPress: async () => {
                        for (const s of activeSessions) await sessionKill(s.id);
                        await sync.updateTaskHeader(id!, { status: 'failed' });
                    }},
                ]
            );
        } else {
            sync.updateTaskHeader(id!, { status: 'failed' });
        }
    }, [id, linkedSessions]);

    // Reopen a completed/failed task (clears explicit status)
    const [, doReopen] = useHappyAction(React.useCallback(async () => {
        await sync.updateTaskHeader(id!, { status: null });
    }, [id]));

    // Delete task — kill active sessions, delete all linked sessions, then remove task
    const handleDelete = React.useCallback(() => {
        const activeSessions = linkedSessions.filter(s => s.active);
        const warningMsg = activeSessions.length > 0
            ? t('tasks.deleteWithSessionsWarning', { count: activeSessions.length, name: task?.title || t('tasks.untitled') })
            : t('tasks.deleteMessage', { name: task?.title || t('tasks.untitled') });

        Modal.alert(
            t('tasks.deleteTitle'),
            warningMsg,
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        for (const s of activeSessions) await sessionKill(s.id);
                        for (const s of linkedSessions) await sessionDelete(s.id);
                        await sync.removeTask(id!);
                        router.back();
                    }
                }
            ]
        );
    }, [id, linkedSessions, task, router]);

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
                        agentLabel={session.metadata?.agentKey ? (agentNameMap.get(session.metadata.agentKey) ?? null) : null}
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

            {/* Artifacts linked to this task */}
            <ItemGroup title={t('tasks.artifacts')}>
                {taskArtifacts.map(artifact => (
                    <Item
                        key={artifact.id}
                        title={artifact.title || artifact.id.slice(0, 8)}
                        icon={<Ionicons name="document-text-outline" size={20} color={theme.colors.textSecondary} />}
                        onPress={() => router.push(`/artifacts/${artifact.id}`)}
                        onLongPress={() => {
                            Modal.alert(t('artifacts.deleteConfirm'), t('artifacts.deleteConfirmDescription'), [
                                { text: t('common.cancel'), style: 'cancel' },
                                { text: t('common.delete'), style: 'destructive', onPress: async () => {
                                    try {
                                        const credentials = sync.getCredentials();
                                        if (!credentials) return;
                                        await deleteArtifact(credentials, artifact.id);
                                        storage.getState().deleteArtifact(artifact.id);
                                    } catch (e) {
                                        console.error('Failed to delete artifact:', e);
                                    }
                                }},
                            ]);
                        }}
                    />
                ))}
                {!isTerminal && (
                    <Item
                        title={t('tasks.addArtifact')}
                        titleStyle={{ color: '#007AFF', textAlign: 'center' }}
                        onPress={() => router.push({ pathname: '/artifacts/new', params: { taskId: id! } })}
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
                            onPress={handleComplete}
                        />
                        <Item
                            title={t('tasks.markFailed')}
                            titleStyle={{ color: '#FF9500', textAlign: 'center' }}
                            onPress={handleFail}
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
