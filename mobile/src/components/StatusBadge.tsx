import { StyleSheet, Text, View } from "react-native";
import { STATUS_STYLE, displayStatus, type DisplayStatus } from "@/lib/clinics";
import { fonts } from "@/lib/theme";
import type { Clinic } from "@/lib/types";

export default function StatusBadge({ clinic, status }: { clinic?: Partial<Clinic>; status?: DisplayStatus }) {
  const key = status || (clinic ? displayStatus(clinic) : "unknown");
  const s = STATUS_STYLE[key] || STATUS_STYLE.unknown;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.dot }]} />
      <Text style={[styles.text, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: fonts.bodySemi, fontSize: 12 },
});
