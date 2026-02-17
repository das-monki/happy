import * as React from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useAgentDefinitions, AgentDefinition } from '@/hooks/useAgentDefinitions';
import { useHappyAction } from '@/hooks/useHappyAction';
import { Modal } from '@/modal';
import { useUnistyles } from 'react-native-unistyles';
import { StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';

const AgentsSettingsScreen = React.memo(function AgentsSettingsScreen() {
    const { theme } = useUnistyles();
    const { agents, loading, refresh, createAgent, updateAgent, deleteAgent } = useAgentDefinitions();
    const [editingAgent, setEditingAgent] = React.useState<AgentDefinition | null>(null);
    const [isCreating, setIsCreating] = React.useState(false);

    // Form state
    const [name, setName] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [promptTemplate, setPromptTemplate] = React.useState('');

    const resetForm = React.useCallback(() => {
        setName('');
        setDescription('');
        setPromptTemplate('');
        setEditingAgent(null);
        setIsCreating(false);
    }, []);

    const startCreate = React.useCallback(() => {
        resetForm();
        setIsCreating(true);
    }, [resetForm]);

    const startEdit = React.useCallback((agent: AgentDefinition) => {
        setName(agent.name);
        setDescription(agent.description);
        setPromptTemplate(agent.promptTemplate);
        setEditingAgent(agent);
        setIsCreating(true);
    }, []);

    const [saving, doSave] = useHappyAction(React.useCallback(async () => {
        if (!name.trim()) return;

        if (editingAgent) {
            await updateAgent(editingAgent.id, {
                name: name.trim(),
                description: description.trim(),
                promptTemplate: promptTemplate.trim(),
            });
        } else {
            await createAgent({
                name: name.trim(),
                description: description.trim(),
                promptTemplate: promptTemplate.trim(),
            });
        }
        resetForm();
    }, [name, description, promptTemplate, editingAgent, createAgent, updateAgent, resetForm]));

    const handleDelete = React.useCallback((agent: AgentDefinition) => {
        Modal.alert(
            t('agents.deleteTitle'),
            t('agents.deleteMessage', { name: agent.name }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        await deleteAgent(agent.id);
                    }
                }
            ]
        );
    }, [deleteAgent]);

    if (isCreating) {
        return (
            <ItemList style={{ paddingTop: 0 }}>
                <ItemGroup title={editingAgent ? t('agents.editAgent') : t('agents.createAgent')}>
                    <Item
                        title={t('agents.name')}
                        detail={name || t('agents.namePlaceholder')}
                        onPress={() => {}}
                    />
                    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder={t('agents.namePlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            style={[styles.input, { color: theme.colors.text }]}
                            autoFocus
                        />
                    </View>
                    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 4 }}>{t('agents.description')}</Text>
                        <TextInput
                            value={description}
                            onChangeText={setDescription}
                            placeholder={t('agents.descriptionPlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            style={[styles.input, { color: theme.colors.text }]}
                            multiline
                        />
                    </View>
                </ItemGroup>
                <ItemGroup title={t('agents.promptTemplate')} footer={t('agents.promptTemplateDescription')}>
                    <View style={{ padding: 16 }}>
                        <TextInput
                            value={promptTemplate}
                            onChangeText={setPromptTemplate}
                            placeholder={t('agents.promptTemplatePlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            style={[styles.textArea, { color: theme.colors.text, borderColor: theme.colors.textSecondary }]}
                            multiline
                            numberOfLines={8}
                            textAlignVertical="top"
                        />
                    </View>
                </ItemGroup>
                <ItemGroup>
                    <Item
                        title={saving ? t('common.saving') : (editingAgent ? t('common.save') : t('agents.createAgent'))}
                        titleStyle={{ color: name.trim() ? '#007AFF' : theme.colors.textSecondary, textAlign: 'center' }}
                        onPress={name.trim() ? doSave : undefined}
                    />
                    <Item
                        title={t('common.cancel')}
                        titleStyle={{ color: '#FF3B30', textAlign: 'center' }}
                        onPress={resetForm}
                    />
                </ItemGroup>
            </ItemList>
        );
    }

    return (
        <ItemList style={{ paddingTop: 0 }}>
            {agents.length === 0 && !loading ? (
                <ItemGroup footer={t('agents.emptyDescription')}>
                    <Item
                        title={t('agents.empty')}
                        icon={<Ionicons name="hardware-chip-outline" size={29} color={theme.colors.textSecondary} />}
                    />
                </ItemGroup>
            ) : (
                <ItemGroup title={t('agents.title')}>
                    {agents.map(agent => (
                        <Item
                            key={agent.id}
                            title={agent.name}
                            subtitle={agent.description || undefined}
                            icon={<Ionicons name="hardware-chip-outline" size={29} color="#FF6B35" />}
                            onPress={() => startEdit(agent)}
                            rightElement={
                                <Pressable onPress={() => handleDelete(agent)} hitSlop={8}>
                                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                </Pressable>
                            }
                        />
                    ))}
                </ItemGroup>
            )}
            <ItemGroup>
                <Item
                    title={t('agents.createAgent')}
                    titleStyle={{ color: '#007AFF', textAlign: 'center' }}
                    onPress={startCreate}
                />
            </ItemGroup>
        </ItemList>
    );
});

export default AgentsSettingsScreen;

const styles = StyleSheet.create((theme) => ({
    input: {
        fontSize: 16,
        paddingVertical: 4,
    },
    textArea: {
        fontSize: 14,
        fontFamily: 'monospace',
        minHeight: 160,
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
    },
}));
