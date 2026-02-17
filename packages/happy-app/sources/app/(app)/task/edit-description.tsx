import * as React from 'react';
import { TextInput, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTask } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';

/**
 * Full-screen editor for the task description.
 * Auto-saves on back navigation (unmount).
 */
const EditDescriptionScreen = React.memo(function EditDescriptionScreen() {
    const { taskId } = useLocalSearchParams<{ taskId: string }>();
    const task = useTask(taskId!);
    const { theme } = useUnistyles();
    const [text, setText] = React.useState(task?.description || '');
    const textRef = React.useRef(text);
    const originalRef = React.useRef(task?.description || '');

    // Keep ref in sync with latest text
    textRef.current = text;

    // Auto-save on unmount (back navigation)
    React.useEffect(() => {
        return () => {
            const trimmed = textRef.current.trim();
            if (trimmed !== originalRef.current) {
                sync.updateTaskHeader(taskId!, { description: trimmed || null })
                    .catch(e => console.error('Failed to persist description:', e));
            }
        };
    }, [taskId]);

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: theme.colors.groupped.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={100}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
            >
                <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={t('tasks.descriptionPlaceholder')}
                    placeholderTextColor={theme.colors.textSecondary}
                    style={{
                        flex: 1,
                        fontSize: 16,
                        color: theme.colors.text,
                        padding: 16,
                        textAlignVertical: 'top',
                    }}
                    multiline
                    autoFocus
                    scrollEnabled={false}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
});

export default EditDescriptionScreen;
