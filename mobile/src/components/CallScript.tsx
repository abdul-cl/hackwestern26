// For clinics with no online waitlist: phone number, hours, a script to read on the call,
// and a reminder to call when the lines open
import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import * as Calendar from "expo-calendar/legacy";
import * as Haptics from "expo-haptics";
import { telHref } from "@/lib/clinics";
import { nextCallSlot } from "@/lib/device";
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

      {/* phones only: the calendar API doesn't exist in the browser */}
      {clinic.phone_number && Platform.OS !== "web" && <CallReminder clinic={clinic} />}

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

// "Lines open Monday at 9:00 AM. Remind me?" -> opens the phone's own new-event screen, filled in,
// so the person sees exactly what's being added and taps save themselves
function CallReminder({ clinic }: { clinic: MergedClinic }) {
  const slot = nextCallSlot(clinic.call_hours);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const addReminder = async () => {
    setBusy(true);
    setNote(null);
    const event = {
      title: `Call ${clinic.name}`,
      startDate: slot.date,
      endDate: new Date(slot.date.getTime() + 15 * 60000),
      location: clinic.address || undefined,
      notes: [
        `Phone: ${clinic.phone_number}`,
        clinic.call_hours ? `Hours: ${clinic.call_hours}` : null,
        clinic.call_script ? `\nWhat to say:\n${clinic.call_script}` : null,
        "\nFrom CareScout",
      ]
        .filter(Boolean)
        .join("\n"),
      alarms: [{ relativeOffset: 0 }],
    };
    try {
      let result;
      try {
        result = await Calendar.createEventInCalendarAsync(event);
      } catch {
        // some phones want calendar permission even for the system screen, ask once and retry
        const perm = await Calendar.requestCalendarPermissionsAsync();
        if (perm.status !== "granted") {
          setNote({ text: "Calendar access is off for CareScout. You can turn it on in Settings.", error: true });
          return;
        }
        result = await Calendar.createEventInCalendarAsync(event);
      }
      // iOS says whether it was saved, Android always says "done"
      if (result.action === "canceled" || result.action === "deleted") return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNote({ text: result.action === "saved" ? `Reminder set for ${slot.label}.` : `Reminder for ${slot.label} sent to your calendar.` });
    } catch {
      setNote({ text: "Couldn't open your calendar on this phone.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.reminder}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" style={{ fontSize: 14 }}>
          {slot.guessed ? "Hours not listed." : `Lines open ${slot.label}.`}
        </T>
        <T variant="small">{slot.guessed ? `Remind me to call ${slot.label}?` : "Remind me to call then?"}</T>
        {note && <T variant="small" style={{ color: note.error ? colors.coral : colors.pine }}>{note.text}</T>}
      </View>
      <Button small variant="secondary" icon="alarm-outline" title="Remind me" onPress={addReminder} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.mist },
  hours: { flexDirection: "row", alignItems: "center", gap: 6 },
  reminder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  script: { backgroundColor: colors.white, padding: 14, borderRadius: radius.sm, gap: 6, borderWidth: 1, borderColor: colors.line },
  scriptText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
});
