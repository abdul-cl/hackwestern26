// One clinic result: status, why it was ranked there, and what you can do next
import { memo, useState } from "react";
import { Linking, Platform, Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import { checkedLabel, displayStatus, hostOf, isFailedScan, lastSeenLabel } from "@/lib/clinics";
import { canGetDirections, directionsUrl, shareText } from "@/lib/device";
import { colors, fonts, radius } from "@/lib/theme";
import type { Clinic, MergedClinic } from "@/lib/types";
import CallScript from "./CallScript";
import { PressableScale, ScoreRing } from "./motion";
import StatusBadge from "./StatusBadge";
import { Button, Card, Ionicons, Pill, T } from "./ui";
import VerifyDoctor from "./VerifyDoctor";

type Props = {
  clinic: MergedClinic;
  email: string;
  city: string;
  postalCode: string;
  publicDemo: boolean;
  rankingPending: boolean; // true while the mission is still running and hasn't ranked yet
  selected: boolean;
  onSelect: (url: string) => void;
  onApply: (c: MergedClinic) => void;
  onUpdated: (c: Clinic) => void;
  onWatched: () => void;
};

type Panel = "call" | "verify" | null;

function ClinicCard(props: Props) {
  const { clinic, email, city, postalCode, publicDemo, rankingPending, selected, onSelect, onApply, onUpdated, onWatched } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const [recheck, setRecheck] = useState<{ loading: boolean; note?: string; error?: string }>({ loading: false });
  const [watch, setWatch] = useState<{ loading: boolean; done: boolean; error?: string; askEmail: boolean }>({
    loading: false,
    done: false,
    askEmail: false,
  });
  const [watchEmail, setWatchEmail] = useState("");
  const [shareNote, setShareNote] = useState<string | null>(null);

  const failed = isFailedScan(clinic);
  const status = displayStatus(clinic);
  const checked = checkedLabel(clinic);
  const lastSeen = lastSeenLabel(clinic);
  const host = hostOf(clinic.url);
  const isWeb = /^https?:\/\//.test(clinic.url);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const open = (url: string) => Linking.openURL(url).catch(() => {});

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

  // phone share sheet (texts, WhatsApp, email...). browsers without a share sheet get it copied instead
  const share = async () => {
    const message = shareText(clinic);
    setShareNote(null);
    try {
      await Share.share({ message, title: clinic.name });
    } catch {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          setShareNote("Copied, paste it anywhere to share.");
          return;
        } catch {
          // fall through to the message below
        }
      }
      setShareNote("Couldn't open the share menu on this device.");
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
      onWatched();
    } catch (e: any) {
      setWatch({ loading: false, done: false, error: e.message, askEmail: true });
    }
  };

  return (
    <Pressable onPress={() => onSelect(clinic.url)} accessibilityLabel={`${failed ? host : clinic.name}, ${status}`}>
        <Card style={[styles.card, selected && styles.cardOn]}>
          <View style={styles.top}>
            {clinic.score != null && <ScoreRing score={clinic.score} />}
            <View style={{ flex: 1, gap: 7 }}>
              <T variant="title" numberOfLines={2}>{failed ? host : clinic.name}</T>
              <StatusBadge clinic={clinic} />
            </View>
          </View>

          <View style={styles.meta}>
            {clinic.distance_km != null && (
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={12} color={colors.muted} />
                <T style={styles.metaMono}>{clinic.distance_km} km</T>
              </View>
            )}
            {clinic.address && <T variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>{clinic.address}</T>}
          </View>

          {!!clinic.coverage_tags?.length && (
            <View style={styles.tags}>
              {clinic.coverage_tags.map((t) => <Pill key={t} text={t} bg={colors.skySoft} color={colors.sky} />)}
            </View>
          )}

          {failed ? (
            <T variant="body" style={{ color: colors.muted }}>
              We couldn't check this clinic's website automatically. Visit the site or call them directly.
            </T>
          ) : (
            <View style={{ gap: 8 }}>
              {!!clinic.reason && <T variant="body">{clinic.reason}</T>}
              {!!clinic.next_step && (
                <View style={styles.next}>
                  <Ionicons name="arrow-forward-circle" size={16} color={colors.pine} style={{ marginTop: 2 }} />
                  <T variant="bodyStrong" style={{ flex: 1, color: colors.pineDeep }}>{clinic.next_step}</T>
                </View>
              )}
              {!!clinic.posted_wait && (
                // only ever what the clinic posts itself, so it's labelled that way
                <View style={styles.wait}>
                  <Ionicons name="hourglass-outline" size={14} color={colors.ink} />
                  <T variant="small" style={{ flex: 1, color: colors.ink }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink }}>Wait posted by the clinic: </T>
                    {clinic.posted_wait}
                  </T>
                </View>
              )}
              {clinic.requirements?.map((r) => (
                <T key={r} variant="small">· {r}</T>
              ))}
              {!!clinic.evidence_quote && (
                // the exact sentence from the clinic's site, so people can see why it got this status
                <View style={styles.quote}>
                  <T style={styles.quoteText}>"{clinic.evidence_quote}"</T>
                  <T variant="small" style={{ fontSize: 11 }}>from {host}</T>
                </View>
              )}
              {!clinic.ranked && rankingPending && <T variant="small">Ranking...</T>}
            </View>
          )}

          {lastSeen && <T style={styles.lastSeen}>{lastSeen}</T>}
          {(checked || recheck.note || recheck.error) && (
            <View style={{ gap: 2 }}>
              {checked && <T variant="mono" style={{ fontSize: 11 }}>{checked.toLowerCase()}</T>}
              {recheck.note && <T variant="small" style={{ color: colors.pine }}>{recheck.note}</T>}
              {recheck.error && <T variant="small" style={{ color: colors.coral }}>{recheck.error}</T>}
            </View>
          )}

          {/* main action first and full width, so it's easy to hit with a thumb */}
          <View style={{ gap: 8 }}>
            {clinic.waitlist_url ? (
              <Button icon="create-outline" title="Auto-fill waitlist" onPress={() => onApply(clinic)} />
            ) : (
              !failed && (
                <Button
                  variant={panel === "call" ? "secondary" : "primary"}
                  icon="call-outline"
                  title={panel === "call" ? "Hide call script" : "Call script"}
                  onPress={() => toggle("call")}
                />
              )
            )}
            {failed && isWeb && <Button icon="open-outline" title="Visit the site" onPress={() => open(clinic.url)} />}

            <View style={styles.actions}>
              <Chip icon="shield-checkmark-outline" text="Verify doctor" on={panel === "verify"} onPress={() => toggle("verify")} />
              {canGetDirections(clinic) && <Chip icon="navigate-outline" text="Directions" onPress={() => open(directionsUrl(clinic))} />}
              {!failed && <Chip icon="share-outline" text="Share" onPress={share} />}
              {isWeb && !failed && <Chip icon="open-outline" text="Website" onPress={() => open(clinic.url)} />}
              {!publicDemo && isWeb && (
                <Chip icon="refresh" text={recheck.loading ? "Checking..." : "Re-check"} onPress={recheckNow} disabled={recheck.loading} />
              )}
              {status === "closed" &&
                (watch.done ? (
                  <View style={styles.watching}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.pine} />
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.pine }}>Watching</T>
                  </View>
                ) : (
                  <Chip icon="notifications-outline" text={watch.loading ? "Adding..." : "Watch clinic"} onPress={startWatch} disabled={watch.loading} />
                ))}
            </View>
          </View>

          {watch.askEmail && !email && (
            <View style={styles.emailRow}>
              <TextInput
                style={styles.input}
                placeholder="Email for opening alerts"
                placeholderTextColor={colors.faint}
                value={watchEmail}
                onChangeText={setWatchEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={startWatch}
                accessibilityLabel="Email for opening alerts"
              />
              <Button small title="Watch" onPress={startWatch} />
            </View>
          )}
          {watch.error && <T variant="small" style={{ color: colors.coral }}>{watch.error}</T>}
          {shareNote && <T variant="small" style={{ color: colors.pine }}>{shareNote}</T>}

          {panel === "call" && <CallScript clinic={clinic} />}
          {panel === "verify" && <VerifyDoctor city={city} />}
        </Card>
    </Pressable>
  );
}

