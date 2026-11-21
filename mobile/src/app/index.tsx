// Home tab: the hero (headline + pulse line) and two ways in, real search or the instant demo
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { PulseLine, SplitWords } from "@/components/motion";
import { Button, Ionicons, T, type IconName } from "@/components/ui";
import { API_BASE_URL } from "@/lib/config";
import { colors, fonts, radius } from "@/lib/theme";
import { useAppState } from "@/state/AppState";

// what a search actually does, in order (so the numbers mean something)
const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "compass-outline", title: "Finds clinics near you", text: "From the CareScout database, plus a web search if your city needs more." },
  { icon: "globe-outline", title: "Reads each clinic's website", text: "Checks whether they're accepting, have a waitlist, or are full." },
  { icon: "podium-outline", title: "Ranks them for you", text: "By your coverage, language and distance, with a call script when there's no form." },
  { icon: "notifications-outline", title: "Watches the full ones", text: "Add your email and you'll get an alert when one opens up." },
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
        <View style={styles.hero}>
          <View style={styles.brand}>
            <Ionicons name="pulse" size={18} color={colors.pulse} />
            <T style={styles.brandText}>CareScout</T>
          </View>

          <SplitWords text="Find a family doctor who's taking new patients." style={styles.heroText} delay={150} />

          <Animated.View entering={FadeIn.delay(700).duration(500)}>
            <T style={styles.heroSub}>
              Agents check every clinic website in your city and rank the ones that fit you. London, Ontario for now.
            </T>
          </Animated.View>

          {/* the signature: one heartbeat trace that draws itself in */}
          <PulseLine live={false} height={56} style={{ marginHorizontal: -22, marginVertical: 4 }} />

          <View style={{ gap: 10 }}>
            <Button title="Start a search" icon="search" variant="light" onPress={() => router.navigate("/find")} />
            <Button title="Watch a demo search" icon="play" variant="outlineLight" onPress={runDemo} />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <T variant="label">What happens when you search</T>
        </View>

        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={styles.step}>
              <View style={styles.rail}>
                <View style={styles.stepDot}>
                  <T style={styles.stepNum}>{i + 1}</T>
                </View>
                {i < STEPS.length - 1 && <View style={styles.railLine} />}
              </View>
              <View style={styles.stepBody}>
                <View style={styles.stepHead}>
                  <Ionicons name={s.icon} size={16} color={colors.pine} />
                  <T variant="title">{s.title}</T>
                </View>
                <T variant="small">{s.text}</T>
              </View>
            </View>
          ))}
        </View>

        {/* handy while testing: shows which backend the app is talking to */}
        <View style={styles.backend}>
          <View
            style={[styles.backendDot, { backgroundColor: backendUp == null ? colors.faint : backendUp ? colors.pine : colors.coral }]}
          />
          <T variant="mono" style={{ flexShrink: 1 }}>
            {backendUp == null ? "checking backend..." : `${backendUp ? "connected" : "can't reach"} · ${API_BASE_URL}`}
          </T>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 20, paddingBottom: 40 },
  hero: { backgroundColor: colors.pineDeep, borderRadius: radius.lg + 4, padding: 22, gap: 14, overflow: "hidden" },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontFamily: fonts.displayMid, fontSize: 17, color: colors.white },
  heroText: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: colors.white },
  heroSub: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: "#B9D6CC" },
  steps: { gap: 0 },
  step: { flexDirection: "row", gap: 14 },
  rail: { alignItems: "center", width: 28 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontFamily: fonts.mono, fontSize: 12, color: colors.pine },
  railLine: { width: 1, flex: 1, backgroundColor: colors.line, marginVertical: 4 },
  stepBody: { flex: 1, paddingBottom: 20, gap: 3 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  backend: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  backendDot: { width: 7, height: 7, borderRadius: 4 },
});
