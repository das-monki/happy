import React from 'react';
import { View, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { MarkdownEditor } from '@/components/MarkdownEditor';

/**
 * New artifact creation screen.
 * Title input at top, markdown editor (with preview/edit toggle) below.
 * Defaults to edit mode for new artifacts since there's no content to preview yet.
 */
export default function NewArtifactScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { taskId } = useLocalSearchParams<{ taskId?: string }>();

    const [title, setTitle] = React.useState('');
    const [body, setBody] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const [titleFocused, setTitleFocused] = React.useState(false);

    const handleSave = React.useCallback(async () => {
        if (isSaving) return;

        if (!title.trim() && !body.trim()) {
            await Modal.alert(t('common.error'), t('artifacts.emptyFieldsError'));
            return;
        }

        try {
            setIsSaving(true);

            const artifactId = await sync.createArtifact(
                title.trim() || null,
                body.trim() || null,
                undefined, // sessions
                undefined, // draft
                taskId || null,
            );

            router.replace(`/artifacts/${artifactId}`);
        } catch (err) {
            console.error('Failed to create artifact:', err);
            await Modal.alert(t('common.error'), t('artifacts.createError'));
            setIsSaving(false);
        }
    }, [title, body, isSaving, router, taskId]);

    const HeaderRight = React.useCallback(() => (
        <Pressable
            style={[styles.headerButton, isSaving && styles.headerButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
        >
            {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.header.tint} />
            ) : (
                <Text style={styles.headerButtonText}>
                    {t('common.save')}
                </Text>
            )}
        </Pressable>
    ), [handleSave, isSaving]);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('artifacts.new'),
                    headerRight: HeaderRight,
                }}
            />
            <View style={styles.container}>
                {/* Title input */}
                <View style={styles.titleSection}>
                    <Text style={styles.label}>{t('artifacts.titleLabel')}</Text>
                    <TextInput
                        style={[
                            styles.input,
                            titleFocused && styles.inputFocused,
                            Platform.OS === 'web' && {
                                outlineStyle: 'none',
                                outline: 'none',
                                outlineWidth: 0,
                                outlineColor: 'transparent',
                            } as any,
                        ]}
                        value={title}
                        onChangeText={setTitle}
                        placeholder={t('artifacts.titlePlaceholder')}
                        placeholderTextColor={theme.colors.input.placeholder}
                        onFocus={() => setTitleFocused(true)}
                        onBlur={() => setTitleFocused(false)}
                        editable={!isSaving}
                        returnKeyType="next"
                        autoCapitalize="sentences"
                    />
                </View>

                {/* Markdown body editor */}
                <MarkdownEditor
                    value={body}
                    onChangeText={setBody}
                    placeholder={t('artifacts.bodyPlaceholder')}
                    initialMode="edit"
                />
            </View>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    titleSection: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    } as any,
    inputFocused: {
        borderColor: theme.colors.button.primary.background,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.header.tint,
    },
    headerButtonDisabled: {
        opacity: 0.5,
    },
}));
