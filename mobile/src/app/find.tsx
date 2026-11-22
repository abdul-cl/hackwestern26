// Find tab: search form, live agent feed, then the map + ranked clinic list
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import AgentFeed from "@/components/AgentFeed";
import ApplySheet from "@/components/ApplySheet";
import ClinicCard from "@/components/ClinicCard";
import ClinicMap from "@/components/ClinicMap";
import HandoffSheet from "@/components/HandoffSheet";
import { FeedbackSurvey, NextSteps, StatusFilterRow, WatchPrompt } from "@/components/AfterSearch";
import MissionForm from "@/components/MissionForm";
import { Reveal } from "@/components/motion";
import { Button, Card, Ionicons, T } from "@/components/ui";
import { displayStatus, matchesStatus, mergeClinics, type StatusFilter } from "@/lib/clinics";
import { searchFromParams, type HandoffParams } from "@/lib/handoff";
import { savedAgo } from "@/lib/storage";
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
  const { search, setSearch, mission, launch, loadMore, publicDemo, refreshWatchCount, savedAt, showSaved, backendUp } = useAppState();
  const { state, stop, reset, updateClinic, retryRank } = mission;
  const params = useLocalSearchParams<HandoffParams>();
  const scroll = useRef<Animated.ScrollView>(null);
  const resultsY = useRef(0);
  const feedY = useRef(0);
  const cardY = useRef<Record<string, number>>({});
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [applyFor, setApplyFor] = useState<MergedClinic | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [handoff, setHandoff] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");

  // a light buzz each time a clinic comes back accepting, and a success buzz when the search finishes.
  // `buzzed` remembers which clinics already buzzed this run, and resets when a new search starts
  const buzzed = useRef(new Set<string>());
  const runId = state.log[0]?.id;
  useEffect(() => {
    buzzed.current.clear();
  }, [runId]);
  useEffect(() => {
    if (state.restoredAt) return; // saved results from last time shouldn't buzz on launch
    for (const c of Object.values(state.scanned)) {
      if (!buzzed.current.has(c.url) && displayStatus(c) === "accepting") {
        buzzed.current.add(c.url);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }
  }, [state.scanned, state.restoredAt]);
  useEffect(() => {
    if (state.summary && !state.restoredAt) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [state.summary, state.restoredAt]);

  const allClinics = useMemo(() => mergeClinics(state.scanned, state.urls, state.ranked), [state.scanned, state.urls, state.ranked]);
  // status filter, like the website's (coverage is chosen in the search form)
  const clinics = useMemo(() => allClinics.filter((c) => matchesStatus(c, filter)), [allClinics, filter]);
  // saved results from the database, shown while the agents confirm them (dropped once each comes back)
  const preview = useMemo(() => state.preview.map((c) => ({ ...c, ranked: false }) as MergedClinic), [state.preview]);
  const finished = !state.running && state.log.length > 0;
  const hasPins = clinics.some((c) => typeof c.lat === "number" && typeof c.lng === "number");

  // links like carescout://find?city=...&postal=...&coverage=...&language=...&demo=1 fill in the form
  // (from the handoff QR or the website). demo=1 also runs the demo, same as the website's /find?demo=1
  const linkKey = [params.city, params.postal, params.coverage, params.language, params.demo].join("|");
  const handledLink = useRef("");
  useEffect(() => {
    if (linkKey === "||||" || handledLink.current === linkKey) return;
    handledLink.current = linkKey;
    const changes = { ...searchFromParams(params), ...(params.demo === "1" ? { useCache: true } : {}) };
    router.setParams({ city: undefined, postal: undefined, coverage: undefined, language: undefined, demo: undefined });
    if (Object.keys(changes).length) setSearch((s) => ({ ...s, ...changes }));
    if (params.demo === "1" && !state.running) launch(changes);
    // only reacts to the link itself, launch/search changing shouldn't start another search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey]);

  // ---------- floating progress pill ----------
  // while a search runs and the live feed's header has scrolled off the top, a small pill shows progress.
  // tapping it scrolls back up to the feed (same idea as a scroll-triggered header)
  const scrollY = useSharedValue(0);
  const feedTop = useSharedValue(Number.MAX_SAFE_INTEGER);
  const runningSV = useSharedValue(state.running);
  const [pillOn, setPillOn] = useState(false);
  useEffect(() => {
    runningSV.set(state.running);
  }, [state.running, runningSV]);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  // the animation runs on the UI thread from this value, React only hears about it to toggle taps on/off
  // shows once the feed's header (title + stage circles, ~140px) has scrolled out of view
  const showPill = useDerivedValue(() => runningSV.get() && scrollY.get() > feedTop.get() + 140);
  useAnimatedReaction(
    () => showPill.get(),
    (show, prev) => {
      if (show !== prev) scheduleOnRN(setPillOn, show);
    },
  );
  const pillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showPill.get() ? 1 : 0, { duration: 200 }),
    transform: [{ translateY: withTiming(showPill.get() ? 0 : -12, { duration: 200 }) }],
  }));
  const agentCounts = Object.values(state.agents);
  const checked = agentCounts.filter((a) => a === "done").length;

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
        <Animated.ScrollView
          ref={scroll}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <T variant="h1">Find a family doctor</T>
              <T variant="small">Tell CareScout where you are and what you need. Agents check each clinic's website for you.</T>
            </View>
            <Pressable
              onPress={() => setHandoff(true)}
              style={({ pressed }) => [styles.qrBtn, pressed && { backgroundColor: colors.mist }]}
              accessibilityRole="button"
              accessibilityLabel="Open this search on another phone"
              hitSlop={6}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <MissionForm values={search} onChange={setSearch} onLaunch={onLaunch} onStop={stop} running={state.running} publicDemo={publicDemo} />
          {(state.running || state.log.length > 0) && (
            <View
              onLayout={(e) => {
                feedY.current = e.nativeEvent.layout.y;
                feedTop.set(e.nativeEvent.layout.y);
              }}
            >
              <AgentFeed
                state={state}
                onStop={stop}
                onReset={reset}
                onUseDemo={() => {
                  setSearch((s) => ({ ...s, useCache: true }));
                  launch({ useCache: true });
                }}
                onShowSaved={savedAt ? showSaved : undefined}
              />
            </View>
          )}

          {/* full clinics: watched only if the person gave an email or asks here */}
          {state.summary && !state.running && !state.restoredAt && <WatchPrompt key={state.log[0]?.id} clinics={allClinics} watched={state.watched} />}

          <View onLayout={(e) => (resultsY.current = e.nativeEvent.layout.y)}>
            {allClinics.length + preview.length > 0 ? (
              <View style={{ gap: 12 }}>
                {state.restoredAt && !state.running && (
                  // these came from storage, not a live search, so say how old they are
                  <View style={styles.saved} accessibilityRole="summary">
                    <Ionicons name={backendUp === false ? "cloud-offline-outline" : "time-outline"} size={18} color={colors.pine} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="bodyStrong" style={{ fontSize: 14 }}>
                        {backendUp === false ? "You're offline. " : ""}Saved on this phone {savedAgo(state.restoredAt)}
                      </T>
                      <T variant="small">Your last search, kept so it still works without Wi-Fi. Clinic status may have changed since.</T>
                    </View>
                  </View>
                )}
                <View style={styles.resultsHead}>
                  <T variant="h2" style={{ flex: 1 }}>
                    {state.ranked ? "Best matches first" : "Results so far"} <T style={styles.count}>{clinics.length || preview.length}</T>
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

                {allClinics.length > 0 && <StatusFilterRow clinics={allClinics} value={filter} onChange={setFilter} />}

                {filter !== "all" && clinics.length === 0 && allClinics.length > 0 && (
                  <Card style={{ gap: 6, alignItems: "center", paddingVertical: 20 }}>
                    <T variant="small">No clinics match this filter.</T>
                    <Button small variant="secondary" title="Show all" onPress={() => setFilter("all")} />
                  </Card>
                )}

                {state.rankError && !state.running && (
                  // Gemini was busy: the results are real but not sorted for you yet
                  <View style={styles.rankError} accessibilityRole="alert">
                    <T variant="small" style={{ color: "#8A5410" }}>
                      Ranking is unavailable right now (the AI model is busy), so these results aren't sorted for you yet. Everything else is up to date.
                    </T>
                    <Button small variant="secondary" icon="refresh" title="Retry ranking" onPress={retryRank} loading={state.rankRetrying} style={{ alignSelf: "flex-start" }} />
                  </View>
                )}

                {hasPins && showMap && <ClinicMap clinics={clinics} selectedUrl={selectedUrl} onSelect={selectFromMap} />}

                {clinics.map((c, i) => (
                  <Reveal key={c.url} index={i} onLayout={(e) => onCardLayout(c.url, e)}>
                    <ClinicCard
                      clinic={c}
                      email={search.email.trim()}
                      city={search.city}
                      postalCode={search.postalCode}
                      publicDemo={publicDemo}
                      rankingPending={(state.running || state.rankRetrying) && !c.ranked}
                      selected={c.url === selectedUrl}
                      onSelect={setSelectedUrl}
                      onApply={setApplyFor}
                      onUpdated={updateClinic}
                      onWatched={onWatched}
                    />
                  </Reveal>
                ))}

                {preview.length > 0 && (
                  <View style={{ gap: 12 }}>
                    <View style={styles.previewHead}>
                      <Ionicons name="flash-outline" size={15} color={colors.muted} />
                      <T variant="small" style={{ flex: 1 }}>
                        From earlier checks. Agents are confirming these now, so they may change.
                      </T>
                    </View>
                    {preview.map((c) => (
                      <View key={c.url} style={styles.previewCard}>
                        <ClinicCard
                          clinic={c}
                          email={search.email.trim()}
                          city={search.city}
                          postalCode={search.postalCode}
                          publicDemo={publicDemo}
                          rankingPending
                          selected={false}
                          onSelect={setSelectedUrl}
                          onApply={setApplyFor}
                          onUpdated={updateClinic}
                          onWatched={onWatched}
                        />
                      </View>
                    ))}
                  </View>
                )}

                {finished && !state.restoredAt && allClinics.length > 0 && (
                  <View style={{ gap: 6 }}>
                    <Button
                      title={state.loadingMore ? "Checking more clinics..." : "Load 5 more clinics"}
                      icon="add-circle-outline"
                      variant="secondary"
                      onPress={loadMore}
                      loading={state.loadingMore}
                      disabled={state.loadingMore || state.noMore}
                    />
                    <T variant="small" style={{ textAlign: "center" }}>
                      {state.noMore
                        ? "That's every clinic CareScout has for this area. Try a nearby city for more."
                        : "Only the new clinics get checked, then the whole list is ranked again."}
                    </T>
                  </View>
                )}

              </View>
            ) : (
              !state.running && state.log.length === 0 && <EmptyState />
            )}
          </View>
          {finished && !state.restoredAt && !state.error && <NextSteps />}
          {/* anonymous survey, once a search has finished */}
          {state.summary && !state.running && !state.restoredAt && <FeedbackSurvey page="find" />}
        </Animated.ScrollView>

        {/* only in the tree while a search runs, so screen readers don't find a hidden pill the rest of the time */}
        {(state.running || pillOn) && (
        <Animated.View style={[styles.pillWrap, pillStyle]} pointerEvents={pillOn ? "box-none" : "none"} aria-hidden={!pillOn}>
          <Pressable
            onPress={() => scroll.current?.scrollTo({ y: Math.max(0, feedY.current - 12), animated: true })}
            style={styles.pill}
            accessibilityRole="button"
            accessibilityLabel={`Agents working, ${checked} of ${agentCounts.length} checked. Show the live feed`}
          >
            <View style={styles.pillDot} />
            <T style={styles.pillText}>
              Agents working{agentCounts.length ? ` · ${checked}/${agentCounts.length} checked` : ""}
            </T>
            <Ionicons name="chevron-up" size={14} color={colors.white} />
          </Pressable>
        </Animated.View>
        )}
      </KeyboardAvoidingView>

      <ApplySheet clinic={applyFor} defaults={search} onClose={() => setApplyFor(null)} />
      <HandoffSheet open={handoff} search={search} onClose={() => setHandoff(false)} />
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
  pillWrap: { position: "absolute", top: 10, left: 0, right: 0, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.pineDeep,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    boxShadow: "0 6px 18px rgba(9, 58, 49, 0.3)",
  },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pulse },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  qrBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  previewCard: { opacity: 0.72 },
  rankError: { gap: 10, backgroundColor: "#FCF1DF", padding: 14, borderRadius: radius.md },
  saved: { flexDirection: "row", gap: 10, backgroundColor: colors.pineSoft, padding: 14, borderRadius: radius.md },
});
