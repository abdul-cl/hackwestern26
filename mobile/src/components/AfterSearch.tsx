// What the website shows around the results, ported to the app: the status filter, the watch prompt for
// full clinics, "No luck yet? Also try these" and the short anonymous feedback survey
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { displayStatus, matchesStatus, STATUS_FILTERS, type StatusFilter } from "@/lib/clinics";
import { DEMO_EMAIL } from "@/lib/config";
import { colors, fonts, radius } from "@/lib/theme";
import type { Feedback, MergedClinic, Watch } from "@/lib/types";
import { useAppState } from "@/state/AppState";
import { Button, Card, Ionicons, T } from "./ui";

// ---------- status filter ----------

/** All / Accepting / Waitlist open / Not accepting, with counts so an empty filter is never a surprise. */
export function StatusFilterRow({ clinics, value, onChange }: { clinics: MergedClinic[]; value: StatusFilter; onChange: (f: StatusFilter) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const on = f.key === value;
          const n = clinics.filter((c) => matchesStatus(c, f.key)).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => onChange(f.key)}
              accessibilityRole="radio"
              accessibilityLabel={`${f.label}, ${n}`}
              aria-checked={on}
              style={[styles.chip, on && styles.chipOn]}
            >
              <T style={[styles.chipText, on && { color: colors.white }]}>
                {f.label} <T style={[styles.chipText, { opacity: 0.65 }, on && { color: colors.white }]}>{n}</T>
              </T>
            </Pressable>
          );
        })}
      </View>
      {value !== "all" && (
        <T variant="small">Showing {clinics.filter((c) => matchesStatus(c, value)).length} of {clinics.length} clinics.</T>
      )}
    </View>
  );
}

// ---------- watch prompt ----------

/**
 * End of a search: what happens to the clinics that are full. Nothing is watched unless the person asks.
 * Gave an email before searching -> the search already watched them (offers a preview of the alert);
 * otherwise -> one tap watches them (their email, or the shared demo watchlist on the public demo).
 */
