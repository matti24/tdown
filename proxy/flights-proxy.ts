// Live-aircraft proxy for tdown — Deno Deploy.
//
// WHY: the app can't call ADS-B APIs directly (they send no CORS headers), and
// none offer a free global "all aircraft" endpoint. This proxy fetches adsb.fi
// (free, no key, ADSBExchange-compatible) one 250 NM tile at a time at ~1 req/s
// (their public limit), merges everything into a rolling global snapshot, and
// serves it with CORS in the compact shape the client already expects:
//   { ac: [{ c, la, lo, al, s, t, vr, co, i }] }
//   c=callsign la=lat lo=lon al=alt(ft) s=speed(kt) t=track° vr=vert(m/s)
//   co=country i=icao24(hex)
//
// DEPLOY: replace the current OpenSky proxy on Deno Deploy with this file
// (same project → same URL, so the app keeps working unchanged). No env vars,
// no credits. Please keep a receiver / cite adsb.fi per their terms.

const SRC = "https://opendata.adsb.fi/api/v3";
const TILE_DIST = 250; // NM (adsb.fi max)
const TILE_GAP_MS = 1050; // stay under the 1 req/s public limit
const MAX_AGE_MS = 150_000; // drop aircraft not re-seen within ~2 sweeps

// Tile centres over regions with ADS-B receiver coverage + traffic. Each covers
// a 250 NM radius; overlaps are deduped by hex.
const TILES: [number, number][] = [
  // Europe
  [51, 0], [50, 8], [52, 14], [45, 10], [41, 15], [40, -4], [43, 1],
  [57, 12], [60, 22], [47, 19], [41, 29], [38, 24], [55, 37], [50, 30],
  // North America
  [40, -74], [43, -79], [42, -83], [41, -88], [45, -93], [33, -84],
  [28, -81], [29, -95], [32, -97], [39, -105], [34, -118], [37, -122],
  [47, -122], [19, -99],
  // Central / South America
  [9, -79], [4, -74], [10, -66], [-12, -77], [-23, -46], [-34, -58], [-33, -70],
  // Africa / Middle East
  [30, 31], [33, 35], [24, 47], [25, 55], [36, 3], [6, 3], [-26, 28], [-33, 18],
  // Asia
  [28, 77], [19, 73], [13, 80], [1, 104], [13, 101], [-6, 107], [14, 121],
  [22, 114], [31, 121], [39, 117], [37, 127], [35, 139], [25, 121],
  // Oceania
  [-33, 151], [-37, 145], [-27, 153], [-32, 116], [-37, 175],
];

// Major ICAO 24-bit address blocks -> flag state (best-effort; unmatched = "").
const ICAO_RANGES: [number, number, string][] = [
  [0x008000, 0x00ffff, "South Africa"],
  [0x100000, 0x1fffff, "Russia"],
  [0x300000, 0x33ffff, "Italy"],
  [0x340000, 0x37ffff, "Spain"],
  [0x380000, 0x3bffff, "France"],
  [0x3c0000, 0x3fffff, "Germany"],
  [0x400000, 0x43ffff, "United Kingdom"],
  [0x440000, 0x447fff, "Austria"],
  [0x448000, 0x44ffff, "Belgium"],
  [0x458000, 0x45ffff, "Denmark"],
  [0x460000, 0x467fff, "Finland"],
  [0x468000, 0x46ffff, "Greece"],
  [0x478000, 0x47ffff, "Norway"],
  [0x480000, 0x487fff, "Netherlands"],
  [0x488000, 0x48ffff, "Poland"],
  [0x490000, 0x497fff, "Portugal"],
  [0x4a0000, 0x4a7fff, "Sweden"],
  [0x4b0000, 0x4b7fff, "Switzerland"],
  [0x4b8000, 0x4bffff, "Turkey"],
  [0x4ca000, 0x4cafff, "Ireland"],
  [0x500000, 0x5003ff, "Slovenia"],
  [0x508000, 0x50ffff, "Ukraine"],
  [0x710000, 0x717fff, "Saudi Arabia"],
  [0x718000, 0x71ffff, "South Korea"],
  [0x738000, 0x73ffff, "Israel"],
  [0x760000, 0x767fff, "Qatar"],
  [0x768000, 0x76ffff, "Singapore"],
  [0x780000, 0x7bffff, "China"],
  [0x7c0000, 0x7fffff, "Australia"],
  [0x800000, 0x83ffff, "India"],
  [0x840000, 0x87ffff, "Japan"],
  [0x880000, 0x887fff, "Thailand"],
  [0x896000, 0x896fff, "United Arab Emirates"],
  [0x8a0000, 0x8a7fff, "Indonesia"],
  [0xa00000, 0xafffff, "United States"],
  [0xc00000, 0xc3ffff, "Canada"],
  [0xc80000, 0xc87fff, "New Zealand"],
  [0xe40000, 0xe7ffff, "Brazil"],
  [0xe80000, 0xe80fff, "Chile"],
  [0xe84000, 0xe87fff, "Argentina"],
];

function countryOf(hex: string): string {
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return "";
  for (const [lo, hi, name] of ICAO_RANGES) if (n >= lo && n <= hi) return name;
  return "";
}

interface Raw {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
  baro_rate?: number;
}

const store = new Map<string, { a: Raw; t: number }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let looping = false;

async function fetchTile(lat: number, lon: number): Promise<Raw[]> {
  const res = await fetch(`${SRC}/lat/${lat}/lon/${lon}/dist/${TILE_DIST}`, {
    headers: { "User-Agent": "tdown-flights/1.0 (+https://www.tdowner.com)" },
  });
  if (!res.ok) throw new Error(`adsb.fi ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.ac) ? j.ac : [];
}

async function refreshLoop() {
  if (looping) return;
  looping = true;
  for (;;) {
    for (const [lat, lon] of TILES) {
      try {
        const now = Date.now();
        for (const a of await fetchTile(lat, lon)) {
          if (a.hex && Number.isFinite(a.lat) && Number.isFinite(a.lon)) {
            store.set(a.hex, { a, t: now });
          }
        }
      } catch {
        // Skip a failing tile; the next sweep retries it.
      }
      await sleep(TILE_GAP_MS);
    }
  }
}

function snapshot() {
  const cutoff = Date.now() - MAX_AGE_MS;
  const ac: Record<string, unknown>[] = [];
  for (const [hex, { a, t }] of store) {
    if (t < cutoff) {
      store.delete(hex);
      continue;
    }
    const alt = a.alt_baro === "ground" ? 0 : Number(a.alt_baro) || 0;
    ac.push({
      c: (a.flight ?? "").trim(),
      la: a.lat,
      lo: a.lon,
      al: alt,
      s: Number(a.gs) || 0,
      t: Number(a.track) || 0,
      vr: (Number(a.baro_rate) || 0) / 196.85, // ft/min -> m/s
      co: countryOf(hex),
      i: hex,
    });
  }
  return ac;
}

// Warm the isolate; requests are served from the rolling store below.
refreshLoop();

Deno.serve((req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Restart the sweep if the isolate was recycled.
  refreshLoop();

  const ac = snapshot();
  return new Response(JSON.stringify({ ac, count: ac.length, now: Date.now() }), {
    headers: {
      ...cors,
      "content-type": "application/json",
      "cache-control": "public, max-age=15",
    },
  });
});
