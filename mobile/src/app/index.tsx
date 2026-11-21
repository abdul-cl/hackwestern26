// Home tab: quick intro and two ways in (real search or the instant demo)
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Ionicons, type IconName } from "@/components/ui";
import { API_BASE_URL } from "@/lib/config";
import { colors } from "@/lib/theme";
import { useAppState } from "@/state/AppState";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "map-outline", title: "Finds the clinics", text: "Searches your city for family practices." },
  { icon: "hardware-chip-outline", title: "Reads every website", text: "AI agents check who's taking new patients." },
  { icon: "sparkles-outline", title: "Ranks them for you", text: "Sorted by your coverage, language and distance." },
  { icon: "notifications-outline", title: "Watches full clinics", text: "Get an alert when one starts accepting again." },
];

export default function HomeScreen() {
  const { setSearch, launch, mission, backendUp } = useAppState();

  // same as the website's "Watch a demo search": demo mode on, run it, jump to results
  const runDemo = () => {
    setSearch((s) => ({ ...s, useCache: true }));
    if (!mission.state.running) launch({ useCache: true });
    router.navigate("/find");
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="medkit" size={18} color={colors.white} />
          </View>
          <Text style={styles.brandText}>CareScout</Text>
        </View>

        <Text style={styles.hero}>Find a family doctor who's actually taking patients.</Text>
        <Text style={styles.sub}>
          CareScout sends AI agents to check clinic websites across your city, then ranks the ones that fit you.
        </Text>

        <View style={{ gap: 10 }}>
          <Button title="Find a doctor" icon="search" onPress={() => router.navigate("/find")} />
          <Button title="Watch a demo search" icon="play-circle-outline" variant="secondary" onPress={runDemo} />
        </View>

        <View style={{ gap: 10 }}>
          {FEATURES.map((f) => (
            <Card key={f.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={colors.pine600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            </Card>
          ))}
        </View>

        {/* handy while testing: shows which backend the app is talking to */}
        <View style={styles.backend}>
          <View
            style={[
              styles.backendDot,
              { backgroundColor: backendUp == null ? colors.slate400 : backendUp ? "#10b981" : "#ef4444" },
            ]}
          />
          <Text style={styles.backendText}>
            {backendUp == null ? "Checking backend..." : backendUp ? "Connected to " : "Can't reach "}
            {backendUp != null && API_BASE_URL}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 20, paddingBottom: 40 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.pine600, alignItems: "center", justifyContent: "center" },
  brandText: { fontSize: 18, fontWeight: "800", color: colors.ink },
  hero: { fontSize: 30, fontWeight: "800", color: colors.ink, lineHeight: 36, letterSpacing: -0.5 },
  sub: { fontSize: 16, color: colors.slate600, lineHeight: 23 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.pine50, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  featureText: { fontSize: 13, color: colors.slate500, marginTop: 2 },
  backend: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  backendDot: { width: 8, height: 8, borderRadius: 4 },
  backendText: { fontSize: 12, color: colors.slate500 },
});
