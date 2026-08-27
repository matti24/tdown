import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe3D } from "@/components/ui/3d-globe";
import { GlobeControls, type LayerState } from "@/components/globe-controls";
import { IssLayer } from "@/components/globe-layers/iss-layer";
import { FlightsLayer } from "@/components/globe-layers/flights-layer";
import { ShipsLayer } from "@/components/globe-layers/ships-layer";
import {
  SatellitesLayer,
  type SatelliteStats,
  type SatSelection,
} from "@/components/globe-layers/satellites-layer";
import { fetchFlights, type Flight } from "@/lib/flights";
import { fetchFlightInfo, type FlightInfo } from "@/lib/flight-info";
import {
  useAisStream,
  hasAisKey,
  shipCategory,
  shipFlag,
  type Ship,
} from "@/lib/ships";
import { type IssPosition } from "@/lib/live-data";
import { fetchWikiInfo, type WikiInfo } from "@/lib/wiki";
import { usePolling } from "@/hooks/use-live-data";

const FLIGHTS_REFRESH_MS = 30_000;

type SelInfo =
  | { kind: "ship"; ship: Ship }
  | { kind: "sat"; sat: SatSelection }
  | { kind: "iss"; iss: IssPosition };

export default function Globe3DDemo() {
  const [layers, setLayers] = useState<LayerState>({
    flights: true,
    ships: true,
    iss: true,
    satellites: true,
  });
  const [satStats, setSatStats] = useState<SatelliteStats | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [flightInfo, setFlightInfo] = useState<FlightInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<SelInfo | null>(null);
  const [wiki, setWiki] = useState<WikiInfo | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);

  // One live-flights poll drives both the layer and the "is it available?" gate.
  const { data: flightsData, error: flightsError } = usePolling(
    fetchFlights,
    FLIGHTS_REFRESH_MS,
    true,
  );
  const flights = useMemo(() => flightsData ?? [], [flightsData]);
  const flightsAvailable = flightsError
    ? false
    : flightsData
      ? flights.length > 0
      : true;

  // Live vessels stream directly from AISStream (only if a key is configured).
  const shipsAvailable = hasAisKey();
  const { ships } = useAisStream(layers.ships && shipsAvailable);

  const toggle = (key: keyof LayerState) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  const handleSatStats = useCallback(
    (stats: SatelliteStats | null) => setSatStats(stats),
    [],
  );

  const handleSelectFlight = useCallback((flight: Flight | null) => {
    setSelectedFlight(flight);
    if (flight) setSelectedInfo(null);
  }, []);

  const handleSelectShip = useCallback((ship: Ship | null) => {
    setSelectedInfo(ship ? { kind: "ship", ship } : null);
    if (ship) setSelectedFlight(null);
  }, []);

  const handleSelectSat = useCallback((sat: SatSelection | null) => {
    setSelectedInfo(sat ? { kind: "sat", sat } : null);
    if (sat) setSelectedFlight(null);
  }, []);

  const handleSelectIss = useCallback((iss: IssPosition | null) => {
    setSelectedInfo(iss ? { kind: "iss", iss } : null);
    if (iss) setSelectedFlight(null);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedFlight(null);
    setSelectedInfo(null);
  }, []);

  // Fetch route + aircraft metadata when a different flight is selected.
  useEffect(() => {
    const callsign = selectedFlight?.callsign;
    if (!callsign || callsign === "\u2014") {
      setFlightInfo(null);
      setInfoLoading(false);
      return;
    }
    let cancelled = false;
    setInfoLoading(true);
    setFlightInfo(null);
    fetchFlightInfo(callsign, selectedFlight?.icao24)
      .then((info) => {
        if (!cancelled) {
          setFlightInfo(info);
          setInfoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFlight?.callsign, selectedFlight?.icao24]);

  const route = useMemo(() => {
    if (
      !selectedFlight ||
      !flightInfo ||
      flightInfo.originLat == null ||
      flightInfo.originLng == null
    ) {
      return null;
    }
    return {
      originLat: flightInfo.originLat,
      originLng: flightInfo.originLng,
      destLat: flightInfo.destLat,
      destLng: flightInfo.destLng,
      planeLat: selectedFlight.lat,
      planeLng: selectedFlight.lng,
    };
  }, [selectedFlight, flightInfo]);

  // Drop any selection when flights vanish (e.g. API quota used up).
  useEffect(() => {
    if (!flightsAvailable) setSelectedFlight(null);
  }, [flightsAvailable]);

  // Wikipedia image + blurb for the selected ship type / satellite / ISS.
  const wikiTopic = useMemo(() => {
    if (!selectedInfo) return null;
    if (selectedInfo.kind === "iss") return "International Space Station";
    if (selectedInfo.kind === "sat") return selectedInfo.sat.wikiTopic;
    return shipCategory(selectedInfo.ship.type).wiki;
  }, [selectedInfo]);

  useEffect(() => {
    if (!wikiTopic) {
      setWiki(null);
      setWikiLoading(false);
      return;
    }
    let cancelled = false;
    setWikiLoading(true);
    setWiki(null);
    fetchWikiInfo(wikiTopic)
      .then((w) => {
        if (!cancelled) {
          setWiki(w);
          setWikiLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setWikiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wikiTopic]);

  return (
    <div className="relative h-full w-full">
      <GlobeControls
        layers={layers}
        onToggle={toggle}
        hidden={{ flights: !flightsAvailable, ships: !shipsAvailable }}
      />

      {((layers.flights && flightsAvailable && flights.length > 0) ||
        (layers.ships && shipsAvailable && ships.length > 0)) && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5 sm:right-4 sm:top-4">
          {layers.flights && flightsAvailable && flights.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-1.5 shadow-2xl backdrop-blur-md">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-sm font-semibold text-white">
                ✈️ {flights.length.toLocaleString("en-US")}
              </span>
              <span className="hidden text-[11px] text-neutral-400 sm:inline">
                flights live
              </span>
            </div>
          )}
          {layers.ships && shipsAvailable && ships.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-1.5 shadow-2xl backdrop-blur-md">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
              <span className="text-sm font-semibold text-white">
                🚢 {ships.length.toLocaleString("en-US")}
              </span>
              <span className="hidden text-[11px] text-neutral-400 sm:inline">
                ships live
              </span>
            </div>
          )}
        </div>
      )}

      {layers.satellites && satStats && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-1.5 text-center shadow-2xl backdrop-blur-md sm:bottom-4 sm:px-3.5 sm:py-2">
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-sm font-semibold text-white">
              📡 {satStats.total.toLocaleString("en-US")} satellites live
            </span>
            <span className="text-xs text-sky-300/80">
              ~{Math.round(satStats.avgSpeedKmh).toLocaleString("en-US")} km/h
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-300">
            {satStats.counts.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.label}
                <span className="text-neutral-500">
                  {c.count.toLocaleString("en-US")}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <Globe3D
        className="h-full"
        onPointerMissed={handleBackgroundClick}
        config={{
          atmosphereColor: "#4da6ff",
          atmosphereIntensity: 20,
          bumpScale: 5,
          autoRotateSpeed: 0,
          enableZoom: true,
          minDistance: 2.2,
          maxDistance: 14,
        }}
      >
        {layers.iss && (
          <IssLayer
            onSelect={handleSelectIss}
            selected={selectedInfo?.kind === "iss"}
          />
        )}
        {layers.flights && flightsAvailable && (
          <FlightsLayer
            flights={flights}
            onSelect={handleSelectFlight}
            selectedCallsign={selectedFlight?.callsign ?? null}
            route={route}
          />
        )}
        {layers.ships && shipsAvailable && (
          <ShipsLayer
            ships={ships}
            onSelect={handleSelectShip}
            selectedMmsi={
              selectedInfo?.kind === "ship" ? selectedInfo.ship.mmsi : null
            }
          />
        )}
        {layers.satellites && (
          <SatellitesLayer
            onStats={handleSatStats}
            onSelect={handleSelectSat}
            selectedSatId={
              selectedInfo?.kind === "sat" ? selectedInfo.sat.id : null
            }
          />
        )}
      </Globe3D>

      {layers.flights && flightsAvailable && selectedFlight && (
        <FlightDetailPanel
          flight={selectedFlight}
          info={flightInfo}
          loading={infoLoading}
          onClose={() => setSelectedFlight(null)}
        />
      )}

      {selectedInfo && (
        <InfoDetailPanel
          info={selectedInfo}
          wiki={wiki}
          wikiLoading={wikiLoading}
          onClose={() => setSelectedInfo(null)}
        />
      )}
    </div>
  );
}

function FlightDetailPanel({
  flight,
  info,
  loading,
  onClose,
}: {
  flight: Flight;
  info: FlightInfo | null;
  loading: boolean;
  onClose: () => void;
}) {
  const speedKmh = Math.round(flight.speedKt * 1.852);
  const vr = flight.verticalRateMs;
  const trend =
    vr > 0.5
      ? `↑ steigend (${Math.round(vr * 196.85)} ft/min)`
      : vr < -0.5
        ? `↓ sinkend (${Math.round(Math.abs(vr) * 196.85)} ft/min)`
        : "→ Reiseflug";
  const fallback = loading ? "…" : "unbekannt";
  const airline = info?.airline || fallback;
  const model =
    [info?.manufacturer, info?.model].filter(Boolean).join(" ") || fallback;
  return (
    <div className="absolute bottom-3 left-3 z-20 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-amber-400/30 bg-neutral-900/80 p-3.5 shadow-2xl backdrop-blur-md sm:bottom-4 sm:left-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
            ✈️
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">
              {flight.callsign || "Unbekannt"}
            </div>
            <div className="text-[11px] leading-tight text-neutral-400">
              {airline}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 rounded-lg px-1.5 py-0.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Verfolgung beenden"
        >
          ✕
        </button>
      </div>

      {info?.photo && (
        <img
          src={info.photo}
          alt={model}
          loading="lazy"
          className="mt-3 h-24 w-full rounded-lg object-cover"
        />
      )}

      <div className="mt-3 flex items-center gap-2 text-xs">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-white">
            {info?.originIata || "—"}
          </span>
          <span className="truncate text-[10px] text-neutral-500">
            {info?.originCity || (loading ? "…" : "Herkunft")}
          </span>
        </div>
        <div className="flex flex-1 items-center gap-1 text-amber-300/70">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/50" />
          <span>✈</span>
          <span className="h-px flex-1 bg-gradient-to-r from-amber-300/50 to-transparent" />
        </div>
        <div className="flex min-w-0 flex-col items-end">
          <span className="text-sm font-semibold text-white">
            {info?.destIata || "—"}
          </span>
          <span className="truncate text-[10px] text-neutral-500">
            {info?.destCity || (loading ? "…" : "Ziel")}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="col-span-2">
          <dt className="text-neutral-500">Modell</dt>
          <dd className="font-medium text-neutral-200">{model}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Geschwindigkeit</dt>
          <dd className="font-medium text-neutral-200">
            {speedKmh.toLocaleString("de-DE")} km/h
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Höhe</dt>
          <dd className="font-medium text-neutral-200">
            {flight.altFt > 0
              ? `${flight.altFt.toLocaleString("de-DE")} ft`
              : "am Boden"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-neutral-500">Vertikal</dt>
          <dd className="font-medium text-neutral-200">{trend}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300/80">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        Frei drehbar – dem Flugweg folgen
      </div>
    </div>
  );
}

type PanelAccent = "cyan" | "violet" | "sky";

const PANEL_ACCENT: Record<PanelAccent, string> = {
  cyan: "border-cyan-400/30",
  violet: "border-violet-400/30",
  sky: "border-sky-400/30",
};
const PANEL_CHIP: Record<PanelAccent, string> = {
  cyan: "bg-cyan-400/20 text-cyan-200",
  violet: "bg-violet-400/20 text-violet-200",
  sky: "bg-sky-400/20 text-sky-200",
};
const PANEL_DOT: Record<PanelAccent, string> = {
  cyan: "bg-cyan-400",
  violet: "bg-violet-400",
  sky: "bg-sky-400",
};

function panelMeta(info: SelInfo): {
  emoji: string;
  accent: PanelAccent;
  title: string;
  subtitle: string;
  note: string;
  rows: [string, string][];
} {
  if (info.kind === "iss") {
    const d = info.iss;
    return {
      emoji: "🛰️",
      accent: "sky",
      title: "ISS",
      subtitle: "Internationale Raumstation",
      note: "Live-Position · ~16 Erdumrundungen/Tag",
      rows: [
        ["Höhe", `${Math.round(d.altitude).toLocaleString("de-DE")} km`],
        ["Tempo", `${Math.round(d.velocity).toLocaleString("de-DE")} km/h`],
        ["Position", `${d.lat.toFixed(2)}°, ${d.lng.toFixed(2)}°`],
        ["Umlaufzeit", "~92 Min"],
      ],
    };
  }
  if (info.kind === "sat") {
    const s = info.sat;
    return {
      emoji: "📡",
      accent: "violet",
      title: s.name,
      subtitle: s.purpose,
      note: "Linie = Bahn der letzten 90 Minuten",
      rows: [
        ["Höhe", `${Math.round(s.altKm).toLocaleString("de-DE")} km`],
        ["Tempo", `${Math.round(s.speedKmh).toLocaleString("de-DE")} km/h`],
        ["Umlaufzeit", `${s.periodMin.toFixed(0)} Min`],
        ["Position", `${s.lat.toFixed(1)}°, ${s.lng.toFixed(1)}°`],
      ],
    };
  }
  const sh = info.ship;
  const cat = shipCategory(sh.type);
  const rows: [string, string][] = [
    ["Flagge", shipFlag(sh.mmsi) ?? "—"],
    ["Typ", cat.name],
    [
      "Tempo",
      sh.speedKn < 0.5 ? "vor Anker" : `${Math.round(sh.speedKn * 1.852)} km/h`,
    ],
    ["Ziel", sh.destination || "—"],
  ];
  if (sh.eta) rows.push(["ETA (UTC)", sh.eta]);
  if (sh.lengthM) rows.push(["Maße", `${sh.lengthM} × ${sh.beamM ?? "?"} m`]);
  if (sh.draughtM) rows.push(["Tiefgang", `${sh.draughtM.toFixed(1)} m`]);
  if (sh.callSign) rows.push(["Rufzeichen", sh.callSign]);
  if (sh.imo) rows.push(["IMO", String(sh.imo)]);
  rows.push(["MMSI", String(sh.mmsi)]);
  return {
    emoji: "🚢",
    accent: "cyan",
    title: sh.name || `MMSI ${sh.mmsi}`,
    subtitle: cat.name,
    note: "Live-Position",
    rows,
  };
}

function InfoDetailPanel({
  info,
  wiki,
  wikiLoading,
  onClose,
}: {
  info: SelInfo;
  wiki: WikiInfo | null;
  wikiLoading: boolean;
  onClose: () => void;
}) {
  const m = panelMeta(info);
  return (
    <div
      className={`absolute bottom-3 left-3 z-20 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border ${PANEL_ACCENT[m.accent]} bg-neutral-900/80 p-3.5 shadow-2xl backdrop-blur-md sm:bottom-4 sm:left-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${PANEL_CHIP[m.accent]}`}
          >
            {m.emoji}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-white">
              {m.title}
            </div>
            <div className="truncate text-[11px] leading-tight text-neutral-400">
              {m.subtitle}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 shrink-0 rounded-lg px-1.5 py-0.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Schließen"
        >
          ✕
        </button>
      </div>

      {wiki?.image ? (
        <img
          src={wiki.image}
          alt={m.title}
          loading="lazy"
          className="mt-3 h-28 w-full rounded-lg object-cover"
        />
      ) : (
        <div className="mt-3 flex h-28 w-full items-center justify-center rounded-lg bg-white/5 text-3xl">
          {wikiLoading ? (
            <span className="text-xs text-neutral-500">lädt…</span>
          ) : (
            m.emoji
          )}
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {m.rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-neutral-500">{label}</dt>
            <dd className="font-medium text-neutral-200">{value}</dd>
          </div>
        ))}
      </dl>

      {wiki?.extract && (
        <p className="mt-3 line-clamp-4 text-[11px] leading-snug text-neutral-400">
          {wiki.extract}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-400">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${PANEL_DOT[m.accent]} opacity-75`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${PANEL_DOT[m.accent]}`}
          />
        </span>
        {m.note}
      </div>
    </div>
  );
}
