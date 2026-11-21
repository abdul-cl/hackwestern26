// Live progress while a mission runs: pulse line, stage rail, agent counts, log, final stats
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { STAGES, type MissionState, type StageStatus } from "@/hooks/useMission";
import { SETUP_HINT } from "@/lib/api";
import { colors, fonts, radius } from "@/lib/theme";
import { CountUp, PulseLine } from "./motion";
import { Button, Card, Ionicons, T } from "./ui";

const DOT = { stage: colors.pine, result: colors.sky, error: colors.coral, done: colors.pine, info: colors.faint };

function StageNode({ status, n }: { status?: StageStatus; n: number }) {
  const active = status === "active";
  const bg = active ? colors.pine : status === "done" ? colors.pineSoft : status === "error" ? colors.coralSoft : colors.white;
  const border = active ? colors.pine : status === "error" ? colors.coral : status ? colors.pineSoft : colors.line;
  return (
    <View style={[styles.node, { backgroundColor: bg, borderColor: border }]}>
      {active ? <ActivityIndicator size="small" color={colors.white} />
      : status === "done" ? <Ionicons name="checkmark" size={15} color={colors.pine} />
      : status === "error" ? <Ionicons name="alert" size={15} color={colors.coral} />
      : status === "skipped" ? <Ionicons name="remove" size={15} color={colors.faint} />
      : <T style={styles.nodeNum}>{n}</T>}
    </View>
  );
}

type FeedProps = { state: MissionState; onStop: () => void; onReset: () => void; onUseDemo?: () => void; onShowSaved?: () => void };

