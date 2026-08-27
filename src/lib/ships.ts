// Live vessels via AISStream.io, connected directly from the browser over a
// WebSocket. Positions accumulate in a Map and are flushed to React on an
// interval (throttled). The free API key is read from VITE_AISSTREAM_API_KEY
// (or a localStorage "aisstream_key" override); without a key the ships layer
// simply stays hidden.
import { useEffect, useRef, useState } from "react";

const AIS_WS = "wss://stream.aisstream.io/v0/stream";
const MAX_SHIPS = 6000;
const FLUSH_MS = 2000;
// AISStream pushes each message as a binary frame, decoded to JSON text.
const decoder = new TextDecoder();

export interface Ship {
  mmsi: number;
  lat: number;
  lng: number;
  /** Course over ground (or true heading) in degrees. */
  courseDeg: number;
  /** Speed over ground in knots. */
  speedKn: number;
  name: string;
  /** AIS ship type code (0–99). */
  type: number;
  destination?: string;
}

// >>> HIER deinen kostenlosen aisstream.io API-Key eintragen, damit die Schiffe
//     dauerhaft laden (auch auf der veröffentlichten Seite). Hinweis: bei einem
//     öffentlichen Repo ist der Key im Frontend sichtbar – notfalls neu erzeugen.
const AIS_KEY = "67772f77bf55dda08425368d83fd7bd935d1a833";

/** Resolve the AISStream API key: env / localStorage override, else AIS_KEY. */
function aisKey(): string {
  const env = (import.meta.env as Record<string, string | undefined>)
    .VITE_AISSTREAM_API_KEY;
  if (env && env.trim()) return env.trim();
  if (typeof localStorage !== "undefined") {
    const ls = localStorage.getItem("aisstream_key");
    if (ls && ls.trim()) return ls.trim();
  }
  return AIS_KEY;
}

export function hasAisKey(): boolean {
  return aisKey().length > 0;
}

type AisMessage = {
  MessageType?: string;
  MetaData?: {
    MMSI?: number;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
  };
  Message?: {
    PositionReport?: {
      Latitude?: number;
      Longitude?: number;
      Cog?: number;
      Sog?: number;
      TrueHeading?: number;
    };
    ShipStaticData?: {
      Type?: number;
      Destination?: string;
    };
  };
};

/**
 * Subscribe to global AIS position reports while `enabled`. Returns the current
 * vessel snapshot (capped, most-recently-updated first) and connection state.
 */
export function useAisStream(enabled: boolean): {
  ships: Ship[];
  connected: boolean;
} {
  const [ships, setShips] = useState<Ship[]>([]);
  const [connected, setConnected] = useState(false);
  const store = useRef<Map<number, Ship>>(new Map());

  useEffect(() => {
    if (!enabled) {
      store.current.clear();
      setShips([]);
      setConnected(false);
      return;
    }
    const key = aisKey();
    if (!key) return;

    let closed = false;
    let retry = 0;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const connect = () => {
      ws = new WebSocket(AIS_WS);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ws?.send(
          JSON.stringify({
            APIKey: key,
            BoundingBoxes: [
              [
                [-90, -180],
                [90, 180],
              ],
            ],
            FilterMessageTypes: ["PositionReport", "ShipStaticData"],
          }),
        );
      };
      ws.onmessage = (ev) => {
        const text =
          typeof ev.data === "string"
            ? ev.data
            : ev.data instanceof ArrayBuffer
              ? decoder.decode(ev.data)
              : "";
        if (!text) return;
        let msg: AisMessage;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        const meta = msg.MetaData ?? {};
        const mmsi = meta.MMSI;
        if (typeof mmsi !== "number") return;
        const prev = store.current.get(mmsi);

        if (msg.MessageType === "PositionReport") {
          const pr = msg.Message?.PositionReport ?? {};
          const lat = pr.Latitude ?? meta.latitude;
          const lng = pr.Longitude ?? meta.longitude;
          if (typeof lat !== "number" || typeof lng !== "number") return;
          const cog = typeof pr.Cog === "number" ? pr.Cog : 0;
          const hdg =
            typeof pr.TrueHeading === "number" && pr.TrueHeading < 360
              ? pr.TrueHeading
              : cog;
          // delete+set moves the entry to the end (most-recently-updated).
          store.current.delete(mmsi);
          store.current.set(mmsi, {
            mmsi,
            lat,
            lng,
            courseDeg: hdg,
            speedKn: typeof pr.Sog === "number" ? pr.Sog : 0,
            name: prev?.name ?? (meta.ShipName ?? "").trim(),
            type: prev?.type ?? 0,
            destination: prev?.destination,
          });
        } else if (msg.MessageType === "ShipStaticData") {
          const sd = msg.Message?.ShipStaticData ?? {};
          const name = (meta.ShipName ?? prev?.name ?? "").trim();
          const type = typeof sd.Type === "number" ? sd.Type : prev?.type ?? 0;
          const destination = (sd.Destination ?? "").trim() || prev?.destination;
          if (prev) {
            prev.name = name || prev.name;
            prev.type = type;
            prev.destination = destination;
          }
        }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry += 1;
        const delay = Math.min(30_000, 1000 * 2 ** retry);
        reconnectTimer = window.setTimeout(() => {
          if (!closed) connect();
        }, delay);
      };
    };
    connect();

    const flush = window.setInterval(() => {
      while (store.current.size > MAX_SHIPS) {
        const oldest = store.current.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        store.current.delete(oldest);
      }
      setShips(Array.from(store.current.values()));
    }, FLUSH_MS);

    return () => {
      closed = true;
      clearInterval(flush);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      store.current.clear();
      setConnected(false);
    };
  }, [enabled]);

  return { ships, connected };
}

const CATEGORIES: { name: string; color: [number, number, number] }[] = [
  { name: "Other", color: [0.75, 0.8, 0.85] },
  { name: "Fishing", color: [0.4, 0.9, 0.5] },
  { name: "Tug / Special", color: [0.85, 0.82, 0.5] },
  { name: "Sailing / Pleasure", color: [0.55, 0.9, 0.9] },
  { name: "High-speed craft", color: [0.85, 0.5, 1] },
  { name: "Passenger", color: [0.35, 0.7, 1] },
  { name: "Cargo", color: [1, 0.72, 0.25] },
  { name: "Tanker", color: [1, 0.4, 0.35] },
];

/** Map an AIS ship-type code to a readable category (name + colour). */
export function shipCategory(type: number): {
  name: string;
  color: [number, number, number];
} {
  if (type === 30) return CATEGORIES[1];
  if (type >= 31 && type <= 35) return CATEGORIES[2];
  if (type >= 36 && type <= 37) return CATEGORIES[3];
  if (type >= 40 && type <= 49) return CATEGORIES[4];
  if (type >= 60 && type <= 69) return CATEGORIES[5];
  if (type >= 70 && type <= 79) return CATEGORIES[6];
  if (type >= 80 && type <= 89) return CATEGORIES[7];
  return CATEGORIES[0];
}
