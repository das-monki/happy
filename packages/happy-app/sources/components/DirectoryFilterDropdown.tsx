import * as React from 'react';
import { View, Text, Pressable, Platform, UIManager } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { FloatingOverlay } from './FloatingOverlay';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

// Check if the ExpoUI ContextMenu native view is actually registered in this binary.
const hasNativeContextMenu = Platform.OS !== 'web' &&
    !!UIManager.getViewManagerConfig('ViewManagerAdapter_ExpoUI_ContextMenu');

// Only load the native modules if the native view is available.
let NativeContextMenu: any = null;
let NativePicker: any = null;
if (hasNativeContextMenu) {
    try {
        NativeContextMenu = require('@expo/ui/src/swift-ui/ContextMenu').ContextMenu;
        NativePicker = require('@expo/ui/src/swift-ui/Picker').Picker;
    } catch {
        NativeContextMenu = null;
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
 * Native implementation using @expo/ui ContextMenu + Picker.
 */
const NativeDropdown = React.memo(function NativeDropdown({
    directories,
    selected,
    onSelect,
    children,
}: DirectoryFilterDropdownProps) {
    const ContextMenu = NativeContextMenu;
    const Picker = NativePicker;

    const options = React.useMemo(() => {
        return [t('tasks.filterAll'), ...directories.map(d => d.displayName)];
    }, [directories]);

    const selectedIndex = React.useMemo(() => {
        if (selected === null) return 0;
        const idx = directories.findIndex(d => d.directory === selected);
        return idx === -1 ? 0 : idx + 1;
    }, [selected, directories]);

    const handleOptionSelected = React.useCallback((event: { nativeEvent: { index: number; label: string } }) => {
        const idx = event.nativeEvent.index;
        if (idx === 0) {
            onSelect(null);
        } else {
            const dir = directories[idx - 1];
            if (dir) {
                onSelect(dir.directory);
            }
        }
    }, [onSelect, directories]);

    return (
        <ContextMenu activationMethod="singlePress">
            <ContextMenu.Trigger>
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Items>
                <Picker
                    options={options}
                    selectedIndex={selectedIndex}
                    onOptionSelected={handleOptionSelected}
                />
            </ContextMenu.Items>
        </ContextMenu>
    );
});

/**
 * Custom fallback dropdown using FloatingOverlay.
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
                                    pressed && Platform.OS === 'ios' && { backgroundColor: theme.colors.surfacePressedOverlay },
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
                                        pressed && Platform.OS === 'ios' && { backgroundColor: theme.colors.surfacePressedOverlay },
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

export const DirectoryFilterDropdown = NativeContextMenu ? NativeDropdown : CustomDropdown;

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
