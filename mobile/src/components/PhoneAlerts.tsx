// "Phone alerts" row on the Watchdog tab: turns on notifications for clinic openings.
// Hidden on the website version, where there's nothing to turn on
import { useCallback, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button, Ionicons, T } from "@/components/ui";
import { askToNotify, canNotify, notifyPermission, type NotifyPermission } from "@/lib/notify";
import { colors, radius } from "@/lib/theme";

export default function PhoneAlerts() {
  const [perm, setPerm] = useState<NotifyPermission | null>(null);

  // re-check whenever you come back to the tab (they might have changed it in Settings)
  useFocusEffect(
    useCallback(() => {
      if (canNotify) notifyPermission().then(setPerm);
    }, []),
  );

  if (!canNotify || perm === null) return null;

  if (perm === "granted") {
    return (
      <View style={styles.on} accessibilityRole="summary">
        <Ionicons name="notifications" size={17} color={colors.pine} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="bodyStrong" style={{ fontSize: 14 }}>Phone alerts are on</T>
          <T variant="small">
            You'll get a notification when a watched clinic opens up. To try it, tap the sparkle on a clinic below, then leave the app. It arrives a few seconds later.
          </T>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <T variant="small">
        {perm === "denied"
          ? "Notifications are turned off for this app. Turn them on in Settings to hear about openings."
          : "Get a phone notification the moment a watched clinic starts accepting patients."}
      </T>
      <Button
        title={perm === "denied" ? "Open Settings" : "Turn on phone alerts"}
        icon={perm === "denied" ? "settings-outline" : "notifications-outline"}
        variant="secondary"
        onPress={async () => {
          if (perm === "denied") Linking.openSettings().catch(() => {});
          else setPerm(await askToNotify());
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  on: { flexDirection: "row", gap: 10, backgroundColor: colors.pineSoft, padding: 12, borderRadius: radius.md },
});
