// Look a doctor up on the official CPSO register (POST /api/verify-doctor)
import { useState } from "react";
import { Linking, StyleSheet, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import { colors, fonts, radius } from "@/lib/theme";
import type { DoctorVerification } from "@/lib/types";
import { useAppState } from "@/state/AppState";
import { Button, Pill, T } from "./ui";

const CPSO_REGISTER = "https://register.cpso.on.ca/";

export default function VerifyDoctor({ city }: { city: string }) {
  const { publicDemo } = useAppState();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DoctorVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ok = name.trim().length >= 2;

  const verify = async () => {
    if (!ok || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      // the backend wants just the city name, "London, ON" -> "London"
      setResult(await api.verifyDoctor(name.trim(), (city || "London").split(",")[0].trim()));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (publicDemo) {
    return (
      <View style={styles.box}>
        <T variant="small">
          Doctor lookups run a live agent, which is turned off on this public demo. You can search the official CPSO register yourself.
        </T>
        <Button small variant="secondary" icon="open-outline" title="Open the CPSO register" onPress={() => Linking.openURL(CPSO_REGISTER)} style={{ alignSelf: "flex-start" }} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <T variant="label">Check a doctor on the CPSO register</T>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Doctor's name, e.g. Jane Smith"
          placeholderTextColor={colors.faint}
          onSubmitEditing={verify}
          returnKeyType="search"
          maxLength={100}
          accessibilityLabel="Doctor's name"
        />
        <Button small title="Verify" icon="shield-checkmark-outline" variant="secondary" onPress={verify} loading={loading} disabled={!ok} />
      </View>
      {loading && <T variant="small">Checking the CPSO register. This can take a minute or two.</T>}
      {error && <T variant="small" style={{ color: colors.coral }}>{error}</T>}

      {result && (
        <View style={{ gap: 8 }}>
          {result.verified ? (
            <Pill text="CPSO verified" bg="#E4F4EC" color="#0B5A44" />
          ) : (
            <Pill
              text={result.lookup_status === "found" ? "Not active" : result.lookup_status === "not_found" ? "Not found" : "Couldn't verify"}
              bg="#FCF1DF"
              color="#8A5410"
            />
          )}
          <View style={{ gap: 3 }}>
            {result.cpso_number && <Row k="CPSO #" v={result.cpso_number} mono />}
            {result.registration_status && <Row k="Status" v={result.registration_status} />}
            {result.specialty && <Row k="Specialty" v={result.specialty} />}
            {result.languages?.length > 0 && <Row k="Languages" v={result.languages.join(", ")} />}
          </View>
          {!!result.notes && <T variant="small">{result.notes}</T>}
          {result.profile_url && (
            <Button
              small
              variant="ghost"
              icon="open-outline"
              title="Official CPSO profile"
              onPress={() => Linking.openURL(result.profile_url!)}
              style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
            />
          )}
        </View>
      )}
    </View>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <T variant="small" style={{ width: 78 }}>{k}</T>
      <T style={[{ flex: 1, fontSize: 13 }, mono && { fontFamily: fonts.mono }]}>{v}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.mist },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
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
    backgroundColor: colors.white,
  },
});
