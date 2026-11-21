// Web version of the map. react-native-maps doesn't run in the browser, so this draws the same
// Leaflet + OpenStreetMap map the website uses, inside an iframe. Pin taps come back via postMessage
import { createElement, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { DEFAULT_MAP_CENTER } from "@/lib/config";
import { STATUS_STYLE, displayStatus } from "@/lib/clinics";
import { colors, radius } from "@/lib/theme";
import { MapLegend, type MapProps } from "./MapLegend";

function buildHtml(pins: { url: string; name: string; lat: number; lng: number; color: string; label: string; selected: boolean }[]) {
  // JSON goes straight into the page, so escape "<" to keep a clinic name from closing the script tag
  const data = JSON.stringify(pins).replace(/</g, "\\u003c");
  const center = JSON.stringify([DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude]);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{margin:0;height:100%;font-family:system-ui,sans-serif}</style></head>
<body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
if(!window.L){document.getElementById('m').innerHTML='<p style="padding:16px;color:#5B6E68;font-size:13px">The map needs an internet connection. The clinic list below still works.</p>';return;}
var pins=${data};
var map=L.map('m',{scrollWheelZoom:false}).setView(${center},12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var pts=[];
pins.forEach(function(p){
  pts.push([p.lat,p.lng]);
  L.circleMarker([p.lat,p.lng],{radius:p.selected?13:9,color:'#fff',weight:p.selected?3:2,fillColor:p.color,fillOpacity:.95})
   .bindTooltip(p.name.replace(/</g,'&lt;')+'<br>'+p.label,{direction:'top'})
   .on('click',function(){parent.postMessage({carescoutPin:p.url},'*')}).addTo(map);
});
if(pts.length===1)map.setView(pts[0],13);else if(pts.length>1)map.fitBounds(pts,{padding:[40,40],maxZoom:14});
})();
</script></body></html>`;
}

export default function ClinicMap({ clinics, selectedUrl, onSelect }: MapProps) {
  const located = clinics.filter((c) => typeof c.lat === "number" && typeof c.lng === "number");

  // rebuilt every render, but React only touches the iframe when the string actually changes
  const html = buildHtml(
    located.map((c) => {
      const s = STATUS_STYLE[displayStatus(c)] || STATUS_STYLE.unknown;
      return {
        url: c.url,
        name: c.name || c.url,
        lat: c.lat as number,
        lng: c.lng as number,
        color: s.dot,
        label: s.label + (c.distance_km != null ? ` · ${c.distance_km} km` : ""),
        selected: c.url === selectedUrl,
      };
    }),
  );

  // listen for pin taps from inside the iframe
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const url = e.data && typeof e.data === "object" ? e.data.carescoutPin : null;
      if (typeof url === "string") onSelect(url);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onSelect]);

  return (
    <View style={styles.wrap}>
      {createElement("iframe", {
        srcDoc: html,
        title: "Map of clinics",
        style: { border: 0, width: "100%", height: "100%" },
        sandbox: "allow-scripts",
      })}
      <MapLegend clinics={clinics} missing={clinics.length - located.length} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 260, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.mist },
});
