// Shown for links that don't match a screen (old or mistyped deep links)
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, T } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function NotFound() {
  return (
    <View style={styles.page}>
      <T variant="h1" style={{ textAlign: "center" }}>This page doesn't exist</T>
      <T variant="small" style={{ textAlign: "center" }}>The link may be old or mistyped.</T>
      <View style={{ gap: 10, alignSelf: "stretch" }}>
        <Button title="Find a doctor" icon="search" onPress={() => router.replace("/find")} />
        <Button title="Go to Home" variant="secondary" onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14, backgroundColor: colors.mist },
});
