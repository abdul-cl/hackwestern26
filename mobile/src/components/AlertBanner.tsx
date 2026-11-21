// Green banner that drops in from the top when a watched clinic opens (real check or simulated demo)
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius } from "@/lib/theme";
import { useAppState } from "@/state/AppState";
import { Ionicons, T } from "./ui";

export default function AlertBanner() {
  const { alert, setAlert } = useAppState();
  const insets = useSafeAreaInsets();
  if (!alert) return null;

  const headline = `${alert.clinic_name} is now ${alert.new_status === "waitlist" ? "taking waitlist sign-ups" : "accepting new patients"}`;

  return (
    <Animated.View
      key={alert.alert_id ?? alert.id}
      entering={SlideInUp.duration(380)}
      exiting={SlideOutUp.duration(250)}
      style={[styles.wrap, { top: insets.top + 8 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.banner}>
        <Ionicons name="notifications" size={20} color={colors.pulse} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <T style={styles.title}>{headline}</T>
            {alert.simulated && (
              <View style={styles.demo}>
                <T style={styles.demoText}>demo</T>
              </View>
            )}
          </View>
          <T style={styles.msg}>{alert.message}</T>
          <Pressable onPress={() => Linking.openURL(alert.url).catch(() => {})} style={styles.open} accessibilityRole="link" accessibilityLabel="Open clinic" hitSlop={6}>
            <T style={styles.openText}>Open clinic</T>
            <Ionicons name="open-outline" size={13} color={colors.pulse} />
          </Pressable>
        </View>
        <Pressable onPress={() => setAlert(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss alert">
          <Ionicons name="close" size={20} color="#B9D6CC" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 100 },
  banner: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: colors.pineDeep,
    borderRadius: radius.lg,
    padding: 14,
    boxShadow: "0 8px 24px rgba(9, 58, 49, 0.35)",
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20, color: colors.white, flexShrink: 1 },
  msg: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: "#B9D6CC" },
  demo: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  demoText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.white },
  open: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  openText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.pulse },
});
