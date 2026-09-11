import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { LayerState } from "@/components/globe-controls";
import type { Flight } from "@/lib/flights";
import type { Ship } from "@/lib/ships";

export interface MapSat {
  lat: number;
  lng: number;
  name: string;
  color: string;
}

export interface MapViewProps {
  initial: { lat: number; lng: number; zoom: number };
  flights: Flight[];
  ships: Ship[];
  satellites: MapSat[];
  iss: { lat: number; lng: number } | null;
  layers: LayerState;
  onClose: () => void;
}

// Keyless Esri basemap (satellite imagery + place/boundary labels). Attribution
// is required and rendered by Leaflet's attribution control.
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_REFERENCE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const CLOSE_ZOOM = 3;
// Per-layer caps keep the DOM light; only in-view markers are drawn.
const CAP = { flights: 600, ships: 600, satellites: 700, iss: 1 };

type TKind = "flights" | "ships" | "satellites" | "iss";
type TMarker = L.Marker & { _tk?: string };

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

// --- SVG icons (crisp, colourable, rotatable) --------------------------------
const PLANE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg"><path d="M11 2h2l1 7 7 4v2l-7-2v5l2 2v2l-4-1.6L8 24v-2l2-2v-5l-7 2v-2l7-4 1-7z" fill="#fbbf24" stroke="#3b2600" stroke-width="0.7" stroke-linejoin="round"/></svg>';
const SHIP_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M3 13h18l-2.3 6H5.3L3 13z" fill="#22d3ee" stroke="#083344" stroke-width="0.7" stroke-linejoin="round"/><rect x="9" y="7" width="6" height="5" rx="0.6" fill="#67e8f9" stroke="#083344" stroke-width="0.6"/><rect x="11.2" y="3.4" width="1.6" height="4" fill="#083344"/></svg>';
const ISS_SVG =
  '<svg viewBox="0 0 24 24" width="26" height="26" xmlns="http://www.w3.org/2000/svg"><line x1="2" y1="12" x2="22" y2="12" stroke="#0c4a6e" stroke-width="1"/><rect x="10.4" y="9" width="3.2" height="6" rx="0.5" fill="#e0f2fe" stroke="#0c4a6e" stroke-width="0.6"/><rect x="1.5" y="8" width="6.5" height="3" fill="#38bdf8" stroke="#0c4a6e" stroke-width="0.5"/><rect x="1.5" y="13" width="6.5" height="3" fill="#38bdf8" stroke="#0c4a6e" stroke-width="0.5"/><rect x="16" y="8" width="6.5" height="3" fill="#38bdf8" stroke="#0c4a6e" stroke-width="0.5"/><rect x="16" y="13" width="6.5" height="3" fill="#38bdf8" stroke="#0c4a6e" stroke-width="0.5"/></svg>';
