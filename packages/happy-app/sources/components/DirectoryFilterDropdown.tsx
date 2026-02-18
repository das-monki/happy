import * as React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { FloatingOverlay } from './FloatingOverlay';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

// Load @expo/ui native components on iOS for native UIMenu appearance.
let ExpoContextMenu: any = null;
let ExpoButton: any = null;
let ExpoHost: any = null;
let expoFixedSize: any = null;
let expoButtonStyle: any = null;
let expoFrame: any = null;
if (Platform.OS === 'ios') {
    try {
        const ui = require('@expo/ui/swift-ui');
        const modifiers = require('@expo/ui/swift-ui/modifiers');
        ExpoContextMenu = ui.ContextMenu;
        ExpoButton = ui.Button;
        ExpoHost = ui.Host;
        expoFixedSize = modifiers.fixedSize;
        expoButtonStyle = modifiers.buttonStyle;
        expoFrame = modifiers.frame;
    } catch {
        ExpoContextMenu = null;
    }
}

export interface DirectoryOption {
    directory: string;
    displayName: string;
}

interface DirectoryFilterDropdownProps {
    directories: DirectoryOption[];
    selected: string | null;
    onSelect: (directory: string | null) => void;
    children: React.ReactNode;
}

/**
 * iOS implementation using @expo/ui ContextMenu for native UIMenu appearance.
 */
class NativeDropdownErrorBoundary extends React.Component<
    { fallback: React.ReactNode; children: React.ReactNode },
    { hasError: boolean; error: any }
> {
    state = { hasError: false, error: null };
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    componentDidCatch(error: any, info: any) {
        console.log('[DirectoryFilter] ContextMenu crash:', error, info?.componentStack);
    }
    render() {
        if (this.state.hasError) return this.props.fallback;
        return this.props.children;
    }
}

const NativeDropdownInner = React.memo(function NativeDropdownInner({
    directories,
    selected,
    onSelect,
    children,
}: DirectoryFilterDropdownProps) {
    const ContextMenu = ExpoContextMenu;
    const Button = ExpoButton;
    const Host = ExpoHost;

    return (
        <View>
            {children}
            <Host
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02 }}
                useViewportSizeMeasurement
            >
                <ContextMenu
                    activationMethod="singlePress"
                    modifiers={[
                        expoFrame({ maxWidth: 99999, maxHeight: 99999 }),
                        expoButtonStyle('bordered'),
                    ]}
                >
                    <ContextMenu.Items>
                        <Button
                            systemImage={selected === null ? 'checkmark' : undefined}
                            onPress={() => onSelect(null)}
                        >
                            {t('tasks.filterAll')}
                        </Button>
                        {directories.map((dir) => (
                            <Button
                                key={dir.directory}
                                systemImage={selected === dir.directory ? 'checkmark' : undefined}
                                onPress={() => onSelect(dir.directory)}
                            >
                                {dir.displayName}
                            </Button>
                        ))}
                    </ContextMenu.Items>
                    <ContextMenu.Trigger>
                        <Button
                            variant="plain"
                            modifiers={[expoFrame({ maxWidth: 99999, maxHeight: 99999 })]}
                        >
                            {' '}
                        </Button>
                    </ContextMenu.Trigger>
                </ContextMenu>
            </Host>
        </View>
    );
});

const NativeDropdown = React.memo(function NativeDropdown(props: DirectoryFilterDropdownProps) {
    return (
        <NativeDropdownErrorBoundary fallback={<CustomDropdown {...props} />}>
            <View style={{ alignItems: 'center' }}>
                <NativeDropdownInner {...props} />
            </View>
        </NativeDropdownErrorBoundary>
    );
});

/**
 * Fallback dropdown using FloatingOverlay (Android / web).
 */
const CustomDropdown = React.memo(function CustomDropdown({
    directories,
    selected,
    onSelect,
    children,
}: DirectoryFilterDropdownProps) {
    const { theme } = useUnistyles();
    const [open, setOpen] = React.useState(false);

    const handleToggle = React.useCallback(() => {
        setOpen(prev => !prev);
    }, []);

    const handleDismiss = React.useCallback(() => {
        setOpen(false);
    }, []);

    const handleSelectAll = React.useCallback(() => {
        onSelect(null);
        setOpen(false);
    }, [onSelect]);

    const handleSelectDirectory = React.useCallback((directory: string) => {
        onSelect(directory);
        setOpen(false);
    }, [onSelect]);

    return (
        <View style={styles.wrapper}>
            <Pressable onPress={handleToggle}>
                {children}
            </Pressable>
            {open && (
                <>
                    <Pressable
                        style={styles.backdrop}
                        onPress={handleDismiss}
                    />
                    <View style={styles.dropdownContainer}>
                        <FloatingOverlay maxHeight={280}>
                            <Pressable
                                onPress={handleSelectAll}
                                style={({ pressed }) => [
                                    styles.row,
                                    pressed && { backgroundColor: theme.colors.surfacePressedOverlay },
                                ]}
                            >
                                <Text style={[styles.rowText, { color: theme.colors.text }]}>
                                    {t('tasks.filterAll')}
                                </Text>
                                {selected === null && (
                                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                                )}
                            </Pressable>
                            {directories.map((dir) => (
                                <Pressable
                                    key={dir.directory}
                                    onPress={() => handleSelectDirectory(dir.directory)}
                                    style={({ pressed }) => [
                                        styles.row,
                                        pressed && { backgroundColor: theme.colors.surfacePressedOverlay },
                                    ]}
                                >
                                    <Text
                                        style={[styles.rowText, { color: theme.colors.text }]}
                                        numberOfLines={1}
                                    >
                                        {dir.displayName}
                                    </Text>
                                    {selected === dir.directory && (
                                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                                    )}
                                </Pressable>
                            ))}
                        </FloatingOverlay>
                    </View>
                </>
            )}
        </View>
    );
});

export const DirectoryFilterDropdown = ExpoContextMenu ? NativeDropdown : CustomDropdown;

const styles = StyleSheet.create((theme) => ({
    wrapper: {
        position: 'relative',
        alignItems: 'center',
    },
    backdrop: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 199,
    },
    dropdownContainer: {
        position: 'absolute',
        top: '100%',
        zIndex: 200,
        minWidth: 200,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    rowText: {
        fontSize: 15,
        flex: 1,
        ...Typography.default(),
    },
}));
