// Live progress steps + log while a mission runs
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { STAGES, type MissionState, type StageStatus } from "@/hooks/useMission";
import { colors } from "@/lib/theme";
import { Card, Ionicons, Pill } from "./ui";

const DOT = { stage: colors.pine500, result: colors.sky, error: colors.rose, done: colors.pine600, info: colors.slate400 };

function StepCircle({ status, n }: { status?: StageStatus; n: number }) {
  const bg =
    status === "active" ? colors.pine600
    : status === "done" ? colors.pine50
    : status === "error" ? colors.roseBg
    : status === "skipped" ? colors.slate100
    : colors.white;
  const fg = status === "active" ? colors.white : status === "error" ? colors.rose : status ? colors.pine700 : colors.slate400;
  return (
    <View style={[styles.circle, { backgroundColor: bg, borderColor: status === "active" ? colors.pine600 : colors.slate200 }]}>
      {status === "active" ? <ActivityIndicator size="small" color={colors.white} />
      : status === "done" ? <Ionicons name="checkmark" size={16} color={fg} />
      : status === "error" ? <Ionicons name="warning" size={15} color={fg} />
      : status === "skipped" ? <Ionicons name="remove" size={16} color={fg} />
      : <Text style={{ color: fg, fontWeight: "600", fontSize: 12 }}>{n}</Text>}
    </View>
  );
}

export default function AgentFeed({ state, onStop, onReset }: { state: MissionState; onStop: () => void; onReset: () => void }) {
  const [open, setOpen] = useState(true);
  const { running, stageStatus, log, agents, error, summary } = state;

  if (!running && log.length === 0) return null;

  const counts = Object.values(agents).reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {});
  // only the last few lines, a phone screen fills up fast
  const visibleLog = log.slice(-12);

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Live agent activity</Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable onPress={running ? onStop : onReset} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name={running ? "stop" : "refresh"} size={16} color={colors.slate600} />
            <Text style={styles.iconBtnText}>{running ? "Stop" : "Reset"}</Text>
          </Pressable>
          <Pressable onPress={() => setOpen((o) => !o)} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.slate600} />
          </Pressable>
        </View>
      </View>

      <View style={styles.steps}>
        {STAGES.map((s, i) => (
          <View key={s.key} style={styles.step}>
            <StepCircle status={stageStatus[s.key]} n={i + 1} />
            <Text style={[styles.stepLabel, !stageStatus[s.key] && { color: colors.slate400 }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {Object.keys(agents).length > 0 && (
        <View style={styles.pills}>
          <Pill text={`${counts.queued || 0} queued`} bg={colors.slate100} color={colors.slate600} />
          <Pill text={`${counts.scanning || 0} scanning`} bg="#f0f9ff" color="#0369a1" />
          <Pill text={`${counts.done || 0} done`} bg={colors.pine50} color={colors.pine700} />
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning" size={16} color={colors.rose} />
          <Text style={{ color: colors.rose, flex: 1, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {open && (
        <View style={styles.log}>
          {visibleLog.map((l) => (
            <View key={l.id} style={styles.logRow}>
              <View style={[styles.logDot, { backgroundColor: DOT[l.kind] }]} />
              <Text style={styles.logTime}>
                {l.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </Text>
              <Text style={[styles.logText, l.kind === "error" && { color: colors.rose }]}>{l.text}</Text>
            </View>
          ))}
        </View>
      )}

      {summary && (
        <View style={styles.stats}>
          {(
            [
              ["Accepting", summary.accepting_count],
              ["Waitlist", summary.waitlist_count],
              ["Not accepting", summary.closed_count],
              ["Watching", summary.watched_count],
            ] as const
          ).map(([label, n]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statNum}>{n ?? 0}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  iconBtnText: { fontSize: 13, color: colors.slate600 },
  steps: { flexDirection: "row", justifyContent: "space-between" },
  step: { alignItems: "center", gap: 4, flex: 1 },
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepLabel: { fontSize: 11, fontWeight: "600", color: colors.slate700 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  errorBox: { flexDirection: "row", gap: 8, backgroundColor: colors.roseBg, padding: 10, borderRadius: 8 },
  log: { backgroundColor: colors.paper, borderRadius: 8, padding: 8, gap: 4 },
  logRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  logDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  logTime: { fontSize: 11, color: colors.slate400, fontVariant: ["tabular-nums"], marginTop: 1 },
  logText: { fontSize: 12, color: colors.slate700, flex: 1, lineHeight: 17 },
  stats: { flexDirection: "row", gap: 6 },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  statNum: { fontSize: 18, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 10, color: colors.slate500, textAlign: "center" },
});
