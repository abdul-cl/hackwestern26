// How it works tab: the four agents, reading results, privacy + safety, FAQ, and the owner key
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import StatusBadge from "@/components/StatusBadge";
import { Button, Card, Ionicons, T } from "@/components/ui";
import type { DisplayStatus } from "@/lib/clinics";
import { forgetDetails, hasSavedDetails } from "@/lib/secureDetails";
import HealthCareConnect from "@/components/HealthCareConnect";
import { colors, fonts, radius } from "@/lib/theme";
import { useAppState } from "@/state/AppState";

// same copy as the website's How it works page
const AGENTS = [
  {
    name: "Scout",
    what: "Searches the web for family practices and family health teams in your city, then has Gemini drop anything that isn't a clinic you could join, like directories, walk-in-only clinics and review sites.",
    tech: "TinyFish search + Gemini",
  },
  {
    name: "Browser Swarm",
    what: "Opens each clinic's website in a real browser and reads it like a person would. It records whether they're accepting new patients, the sentence that says so, any waitlist form, the address, phone number and hours.",
    tech: "TinyFish browser agents, two at a time",
  },
  {
    name: "Triage",
    what: "Scores every clinic for you, using your health coverage, your language and how far it is from your postal code. It writes the reason and your next step in the language you chose, and a call script for clinics that only take patients by phone.",
    tech: "Gemini",
  },
  {
    name: "Watchdog",
    what: "Keeps a list of clinics that were full and checks them again. When one starts accepting patients, you get an alert with the quote from their site.",
    tech: "TinyFish + a small database",
  },
];

const RESULTS: [DisplayStatus, string][] = [
  ["accepting", "The clinic's site says it's taking new patients now."],
  ["waitlist", "You can't book yet, but you can join their list."],
  ["closed", "The clinic says it's full. Watch it to hear when that changes."],
  ["unknown", "The site didn't load or blocked the agent. Visit it or call them directly."],
];

const SAFETY = [
  ["CareScout never presses Submit", "Waitlist forms are filled in and left for you to check and send. If an agent ever reports that a form was sent, CareScout tells you right away."],
  ["It only reads public pages", "Agents read the same clinic websites you could. They don't log in anywhere or get around CAPTCHAs; if a site blocks them, you're asked to finish that one yourself."],
  ["Your details are used for one thing", "Your name, email, phone and postal code are only typed into the form you ask CareScout to fill. Your email is only used for your watchlist alerts."],
  ["It's not medical advice", "CareScout helps you find a clinic. For health advice call Health811, and in an emergency call 911."],
];

const FAQ = [
  ["Is CareScout free?", "Yes. It was built at Hack Western to help people across Ontario find a family doctor."],
  ["Does it sign me up with a clinic?", "No. When a clinic has an online form, CareScout fills it in and stops before the final Submit button, so you review it and send it yourself. It never submits anything for you."],
  ["How current are the results?", "Each search reads the clinic websites at that moment. A clinic's status can change quickly, so check the quote on each result and act soon on any clinic that's accepting."],
  ["Why does a search take a few minutes?", "Agents read real clinic websites, and each one can take a minute or two. You'll see every clinic's progress live, and you can use other tabs while they work."],
  ["What does the match score mean?", "It's how well a clinic fits you, from 0 to 100, based on whether it's accepting, your coverage, your language and distance. It's guidance, not a rating of the clinic's care."],
  ["I don't have OHIP. Can I still use it?", "Yes. Choose UHIP or Uninsured and CareScout favours clinics whose sites say they take those patients, and marks the rest as 'Check eligibility'."],
];