const satSvg = (color: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg"><line x1="12" y1="4.5" x2="12" y2="9" stroke="${color}" stroke-width="1.1"/><circle cx="12" cy="4" r="1.1" fill="${color}"/><rect x="10" y="9" width="4" height="6.5" rx="0.5" fill="${color}" stroke="#0b1020" stroke-width="0.6"/><rect x="2.5" y="9.8" width="6" height="5" fill="${color}" opacity="0.85" stroke="#0b1020" stroke-width="0.5"/><rect x="15.5" y="9.8" width="6" height="5" fill="${color}" opacity="0.85" stroke="#0b1020" stroke-width="0.5"/></svg>`;

const shipIcon = L.divIcon({
  html: SHIP_SVG,
  className: "tdm-ic",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const issIcon = L.divIcon({
  html: ISS_SVG,
  className: "tdm-ic",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
const satIcons = new Map<string, L.DivIcon>();
function satIcon(color: string): L.DivIcon {
  let icon = satIcons.get(color);
  if (!icon) {
    icon = L.divIcon({
      html: satSvg(color),
      className: "tdm-ic",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    satIcons.set(color, icon);
  }
  return icon;
}
function planeIcon(deg: number): L.DivIcon {
  return L.divIcon({
    html: `<div style="transform:rotate(${deg.toFixed(0)}deg)">${PLANE_SVG}</div>`,
    className: "tdm-ic",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function flightPopup(f: Flight): string {
  return `<strong>${escapeHtml(f.callsign)}</strong><br>${Math.round(
    f.altFt,
  ).toLocaleString("en-US")} ft &middot; ${Math.round(f.speedKt)} kt${
    f.country ? `<br><span style="opacity:.7">${escapeHtml(f.country)}</span>` : ""
  }`;
}
function shipPopup(s: Ship): string {
  return `<strong>${escapeHtml(s.name || "Vessel")}</strong><br>${s.speedKn.toFixed(
    1,
  )} kn${
    s.destination
      ? `<br><span style="opacity:.7">&rarr; ${escapeHtml(s.destination)}</span>`
      : ""
  }`;
}

export default function MapView({
  initial,
  flights,
  ships,
  satellites,
  iss,
  layers,
  onClose,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const renderRef = useRef<() => void>(() => {});

  const dataRef = useRef({ flights, ships, satellites, iss, layers });
  dataRef.current = { flights, ships, satellites, iss, layers };
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [initial.lat, initial.lng],
      zoom: initial.zoom,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: false,
      worldCopyJump: true,
    });
    mapRef.current = map;

    L.tileLayer(ESRI_IMAGERY, {
      maxZoom: 19,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    }).addTo(map);
    L.tileLayer(ESRI_REFERENCE, { maxZoom: 19, opacity: 0.9 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const groups: Record<TKind, L.LayerGroup> = {
      satellites: L.layerGroup().addTo(map),
      ships: L.layerGroup().addTo(map),
      flights: L.layerGroup().addTo(map),
      iss: L.layerGroup().addTo(map),
    };
    const store: Record<TKind, Map<string, TMarker>> = {
      satellites: new Map(),
      ships: new Map(),
      flights: new Map(),
      iss: new Map(),
    };

    // Update markers in place (add/move/remove by id) so nothing flickers and
    // open popups survive live data ticks.
    function sync<T>(
      kind: TKind,
      items: T[],
      id: (t: T) => string,
      pos: (t: T) => [number, number],
      iconKey: (t: T) => string,
      icon: (t: T) => L.DivIcon,
      popup: (t: T) => string,
      z?: number,
    ) {
      const bounds = map.getBounds().pad(0.2);
      const cap = CAP[kind];
      const s = store[kind];
      const seen = new Set<string>();
      let n = 0;
      for (const it of items) {
        if (n >= cap) break;
        const p = pos(it);
        if (!bounds.contains(p)) continue;
        n++;
        const key = id(it);
        seen.add(key);
        const k = iconKey(it);
        let mk = s.get(key);
        if (mk) {
          mk.setLatLng(p);
          if (mk._tk !== k) {
            mk.setIcon(icon(it));
            mk._tk = k;
          }
          if (mk.isPopupOpen()) mk.setPopupContent(popup(it));
        } else {
          mk = L.marker(p, {
            icon: icon(it),
            keyboard: false,
            zIndexOffset: z ?? 0,
          }) as TMarker;
          mk._tk = k;
          mk.bindPopup(popup(it));
          mk.addTo(groups[kind]);
          s.set(key, mk);
        }
      }
      for (const [key, mk] of s) {
        if (!seen.has(key)) {
          groups[kind].removeLayer(mk);
          s.delete(key);
        }
      }
    }

    const render = () => {
      if (!mapRef.current) return;
      const d = dataRef.current;
      sync(
        "satellites",
        d.layers.satellites ? d.satellites : [],
        (s) => s.name,
        (s) => [s.lat, s.lng],
        (s) => s.color,
        (s) => satIcon(s.color),
        (s) => `<strong>${escapeHtml(s.name)}</strong><br>Satellite`,
      );
      sync(
        "ships",
        d.layers.ships ? d.ships : [],
        (s) => "s" + s.mmsi,
        (s) => [s.lat, s.lng],
        () => "ship",
        () => shipIcon,
        (s) => shipPopup(s),
      );
      sync(
        "flights",
        d.layers.flights ? d.flights : [],
        (f) => "f" + (f.icao24 || f.callsign),
        (f) => [f.lat, f.lng],
        (f) => "p" + Math.round(f.trackDeg),
        (f) => planeIcon(f.trackDeg),
        (f) => flightPopup(f),
      );
      sync(
        "iss",
        d.layers.iss && d.iss ? [d.iss] : [],
        () => "iss",
        (p) => [p.lat, p.lng],
        () => "iss",
        () => issIcon,
        () => "<strong>ISS</strong><br>International Space Station",
        1000,
      );
    };
    renderRef.current = render;

    map.on("moveend", render);
    map.on("zoomend", () => {
      if (mapRef.current && mapRef.current.getZoom() < CLOSE_ZOOM) {
        onCloseRef.current();
      }
    });

    // Keep Leaflet sized to the container even if it settles a tick after mount.
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(containerRef.current);
    setTimeout(() => mapRef.current?.invalidateSize(), 0);
    render();

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderRef.current();
  }, [flights, ships, satellites, iss, layers]);

  return (
    <div className="fixed inset-0 z-[70] bg-[#05080f]">
      <style>{`.tdm-ic{background:none;border:none;line-height:0}.tdm-ic>div{line-height:0}`}</style>
      <div ref={containerRef} className="h-full w-full" />

      <button
        type="button"
        onClick={onClose}
        className="inset-safe-t inset-safe-l absolute z-[1100] flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/85 px-3.5 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-neutral-800/90"
      >
        <span aria-hidden>&larr;</span> Globe
      </button>

      <div className="inset-safe-t absolute left-1/2 z-[1100] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-white/10 bg-neutral-900/80 px-3.5 py-1.5 text-[11px] font-medium text-neutral-200 shadow-2xl backdrop-blur-md">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Flights
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> Ships
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Satellites
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> ISS
        </span>
      </div>
    </div>
  );
}