// small outline button for the secondary actions
function Chip({ icon, text, onPress, on, disabled }: { icon: any; text: string; onPress: () => void; on?: boolean; disabled?: boolean }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={text}
      aria-disabled={!!disabled}
      aria-expanded={!!on}
      style={[styles.chip, on && styles.chipOn, disabled && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={14} color={on ? colors.white : colors.ink} />
      <T style={[styles.chipText, on && { color: colors.white }]}>{text}</T>
    </PressableScale>
  );
}

export default memo(ClinicCard);

const styles = StyleSheet.create({
  wait: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.mist, paddingVertical: 7, paddingHorizontal: 10, borderRadius: radius.sm },
  card: { gap: 12 },
  cardOn: { borderColor: colors.pine, borderWidth: 2, margin: -1 },
  top: { flexDirection: "row", gap: 14, alignItems: "center" },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaMono: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  next: { flexDirection: "row", gap: 6 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.pulse, paddingLeft: 10, paddingVertical: 2, gap: 2 },
  quoteText: { fontFamily: fonts.body, fontStyle: "italic", fontSize: 13, lineHeight: 19, color: colors.muted },
  lastSeen: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: "#57524D", backgroundColor: "#F3F1EF", padding: 10, borderRadius: radius.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  watching: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6 },
  emailRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
});
