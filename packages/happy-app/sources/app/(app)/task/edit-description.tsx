import * as React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTask } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { t } from '@/text';

/**
 * Full-screen markdown editor for the task description.
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
        <View style={{ flex: 1, backgroundColor: theme.colors.groupped.background }}>
            <MarkdownEditor
                value={text}
                onChangeText={setText}
                placeholder={t('tasks.descriptionPlaceholder')}
            />
        </View>
    );
});

export default EditDescriptionScreen;
