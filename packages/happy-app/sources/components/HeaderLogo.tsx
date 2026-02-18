import * as React from 'react';
import { Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';

/**
 * Shared header logo component used across all main tabs.
 * Extracted to prevent flickering on tab switches - when each tab
 * had its own HeaderLeft, the component would unmount/remount.
 * Tapping navigates to the settings screen.
 */
export const HeaderLogo = React.memo(() => {
    const { theme } = useUnistyles();
    const router = useRouter();
    return (
        <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={{
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Image
                source={require('@/assets/images/logo-black.png')}
                contentFit="contain"
                style={{ width: 24, height: 24 }}
                tintColor={theme.colors.header.tint}
            />
        </Pressable>
    );
});
