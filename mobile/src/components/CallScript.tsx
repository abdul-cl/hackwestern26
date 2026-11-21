// For clinics with no online waitlist: phone number, hours and a script to read on the call
import { Linking, StyleSheet, Text, View } from "react-native";
import { telHref } from "@/lib/clinics";
import { colors } from "@/lib/theme";
import type { MergedClinic } from "@/lib/types";
import { Button, Ionicons } from "./ui";

export default function CallScript({ clinic }: { clinic: MergedClinic }) {
  return (
    <View style={styles.box}>
      {clinic.phone_number ? (
        <Button
          small
          icon="call"
          title={`Call ${clinic.phone_number}`}
          onPress={() => Linking.openURL(telHref(clinic.phone_number!))}
          style={{ alignSelf: "flex-start" }}
        />
      ) : (
        <Text style={styles.muted}>No phone number listed on the clinic's site.</Text>
      )}
      {clinic.call_hours && (
        <View style={styles.hours}>
          <Ionicons name="time-outline" size={14} color={colors.slate600} />
          <Text style={{ color: colors.slate600, fontSize: 13, flex: 1 }}>{clinic.call_hours}</Text>
        </View>
      )}
      {clinic.call_script ? (
        // selectable so people can long-press and copy it
        <Text selectable style={styles.script}>{clinic.call_script}</Text>
      ) : (
        <Text style={styles.muted}>No call script for this clinic.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12, gap: 10, padding: 12, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.slate200 },
  hours: { flexDirection: "row", alignItems: "center", gap: 6 },
  script: { backgroundColor: colors.white, padding: 12, borderRadius: 8, color: colors.slate700, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.slate500, fontSize: 13 },
});
