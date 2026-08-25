// Live satellite tracking: TLE element sets are fetched from Celestrak
// (free, no API key, HTTPS + CORS) and propagated in the browser with the
// SGP4 model via satellite.js. This gives real, live positions and speeds
// for SpaceX Starlink, OneWeb and GPS satellites.
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  propagate,
  twoline2satrec,
  type SatRec,
} from "satellite.js";

export interface Constellation {
  key: string;
  label: string;
  /** What the constellation is for (shown on hover). */
  purpose: string;
  /** Full Celestrak URL delivering three-line (name + TLE) element sets. */
  url: string;
  /** Marker colour (hex). */
  color: string;
}

// Starlink uses SpaceX's supplemental ephemerides (more accurate than the
// general catalogue and served independently of it).
const STARLINK_URL =
  "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle";
const gpGroup = (group: string) =>
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;

/** Tracked constellations: internet mega-constellations plus navigation sats. */
export const CONSTELLATIONS: Constellation[] = [
  {
    key: "starlink",
    label: "Starlink",
    purpose: "Internet · SpaceX",
    url: STARLINK_URL,
    color: "#3fa9ff",
  },
  {
    key: "oneweb",
    label: "OneWeb",
    purpose: "Internet",
    url: gpGroup("oneweb"),
    color: "#b57bff",
  },
  {
    key: "gps",
    label: "GPS",
    purpose: "Navigation · USA",
    url: gpGroup("gps-ops"),
    color: "#ffcf4d",
  },
];

export interface SatelliteRecord {
  name: string;
  constellation: string;
  satrec: SatRec;
}

export interface SatelliteState {
  lat: number;
  lng: number;
  /** Altitude above sea level in kilometres. */
  altKm: number;
  /** Orbital speed in kilometres per hour. */
  speedKmh: number;
}

// Celestrak returns HTTP 403 ("GP data has not updated since your last
// successful download") when a dataset is re-requested before it changes, so
// we cache each set locally and only hit the network occasionally. This keeps
// the layer reliable and respects Celestrak's fair-use policy.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const cacheKey = (key: string) => `tle:${key}`;

interface TleCacheEntry {
  text: string;
  ts: number;
}

function readTleCache(key: string): TleCacheEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TleCacheEntry;
    if (typeof parsed?.text === "string" && typeof parsed?.ts === "number") {
      return parsed;
    }
  } catch {
    // Unavailable or corrupt storage — treat as a cache miss.
  }
  return null;
}

function writeTleCache(key: string, text: string): void {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ text, ts: Date.now() }));
  } catch {
    // Storage full or disabled — keep working from memory for this session.
  }
}

/** Parse Celestrak three-line (name + TLE) text into satellite records. */
function parseTle(text: string, constellation: string): SatelliteRecord[] {
  const lines = text.split(/\r?\n/);
  const records: SatelliteRecord[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = (lines[i] ?? "").trim();
    const line1 = (lines[i + 1] ?? "").trim();
    const line2 = (lines[i + 2] ?? "").trim();
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;
    try {
      records.push({
        name: name || constellation,
        constellation,
        satrec: twoline2satrec(line1, line2),
      });
    } catch {
      // Skip malformed element sets rather than failing the whole batch.
    }
  }
  return records;
}

/** Fetch and parse a single constellation's current element sets. */
export async function fetchConstellation(
  constellation: Constellation,
  signal?: AbortSignal,
): Promise<SatelliteRecord[]> {
  const cached = readTleCache(constellation.key);
  // Skip the network while the cached set is still fresh (Celestrak updates a
  // few times per day) to avoid the "not updated" 403 and speed up load.
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return parseTle(cached.text, constellation.key);
  }
  try {
    const res = await fetch(constellation.url, { signal });
    if (!res.ok) throw new Error(`Celestrak ${constellation.key} ${res.status}`);
    const text = await res.text();
    writeTleCache(constellation.key, text);
    return parseTle(text, constellation.key);
  } catch (err) {
    // Network failure or Celestrak 403: fall back to the last good data.
    if (cached) return parseTle(cached.text, constellation.key);
    throw err;
  }
}

/** Fetch every tracked constellation; a failed group degrades gracefully. */
export async function fetchSatellites(
  signal?: AbortSignal,
): Promise<SatelliteRecord[]> {
  const groups = await Promise.all(
    CONSTELLATIONS.map((c) =>
      fetchConstellation(c, signal).catch(() => [] as SatelliteRecord[]),
    ),
  );
  return groups.flat();
}

/**
 * Propagate a satellite to `date` with SGP4 and return its geodetic position
 * and speed. Pass a precomputed `gmst` (from `gstime(date)`) so a whole batch
 * shares one sidereal-time calculation. Returns `null` when the orbit cannot
 * be resolved (e.g. a decayed satellite).
 */
export function propagateSatellite(
  satrec: SatRec,
  date: Date,
  gmst: number,
): SatelliteState | null {
  const pv = propagate(satrec, date, { communityDecayCheckEnabled: true });
  if (!pv) return null;

  const geo = eciToGeodetic(pv.position, gmst);
  const lat = degreesLat(geo.latitude);
  const lng = degreesLong(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const { x, y, z } = pv.velocity;
  const speedKmh = Math.sqrt(x * x + y * y + z * z) * 3600;
  return { lat, lng, altKm: geo.height, speedKmh };
}
