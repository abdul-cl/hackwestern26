import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { MapPinOff } from "lucide-react";
import { DEFAULT_MAP_CENTER } from "../config";
import { STATUS_STYLE, displayStatus } from "../lib/clinics";

function FitToPins({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** Color-coded clinic pins. Clicking a pin calls onSelect(url) so the list can highlight + scroll to that card. */
export default function ClinicMap({ clinics, selectedUrl, onSelect }) {
  const located = clinics.filter((c) => typeof c.lat === "number" && typeof c.lng === "number");
  const missing = clinics.length - located.length;

  return (
    <div className="card relative h-full min-h-[320px] overflow-hidden p-0">
      {/* scrollWheelZoom off so the page scrolls normally over the map (zoom with +/- or pinch) */}
      <MapContainer center={DEFAULT_MAP_CENTER} zoom={12} scrollWheelZoom={false} className="h-full min-h-[320px]">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPins points={located.map((c) => [c.lat, c.lng])} />
        {located.map((c) => {
          const style = STATUS_STYLE[displayStatus(c)] || STATUS_STYLE.unknown;
          const selected = c.url === selectedUrl;
          return (
            <CircleMarker
              key={c.url}
              center={[c.lat, c.lng]}
              radius={selected ? 13 : 9}
              pathOptions={{ color: "#ffffff", weight: selected ? 3 : 2, fillColor: style.pin, fillOpacity: 0.95 }}
              eventHandlers={{ click: () => onSelect(c.url) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <div className="text-xs">
                  <div className="font-semibold">{c.name}</div>
                  <div>{style.label}{c.distance_km != null ? ` · ${c.distance_km} km` : ""}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-lg bg-white/90 px-2 py-1 text-xs shadow-sm">
        {["accepting", "waitlist", "closed"].map((k) => (
          <span key={k} className="flex items-center gap-1 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[k].pin }} />
            {STATUS_STYLE[k].label}
          </span>
        ))}
      </div>
      {missing > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 z-[500] flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">
          <MapPinOff className="h-3.5 w-3.5" /> {missing} without a map location
        </div>
      )}
    </div>
  );
}