export function WatchPrompt({ clinics, watched }: { clinics: MergedClinic[]; watched: Watch[] }) {
  const { search, setSearch, publicDemo, refreshWatchCount } = useAppState();
  const [email, setEmail] = useState(search.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Watch[]>([]);
  const full = clinics.filter((c) => displayStatus(c) === "closed");
  const watches = watched.length ? watched : mine;

  if (watches.length) {
    return (
      <View style={styles.watching}>
        <Ionicons name="notifications" size={18} color={colors.pine} />
        <T variant="body" style={{ flex: 1, fontSize: 14 }}>
          Watching {watches.length} full clinic{watches.length === 1 ? "" : "s"}. When one starts taking patients, you get an alert.
        </T>
        <Button small title="Preview the alert" onPress={() => router.navigate({ pathname: "/watchdog", params: { simulate: String(watches[0].id) } })} />
      </View>
    );
  }
  if (!full.length) return null;

  const watchAll = async (userEmail: string) => {
    if (!userEmail.includes("@")) {
      setError("Enter your email so CareScout can tell you when they open.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const made: Watch[] = [];
      for (const c of full) made.push((await api.addWatch(c, userEmail)) as Watch);
      setMine(made);
      setSearch((s) => ({ ...s, email: userEmail })); // Watchdog then shows these
      refreshWatchCount();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const names = full.length === 1 ? full[0].name : `${full.length} clinics`;
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Ionicons name="notifications-outline" size={18} color={colors.pine} />
        <T variant="body" style={{ flex: 1, fontSize: 14 }}>
          {names} {full.length === 1 ? "isn't" : "aren't"} taking new patients right now. Want an alert when {full.length === 1 ? "it opens" : "one opens"}?
        </T>
      </View>
      {publicDemo ? (
        <>
          <Button icon="notifications-outline" title="Try it with the demo watchlist" onPress={() => watchAll(DEMO_EMAIL)} loading={busy} />
          <T variant="small">This public demo uses a shared demo watchlist, so your own email isn't needed or stored.</T>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email for the alert"
          />
          <Button icon="notifications-outline" title={`Watch ${full.length === 1 ? "it" : "them"}`} onPress={() => watchAll(email.trim())} loading={busy} />
        </>
      )}
      {error && <T variant="small" style={{ color: colors.coral }}>{error}</T>}
    </Card>
  );
}

// ---------- also try these ----------

// official and community routes to a family doctor in Ontario / London (same list as the website)
const ROUTES = [
  {
    name: "Health Care Connect",
    who: "Ontario's own waitlist. It matches you with a family doctor or nurse practitioner taking patients. You need your health card number, postal code and phone number. Register online, or by phone through 811.",
    phone: "811",
    url: "https://www.ontario.ca/page/health-care-connect-find-family-doctor-or-nurse-practitioner",
    action: "Register online",
  },
  {
    name: "London InterCommunity Health Centre",
    who: "Health care in London for people who face barriers to care, such as poverty, homelessness, language or culture.",
    url: "https://lihc.on.ca/",
    action: "Visit",
  },
  {
    name: "London & District Academy of Medicine",
    who: "Keeps a list of London doctors who have said they're taking new patients.",
    url: "https://www.ldam.ca/find-a-doctor",
    action: "See the list",
  },
  {
    name: "Health811",
    who: "Free health advice from a registered nurse, any time, while you're still looking.",
    phone: "811",
    url: "https://health811.ontario.ca/",
    action: "Visit",
  },
];

/** "No luck yet? Also try these": the official routes that run alongside a CareScout search. */
export function NextSteps() {
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T variant="h2" accessibilityRole="header">No luck yet? Also try these</T>
        <T variant="small">They work alongside CareScout. It's worth doing all of them while you wait.</T>
      </View>
      {ROUTES.map((r) => (
        <View key={r.name} style={styles.route}>
          <T variant="title">{r.name}</T>
          <T variant="small">{r.who}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {r.phone && <Button small variant="secondary" icon="call-outline" title={r.phone} onPress={() => Linking.openURL(`tel:${r.phone}`).catch(() => {})} />}
            <Button small variant="secondary" icon="open-outline" title={r.action} onPress={() => Linking.openURL(r.url).catch(() => {})} />
          </View>
        </View>
      ))}
    </Card>
  );
}

// ---------- feedback survey ----------

const HELPED = [
  { key: "yes", label: "Yes" },
  { key: "somewhat", label: "Somewhat" },
  { key: "no", label: "No" },
] as const;
const EASE = ["", "Very hard", "Hard", "Okay", "Easy", "Very easy"];
const DONE_KEY = "carescout_feedback_sent";

/** Short anonymous survey (POST /api/feedback): did it help, how easy was it, anything to say. Shown once per phone. */
export function FeedbackSurvey({ page = "find" }: { page?: string }) {
  const [sentBefore, setSentBefore] = useState(true); // hidden until we know
  const [helped, setHelped] = useState<Feedback["helped"] | null>(null);
  const [ease, setEase] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"open" | "sending" | "sent">("open");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DONE_KEY)
      .then((v) => setSentBefore(v === "1"))
      .catch(() => setSentBefore(false));
  }, []);

  if (state === "sent") {
    return (
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name="checkmark-circle" size={20} color={colors.pine} />
        <T variant="body" style={{ flex: 1, fontSize: 14 }}>Thank you. Your answers help us make finding a family doctor a little easier.</T>
      </Card>
    );
  }
  if (sentBefore) return null;

  const submit = async () => {
    if (!helped) {
      setError("Please answer the first question.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      await api.feedback({ helped, ease: ease || null, comment: comment.trim(), page });
      AsyncStorage.setItem(DONE_KEY, "1").catch(() => {});
      setState("sent");
    } catch (e: any) {
      setError(e.message);
      setState("open");
    }
  };

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <T variant="h2" accessibilityRole="header">How did CareScout do?</T>
        <T variant="small">Three quick questions. Anonymous: please don't include your name or health details.</T>
      </View>
      <View style={{ gap: 8 }}>
        <T variant="bodyStrong" style={{ fontSize: 14 }}>Did it help you find a clinic to try?</T>
        <View style={styles.chips}>
          {HELPED.map((h) => (
            <Pressable key={h.key} onPress={() => setHelped(h.key)} accessibilityRole="radio" aria-checked={helped === h.key} style={[styles.chip, helped === h.key && styles.chipPine]}>
              <T style={[styles.chipText, helped === h.key && { color: colors.white }]}>{h.label}</T>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <T variant="bodyStrong" style={{ fontSize: 14 }}>How easy was it to use?</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setEase(n)} accessibilityRole="radio" accessibilityLabel={`${n} out of 5`} aria-checked={ease === n} hitSlop={4} style={{ padding: 2 }}>
              <Ionicons name={ease >= n ? "star" : "star-outline"} size={26} color={ease >= n ? colors.amber : colors.faint} />
            </Pressable>
          ))}
          <T variant="small" style={{ marginLeft: 8 }}>{EASE[ease]}</T>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <T variant="bodyStrong" style={{ fontSize: 14 }}>
          Anything we should change or add? <T variant="small">(optional)</T>
        </T>
        <TextInput
          style={[styles.input, { minHeight: 72, paddingTop: 10 }]}
          value={comment}
          onChangeText={setComment}
          maxLength={1000}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Anything we should change or add"
        />
      </View>
      {error && <T variant="small" style={{ color: colors.coral }}>{error}</T>}
      <Button title="Send feedback" onPress={submit} loading={state === "sending"} />
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipPine: { backgroundColor: colors.pine, borderColor: colors.pine },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  watching: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, backgroundColor: colors.pineSoft, padding: 14, borderRadius: radius.md },
  route: { gap: 4, backgroundColor: colors.mist, padding: 14, borderRadius: radius.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
