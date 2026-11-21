// Find tab: search form, live agent feed, then the ranked clinic list
import { useMemo } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AgentFeed from "@/components/AgentFeed";
import ClinicCard from "@/components/ClinicCard";
import MissionForm from "@/components/MissionForm";
import { Card } from "@/components/ui";
import { mergeClinics } from "@/lib/clinics";
import { colors } from "@/lib/theme";
import { useAppState } from "@/state/AppState";

function EmptyState() {
  const steps = [
    ["Find the clinics", "Searches your city for family practices."],
    ["Read every website", "Agents check who's accepting new patients."],
    ["Rank them for you", "Sorted for your coverage, language and distance."],
  ];
  return (
    <Card style={{ gap: 12 }}>
      <Text style={styles.emptyTitle}>Your results will show up here</Text>
      <Text style={styles.emptyText}>
        Hit Launch CareScout to start. A live search takes a few minutes, demo mode shows saved results right away.
      </Text>
      {steps.map(([title, text], i) => (
        <View key={title} style={styles.emptyStep}>
          <View style={styles.stepNum}>
            <Text style={{ color: colors.white, fontSize: 12, fontWeight: "700" }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.emptyText}>{text}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function FindScreen() {
  const { search, setSearch, mission, launch, publicDemo } = useAppState();
  const { state, stop, reset, updateClinic } = mission;

  const clinics = useMemo(() => mergeClinics(state.scanned, state.urls, state.ranked), [state.scanned, state.urls, state.ranked]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      {/* keeps the keyboard from covering the inputs on iOS */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.h1}>Find a family doctor</Text>
            <Text style={styles.sub}>Tell CareScout where you are and what you need.</Text>
          </View>

          <MissionForm
            values={search}
            onChange={setSearch}
            onLaunch={() => launch()}
            onStop={stop}
            running={state.running}
            publicDemo={publicDemo}
          />
          <AgentFeed state={state} onStop={stop} onReset={reset} />

          {clinics.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.h2}>
                {state.ranked ? "Best matches first" : "Results so far"} ({clinics.length})
              </Text>
              {clinics.map((c) => (
                <ClinicCard
                  key={c.url}
                  clinic={c}
                  email={search.email.trim()}
                  city={search.city}
                  postalCode={search.postalCode}
                  publicDemo={publicDemo}
                  rankingPending={state.running && !state.ranked}
                  onUpdated={updateClinic}
                />
              ))}
            </View>
          ) : (
            !state.running && state.log.length === 0 && <EmptyState />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  h2: { fontSize: 16, fontWeight: "700", color: colors.ink },
  sub: { fontSize: 14, color: colors.slate500, marginTop: 4 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  emptyText: { fontSize: 13, color: colors.slate500, lineHeight: 18 },
  emptyStep: { flexDirection: "row", gap: 10, backgroundColor: colors.paper, padding: 12, borderRadius: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
});
