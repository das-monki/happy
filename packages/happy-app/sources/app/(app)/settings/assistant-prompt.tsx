import * as React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSettingMutable } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { MarkdownEditor } from '@/components/MarkdownEditor';

/**
 * Shared markdown editor for the assistant agent prompt (agents.md)
 * or soul prompt (soul.md). The `field` search param determines which
 * setting is being edited. Auto-saves on unmount (back navigation).
 */
const AssistantPromptScreen = React.memo(function AssistantPromptScreen() {
    const { field } = useLocalSearchParams<{ field: 'assistantAgentPrompt' | 'assistantSoulPrompt' }>();
    const [current] = useSettingMutable(field!);
    const [text, setText] = React.useState(current || '');
    const textRef = React.useRef(text);
    const originalRef = React.useRef(current || '');

    const { theme } = useUnistyles();

    // Keep ref in sync with latest text
    textRef.current = text;

    // Auto-save on unmount (back navigation)
    React.useEffect(() => {
        return () => {
            const trimmed = textRef.current.trim();
            if (trimmed !== originalRef.current.trim()) {
                sync.applySettings({ [field!]: trimmed });
            }
        };
    }, [field]);

    const isEmpty = !originalRef.current.trim();

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.groupped.background }}>
            <MarkdownEditor
                value={text}
                onChangeText={setText}
                initialMode={isEmpty ? 'edit' : 'preview'}
            />
        </View>
    );
});

export default AssistantPromptScreen;
