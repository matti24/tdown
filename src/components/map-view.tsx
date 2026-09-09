import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { LayerState } from "@/components/globe-controls";
import type { Flight } from "@/lib/flights";
import type { Ship } from "@/lib/ships";

export interface MapViewProps {
  initial: { lat: number; lng: number; zoom: number };
  flights: Flight[];
  ships: Ship[];
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
const MAX_MARKERS = 2500;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

export default function MapView({
  initial,
  flights,
  ships,
  iss,
  layers,
  onClose,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);
  const groupsRef = useRef<{
    flights: L.LayerGroup;
    ships: L.LayerGroup;
    iss: L.LayerGroup;
  } | null>(null);
  const renderRef = useRef<() => void>(() => {});

  // Latest props for the render function (which lives inside the mount effect).
  const dataRef = useRef({ flights, ships, iss, layers });
  dataRef.current = { flights, ships, iss, layers };
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
      preferCanvas: true,
    });
    mapRef.current = map;
    const renderer = L.canvas({ padding: 0.5 });
    rendererRef.current = renderer;

    L.tileLayer(ESRI_IMAGERY, {
      maxZoom: 19,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    }).addTo(map);
    L.tileLayer(ESRI_REFERENCE, { maxZoom: 19, opacity: 0.9 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const groups = {
      ships: L.layerGroup().addTo(map),
      flights: L.layerGroup().addTo(map),
      iss: L.layerGroup().addTo(map),
    };
    groupsRef.current = groups;

    // Only draw what's in view (capped) so deep zoom stays sharp and light.
    const render = () => {
      const m = mapRef.current;
      const g = groupsRef.current;
      const r = rendererRef.current;
      if (!m || !g || !r) return;
      const d = dataRef.current;
      const bounds = m.getBounds().pad(0.3);
      const z = m.getZoom();
      const dot = z < 5 ? 3 : z < 9 ? 4 : 5;

      g.flights.clearLayers();
      if (d.layers.flights) {
        let n = 0;
        for (const f of d.flights) {
          if (n >= MAX_MARKERS) break;
          if (!bounds.contains([f.lat, f.lng])) continue;
          n++;
          L.circleMarker([f.lat, f.lng], {
            renderer: r,
            radius: dot,
            color: "#3b2600",
            weight: 1,
            fillColor: "#fbbf24",
            fillOpacity: 0.95,
          })
            .bindPopup(
              `<strong>${escapeHtml(f.callsign)}</strong><br>${Math.round(
                f.altFt,
              ).toLocaleString("en-US")} ft &middot; ${Math.round(
                f.speedKt,
              )} kt${
                f.country
                  ? `<br><span style="opacity:.7">${escapeHtml(f.country)}</span>`
                  : ""
              }`,
            )
            .addTo(g.flights);
        }
      }

      g.ships.clearLayers();
      if (d.layers.ships) {
        let n = 0;
        for (const s of d.ships) {
          if (n >= MAX_MARKERS) break;
          if (!bounds.contains([s.lat, s.lng])) continue;
          n++;
          L.circleMarker([s.lat, s.lng], {
            renderer: r,
            radius: dot,
            color: "#083344",
            weight: 1,
            fillColor: "#22d3ee",
            fillOpacity: 0.9,
          })
            .bindPopup(
              `<strong>${escapeHtml(s.name || "Vessel")}</strong><br>${s.speedKn.toFixed(
                1,
              )} kn${
                s.destination
                  ? `<br><span style="opacity:.7">&rarr; ${escapeHtml(
                      s.destination,
                    )}</span>`
                  : ""
              }`,
            )
            .addTo(g.ships);
        }
      }

      g.iss.clearLayers();
      if (d.layers.iss && d.iss) {
        L.circleMarker([d.iss.lat, d.iss.lng], {
          renderer: r,
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#38bdf8",
          fillOpacity: 1,
        })
          .bindPopup("<strong>ISS</strong><br>International Space Station")
          .addTo(g.iss);
      }
    };
    renderRef.current = render;

    map.on("moveend", render);
    map.on("zoomend", () => {
      const m = mapRef.current;
      if (m && m.getZoom() < CLOSE_ZOOM) onCloseRef.current();
    });

    // Container may size a tick after mount; make sure Leaflet picks it up.
    setTimeout(() => mapRef.current?.invalidateSize(), 0);
    render();

    return () => {
      map.remove();
      mapRef.current = null;
      groupsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderRef.current();
  }, [flights, ships, iss, layers]);

  return (
    <div className="fixed inset-0 z-[70] bg-[#05080f]">
      <div ref={containerRef} className="h-full w-full" />

      <button
        type="button"
        onClick={onClose}
        className="inset-safe-t inset-safe-l absolute z-[1100] flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/85 px-3.5 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-neutral-800/90"
      >
        <span aria-hidden>&larr;</span> Globe
      </button>

      <div className="inset-safe-t absolute left-1/2 z-[1100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-neutral-900/80 px-3.5 py-1.5 text-[11px] font-medium text-neutral-200 shadow-2xl backdrop-blur-md">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Flights
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> Ships
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> ISS
        </span>
      </div>
    </div>
  );
}
