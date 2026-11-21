// One clinic result: status, why it was ranked there, and what you can do next
import { memo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import { checkedLabel, displayStatus, hostOf, isFailedScan, lastSeenLabel } from "@/lib/clinics";
import { colors, radius } from "@/lib/theme";
import type { Clinic, MergedClinic } from "@/lib/types";
import CallScript from "./CallScript";
import StatusBadge from "./StatusBadge";
import { Button, Card, Ionicons, Pill } from "./ui";

// match score in a coloured circle (green is good, red is a poor fit)
function Score({ score }: { score?: number }) {
  if (score == null) return null;
  const c = score >= 70 ? colors.pine500 : score >= 40 ? colors.amber : colors.rose;
  return (
    <View style={[styles.score, { borderColor: c }]}>
      <Text style={styles.scoreText}>{score}</Text>
    </View>
  );
}

type Props = {
  clinic: MergedClinic;
  email: string;
  city: string;
  postalCode: string;
  publicDemo: boolean;
  rankingPending: boolean; // true while the mission is still running and hasn't ranked yet
  onUpdated: (c: Clinic) => void;
};

function ClinicCard({ clinic, email, city, postalCode, publicDemo, rankingPending, onUpdated }: Props) {
  const [showCall, setShowCall] = useState(false);
  const [recheck, setRecheck] = useState<{ loading: boolean; note?: string; error?: string }>({ loading: false });
  const [watch, setWatch] = useState<{ loading: boolean; done: boolean; error?: string; askEmail: boolean }>({
    loading: false,
    done: false,
    askEmail: false,
  });
  const [watchEmail, setWatchEmail] = useState("");

  const failed = isFailedScan(clinic);
  const status = displayStatus(clinic);
  const checked = checkedLabel(clinic);
  const lastSeen = lastSeenLabel(clinic);
  const host = hostOf(clinic.url);
  const isWeb = /^https?:\/\//.test(clinic.url);

  // check just this clinic again (quick page read, or a browser agent if the site needs it)
  const recheckNow = async () => {
    setRecheck({ loading: true });
    try {
      const r = await api.refreshClinic(clinic.url, city, postalCode);
      onUpdated(r.clinic);
      const note =
        r.method === "failed" ? `Couldn't re-check right now (${r.error}). Showing the last saved result.`
        : r.status_changed ? "Status changed since the last check."
        : r.method === "unchanged" ? "No change on the clinic's website."
        : "Up to date.";
      setRecheck({ loading: false, note });
    } catch (e: any) {
      setRecheck({ loading: false, error: e.message });
    }
  };

  const startWatch = async () => {
    const userEmail = (email || watchEmail).trim();
    if (!userEmail.includes("@")) {
      setWatch((w) => ({ ...w, askEmail: true, error: userEmail ? "Enter a valid email." : undefined }));
      return;
    }
    setWatch({ loading: true, done: false, askEmail: false });
    try {
      await api.addWatch({ name: clinic.name, url: clinic.url, status: clinic.status }, userEmail);
      setWatch({ loading: false, done: true, askEmail: false });
    } catch (e: any) {
      setWatch({ loading: false, done: false, error: e.message, askEmail: true });
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.top}>
        <Score score={clinic.score} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.name} numberOfLines={2}>{failed ? host : clinic.name}</Text>
          <StatusBadge clinic={clinic} />
        </View>
      </View>

      <View style={styles.meta}>
        {clinic.distance_km != null && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={13} color={colors.slate500} />
            <Text style={styles.metaText}>{clinic.distance_km} km away</Text>
          </View>
        )}
        {clinic.address && <Text style={styles.metaText} numberOfLines={1}>{clinic.address}</Text>}
        {isWeb && (
          <Pressable onPress={() => Linking.openURL(clinic.url)} style={styles.metaItem} hitSlop={4}>
            <Text style={[styles.metaText, { color: colors.pine700 }]}>{host}</Text>
            <Ionicons name="open-outline" size={12} color={colors.pine700} />
          </Pressable>
        )}
      </View>

      {!!clinic.coverage_tags?.length && (
        <View style={styles.tags}>
          {clinic.coverage_tags.map((t) => <Pill key={t} text={t} bg="#f0f9ff" color="#0369a1" />)}
        </View>
      )}

      {failed ? (
        <Text style={styles.body}>We couldn't check this clinic's website automatically. Visit the site or call them directly.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {!!clinic.reason && <Text style={styles.body}>{clinic.reason}</Text>}
          {!!clinic.next_step && (
            <Text style={styles.nextStep}>
              <Text style={{ color: colors.slate500, fontWeight: "400" }}>Next step: </Text>
              {clinic.next_step}
            </Text>
          )}
          {clinic.requirements?.map((r) => (
            <Text key={r} style={styles.req}>• {r}</Text>
          ))}
          {!!clinic.evidence_quote && (
            <View style={styles.quote}>
              <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.slate400} />
              <Text style={styles.quoteText}>{clinic.evidence_quote}</Text>
            </View>
          )}
          {!clinic.ranked && rankingPending && <Text style={styles.small}>Ranking pending...</Text>}
        </View>
      )}

      {lastSeen && <Text style={styles.lastSeen}>{lastSeen}</Text>}
      {(checked || recheck.note || recheck.error) && (
        <View style={{ gap: 2 }}>
          {checked && <Text style={styles.small}>{checked}</Text>}
          {recheck.note && <Text style={[styles.small, { color: colors.pine700 }]}>{recheck.note}</Text>}
          {recheck.error && <Text style={[styles.small, { color: colors.rose }]}>{recheck.error}</Text>}
        </View>
      )}

      <View style={styles.actions}>
        {clinic.waitlist_url ? (
          // auto-fill comes in the next phase, for now this just opens the waitlist page
          <Button small icon="document-text-outline" title="Open waitlist" onPress={() => Linking.openURL(clinic.waitlist_url!)} />
        ) : (
          !failed && (
            <Button
              small
              variant="secondary"
              icon="call-outline"
              title={showCall ? "Hide call script" : "Call script"}
              onPress={() => setShowCall((s) => !s)}
            />
          )
        )}
        {!publicDemo && isWeb && (
          <Button small variant="ghost" icon="refresh" title={recheck.loading ? "Checking..." : "Re-check"} loading={recheck.loading} onPress={recheckNow} />
        )}
        {status === "closed" &&
          (watch.done ? (
            <View style={styles.watching}>
              <Ionicons name="checkmark" size={15} color={colors.pine700} />
              <Text style={{ color: colors.pine700, fontWeight: "600", fontSize: 13 }}>Watching</Text>
            </View>
          ) : (
            <Button small variant="secondary" icon="notifications-outline" title="Watch clinic" loading={watch.loading} onPress={startWatch} />
          ))}
      </View>

      {watch.askEmail && !email && (
        <View style={styles.emailRow}>
          <TextInput
            style={styles.input}
            placeholder="Email for opening alerts"
            value={watchEmail}
            onChangeText={setWatchEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            onSubmitEditing={startWatch}
          />
          <Button small title="Watch" onPress={startWatch} />
        </View>
      )}
      {watch.error && <Text style={[styles.small, { color: colors.rose }]}>{watch.error}</Text>}

      {showCall && <CallScript clinic={clinic} />}
    </Card>
  );
}

export default memo(ClinicCard);

const styles = StyleSheet.create({
  top: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  score: { width: 46, height: 46, borderRadius: 23, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  scoreText: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12, color: colors.slate500 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  body: { fontSize: 14, color: colors.slate700, lineHeight: 20 },
  nextStep: { fontSize: 14, color: colors.pine900, fontWeight: "600", lineHeight: 20 },
  req: { fontSize: 12, color: colors.slate600, lineHeight: 17 },
  quote: { flexDirection: "row", gap: 6, backgroundColor: colors.paper, padding: 8, borderRadius: 8 },
  quoteText: { flex: 1, fontSize: 12, fontStyle: "italic", color: colors.slate600, lineHeight: 17 },
  small: { fontSize: 12, color: colors.slate400 },
  lastSeen: { fontSize: 12, color: "#44403c", backgroundColor: "#fafaf9", padding: 8, borderRadius: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  watching: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
  emailRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
});
