// Predicts the next visible passes of the ISS over an observer, computed in the
// browser with SGP4 (satellite.js) from the current ISS TLE — no API quotas.
import {
  ecfToLookAngles,
  eciToEcf,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from "satellite.js";

const ISS_CATNR = 25544;
const TLE_TTL_MS = 3 * 60 * 60 * 1000; // element sets change a few times/day
const TLE_KEY = "tle:iss";
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export interface IssPass {
  /** Rise above the horizon threshold. */
  start: Date;
  /** Highest point of the pass. */
  peak: Date;
  /** Drop back below the threshold. */
  end: Date;
  maxElevationDeg: number;
  durationSec: number;
}

interface Tle {
  line1: string;
  line2: string;
}

let satrecCache: { satrec: SatRec; ts: number } | null = null;

function readTle(): Tle | null {
  try {
    const raw = localStorage.getItem(TLE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Tle & { ts: number };
    if (p?.line1 && p?.line2 && Date.now() - p.ts < TLE_TTL_MS) {
      return { line1: p.line1, line2: p.line2 };
    }
  } catch {
    // ignore corrupt/unavailable storage
  }
  return null;
}

function writeTle(t: Tle): void {
  try {
    localStorage.setItem(TLE_KEY, JSON.stringify({ ...t, ts: Date.now() }));
  } catch {
    // storage disabled — keep the in-memory satrec for this session
  }
}

async function fetchTle(): Promise<Tle> {
  const cached = readTle();
  if (cached) return cached;
  // Primary: Celestrak (name + two lines).
  try {
    const res = await fetch(
      `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_CATNR}&FORMAT=TLE`,
    );
    if (res.ok) {
      const lines = (await res.text())
        .split(/\r?\n/)
        .map((l) => l.trim());
      const line1 = lines.find((l) => l.startsWith("1 "));
      const line2 = lines.find((l) => l.startsWith("2 "));
      if (line1 && line2) {
        const t = { line1, line2 };
        writeTle(t);
        return t;
      }
    }
  } catch {
    // fall through to the backup source
  }
  // Backup: wheretheiss.at.
  const res = await fetch(
    `https://api.wheretheiss.at/v1/satellites/${ISS_CATNR}/tles`,
  );
  if (!res.ok) throw new Error(`ISS TLE ${res.status}`);
  const j = await res.json();
  if (!j?.line1 || !j?.line2) throw new Error("ISS TLE unparseable");
  const t = { line1: j.line1 as string, line2: j.line2 as string };
  writeTle(t);
  return t;
}

async function getSatrec(): Promise<SatRec> {
  if (satrecCache && Date.now() - satrecCache.ts < TLE_TTL_MS) {
    return satrecCache.satrec;
  }
  const { line1, line2 } = await fetchTle();
  const satrec = twoline2satrec(line1, line2);
  satrecCache = { satrec, ts: Date.now() };
  return satrec;
}

/**
 * The next ISS passes over (lat, lng): scans ahead in 15 s steps and reports
 * each interval the station spends above `minElevationDeg` on the horizon.
 */
export async function nextIssPasses(
  lat: number,
  lng: number,
  opts: { count?: number; minElevationDeg?: number; hours?: number } = {},
): Promise<IssPass[]> {
  const { count = 3, minElevationDeg = 10, hours = 48 } = opts;
  const satrec = await getSatrec();
  const observer = { longitude: lng * D2R, latitude: lat * D2R, height: 0.1 };
  const passes: IssPass[] = [];
  const now = Date.now();
  let cur: IssPass | null = null;

  for (let s = 0; s <= hours * 3600; s += 15) {
    const date = new Date(now + s * 1000);
    const pv = propagate(satrec, date);
    if (!pv || !pv.position) continue;
    const ecf = eciToEcf(pv.position, gstime(date));
    const elevation = ecfToLookAngles(observer, ecf).elevation * R2D;

    if (elevation >= minElevationDeg) {
      if (!cur) cur = { start: date, peak: date, end: date, maxElevationDeg: elevation, durationSec: 0 };
      else if (elevation > cur.maxElevationDeg) {
        cur.maxElevationDeg = elevation;
        cur.peak = date;
      }
    } else if (cur) {
      cur.end = date;
      cur.durationSec = (cur.end.getTime() - cur.start.getTime()) / 1000;
      passes.push(cur);
      cur = null;
      if (passes.length >= count) break;
    }
  }
  return passes;
}
