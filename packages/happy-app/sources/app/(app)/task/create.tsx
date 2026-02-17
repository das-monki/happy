import * as React from 'react';
import { View, TextInput, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useAgentDefinitions } from '@/hooks/useAgentDefinitions';
import { useHappyAction } from '@/hooks/useHappyAction';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';
import { Ionicons } from '@expo/vector-icons';

const TaskCreateScreen = React.memo(function TaskCreateScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { agents } = useAgentDefinitions();
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [selectedAgentKey, setSelectedAgentKey] = React.useState<string | null>(null);

    const [creating, doCreate] = useHappyAction(React.useCallback(async () => {
        if (!title.trim()) return;
        await sync.createTask(
            title.trim(),
            description.trim() || null,
            selectedAgentKey
        );
        router.back();
    }, [title, description, selectedAgentKey, router]));

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

            {agents.length > 0 && (
                <ItemGroup title={t('tasks.fieldAgent')}>
                    <Item
                        title={t('tasks.noAgent')}
                        icon={
                            !selectedAgentKey
                                ? <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                                : <Ionicons name="ellipse-outline" size={24} color={theme.colors.textSecondary} />
                        }
                        onPress={() => setSelectedAgentKey(null)}
                        showChevron={false}
                    />
                    {agents.map(agent => (
                        <Item
                            key={agent.id}
                            title={agent.name}
                            subtitle={agent.description || undefined}
                            icon={
                                selectedAgentKey === `agent:${agent.id}`
                                    ? <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                                    : <Ionicons name="ellipse-outline" size={24} color={theme.colors.textSecondary} />
                            }
                            onPress={() => setSelectedAgentKey(`agent:${agent.id}`)}
                            showChevron={false}
                        />
                    ))}
                </ItemGroup>
            )}

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
