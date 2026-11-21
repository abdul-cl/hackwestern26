// Map of clinic pins (iOS uses Apple Maps, Android uses Google Maps). Tapping a pin selects that
// clinic's card. The web build uses ClinicMap.web.tsx instead since react-native-maps is native only
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { DEFAULT_MAP_CENTER } from "@/lib/config";
import { STATUS_STYLE, displayStatus } from "@/lib/clinics";
import { colors, radius } from "@/lib/theme";
import type { MergedClinic } from "@/lib/types";
import { MapLegend, type MapProps } from "./MapLegend";

export default function ClinicMap({ clinics, selectedUrl, onSelect }: MapProps) {
  const map = useRef<MapView>(null);
  const located = clinics.filter((c): c is MergedClinic & { lat: number; lng: number } => typeof c.lat === "number" && typeof c.lng === "number");
  const key = located.map((c) => `${c.lat},${c.lng}`).join("|");

  // zoom to fit every pin whenever the set of pins changes
  useEffect(() => {
    if (!located.length) return;
    const t = setTimeout(() => {
      if (located.length === 1) {
        map.current?.animateToRegion({ latitude: located[0].lat, longitude: located[0].lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 400);
      } else {
        map.current?.fitToCoordinates(
          located.map((c) => ({ latitude: c.lat, longitude: c.lng })),
          { edgePadding: { top: 50, right: 40, bottom: 60, left: 40 }, animated: true },
        );
      }
    }, 300); // give the map a moment to lay out first
    return () => clearTimeout(t);
    // keyed on the pin positions, not the array (which is new every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...DEFAULT_MAP_CENTER, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
      >
        {located.map((c) => {
          const s = STATUS_STYLE[displayStatus(c)] || STATUS_STYLE.unknown;
          const selected = c.url === selectedUrl;
          return (
            <Marker
              // native pins, custom marker views can come out blank on Android
              key={c.url}
              coordinate={{ latitude: c.lat, longitude: c.lng }}
              pinColor={s.dot}
              opacity={selectedUrl && !selected ? 0.55 : 1}
              title={c.name}
              description={s.label + (c.distance_km != null ? ` · ${c.distance_km} km` : "")}
              onPress={() => onSelect(c.url)}
            />
          );
        })}
      </MapView>
      <MapLegend clinics={clinics} missing={clinics.length - located.length} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 260, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.mist },
});
