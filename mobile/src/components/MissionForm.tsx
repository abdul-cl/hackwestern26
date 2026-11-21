// The search form at the top of the Find tab
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { COVERAGE_OPTIONS, LANGUAGE_OPTIONS, MAX_CLINICS, type Search } from "@/lib/config";
import { colors, radius } from "@/lib/theme";
import { Button, Card, ChipSelect, Ionicons, Label } from "./ui";

type Props = {
  values: Search;
  onChange: (s: Search) => void;
  onLaunch: () => void;
  onStop: () => void;
  running: boolean;
  publicDemo?: boolean;
};

export default function MissionForm({ values, onChange, onLaunch, onStop, running, publicDemo = false }: Props) {
  const [showMore, setShowMore] = useState(false);
  const set = <K extends keyof Search>(key: K) => (v: Search[K]) => onChange({ ...values, [key]: v });

  // keep the clinic count between 1 and 25
  const setCount = (raw: string) => {
    const n = Math.round(Number(raw.replace(/\D/g, "")));
    onChange({ ...values, maxClinics: raw === "" ? 0 : Math.max(1, Math.min(MAX_CLINICS, n || 1)) });
  };

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.row}>
        <View style={{ flex: 3 }}>
          <Label>City</Label>
          <TextInput style={styles.input} value={values.city} onChangeText={set("city")} placeholder="London, ON" />
        </View>
        <View style={{ flex: 2 }}>
          <Label>Postal code</Label>
          <TextInput
            style={styles.input}
            value={values.postalCode}
            onChangeText={set("postalCode")}
            placeholder="N6A 3K7"
            autoCapitalize="characters"
          />
        </View>
      </View>

      <View>
        <Label>Coverage</Label>
        <ChipSelect options={COVERAGE_OPTIONS} value={values.coverage} onChange={set("coverage")} />
      </View>
      <View>
        <Label>Language</Label>
        <ChipSelect options={LANGUAGE_OPTIONS} value={values.language} onChange={set("language")} />
      </View>

      {/* the less common settings are tucked away so the form isn't huge on a phone */}
      <Pressable onPress={() => setShowMore((s) => !s)} style={styles.moreToggle}>
        <Text style={styles.moreText}>{showMore ? "Fewer options" : "More options"}</Text>
        <Ionicons name={showMore ? "chevron-up" : "chevron-down"} size={16} color={colors.pine700} />
      </Pressable>

      {showMore && (
        <View style={{ gap: 14 }}>
          <View>
            <Label>Email (optional, auto-watch full clinics)</Label>
            <TextInput
              style={styles.input}
              value={values.email}
              onChangeText={set("email")}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.row}>
            <View style={{ width: 110 }}>
              <Label>Clinics</Label>
              <TextInput
                style={styles.input}
                value={values.maxClinics ? String(values.maxClinics) : ""}
                onChangeText={setCount}
                onBlur={() => !values.maxClinics && onChange({ ...values, maxClinics: 5 })}
                keyboardType="number-pad"
              />
            </View>
            <Text style={styles.note}>
              {values.useCache || publicDemo
                ? `Up to ${MAX_CLINICS}. Saved results load instantly.`
                : "More clinics means longer waits. Sites that need a browser agent take 1-3 min each."}
            </Text>
          </View>
          {!publicDemo && (
            <ToggleRow
              label="Re-check every clinic"
              hint="slower, ignores saved results"
              value={values.recheckAll && !values.useCache}
              disabled={values.useCache}
              onChange={set("recheckAll")}
            />
          )}
        </View>
      )}

      {publicDemo ? (
        <Text style={styles.note}>This is the public demo, so it only shows saved results from the CareScout database.</Text>
      ) : (
        <ToggleRow label="Demo mode" hint="saved results only, instant" value={values.useCache} onChange={set("useCache")} />
      )}

      {running ? (
        <Button title="Stop" icon="stop" variant="secondary" onPress={onStop} />
      ) : (
        <Button title="Launch CareScout" icon="rocket" onPress={onLaunch} />
      )}
    </Card>
  );
}

function ToggleRow(props: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.toggleRow, props.disabled && { opacity: 0.4 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{props.label}</Text>
        <Text style={styles.toggleHint}>{props.hint}</Text>
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        trackColor={{ true: colors.pine500, false: colors.slate200 }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  moreToggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  moreText: { color: colors.pine700, fontWeight: "600", fontSize: 14 },
  note: { flex: 1, fontSize: 12, color: colors.slate500, lineHeight: 17, marginTop: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: colors.ink },
  toggleHint: { fontSize: 12, color: colors.slate500 },
});