export default function HowItWorksScreen() {
  const [openQ, setOpenQ] = useState<number | null>(null);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ gap: 8 }}>
          <T variant="h1">How CareScout works</T>
          <T variant="body" style={{ color: colors.muted }}>
            Finding a family doctor usually means checking dozens of clinic websites and phone lines. CareScout splits that work between four agents and shows you what each one finds.
          </T>
        </View>

        <Section title="The four agents">
          <Card style={{ paddingVertical: 4 }}>
            {AGENTS.map((a, i) => (
              <View key={a.name} style={[styles.agent, i > 0 && styles.divider]}>
                <View style={styles.agentHead}>
                  <View style={styles.agentNum}>
                    <T style={styles.agentNumText}>{i + 1}</T>
                  </View>
                  <T variant="h2" style={{ flex: 1 }}>{a.name}</T>
                </View>
                <T variant="body" style={{ color: colors.muted }}>{a.what}</T>
                <T variant="mono" style={{ fontSize: 11 }}>{a.tech}</T>
              </View>
            ))}
          </Card>
        </Section>

        <Section title="Reading your results" sub="Every clinic shows its status and the exact sentence from its website that the status is based on.">
          <Card style={{ gap: 14 }}>
            {RESULTS.map(([status, desc]) => (
              <View key={status} style={{ gap: 6 }}>
                <StatusBadge status={status} />
                <T variant="small">{desc}</T>
              </View>
            ))}
          </Card>
        </Section>

        <View style={styles.safety}>
          <T variant="h2" style={{ color: colors.white }}>Privacy and safety</T>
          {SAFETY.map(([title, text]) => (
            <View key={title} style={{ gap: 3 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Ionicons name="shield-checkmark" size={15} color={colors.pulse} />
                <T style={styles.safetyTitle}>{title}</T>
              </View>
              <T style={styles.safetyText}>{text}</T>
            </View>
          ))}
        </View>

        <Section title="If nothing's accepting" sub="CareScout finds clinics taking patients right now. Ontario also keeps its own waitlist, and it's worth being on both.">
          <HealthCareConnect />
        </Section>

        <Section title="Questions">
          <Card style={{ paddingVertical: 2 }}>
            {FAQ.map(([q, a], i) => {
              const open = openQ === i;
              return (
                <View key={q} style={i > 0 && styles.divider}>
                  <Pressable
                    onPress={() => setOpenQ(open ? null : i)}
                    style={styles.q}
                    accessibilityRole="button"
                    accessibilityLabel={q}
                    aria-expanded={open}
                  >
                    <T variant="bodyStrong" style={{ flex: 1 }}>{q}</T>
                    <Ionicons name={open ? "remove" : "add"} size={18} color={colors.muted} />
                  </Pressable>
                  {open && (
                    <Animated.View entering={FadeIn.duration(200)} style={{ paddingBottom: 14 }}>
                      <T variant="body" style={{ color: colors.muted }}>{a}</T>
                    </Animated.View>
                  )}
                </View>
              );
            })}
          </Card>
        </Section>

        <View style={{ gap: 10 }}>
          <Button title="Find a doctor" icon="search" onPress={() => router.navigate("/find")} />
          <Button title="Watch a demo search" icon="play" variant="secondary" onPress={() => router.navigate({ pathname: "/find", params: { demo: "1" } })} />
          <Button
            title="CPSO physician register"
            icon="open-outline"
            variant="ghost"
            small
            onPress={() => Linking.openURL("https://register.cpso.on.ca/").catch(() => {})}
          />
        </View>

        <SavedDetails />
        <OwnerKey />

        <T variant="small" style={{ textAlign: "center" }}>
          Built at Hack Western for patients across Ontario. In an emergency, call 911. For health advice any time, call Health811.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <T variant="label">{title}</T>
        {sub && <T variant="small">{sub}</T>}
      </View>
      {children}
    </View>
  );
}

// lets people wipe the Auto-fill details they saved (only shows when there are some)
function SavedDetails() {
  const [has, setHas] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    hasSavedDetails().then(setHas);
  }, []);
  if (!has && !done) return null;
  return (
    <View style={styles.vault}>
      <Ionicons name="lock-closed-outline" size={16} color={colors.pine} />
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong" style={{ fontSize: 14 }}>{done ? "Saved details removed" : "Your details are saved on this phone"}</T>
        <T variant="small">{done ? "Auto-fill will ask for them again next time." : "Locked in the phone's keychain, used only for Auto-fill."}</T>
      </View>
      {!done && (
        <Button
          small
          variant="secondary"
          title="Forget"
          onPress={async () => {
            await forgetDetails();
            setHas(false);
            setDone(true);
          }}
        />
      )}
    </View>
  );
}

// owner-only unlock for the public deployment, same as the website's console trick but with a field.
// tucked at the bottom since normal users never need it
function OwnerKey() {
  const { ownerKey, saveOwnerKey, publicDemo } = useAppState();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (k: string) => {
    setSaving(true);
    await saveOwnerKey(k);
    setSaving(false);
    setValue("");
  };

  return (
    <View style={styles.owner}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.q}
        accessibilityRole="button"
        accessibilityLabel="Owner key"
        aria-expanded={open}
      >
        <Ionicons name="key-outline" size={15} color={colors.muted} />
        <T variant="small" style={{ flex: 1 }}>Owner key {ownerKey ? "(saved)" : ""}</T>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={{ gap: 10, paddingBottom: 12 }}>
          <T variant="small">
            Only for whoever runs the CareScout server. On the public demo, your admin key turns live agents back on for this phone only. It's stored on this device.
          </T>
          {ownerKey ? (
            <>
              <T variant="small" style={{ color: publicDemo ? colors.coral : colors.pine }}>
                {publicDemo ? "The server didn't accept this key." : "Live agents are on for this phone."}
              </T>
              <Button small variant="secondary" title="Remove key" onPress={() => save("")} loading={saving} style={{ alignSelf: "flex-start" }} />
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                placeholder="CARESCOUT_ADMIN_KEY"
                placeholderTextColor={colors.faint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Owner key"
              />
              <Button small title="Save" onPress={() => save(value)} loading={saving} disabled={!value.trim()} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 26, paddingBottom: 48 },
  agent: { paddingVertical: 16, gap: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  agentHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  agentNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  agentNumText: { fontFamily: fonts.mono, fontSize: 12, color: colors.white },
  safety: { backgroundColor: colors.pineDeep, borderRadius: radius.lg + 4, padding: 22, gap: 16 },
  safetyTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.white, flex: 1 },
  safetyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: "#B9D6CC", paddingLeft: 23 },
  q: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  owner: { borderTopWidth: 1, borderTopColor: colors.line },
  vault: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.pineSoft, padding: 14, borderRadius: radius.md },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
});
