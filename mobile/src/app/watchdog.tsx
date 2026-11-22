// Watchdog tab: clinics you're watching, Check all now, alert history, and the demo "Simulate opening"
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Reveal } from "@/components/motion";
import PhoneAlerts from "@/components/PhoneAlerts";
import StatusBadge from "@/components/StatusBadge";
import { Button, Card, Ionicons, Label, T } from "@/components/ui";
import { api } from "@/lib/api";
import { askToNotify, canNotify, notifyPermission } from "@/lib/notify";
import { hostOf } from "@/lib/clinics";
import { colors, fonts, radius } from "@/lib/theme";
import type { Watch, WatchAlert } from "@/lib/types";
import { useAppState } from "@/state/AppState";

function ago(iso: string | null) {
  if (!iso) return "not checked yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `checked ${h} h ago` : `checked ${Math.round(h / 24)} d ago`;
}

export default function WatchdogScreen() {
  const { search, setSearch, setAlert, setWatchCount, publicDemo, emailAlerts } = useAppState();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [simulating, setSimulating] = useState<number | "newest" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const email = search.email;
  // always send the email when we have one, otherwise the backend shows everyone's watches (masked)
  const userEmail = email.includes("@") ? email.trim() : undefined;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, a] = await Promise.all([api.listWatches(userEmail), api.watchAlerts(userEmail, 10)]);
      setWatches(w.watched_clinics);
      setAlerts(a.alerts);
      setWatchCount(w.watched_clinics.length);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userEmail, setWatchCount]);

  // loads when you open the tab, when you come back to it, and when the email changes
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pullToRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const checkAll = async () => {
    setChecking(true);
    setMessage(null);
    setError(null);
    try {
      const r = await api.checkWatches(userEmail);
      const failedNote = r.failed ? ` (${r.failed} couldn't be checked)` : "";
      setMessage(`Checked ${r.checked} clinic${r.checked === 1 ? "" : "s"}${failedNote}. ${r.alerts.length ? `${r.alerts.length} changed!` : "No changes yet."}`);
      if (r.alerts[0]) setAlert(r.alerts[0]);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  const simulate = async (watchId?: number) => {
    setSimulating(watchId ?? "newest");
    setError(null);
    try {
      // first time: ask for notifications so the demo shows a real one
      if (canNotify && (await notifyPermission()) === "undetermined") await askToNotify();
      const r = await api.simulateOpening(watchId);
      // a few seconds' delay so you can leave the app or lock the phone and see it arrive
      setAlert(r.alert, { notifyIn: 3 });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSimulating(null);
    }
  };

  const remove = async (w: Watch) => {
    if (!userEmail) {
      setError("Enter your email above to manage your watches.");
      return;
    }
    try {
      await api.deleteWatch(w.id, userEmail);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.pine} />}
      >
        <View style={{ gap: 4 }}>
          <T variant="h1">Watchdog</T>
          <T variant="small">Full clinics you're watching. CareScout re-checks their websites and alerts you when one starts accepting patients.</T>
        </View>

        <Card style={{ gap: 14 }}>
          <View>
            <Label>Your email</Label>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(v) => setSearch((s) => ({ ...s, email: v }))}
              placeholder="you@example.com"
              placeholderTextColor={colors.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              accessibilityLabel="Your email"
            />
            {!!userEmail && emailAlerts && (
              <View style={styles.emailOn}>
                <Ionicons name="mail-outline" size={14} color={colors.pine} />
                <T variant="small" style={{ flex: 1, color: colors.pineDeep }}>
                  When a clinic you watch opens up, we'll also email {userEmail}.
                </T>
              </View>
            )}
            {!userEmail && (
              <T variant="small" style={{ color: "#8A5410", marginTop: 6 }}>
                Showing everyone's watches with emails hidden. Enter your email to see only yours.
              </T>
            )}
          </View>
          <PhoneAlerts />
          <Button
            title="Check all now"
            icon="refresh"
            onPress={checkAll}
            loading={checking}
            disabled={watches.length === 0 || publicDemo}
          />
          {publicDemo && <T variant="small">Live re-checks are turned off on this public demo. Use Simulate opening to see how an alert looks.</T>}
          {checking && <T variant="small">Agents are re-checking each clinic's website. This takes a few minutes.</T>}
          {message && <T variant="small" style={{ color: colors.pine }}>{message}</T>}
          {error && <T variant="small" style={{ color: colors.coral }} accessibilityRole="alert">{error}</T>}
        </Card>

        <View style={{ gap: 10 }}>
          <T variant="label">Watching{watches.length ? ` · ${watches.length}` : ""}</T>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.pine} />
              <T variant="small">Loading watched clinics...</T>
            </View>
          ) : watches.length === 0 ? (
            <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
              <Ionicons name="notifications-off-outline" size={24} color={colors.faint} />
              <T variant="small" style={{ textAlign: "center", maxWidth: 300 }}>
                No watched clinics yet. Tap Watch clinic on any full clinic in Find, or add your email before a search to watch them automatically.
              </T>
            </Card>
          ) : (
            watches.map((w, i) => (
              <Reveal key={w.id} index={i}>
                <Card style={styles.watch}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <T variant="title" numberOfLines={2}>{w.clinic_name}</T>
                    <StatusBadge status={w.last_status} />
                    <View style={styles.watchMeta}>
                      <Pressable
                        onPress={() => Linking.openURL(w.url).catch(() => {})}
                        hitSlop={4}
                        style={styles.link}
                        accessibilityRole="link"
                        accessibilityLabel={`Open ${hostOf(w.url)}`}
                      >
                        <T style={styles.linkText}>{hostOf(w.url)}</T>
                        <Ionicons name="open-outline" size={11} color={colors.pine} />
                      </Pressable>
                      <T variant="mono" style={{ fontSize: 11 }}>{ago(w.last_checked)}</T>
                      {!userEmail && <T variant="small" style={{ fontSize: 11 }}>{w.user_email}</T>}
                    </View>
                  </View>
                  <View style={styles.watchActions}>
                    <Pressable
                      onPress={() => simulate(w.id)}
                      disabled={simulating != null}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Simulate ${w.clinic_name} opening (demo)`}
                      hitSlop={4}
                    >
                      {simulating === w.id ? <ActivityIndicator size="small" color={colors.pine} /> : <Ionicons name="sparkles-outline" size={17} color={colors.muted} />}
                    </Pressable>
                    {userEmail && (
                      <Pressable
                        onPress={() => remove(w)}
                        style={styles.iconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Stop watching ${w.clinic_name}`}
                        hitSlop={4}
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.coral} />
                      </Pressable>
                    )}
                  </View>
                </Card>
              </Reveal>
            ))
          )}
        </View>

        {alerts.length > 0 && (
          <View style={{ gap: 10 }}>
            <T variant="label">Recent alerts</T>
            <Card style={{ gap: 14 }}>
              {alerts.map((a, i) => (
                <View key={a.alert_id ?? i} style={styles.alert}>
                  <View style={styles.alertDot} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <T style={{ fontSize: 14, lineHeight: 20 }}>{a.message}</T>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      {a.created_at && <T variant="mono" style={{ fontSize: 11 }}>{new Date(a.created_at).toLocaleString()}</T>}
                      {a.simulated && (
                        <View style={styles.demoTag}>
                          <T style={styles.demoText}>demo</T>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}

        <Button
          variant="ghost"
          small
          icon="sparkles-outline"
          title="Simulate opening (demo)"
          onPress={() => simulate(undefined)}
          loading={simulating === "newest"}
          disabled={watches.length === 0 || simulating != null}
          style={{ alignSelf: "center" }}
        />
        <T variant="small" style={{ textAlign: "center", marginTop: -10 }}>For live demos: pretends the newest watched clinic just opened.</T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emailOn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  page: { padding: 16, gap: 18, paddingBottom: 48 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  loading: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12 },
  watch: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 16 },
  watchMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 3 },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.pine },
  watchActions: { gap: 6 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  alert: { flexDirection: "row", gap: 10 },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#14A06F", marginTop: 6 },
  demoTag: { backgroundColor: colors.mist, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  demoText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted },
});
