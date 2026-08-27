// Live vessels via AISStream.io, connected directly from the browser over a
// WebSocket. Positions accumulate in a Map and are flushed to React on an
// interval (throttled). The free API key is read from VITE_AISSTREAM_API_KEY
// (or a localStorage "aisstream_key" override); without a key the ships layer
// simply stays hidden.
import { useEffect, useRef, useState } from "react";

const AIS_WS = "wss://stream.aisstream.io/v0/stream";
const MAX_SHIPS = 20000;
const FLUSH_MS = 3000;
// Drop vessels not heard from in this long, so all regions persist rather than
// being crowded out by high-frequency coastal traffic.
const SHIP_TTL_MS = 20 * 60_000;
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
  imo?: number;
  callSign?: string;
  /** Overall length in metres (from AIS dimensions). */
  lengthM?: number;
  /** Beam in metres. */
  beamM?: number;
  /** Max static draught in metres. */
  draughtM?: number;
  /** Estimated arrival, formatted "DD.MM HH:MM" (UTC). */
  eta?: string;
  /** Internal: last-seen timestamp (ms). */
  t?: number;
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
      ImoNumber?: number;
      CallSign?: string;
      MaximumStaticDraught?: number;
      Dimension?: { A?: number; B?: number; C?: number; D?: number };
      Eta?: { Month?: number; Day?: number; Hour?: number; Minute?: number };
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
            t: Date.now(),
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
            prev.t = Date.now();
            if (typeof sd.ImoNumber === "number" && sd.ImoNumber > 0) {
              prev.imo = sd.ImoNumber;
            }
            const cs = (sd.CallSign ?? "").trim();
            if (cs) prev.callSign = cs;
            if (
              typeof sd.MaximumStaticDraught === "number" &&
              sd.MaximumStaticDraught > 0
            ) {
              prev.draughtM = sd.MaximumStaticDraught;
            }
            const dim = sd.Dimension;
            if (dim && (dim.A || dim.B)) {
              prev.lengthM = (dim.A ?? 0) + (dim.B ?? 0);
              prev.beamM = (dim.C ?? 0) + (dim.D ?? 0);
            }
            const eta = sd.Eta;
            if (eta && eta.Month && eta.Day) {
              const p = (n: number) => String(n).padStart(2, "0");
              prev.eta = `${p(eta.Day)}.${p(eta.Month)} ${p(eta.Hour ?? 0)}:${p(eta.Minute ?? 0)}`;
            }
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
      const now = Date.now();
      for (const [mmsi, s] of store.current) {
        if (s.t !== undefined && now - s.t > SHIP_TTL_MS) {
          store.current.delete(mmsi);
        }
      }
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

const CATEGORIES: {
  name: string;
  color: [number, number, number];
  wiki: string;
}[] = [
  { name: "Other", color: [0.75, 0.8, 0.85], wiki: "Ship" },
  { name: "Fishing", color: [0.4, 0.9, 0.5], wiki: "Fishing vessel" },
  { name: "Tug / Special", color: [0.85, 0.82, 0.5], wiki: "Tugboat" },
  { name: "Sailing / Pleasure", color: [0.55, 0.9, 0.9], wiki: "Yacht" },
  { name: "High-speed craft", color: [0.85, 0.5, 1], wiki: "High-speed craft" },
  { name: "Passenger", color: [0.35, 0.7, 1], wiki: "Cruise ship" },
  { name: "Cargo", color: [1, 0.72, 0.25], wiki: "Cargo ship" },
  { name: "Tanker", color: [1, 0.4, 0.35], wiki: "Oil tanker" },
];

