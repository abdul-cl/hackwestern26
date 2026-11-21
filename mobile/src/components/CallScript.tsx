// For clinics with no online waitlist: phone number, hours and a script to read on the call
import { Linking, StyleSheet, View } from "react-native";
import { telHref } from "@/lib/clinics";
import { colors, fonts, radius } from "@/lib/theme";
import type { MergedClinic } from "@/lib/types";
import { Button, Ionicons, T } from "./ui";

export default function CallScript({ clinic }: { clinic: MergedClinic }) {
  return (
    <View style={styles.box}>
      {clinic.phone_number ? (
        <Button
          small
          icon="call"
          title={`Call ${clinic.phone_number}`}
          onPress={() => Linking.openURL(telHref(clinic.phone_number!)).catch(() => {})}
          style={{ alignSelf: "flex-start" }}
        />
      ) : (
        <T variant="small">No phone number listed on the clinic's site.</T>
      )}
      {clinic.call_hours && (
        <View style={styles.hours}>
          <Ionicons name="time-outline" size={14} color={colors.muted} />
          <T variant="small" style={{ flex: 1 }}>{clinic.call_hours}</T>
        </View>
      )}
      {clinic.call_script ? (
        <View style={styles.script}>
          <T variant="label">What to say</T>
          {/* selectable so people can long-press and copy it. RN Text keeps \n line breaks like pre-line */}
          <T selectable style={styles.scriptText}>{clinic.call_script}</T>
        </View>
      ) : (
        <T variant="small">No call script for this clinic.</T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.mist },
  hours: { flexDirection: "row", alignItems: "center", gap: 6 },
  script: { backgroundColor: colors.white, padding: 14, borderRadius: radius.sm, gap: 6, borderWidth: 1, borderColor: colors.line },
  scriptText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
});
