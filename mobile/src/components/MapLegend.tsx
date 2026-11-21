// Legend shown over the map, shared by the native map and the web fallback
import { StyleSheet, View } from "react-native";
import { STATUS_STYLE, displayStatus, type DisplayStatus } from "@/lib/clinics";
import { colors, fonts } from "@/lib/theme";
import type { MergedClinic } from "@/lib/types";
import { Ionicons, T } from "./ui";

export type MapProps = { clinics: MergedClinic[]; selectedUrl: string | null; onSelect: (url: string) => void };

export function MapLegend({ clinics, missing }: { clinics: MergedClinic[]; missing: number }) {
  const keys: DisplayStatus[] = ["accepting", "waitlist", "closed"];
  if (clinics.some((c) => displayStatus(c) === "expired")) keys.push("expired");
  return (
    <>
      <View style={styles.legend} pointerEvents="none">
        {keys.map((k) => (
          <View key={k} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: STATUS_STYLE[k].dot }]} />
            <T style={styles.text}>{STATUS_STYLE[k].label}</T>
          </View>
        ))}
      </View>
      {missing > 0 && (
        <View style={styles.missing} pointerEvents="none">
          <Ionicons name="location-outline" size={12} color={colors.muted} />
          <T style={styles.text}>{missing} without a map location</T>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: "absolute",
    left: 10,
    bottom: 10,
    right: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  text: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },
  missing: {
    position: "absolute",
    right: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