/** Map an AIS ship-type code to a readable category (name + colour + wiki). */
export function shipCategory(type: number): {
  name: string;
  color: [number, number, number];
  wiki: string;
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

// ITU Maritime Identification Digits (first 3 MMSI digits) -> flag state.
const MID_COUNTRY: Record<number, string> = {
  201: "Albania", 205: "Belgium", 207: "Bulgaria", 209: "Cyprus", 210: "Cyprus",
  211: "Germany", 212: "Cyprus", 215: "Malta", 218: "Germany", 219: "Denmark",
  220: "Denmark", 224: "Spain", 225: "Spain", 226: "France", 227: "France",
  228: "France", 229: "Malta", 230: "Finland", 231: "Faroe Is", 232: "UK",
  233: "UK", 234: "UK", 235: "UK", 236: "Gibraltar", 237: "Greece",
  238: "Croatia", 239: "Greece", 240: "Greece", 241: "Greece", 244: "Netherlands",
  245: "Netherlands", 246: "Netherlands", 247: "Italy", 248: "Malta", 249: "Malta",
  250: "Ireland", 251: "Iceland", 253: "Luxembourg", 254: "Monaco", 255: "Portugal",
  256: "Malta", 257: "Norway", 258: "Norway", 259: "Norway", 261: "Poland",
  262: "Montenegro", 263: "Portugal", 264: "Romania", 265: "Sweden", 266: "Sweden",
  267: "Slovakia", 269: "Switzerland", 270: "Czechia", 271: "Turkey", 272: "Ukraine",
  273: "Russia", 275: "Latvia", 276: "Estonia", 277: "Lithuania", 278: "Slovenia",
  279: "Serbia", 304: "Antigua & Barbuda", 305: "Antigua & Barbuda", 306: "Cura\u00e7ao",
  307: "Aruba", 308: "Bahamas", 309: "Bahamas", 310: "Bermuda", 311: "Bahamas",
  312: "Belize", 314: "Barbados", 316: "Canada", 319: "Cayman Is", 321: "Costa Rica",
  323: "Cuba", 327: "Dominican Rep.", 330: "Grenada", 331: "Greenland", 336: "Haiti",
  338: "USA", 341: "St Kitts & Nevis", 343: "St Lucia", 345: "Mexico", 351: "Panama",
  352: "Panama", 353: "Panama", 354: "Panama", 355: "Panama", 356: "Panama",
  357: "Panama", 370: "Panama", 371: "Panama", 372: "Panama", 373: "Panama",
  374: "Panama", 366: "USA", 367: "USA", 368: "USA", 369: "USA", 375: "St Vincent",
  376: "St Vincent", 377: "St Vincent", 378: "BVI", 401: "Afghanistan",
  403: "Saudi Arabia", 405: "Bangladesh", 408: "Bahrain", 412: "China", 413: "China",
  414: "China", 416: "Taiwan", 417: "Sri Lanka", 419: "India", 422: "Iran",
  423: "Azerbaijan", 425: "Iraq", 428: "Israel", 431: "Japan", 432: "Japan",
  436: "Kazakhstan", 438: "Jordan", 440: "South Korea", 441: "South Korea",
  445: "North Korea", 447: "Kuwait", 450: "Lebanon", 453: "Macau", 455: "Maldives",
  457: "Mongolia", 459: "Nepal", 461: "Oman", 463: "Pakistan", 466: "Qatar",
  468: "Syria", 470: "UAE", 471: "UAE", 473: "Yemen", 477: "Hong Kong",
  503: "Australia", 506: "Myanmar", 508: "Brunei", 511: "Palau", 512: "New Zealand",
  514: "Cambodia", 515: "Cambodia", 520: "Fiji", 525: "Indonesia", 533: "Malaysia",
  536: "N. Mariana Is", 538: "Marshall Is", 540: "New Caledonia", 548: "Philippines",
  553: "Papua New Guinea", 557: "Solomon Is", 563: "Singapore", 564: "Singapore",
  565: "Singapore", 566: "Singapore", 567: "Thailand", 574: "Vietnam", 576: "Vanuatu",
  577: "Vanuatu", 601: "South Africa", 603: "Angola", 605: "Algeria", 610: "Benin",
  613: "Cameroon", 615: "Congo", 616: "Comoros", 617: "Cape Verde", 619: "Ivory Coast",
  620: "Comoros", 621: "Djibouti", 622: "Egypt", 624: "Ethiopia", 625: "Eritrea",
  626: "Gabon", 627: "Ghana", 629: "Gambia", 630: "Guinea-Bissau", 632: "Guinea",
  633: "Burkina Faso", 634: "Kenya", 636: "Liberia", 637: "Liberia", 642: "Libya",
  644: "Lesotho", 645: "Mauritius", 647: "Madagascar", 649: "Mali", 650: "Mozambique",
  654: "Mauritania", 656: "Niger", 657: "Nigeria", 659: "Namibia", 660: "R\u00e9union",
  661: "Rwanda", 662: "Sudan", 663: "Senegal", 664: "Seychelles", 666: "Somalia",
  667: "Sierra Leone", 668: "S\u00e3o Tom\u00e9", 671: "Togo", 672: "Tunisia", 674: "Tanzania",
  675: "Uganda", 676: "DR Congo", 677: "Tanzania", 678: "Zambia", 701: "Argentina",
  710: "Brazil", 720: "Bolivia", 725: "Chile", 730: "Colombia", 735: "Ecuador",
  740: "Falkland Is", 745: "Guiana", 750: "India", 755: "Paraguay", 760: "Peru",
  765: "Suriname", 770: "Uruguay", 775: "Venezuela",
};

/** Flag state derived from an MMSI's Maritime Identification Digits. */
export function shipFlag(mmsi: number): string | undefined {
  return MID_COUNTRY[Math.floor(mmsi / 1_000_000)];
}
