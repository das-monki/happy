import * as React from "react";
import { View, Pressable } from "react-native";
import { Image } from "expo-image";
import { StyleSheet } from "react-native-unistyles";

const mascot = require("@/assets/images/mascot.png");

interface AssistantButtonProps {
  onPress: () => void;
  bottom: number;
}

export const AssistantButton = React.memo(
  ({ onPress, bottom }: AssistantButtonProps) => {
    return (
      <View style={[styles.container, { bottom }]}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={onPress}
        >
          <Image
            source={mascot}
            style={{ width: 80, height: 80 }}
            contentFit="cover"
          />
        </Pressable>
      </View>
    );
  },
);

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    right: 32,
    zIndex: 10,
    // Shadow on outer container so overflow:hidden on button doesn't clip it
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    shadowOpacity: 0.3,
    elevation: 8,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.93 }],
  },
}));
