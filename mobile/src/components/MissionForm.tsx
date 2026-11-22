// The search form at the top of the Find tab
import { useState } from "react";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { COVERAGE_OPTIONS, LANGUAGE_OPTIONS, MAX_CLINICS, type Search } from "@/lib/config";
import { cityLabel, formatPostal } from "@/lib/device";
import { colors, fonts, radius } from "@/lib/theme";
import { Button, Card, ChipSelect, Ionicons, Label, T } from "./ui";

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
  const savedOnly = publicDemo || values.useCache;
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<{ text: string; error?: boolean } | null>(null);

  // GPS -> postal code + city. reverse geocoding only exists on iOS/Android so the button is hidden on web
  const useMyLocation = async () => {
    setLocating(true);
    setLocNote(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocNote({ text: "Location is off for CareScout. You can turn it on in Settings, or type your postal code.", error: true });
        return;
      }
      // last known position is instant, only ask the GPS if there isn't one
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60000 })) ||
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const postal = formatPostal(place?.postalCode);
      const city = cityLabel(place?.city || place?.subregion, place?.region);
      if (!postal && !city) {
        setLocNote({ text: "Couldn't work out an address here. Type your postal code instead.", error: true });
        return;
      }
      onChange({ ...values, postalCode: postal || values.postalCode, city: city || values.city });
      Haptics.selectionAsync().catch(() => {});
      // phones sometimes only know the first 3 characters, which the backend can't use for distances
      if (!postal) setLocNote({ text: `Got ${city}. Add your postal code to see distances.`, error: true });
      else if (postal.length < 7) setLocNote({ text: `Got ${city || "your area"}, but only part of the postal code. Add the rest for distances.`, error: true });
      else setLocNote({ text: `Using ${postal}${city ? `, ${city}` : ""}` });
    } catch {
      setLocNote({ text: "Couldn't get your location. Check that location services are on.", error: true });
    } finally {
      setLocating(false);
    }
  };

  // keep the clinic count between 1 and 25 (blank while typing is fine, it snaps back to 5 on blur)
  const setCount = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    onChange({ ...values, maxClinics: digits === "" ? 0 : Math.max(1, Math.min(MAX_CLINICS, Number(digits))) });
  };

  return (
    <Card style={{ gap: 18 }}>
      <View style={styles.row}>
        <View style={{ flex: 3 }}>
          <Label>City</Label>
          <TextInput
            style={styles.input}
            value={values.city}
            onChangeText={set("city")}
            placeholder="London, ON"
            placeholderTextColor={colors.faint}
            accessibilityLabel="City"
            maxLength={100}
          />
        </View>
        <View style={{ flex: 2 }}>
          <Label>Postal code</Label>
          <TextInput
            style={styles.input}
            value={values.postalCode}
            onChangeText={set("postalCode")}
            placeholder="N6A 3K7"
            placeholderTextColor={colors.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Postal code"
            maxLength={12}
          />
        </View>
      </View>

      {Platform.OS !== "web" && (
        <View style={{ gap: 6, marginTop: -6 }}>
          <Pressable
            onPress={useMyLocation}
            disabled={locating}
            style={({ pressed }) => [styles.locBtn, (pressed || locating) && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Use my location"
            hitSlop={6}
          >
            {locating ? <ActivityIndicator size="small" color={colors.pine} /> : <Ionicons name="locate" size={16} color={colors.pine} />}
            <T style={styles.locText}>{locating ? "Finding you..." : "Use my location"}</T>
          </Pressable>
          {locNote && <T variant="small" style={locNote.error ? { color: "#8A5410" } : { color: colors.pine }}>{locNote.text}</T>}
        </View>
      )}

      <View>
        <Label>Coverage</Label>
        <ChipSelect label="Coverage" options={COVERAGE_OPTIONS} value={values.coverage} onChange={set("coverage")} />
      </View>
      <View>
        <Label>Language</Label>
        <ChipSelect label="Language" options={LANGUAGE_OPTIONS} value={values.language} onChange={set("language")} />
      </View>

      {/* the less common settings are tucked away so the form isn't huge on a phone */}
      <Pressable
        onPress={() => setShowMore((s) => !s)}
        style={styles.moreToggle}
        accessibilityRole="button"
        accessibilityLabel={showMore ? "Fewer options" : "More options: email, clinic count, re-checks"}
        aria-expanded={showMore}
        hitSlop={8}
      >
        <T style={styles.moreText}>{showMore ? "Fewer options" : "Email, clinic count, re-checks"}</T>
        <Ionicons name={showMore ? "chevron-up" : "chevron-down"} size={16} color={colors.pine} />
      </Pressable>

      {showMore && (
        <View style={{ gap: 16 }}>
          <View>
            <Label>Email (optional)</Label>
            <TextInput
              style={styles.input}
              value={values.email}
              onChangeText={set("email")}
              placeholder="you@example.com"
              placeholderTextColor={colors.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              accessibilityLabel="Email"
              maxLength={200}
            />
            <T variant="small" style={{ marginTop: 6 }}>Add it and CareScout watches the full clinics for you.</T>
          </View>
          <View style={styles.row}>
            <View style={{ width: 96 }}>
              <Label>Clinics</Label>
              <TextInput
                style={[styles.input, { fontFamily: fonts.mono }]}
                value={values.maxClinics ? String(values.maxClinics) : ""}
                onChangeText={setCount}
                onBlur={() => !values.maxClinics && onChange({ ...values, maxClinics: 5 })}
                keyboardType="number-pad"
                accessibilityLabel={`Clinics to check, 1 to ${MAX_CLINICS}`}
                maxLength={2}
              />
            </View>
            <T variant="small" style={{ flex: 1, marginTop: 24 }}>
              {savedOnly
                ? `Up to ${MAX_CLINICS}. Saved results load instantly, so a bigger number doesn't make you wait.`
                : `Up to ${MAX_CLINICS}. Clinics checked in the last 12 hours load instantly, most others take a few seconds.`}
            </T>
          </View>
          {!publicDemo && (
            <ToggleRow
              label="Re-check every clinic"
              hint={values.useCache ? "turn off demo mode to use this" : "slower, ignores saved results"}
              value={values.recheckAll && !values.useCache}
              disabled={values.useCache}
              onChange={set("recheckAll")}
            />
          )}
        </View>
      )}

      <View style={styles.divider} />

      {publicDemo ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle" size={18} color={colors.pine} />
          <T variant="small" style={{ flex: 1 }}>
            This is the public demo, so it shows saved results from the CareScout database. Live checks run when CareScout is set up locally.
          </T>
        </View>
      ) : (
        <ToggleRow label="Demo mode" hint="saved results only, instant, no agent credits" value={values.useCache} onChange={set("useCache")} />
      )}

      {running ? (
        <Button title="Stop the search" icon="stop" variant="secondary" onPress={onStop} />
      ) : (
        <Button title={savedOnly ? "Show saved results" : "Start live search"} icon={savedOnly ? "flash" : "pulse"} onPress={onLaunch} />
      )}
    </Card>
  );
}

function ToggleRow(props: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.toggleRow, props.disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{props.label}</T>
        <T variant="small">{props.hint}</T>
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        trackColor={{ true: colors.pine, false: colors.line }}
        thumbColor={colors.white}
        // web ignores thumbColor when the switch is on, this is its version of it
        {...(Platform.OS === "web" ? ({ activeThumbColor: colors.white } as object) : {})}
        accessibilityLabel={props.label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16, // 16+ stops iOS from zooming into the field
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  locBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  locText: { color: colors.pine, fontFamily: fonts.bodySemi, fontSize: 14 },
  moreToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  moreText: { color: colors.pine, fontFamily: fonts.bodySemi, fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: -18 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  notice: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});
