// How it works tab: the four agents in plain words
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Ionicons, type IconName } from "@/components/ui";
import { colors } from "@/lib/theme";

const STEPS: { icon: IconName; name: string; text: string }[] = [
  { icon: "compass-outline", name: "Scout", text: "Pulls clinics for your city from the CareScout database, and searches the web if there aren't enough." },
  { icon: "globe-outline", name: "Browser Swarm", text: "Reads each clinic's website to see if they're accepting, have a waitlist, or are full. Tricky sites get a real browser agent." },
  { icon: "podium-outline", name: "Triage", text: "Ranks the clinics for your coverage, language and distance, and writes a call script for the ones without an online form." },
  { icon: "notifications-outline", name: "Watchdog", text: "Keeps an eye on full clinics and lets you know when one opens up again." },
];

export default function HowItWorksScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.h1}>How it works</Text>
        <Text style={styles.sub}>One search runs four agents, one after the other.</Text>
        {STEPS.map((s, i) => (
          <Card key={s.name} style={styles.card}>
            <View style={styles.icon}>
              <Ionicons name={s.icon} size={22} color={colors.pine600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {i + 1}. {s.name}
              </Text>
              <Text style={styles.text}>{s.text}</Text>
            </View>
          </Card>
        ))}
        <Text style={styles.note}>
          Auto-Fill never submits a form for you. It fills it in and you review it and press submit yourself.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 14, color: colors.slate500, marginBottom: 4 },
  card: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  icon: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.pine50, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "700", color: colors.ink },
  text: { fontSize: 13, color: colors.slate600, lineHeight: 19, marginTop: 2 },
  note: { fontSize: 12, color: colors.slate500, textAlign: "center", marginTop: 8 },
});
