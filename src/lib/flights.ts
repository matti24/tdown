// Live aircraft via a personal Deno Deploy proxy that fetches OpenSky
// server-side (Cloudflare IPs are blocked by OpenSky) and adds CORS, returning
// a compact { ac: [{ c, la, lo, al, s }] } payload (al = feet, s = knots).
const FLIGHTS_PROXY = "https://comfortable-cheetah-8401.matti24.deno.net/";

export interface Flight {
  callsign: string;
  lat: number;
  lng: number;
  /** Barometric altitude in feet. */
  altFt: number;
  /** Ground speed in knots. */
  speedKt: number;
}

interface RawFlight {
  c?: string;
  la?: number;
  lo?: number;
  al?: number;
  s?: number;
}

/** Fetch the current live aircraft snapshot from the proxy. */
export async function fetchFlights(signal?: AbortSignal): Promise<Flight[]> {
  const res = await fetch(FLIGHTS_PROXY, { signal });
  if (!res.ok) throw new Error(`Flights proxy ${res.status}`);
  const data = await res.json();
  const ac: RawFlight[] = Array.isArray(data?.ac) ? data.ac : [];
  return ac
    .filter((a) => Number.isFinite(a.la) && Number.isFinite(a.lo))
    .map((a) => ({
      callsign: (a.c ?? "").trim() || "—",
      lat: a.la as number,
      lng: a.lo as number,
      altFt: Number(a.al) || 0,
      speedKt: Number(a.s) || 0,
    }));
}
