// Find tab: search form, live agent feed, then the map + ranked clinic list
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AgentFeed from "@/components/AgentFeed";
import ApplySheet from "@/components/ApplySheet";
import ClinicCard from "@/components/ClinicCard";
import ClinicMap from "@/components/ClinicMap";
import MissionForm from "@/components/MissionForm";
import { Reveal } from "@/components/motion";
import { Card, Ionicons, T } from "@/components/ui";
import { mergeClinics } from "@/lib/clinics";
import { colors, fonts, radius } from "@/lib/theme";
import type { MergedClinic } from "@/lib/types";
import { useAppState } from "@/state/AppState";

function EmptyState() {
  return (
    <Card style={{ gap: 8, alignItems: "center", paddingVertical: 26 }}>
      <Ionicons name="pulse" size={26} color={colors.pine} />
      <T variant="h2">Results show up here</T>
      <T variant="small" style={{ textAlign: "center", maxWidth: 300 }}>
        A live search takes a few minutes while agents read each clinic's website. Demo mode shows saved results right away.
      </T>
    </Card>
  );
}

export default function FindScreen() {
  const { search, setSearch, mission, launch, publicDemo, refreshWatchCount } = useAppState();
  const { state, stop, reset, updateClinic } = mission;
  const params = useLocalSearchParams<{ demo?: string }>();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const resultsY = useRef(0);
  const feedY = useRef(0);
  const cardY = useRef<Record<string, number>>({});
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [applyFor, setApplyFor] = useState<MergedClinic | null>(null);
  const [showMap, setShowMap] = useState(true);

  const clinics = useMemo(() => mergeClinics(state.scanned, state.urls, state.ranked), [state.scanned, state.urls, state.ranked]);
  const hasPins = clinics.some((c) => typeof c.lat === "number" && typeof c.lng === "number");

  // carescout://find?demo=1 (or /find?demo=1 on web) turns on demo mode and runs it, same as the website
  const demoStarted = useRef(false);
  useEffect(() => {
    if (params.demo !== "1") {
      demoStarted.current = false;
      return;
    }
    if (!demoStarted.current) {
      demoStarted.current = true;
      router.setParams({ demo: undefined });
      setSearch((s) => ({ ...s, useCache: true }));
      if (!state.running) launch({ useCache: true });
    }
    // only reacts to the link itself, launch/search changing shouldn't start another demo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.demo]);

  const onLaunch = () => {
    setSelectedUrl(null);
    launch();
    // jump down to the live feed so you can watch it (wait a beat for it to render first)
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, feedY.current - 12), animated: true }), 200);
  };

  // tapping a map pin highlights its card and scrolls to it
  const selectFromMap = useCallback((url: string) => {
    setSelectedUrl(url);
    const y = cardY.current[url];
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, resultsY.current + y - 12), animated: true });
  }, []);

  const onCardLayout = useCallback((url: string, e: LayoutChangeEvent) => {
    cardY.current[url] = e.nativeEvent.layout.y;
  }, []);

  const onWatched = useCallback(() => refreshWatchCount(), [refreshWatchCount]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      {/* keeps the keyboard from covering the inputs on iOS */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 4 }}>
            <T variant="h1">Find a family doctor</T>
            <T variant="small">Tell CareScout where you are and what you need. Agents check each clinic's website for you.</T>
          </View>

          <MissionForm values={search} onChange={setSearch} onLaunch={onLaunch} onStop={stop} running={state.running} publicDemo={publicDemo} />
          {(state.running || state.log.length > 0) && (
            <View onLayout={(e) => (feedY.current = e.nativeEvent.layout.y)}>
              <AgentFeed state={state} onStop={stop} onReset={reset} />
            </View>
          )}

          <View onLayout={(e) => (resultsY.current = e.nativeEvent.layout.y)}>
            {clinics.length > 0 ? (
              <View style={{ gap: 12 }}>
                <View style={styles.resultsHead}>
                  <T variant="h2" style={{ flex: 1 }}>
                    {state.ranked ? "Best matches first" : "Results so far"} <T style={styles.count}>{clinics.length}</T>
                  </T>
                  {hasPins && (
                    <Pressable
                      onPress={() => setShowMap((m) => !m)}
                      style={styles.mapToggle}
                      accessibilityRole="button"
                      accessibilityLabel={showMap ? "Hide map" : "Show map"}
                      hitSlop={6}
                    >
                      <Ionicons name={showMap ? "list" : "map-outline"} size={15} color={colors.ink} />
                      <T style={styles.mapToggleText}>{showMap ? "List only" : "Map"}</T>
                    </Pressable>
                  )}
                </View>

                {hasPins && showMap && <ClinicMap clinics={clinics} selectedUrl={selectedUrl} onSelect={selectFromMap} />}

                {clinics.map((c, i) => (
                  <Reveal key={c.url} index={i} onLayout={(e) => onCardLayout(c.url, e)}>
                    <ClinicCard
                      clinic={c}
                      email={search.email.trim()}
                      city={search.city}
                      postalCode={search.postalCode}
                      publicDemo={publicDemo}
                      rankingPending={state.running && !state.ranked}
                      selected={c.url === selectedUrl}
                      onSelect={setSelectedUrl}
                      onApply={setApplyFor}
                      onUpdated={updateClinic}
                      onWatched={onWatched}
                    />
                  </Reveal>
                ))}
              </View>
            ) : (
              !state.running && state.log.length === 0 && <EmptyState />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ApplySheet clinic={applyFor} defaults={search} onClose={() => setApplyFor(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 48 },
  resultsHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  count: { fontFamily: fonts.mono, fontSize: 15, color: colors.muted },
  mapToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  mapToggleText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
});
