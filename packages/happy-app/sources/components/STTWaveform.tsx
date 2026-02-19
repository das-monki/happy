/**
 * Scrolling audio waveform that visualizes audio level history.
 *
 * New bars appear on the right with the current audio level and scroll
 * left over time, creating a real-time audio timeline. Each bar's height
 * is the audio level at the moment it was sampled.
 *
 * Smoothing: an exponential moving average (EMA) is applied to the raw
 * audio level before sampling to reduce visual jitter. Each sample gets
 * a stable unique ID so React doesn't re-create DOM nodes when the
 * oldest sample is dropped.
 */
import * as React from "react";
import { View, LayoutChangeEvent } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

interface STTWaveformProps {
  /** Current audio level (0-1) */
  level: number;
  /** Whether actively recording */
  isRecording?: boolean;
}

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 28;
const SAMPLE_INTERVAL = 80;
const SMOOTHING = 0.35; // EMA factor — lower = smoother, higher = more reactive

interface Sample {
  id: number;
  level: number;
}

export const STTWaveform = React.memo(function STTWaveform({
  level,
  isRecording = true,
}: STTWaveformProps) {
  const { theme } = useUnistyles();
  const [width, setWidth] = React.useState(0);
  const [samples, setSamples] = React.useState<Sample[]>([]);
  const levelRef = React.useRef(level);
  levelRef.current = level;
  const smoothedRef = React.useRef(0);
  const idRef = React.useRef(0);

  const maxBars = width > 0 ? Math.floor(width / BAR_STEP) : 0;

  React.useEffect(() => {
    if (!isRecording) {
      setSamples([]);
      smoothedRef.current = 0;
      idRef.current = 0;
      return;
    }

    const id = setInterval(() => {
      // Exponential moving average for smooth transitions
      smoothedRef.current =
        smoothedRef.current * (1 - SMOOTHING) + levelRef.current * SMOOTHING;

      const sampleId = ++idRef.current;
      setSamples((prev) => {
        const next = [...prev, { id: sampleId, level: smoothedRef.current }];
        if (maxBars > 0 && next.length > maxBars) {
          return next.slice(next.length - maxBars);
        }
        return next;
      });
    }, SAMPLE_INTERVAL);

    return () => clearInterval(id);
  }, [isRecording, maxBars]);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const barColor = theme.colors.textSecondary;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {samples.map((s) => (
        <View
          key={s.id}
          style={{
            width: BAR_WIDTH,
            borderRadius: BAR_WIDTH / 2,
            backgroundColor: barColor,
            height: Math.max(MIN_BAR_HEIGHT, s.level * MAX_BAR_HEIGHT),
          }}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create(() => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
    height: MAX_BAR_HEIGHT,
    gap: BAR_GAP,
    overflow: "hidden",
    marginRight: 8,
  },
}));