export default function AgentFeed({ state, onStop, onReset, onUseDemo, onShowSaved }: FeedProps) {
  const [open, setOpen] = useState(true);
  const { running, stageStatus, log, agents, error, summary } = state;

  if (!running && log.length === 0) return null;

  const counts = Object.values(agents).reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {});
  const busy = (counts.queued || 0) + (counts.scanning || 0);
  // only the last few lines, a phone screen fills up fast
  const visibleLog = log.slice(-10);

  return (
    <Card style={styles.card}>
      {/* the pulse runs while agents work and settles into a solid trace when done */}
      <PulseLine live={running} color={colors.pine} height={34} style={styles.pulse} />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="h2">{running ? "Agents working" : state.stopped ? "Search stopped" : error ? "Search didn't run" : "Search finished"}</T>
          {running && busy > 0 && (
            <T variant="small">Most clinics take seconds. Sites that need a browser agent take 1-3 min, two at a time.</T>
          )}
        </View>
        <Pressable
          onPress={running ? onStop : onReset}
          style={({ pressed }) => [styles.headBtn, pressed && { backgroundColor: colors.mist }]}
          accessibilityRole="button"
          accessibilityLabel={running ? "Stop" : "Clear the results"}
          hitSlop={6}
        >
          <Ionicons name={running ? "stop" : "refresh"} size={14} color={colors.ink} />
          <T style={styles.headBtnText}>{running ? "Stop" : "Clear"}</T>
        </Pressable>
      </View>

      {/* stage rail: nodes joined by a line that fills in as stages finish */}
      <View style={styles.rail}>
        {STAGES.map((s, i) => {
          const st = stageStatus[s.key];
          const next = STAGES[i + 1] && stageStatus[STAGES[i + 1].key];
          return (
            <View key={s.key} style={styles.stage}>
              <View style={styles.nodeRow}>
                <View style={[styles.link, { opacity: i === 0 ? 0 : 1 }, st && { backgroundColor: colors.pine }]} />
                <StageNode status={st} n={i + 1} />
                <View style={[styles.link, { opacity: i === STAGES.length - 1 ? 0 : 1 }, next && { backgroundColor: colors.pine }]} />
              </View>
              <T style={[styles.stageLabel, !st && { color: colors.faint }]}>{s.label}</T>
            </View>
          );
        })}
      </View>

      {Object.keys(agents).length > 0 && (
        <View style={styles.counts}>
          <Count n={counts.queued || 0} label="queued" color={colors.faint} />
          <Count n={counts.scanning || 0} label="checking" color={colors.sky} />
          <Count n={counts.done || 0} label="done" color={colors.pine} />
        </View>
      )}

      {error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.coral} />
          <View style={{ flex: 1, gap: 10 }}>
            <T style={{ color: colors.coral, fontSize: 13, lineHeight: 18 }}>{error}</T>
            {/* live search can't run on this server, so give a way out right here */}
            {onUseDemo && error.includes(`Live search ${SETUP_HINT}`) && (
              <Button small icon="flash" title="Show saved results instead" onPress={onUseDemo} style={{ alignSelf: "flex-start" }} />
            )}
            {/* no connection: the last results saved on this phone are better than nothing */}
            {onShowSaved && /Can't reach the CareScout backend/.test(error) && (
              <Button small icon="cloud-offline-outline" title="Show my last results" onPress={onShowSaved} style={{ alignSelf: "flex-start" }} />
            )}
          </View>
        </View>
      )}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.logToggle}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide activity log" : "Show activity log"}
        hitSlop={6}
      >
        <T variant="label">Activity log</T>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={styles.log}>
          {visibleLog.map((l) => (
            <Animated.View key={l.id} entering={FadeIn.duration(250)} style={styles.logRow}>
              <View style={[styles.logDot, { backgroundColor: DOT[l.kind] }]} />
              <T variant="mono" style={styles.logTime}>
                {l.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </T>
              <T style={[styles.logText, l.kind === "error" && { color: colors.coral }]}>{l.text}</T>
            </Animated.View>
          ))}
        </View>
      )}

      {summary && (
        <View style={{ gap: 8 }}>
          <View style={styles.stats}>
            {(
              [
                ["Accepting", summary.accepting_count, "#14A06F"],
                ["Waitlist", summary.waitlist_count, colors.amber],
                ["Full", summary.closed_count, colors.coral],
                ["Watching", summary.watched_count, colors.sky],
              ] as const
            ).map(([label, n, c]) => (
              <View key={label} style={styles.stat}>
                <CountUp to={n ?? 0} style={[styles.statNum, { color: c }]} />
                <T style={styles.statLabel}>{label}</T>
              </View>
            ))}
          </View>
          {(summary.from_database != null || summary.rechecked != null) && (
            <T variant="small">
              {summary.from_database ?? 0} from the CareScout database, {summary.rechecked ?? 0} checked live, in {summary.duration_s}s.
              {summary.expired_count
                ? ` ${summary.expired_count} saved result${summary.expired_count === 1 ? " is" : "s are"} older than a week and marked "Needs a re-check".`
                : ""}
            </T>
          )}
        </View>
      )}
    </Card>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.count}>
      <View style={[styles.countDot, { backgroundColor: color }]} />
      <T style={styles.countNum}>{n}</T>
      <T variant="small">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, paddingTop: 10, overflow: "hidden" },
  pulse: { marginHorizontal: -18 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headBtnText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  rail: { flexDirection: "row" },
  stage: { flex: 1, alignItems: "center", gap: 6 },
  nodeRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  link: { flex: 1, height: 2, backgroundColor: colors.line },
  node: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  nodeNum: { fontFamily: fonts.mono, fontSize: 12, color: colors.faint },
  stageLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.ink },
  counts: { flexDirection: "row", gap: 16 },
  count: { flexDirection: "row", alignItems: "center", gap: 5 },
  countDot: { width: 7, height: 7, borderRadius: 4 },
  countNum: { fontFamily: fonts.mono, fontSize: 14, color: colors.ink },
  errorBox: { flexDirection: "row", gap: 8, backgroundColor: colors.coralSoft, padding: 12, borderRadius: radius.sm },
  logToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 },
  log: { backgroundColor: colors.mist, borderRadius: radius.sm, padding: 10, gap: 6 },
  logRow: { flexDirection: "row", gap: 7, alignItems: "flex-start" },
  logDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  logTime: { fontSize: 11, color: colors.faint },
  logText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.ink, flex: 1 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: colors.mist, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center", gap: 2 },
  statNum: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  statLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },
});
