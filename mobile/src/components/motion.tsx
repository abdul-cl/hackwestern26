// Animation pieces, done with Reanimated since GSAP / React Bits only run on the web.
// Same rule as the website: one hero moment, everything else only moves after you do something.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, fonts } from "@/lib/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---------- pulse line (the ECG trace) ----------

// one heartbeat shape, repeated across a 300 x 60 box
const BEAT: [number, number][] = [
  [0, 30], [38, 30], [46, 26], [54, 30], [62, 30], [68, 36], [76, 6], [84, 50], [90, 30], [104, 30], [114, 24], [124, 30], [150, 30],
];
const POINTS: [number, number][] = [...BEAT, ...BEAT.slice(1).map(([x, y]) => [x + 150, y] as [number, number])];
const PATH_D = "M" + POINTS.map(([x, y]) => `${x} ${y}`).join(" L");
// total length of the line, needed for the dash trick
const PATH_LEN = POINTS.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - POINTS[i][0], y - POINTS[i][1]), 0);
const SEG = PATH_LEN * 0.28; // length of the bright moving piece

type PulseProps = { live: boolean; color?: string; height?: number; style?: StyleProp<ViewStyle> };

// live = a bright segment keeps running along the trace, otherwise it's drawn solid once
export function PulseLine({ live, color = colors.pulse, height = 48, style }: PulseProps) {
  const reduced = useReducedMotion();
  const offset = useSharedValue(PATH_LEN);

  // .set() instead of .value = so it plays nice with the React compiler lint rules
  useEffect(() => {
    if (reduced) {
      offset.set(0);
      return;
    }
    if (live) {
      offset.set(PATH_LEN + SEG);
      offset.set(withRepeat(withTiming(-SEG, { duration: 2200, easing: Easing.linear }), -1, false));
    } else {
      offset.set(withTiming(0, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }
  }, [live, reduced, offset]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  const dash = live && !reduced ? [SEG, PATH_LEN] : [PATH_LEN, PATH_LEN];

  return (
    <View style={[{ height }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 60" preserveAspectRatio="none">
        {/* faint full trace underneath so the shape is always readable */}
        <Path d={PATH_D} stroke={color} strokeOpacity={0.18} strokeWidth={2} fill="none" />
        <AnimatedPath
          d={PATH_D}
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={dash}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}

// ---------- word-by-word reveal (like React Bits' Split Text) ----------

export function SplitWords({ text, style, delay = 0 }: { text: string; style?: StyleProp<TextStyle>; delay?: number }) {
  const words = useMemo(() => text.split(" "), [text]);
  // word spacing comes from the gap, a trailing space inside each word can get dropped on native
  const size = StyleSheet.flatten(style)?.fontSize ?? 16;
  return (
    <View style={[styles.words, { columnGap: Math.round(size * 0.26) }]} accessible accessibilityRole="header" accessibilityLabel={text}>
      {words.map((w, i) => (
        <Animated.View key={i} entering={FadeInDown.delay(delay + i * 70).duration(480)}>
          <Text style={style}>{w}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ---------- count up (like React Bits' Count Up) ----------

export function CountUp({ to, style, duration = 700 }: { to: number; style?: StyleProp<TextStyle>; duration?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (reduced) return; // just shows the final number below
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3)))); // ease out
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, reduced]);

  return <Text style={style}>{reduced ? to : n}</Text>;
}

// ---------- score ring that fills in ----------

export function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const reduced = useReducedMotion();
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 70 ? colors.pine : score >= 40 ? colors.amber : colors.coral;
  const progress = useSharedValue(reduced ? pct : 0);

  useEffect(() => {
    progress.set(reduced ? pct : withDelay(150, withTiming(pct, { duration: 800, easing: Easing.out(Easing.cubic) })));
  }, [pct, reduced, progress]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));

  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`Match score ${score} out of 100`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[c, c]}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <Text style={[styles.score, { lineHeight: size }]}>{score}</Text>
      </View>
    </View>
  );
}

// ---------- pressable that gives a little when you press it ----------

export function PressableScale({ children, style, ...rest }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (!reduced) scale.set(withSpring(0.96, { damping: 18, stiffness: 400 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

// fades + slides a block in, used for results as they arrive
type RevealProps = { children: ReactNode; index?: number; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void };

export function Reveal({ children, index = 0, style, onLayout }: RevealProps) {
  // cap the delay so the 20th card doesn't wait forever
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(420)} style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  words: { flexDirection: "row", flexWrap: "wrap" },
  score: {
    flex: 1,
    textAlign: "center",
    textAlignVertical: "center",
    fontFamily: fonts.mono,
    fontSize: 15,
    color: colors.ink,
  },
});
