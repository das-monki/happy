import * as React from 'react';
import {
    View,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { t } from '@/text';

/**
 * Reusable markdown editor with raw/preview toggle.
 * Used for task descriptions, artifact content, or any markdown field.
 *
 * - "Edit" mode: full-screen multiline TextInput
 * - "Preview" mode: rendered markdown via MarkdownView
 * - Segmented control toggle at the top
 * - Exposes current text via onChangeText callback
 */
export const MarkdownEditor = React.memo(function MarkdownEditor({
    value,
    onChangeText,
    placeholder,
    autoFocus,
    initialMode = 'preview',
}: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    initialMode?: 'edit' | 'preview';
}) {
    const { theme } = useUnistyles();
    const [mode, setMode] = React.useState<'edit' | 'preview'>(initialMode);

    return (
        <View style={styles.container}>
            {/* Segmented control */}
            <View style={styles.segmentWrapper}>
                <View style={[styles.segmentTrack, { backgroundColor: theme.colors.surfaceRipple }]}>
                    <Pressable
                        onPress={() => setMode('edit')}
                        style={[
                            styles.segment,
                            mode === 'edit' && [styles.segmentActive, { backgroundColor: theme.colors.groupped.background }],
                        ]}
                    >
                        <Text style={[
                            styles.segmentLabel,
                            { color: mode === 'edit' ? theme.colors.text : theme.colors.textSecondary },
                        ]}>
                            {t('common.edit')}
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={() => setMode('preview')}
                        style={[
                            styles.segment,
                            mode === 'preview' && [styles.segmentActive, { backgroundColor: theme.colors.groupped.background }],
                        ]}
                    >
                        <Text style={[
                            styles.segmentLabel,
                            { color: mode === 'preview' ? theme.colors.text : theme.colors.textSecondary },
                        ]}>
                            {t('common.preview')}
                        </Text>
                    </Pressable>
                </View>
            </View>

            {/* Content */}
            {mode === 'edit' ? (
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={140}
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <TextInput
                            value={value}
                            onChangeText={onChangeText}
                            placeholder={placeholder}
                            placeholderTextColor={theme.colors.textSecondary}
                            style={[styles.input, { color: theme.colors.text }]}
                            multiline
                            autoFocus={autoFocus}
                            scrollEnabled={false}
                        />
                    </ScrollView>
                </KeyboardAvoidingView>
            ) : (
                <ScrollView contentContainerStyle={styles.previewContent}>
                    {value.trim() ? (
                        <MarkdownView markdown={value} />
                    ) : (
                        <Text style={[styles.emptyPreview, { color: theme.colors.textSecondary }]}>
                            {t('common.noContent')}
                        </Text>
                    )}
                </ScrollView>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    segmentWrapper: {
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    segmentTrack: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 2,
    },
    segment: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 7,
        borderRadius: 7,
    },
    segmentActive: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    segmentLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    input: {
        flex: 1,
        fontSize: 16,
        padding: 16,
        textAlignVertical: 'top',
    },
    previewContent: {
        padding: 16,
        flexGrow: 1,
    },
    emptyPreview: {
        fontSize: 16,
        fontStyle: 'italic',
    },
}));
