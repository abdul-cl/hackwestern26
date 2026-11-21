// Small building blocks used all over the app (text, cards, buttons, chips)
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cardShadow, colors, fonts, radius } from "@/lib/theme";
import { PressableScale } from "./motion";

type IconName = ComponentProps<typeof Ionicons>["name"];

// one text component so fonts stay consistent. custom fonts need a family per weight,
// so weight is picked with `variant` and not fontWeight (fontWeight breaks custom fonts on Android)
const VARIANTS = {
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.ink },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: colors.ink },
  h2: { fontFamily: fonts.displayMid, fontSize: 19, lineHeight: 24, letterSpacing: -0.2, color: colors.ink },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: colors.muted, textTransform: "uppercase" },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: colors.muted },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

export function T({ variant = "body", style, ...rest }: TextProps & { variant?: TextVariant; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[VARIANTS[variant], style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "light" | "outlineLight";
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

const BTN_COLORS = {
  primary: { bg: colors.pine, fg: colors.white, border: colors.pine },
  secondary: { bg: colors.white, fg: colors.ink, border: colors.line },
  ghost: { bg: "transparent", fg: colors.pine, border: "transparent" },
  light: { bg: colors.white, fg: colors.pineDeep, border: colors.white }, // for use on the dark hero
  outlineLight: { bg: "transparent", fg: colors.pulse, border: "rgba(94, 226, 176, 0.35)" }, // second button on the dark hero
};

export function Button({ title, onPress, icon, variant = "primary", loading, disabled, small, style }: ButtonProps) {
  const c = BTN_COLORS[variant];
  const off = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      aria-disabled={!!off}
      aria-busy={!!loading}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: c.bg, borderColor: c.border },
        off && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={small ? 15 : 18} color={c.fg} />
      ) : null}
      <Text style={[styles.btnText, small && styles.btnTextSmall, { color: c.fg }]}>{title}</Text>
    </PressableScale>
  );
}

// row of tappable options, used instead of a dropdown since those look different on every platform
export function ChipSelect({ options, value, onChange, label }: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            accessibilityRole="radio"
            // aria-* works on iOS, Android and web (react-native-web ignores accessibilityState)
            aria-checked={on}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && { backgroundColor: colors.mist }]}
          >
            <Text style={[styles.chipText, on && { color: colors.white }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <T variant="label" style={{ marginBottom: 8 }}>{children}</T>;
}

export function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export { Ionicons };
export type { IconName };

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    ...cardShadow,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 12, gap: 6, borderRadius: radius.sm },
  btnText: { fontFamily: fonts.bodySemi, fontSize: 16 },
  btnTextSmall: { fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  pill: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 12 },
});
