// Ontario's own waitlist for a family doctor. Worth doing alongside CareScout, so it shows up
// after results (louder when nothing nearby is accepting) and on How it works
import { Linking, StyleSheet, View } from "react-native";
import { PressableScale } from "@/components/motion";
import { Ionicons, T } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";

export const HCC_URL = "https://www.ontario.ca/healthcareconnect";

export default function HealthCareConnect({ noneAccepting = false }: { noneAccepting?: boolean }) {
  return (
    <View style={[styles.card, noneAccepting && styles.loud]} accessibilityRole="summary">
      <View style={styles.head}>
        <Ionicons name="list-circle-outline" size={20} color={colors.pine} />
        <T style={styles.eyebrow}>{noneAccepting ? "Nothing accepting nearby? Do this next" : "Also do this"}</T>
      </View>
      <T variant="title">Join Ontario's Health Care Connect waitlist</T>
      <T variant="small">
        It's free and run by the province. A nurse looks for a family doctor or nurse practitioner taking patients near you
        and contacts you when there's a match. You need an Ontario health card. Sign up online or call 811.
      </T>
      <View style={styles.actions}>
        <PressableScale
          onPress={() => Linking.openURL(HCC_URL).catch(() => {})}
          style={styles.primary}
          accessibilityRole="link"
          accessibilityLabel="Sign up for Health Care Connect on ontario.ca"
        >
          <T style={styles.primaryText}>Sign up on ontario.ca</T>
          <Ionicons name="open-outline" size={14} color={colors.white} />
        </PressableScale>
        <PressableScale
          onPress={() => Linking.openURL("tel:811").catch(() => {})}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel="Call 811 to sign up by phone"
        >
          <Ionicons name="call-outline" size={14} color={colors.ink} />
          <T style={styles.secondaryText}>Call 811</T>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  loud: { borderColor: colors.pine, borderWidth: 1.5, backgroundColor: colors.pineSoft },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: colors.pine },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.pine,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.white },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
