// Small building blocks used all over the app (cards, buttons, chips, labels)
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cardShadow, colors, radius } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, icon, variant = "primary", loading, disabled, small, style }: ButtonProps) {
  const fg = variant === "primary" ? colors.white : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        variant === "primary" && styles.btnPrimary,
        variant === "secondary" && styles.btnSecondary,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

// row of tappable options, used instead of a dropdown since those look different on every platform
export function ChipSelect({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && { color: colors.white }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{text}</Text>
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
    borderColor: colors.slate200,
    padding: 16,
    ...cardShadow,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  btnPrimary: { backgroundColor: colors.pine600 },
  btnSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate200 },
  btnText: { fontSize: 15, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.pine600, borderColor: colors.pine600 },
  chipText: { fontSize: 14, color: colors.slate700, fontWeight: "500" },
  label: { fontSize: 13, fontWeight: "600", color: colors.slate600, marginBottom: 6 },
  pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
});
