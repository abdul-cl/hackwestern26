// "Open this search on another phone": a QR code of the current search. Handy for someone helping a
// parent or friend look for a doctor, they scan it and get the same city, coverage and language
import { Modal, Platform, Pressable, Share, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Search } from "@/lib/config";
import { searchLink } from "@/lib/handoff";
import { colors, fonts, radius } from "@/lib/theme";
import { Button, Ionicons, T } from "./ui";

export default function HandoffSheet({ open, search, onClose }: { open: boolean; search: Search; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const link = searchLink(search);
  const inExpoGo = link.startsWith("exp");

  const share = async () => {
    try {
      await Share.share({ message: `Open this CareScout search: ${link}` });
    } catch {
      // no share sheet (some browsers), the QR is still there
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <T variant="h2" style={{ flex: 1 }}>Open on another phone</T>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <T variant="small">
            Scan with the other phone's camera to open this search there, with the same city, coverage and language. Good for helping a parent or friend.
          </T>

          <View style={styles.qrBox}>
            <QRCode value={link} size={200} color={colors.ink} backgroundColor={colors.white} />
          </View>

          <View style={styles.summary}>
            <Row icon="location-outline" text={`${search.city || "London, ON"}${search.postalCode ? ` · ${search.postalCode}` : ""}`} />
            <Row icon="card-outline" text={search.coverage} />
            <Row icon="language-outline" text={search.language} />
          </View>

          {inExpoGo && (
            <T variant="small" style={{ textAlign: "center" }}>
              While testing in Expo Go, the other phone needs Expo Go signed in to the same account.
            </T>
          )}
          {Platform.OS !== "web" && <Button title="Send the link instead" icon="share-outline" variant="secondary" onPress={share} />}
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      {/* one line, so a very long city from a link can't push the sheet sideways */}
      <T style={styles.rowText} numberOfLines={1}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(9, 25, 21, 0.45)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  qrBox: {
    alignSelf: "center",
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "100%" },
  rowText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink, flexShrink: 1 },
});
