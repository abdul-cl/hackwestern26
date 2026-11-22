// Auto-fill a clinic's waitlist form (POST /api/apply). The agent fills the fields and STOPS before
// Submit, so the patient always reviews and submits on the clinic's own page. Shown as a bottom sheet
import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { canSaveDetails, hasSavedDetails, phoneHasLock, saveDetails, unlockDetails, unlockLabel } from "@/lib/secureDetails";
import type { Search } from "@/lib/config";
import { colors, fonts, radius } from "@/lib/theme";
import type { ApplyResult, MergedClinic, PatientInfo } from "@/lib/types";
import { useAppState } from "@/state/AppState";
import { Button, Ionicons, Label, T } from "./ui";

type Props = { clinic: MergedClinic | null; defaults: Search; onClose: () => void };

export default function ApplySheet({ clinic, defaults, onClose }: Props) {
  const insets = useSafeAreaInsets();
  // the body is keyed by clinic so every open starts with a fresh form (no reset effect needed)
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal visible={!!clinic} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          {clinic && <ApplyBody key={clinic.url} clinic={clinic} defaults={defaults} onClose={close} onBusy={setBusy} busy={busy} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type BodyProps = { clinic: MergedClinic; defaults: Search; onClose: () => void; onBusy: (b: boolean) => void; busy: boolean };

function ApplyBody({ clinic, defaults, onClose, onBusy, busy }: BodyProps) {
  const { applyAvailable } = useAppState();
  const [form, setForm] = useState<PatientInfo>({ name: "", email: defaults.email || "", phone: "", postal_code: defaults.postalCode || "" });
  // kept apart from the saved details on purpose: health info is never stored on the phone
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // saved details (phones only): locked in the keychain, unlocked with Face ID / fingerprint / passcode
  const [vault, setVault] = useState({ canSave: false, hasSaved: false, label: "your passcode", locked: true });
  const [remember, setRemember] = useState(false);
  const [vaultNote, setVaultNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const canSave = await canSaveDetails();
      if (!canSave || !alive) return;
      const [hasSaved, label, locked] = await Promise.all([hasSavedDetails(), unlockLabel(), phoneHasLock()]);
      if (alive) setVault({ canSave, hasSaved, label, locked });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const fillSaved = async () => {
    setVaultNote(null);
    const r = await unlockDetails();
    if (r.ok) setForm(r.details);
    else if (r.reason) setVaultNote(r.reason);
  };

  const set = (k: keyof PatientInfo) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const complete = form.name.trim() && form.email.includes("@") && form.phone.trim() && form.postal_code.trim();
  const openForm = () => {
    if (clinic.waitlist_url) Linking.openURL(clinic.waitlist_url).catch(() => {});
  };

  const submit = async () => {
    if (!clinic.waitlist_url || !complete) return;
    onBusy(true);
    setError(null);
    setResult(null);
    try {
      if (remember) {
        // save first so the details aren't lost if the form fill fails
        await saveDetails(form).catch(() => {});
        setVault((v) => ({ ...v, hasSaved: true }));
      }
      const r = reason.trim();
      setResult(await api.apply(clinic.waitlist_url, r ? { ...form, reason: r } : form));
    } catch (e: any) {
      setError(e.message);
    } finally {
      onBusy(false);
    }
  };

  return (
    <>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T variant="h2">Auto-fill waitlist</T>
          <T variant="small" numberOfLines={1}>{clinic.name}</T>
        </View>
        <Pressable onPress={onClose} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
        <View style={styles.safety}>
          <Ionicons name="hand-left-outline" size={18} color={colors.pine} />
          <T style={styles.safetyText}>
            CareScout fills in the form and <T style={{ fontFamily: fonts.bodyBold, color: colors.pineDeep }}>stops before Submit</T>. You check it and submit it yourself on the clinic's website.
          </T>
        </View>

        {!applyAvailable && (
          <View style={{ gap: 12 }}>
            <T variant="small">Auto-fill is turned off on this server right now. You can open the clinic's form and fill it in yourself.</T>
            <Button title="Open the clinic's form" icon="open-outline" onPress={openForm} />
          </View>
        )}

        {!result && applyAvailable && (
          <View style={{ gap: 12 }}>
            {vault.hasSaved && (
              <View style={{ gap: 6 }}>
                <Button
                  variant="secondary"
                  icon={vault.label === "Face ID" || vault.label === "face unlock" ? "scan-outline" : "finger-print"}
                  title={`Fill with my saved details`}
                  onPress={fillSaved}
                />
                <T variant="small" style={{ textAlign: "center" }}>Unlocks with {vault.label}</T>
                {vaultNote && <T variant="small" style={{ color: colors.coral, textAlign: "center" }}>{vaultNote}</T>}
              </View>
            )}
            <Field label="Full name" value={form.name} onChange={set("name")} max={120} auto="name" />
            <Field label="Email" value={form.email} onChange={set("email")} max={200} auto="email" keyboard="email-address" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Phone" value={form.phone} onChange={set("phone")} max={40} auto="tel" keyboard="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Postal code" value={form.postal_code} onChange={set("postal_code")} max={12} auto="postal-code" caps />
              </View>
            </View>
            <View>
              <Label>Reason for your visit (optional)</Label>
              <TextInput
                style={[styles.input, styles.reason]}
                value={reason}
                onChangeText={setReason}
                maxLength={600}
                multiline
                textAlignVertical="top"
                placeholder="e.g. Need a family doctor for ongoing asthma care and prescription refills"
                placeholderTextColor={colors.faint}
                accessibilityLabel="Reason for your visit, optional"
              />
              <T variant="small" style={{ marginTop: 6 }}>
                Only goes into the clinic's form if it has a box for it. Not saved on your phone. {reason.length}/600
              </T>
            </View>
            {vault.canSave && !vault.hasSaved && (
              <View style={styles.remember}>
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong" style={{ fontSize: 14 }}>Save these on this phone</T>
                  <T variant="small">
                    {vault.locked
                      ? `Locked with ${vault.label}. Only used to fill forms you choose.`
                      : "Your phone has no lock set up, so anyone holding it could use them."}
                  </T>
                </View>
                <Switch
                  value={remember}
                  onValueChange={setRemember}
                  trackColor={{ true: colors.pine, false: colors.line }}
                  thumbColor={colors.white}
                  accessibilityLabel="Save these details on this phone"
                />
              </View>
            )}
            {error && <T variant="small" style={{ color: colors.coral }}>{error}</T>}
            {busy && <T variant="small">The agent is filling in the form. This can take up to 2 minutes.</T>}
            <Button title="Fill in the form" icon="create-outline" onPress={submit} loading={busy} disabled={!complete} />
          </View>
        )}

        {result && <Result result={result} onOpen={openForm} onRetry={() => setResult(null)} />}
      </ScrollView>
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  auto: "name" | "email" | "tel" | "postal-code";
  keyboard?: "email-address" | "phone-pad";
  caps?: boolean;
}) {
  return (
    <View>
      <Label>{props.label}</Label>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        maxLength={props.max}
        autoComplete={props.auto}
        keyboardType={props.keyboard}
        autoCapitalize={props.caps ? "characters" : props.keyboard ? "none" : "words"}
        autoCorrect={false}
        accessibilityLabel={props.label}
      />
    </View>
  );
}

function Result({ result, onOpen, onRetry }: { result: ApplyResult; onOpen: () => void; onRetry: () => void }) {
  if (result.status === "ready_for_review") {
    const fields = Object.entries(result.filled_fields || {});
    return (
      <View style={{ gap: 12 }}>
        <View style={[styles.banner, { backgroundColor: "#E4F4EC" }]}>
          <Ionicons name="checkmark-circle" size={18} color="#0B5A44" />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bodyBold, color: "#0B5A44" }}>Ready for your review. Not submitted.</T>
            <T variant="small" style={{ color: "#0B5A44" }}>
              The agent stopped before the final Submit button. Open the form, check every field, and submit it yourself.
            </T>
          </View>
        </View>
        {fields.length > 0 && (
          <View style={styles.table}>
            {fields.map(([k, v], i) => (
              <View key={k} style={[styles.tr, i === fields.length - 1 && { borderBottomWidth: 0 }]}>
                <T variant="small" style={{ width: 110 }}>{k}</T>
                <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14 }}>{String(v)}</T>
              </View>
            ))}
          </View>
        )}
        {!!result.summary && <T variant="small">{result.summary}</T>}
        {result.screenshot_url && (
          <Image source={{ uri: result.screenshot_url }} style={styles.shot} resizeMode="contain" accessibilityLabel="Filled form preview" />
        )}
        <Button title="Open the clinic's form" icon="open-outline" onPress={onOpen} />
      </View>
    );
  }

  const isError = result.status === "error";
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.banner, { backgroundColor: isError ? colors.coralSoft : "#FCF1DF" }]} accessibilityRole="alert">
        <Ionicons name="warning" size={18} color={isError ? colors.coral : "#8A5410"} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodyBold, color: isError ? "#9B2730" : "#8A5410" }}>
            {isError ? "Something went wrong" : "Please finish this one yourself"}
          </T>
          <T variant="small" style={{ color: isError ? "#9B2730" : "#8A5410" }}>{result.summary}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button title="Try again" variant="secondary" onPress={onRetry} style={{ flex: 1 }} />
        <Button title="Open form" icon="open-outline" onPress={onOpen} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reason: { minHeight: 88, paddingTop: 12 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(9, 25, 21, 0.45)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "90%",
    gap: 14,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  safety: { flexDirection: "row", gap: 10, backgroundColor: colors.pineSoft, padding: 12, borderRadius: radius.sm },
  safetyText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.pineDeep },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  banner: { flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.sm },
  remember: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mist, padding: 12, borderRadius: radius.sm },
  table: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm },
  tr: { flexDirection: "row", gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  shot: { width: "100%", height: 220, borderRadius: radius.sm, backgroundColor: colors.mist },
});
