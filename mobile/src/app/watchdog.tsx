// Watchdog tab, placeholder for now. Watch list + alerts get built in a later phase
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Ionicons } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function WatchdogScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <View style={styles.page}>
        <Text style={styles.h1}>Watchdog</Text>
        <Card style={styles.card}>
          <Ionicons name="notifications-outline" size={28} color={colors.pine600} />
          <Text style={styles.title}>Coming soon</Text>
          <Text style={styles.text}>
            Clinics you watch and their opening alerts will show up here. For now you can tap Watch clinic on any full clinic in Find.
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  h1: { fontSize: 26, fontWeight: "800", color: colors.ink },
  card: { alignItems: "center", gap: 8, paddingVertical: 28 },
  title: { fontSize: 17, fontWeight: "700", color: colors.ink },
  text: { fontSize: 14, color: colors.slate500, textAlign: "center", lineHeight: 20 },
});
