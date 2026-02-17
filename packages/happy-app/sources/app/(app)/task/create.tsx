import * as React from 'react';
import { View, TextInput, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useAgentDefinitions } from '@/hooks/useAgentDefinitions';
import { useHappyAction } from '@/hooks/useHappyAction';
import { sync } from '@/sync/sync';
import { useAllMachines, useAllSessions } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from '@/modal';
import type { Machine } from '@/sync/storageTypes';

/**
 * Returns the display name for a machine: displayName > host > truncated id.
 */
function machineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || machine.id.slice(0, 8);
}

/**
 * Modal component for selecting an agent.
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
 * Modal component for selecting a machine.
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

const TaskCreateScreen = React.memo(function TaskCreateScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { agents } = useAgentDefinitions();
    const machines = useAllMachines();
    const allSessions = useAllSessions();
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [selectedAgentKey, setSelectedAgentKey] = React.useState<string | null>(null);
    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(null);
    const [selectedDirectory, setSelectedDirectory] = React.useState<string>('~');

    // Auto-select the first online machine
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

    /** Shorten an absolute directory path by replacing the home dir prefix with ~ */
    const displayDirectory = React.useMemo(() => {
        const homeDir = selectedMachine?.metadata?.homeDir;
        if (homeDir && selectedDirectory.startsWith(homeDir)) {
            const rel = selectedDirectory.slice(homeDir.length);
            return rel ? '~' + rel : '~';
        }
        return selectedDirectory;
    }, [selectedDirectory, selectedMachine?.metadata?.homeDir]);

    // Agent display name
    const agentName = React.useMemo(() => {
        if (!selectedAgentKey) return null;
        const agentId = selectedAgentKey.replace('agent:', '');
        const agent = agents.find(a => a.id === agentId);
        return agent?.name ?? agentId;
    }, [selectedAgentKey, agents]);

    const handlePickAgent = React.useCallback(() => {
        Modal.show({
            component: AgentPickerModal,
            props: {
                agents,
                selectedAgentKey,
                onSelect: (agentKey: string | null) => {
                    setSelectedAgentKey(agentKey);
                },
            },
        });
    }, [agents, selectedAgentKey]);

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
    const { path: pathParam } = useLocalSearchParams<{ path?: string }>();
    React.useEffect(() => {
        if (typeof pathParam !== 'string') return;
        const trimmed = pathParam.trim();
        if (trimmed && trimmed !== selectedDirectory) {
            setSelectedDirectory(trimmed);
        }
    }, [pathParam]); // intentionally omit selectedDirectory to avoid loops

    const [creating, doCreate] = useHappyAction(React.useCallback(async () => {
        if (!title.trim()) return;
        await sync.createTask(
            title.trim(),
            description.trim() || null,
            selectedAgentKey,
            selectedMachineId,
            selectedDirectory
        );
        router.back();
    }, [title, description, selectedAgentKey, selectedMachineId, selectedDirectory, router]));

    return (
        <ItemList style={{ paddingTop: 0 }}>
            <ItemGroup title={t('tasks.details')}>
                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{t('tasks.fieldTitle')}</Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder={t('tasks.titlePlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[styles.input, { color: theme.colors.text }]}
                        autoFocus
                    />
                </View>
                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{t('tasks.fieldDescription')}</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder={t('tasks.descriptionPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[styles.input, { color: theme.colors.text }]}
                        multiline
                    />
                </View>
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
                    detail={displayDirectory}
                    onPress={selectedMachineId ? handlePickDirectory : undefined}
                />
            </ItemGroup>

            <ItemGroup>
                <Item
                    title={creating ? t('common.saving') : t('tasks.createTask')}
                    titleStyle={{ color: title.trim() ? '#007AFF' : theme.colors.textSecondary, textAlign: 'center' }}
                    onPress={title.trim() ? doCreate : undefined}
                />
                <Item
                    title={t('common.cancel')}
                    titleStyle={{ color: '#FF3B30', textAlign: 'center' }}
                    onPress={() => router.back()}
                />
            </ItemGroup>
        </ItemList>
    );
});

export default TaskCreateScreen;

const styles = StyleSheet.create((theme) => ({
    input: {
        fontSize: 16,
        paddingVertical: 4,
    },
}));

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
