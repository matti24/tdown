// Live-Datenquelle: gratis, ohne API-Key, HTTPS und CORS-faehig.

export interface IssPosition {
  lat: number;
  lng: number;
  altitude: number;
  velocity: number;
  timestamp: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** wheretheiss.at: aktuelle Position der ISS. */
export async function fetchIss(signal?: AbortSignal): Promise<IssPosition> {
  const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544", {
    signal,
  });
  if (!res.ok) throw new Error(`ISS ${res.status}`);
  const d: Json = await res.json();
  return {
    lat: d.latitude,
    lng: d.longitude,
    altitude: d.altitude,
    velocity: d.velocity,
    timestamp: d.timestamp,
  };
}
