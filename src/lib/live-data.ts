// Live-Datenquellen: alle gratis, ohne API-Key, HTTPS und CORS-faehig.

export interface Earthquake {
  id: string;
  lat: number;
  lng: number;
  magnitude: number;
  place: string;
  time: number;
  url: string;
}

export interface IssPosition {
  lat: number;
  lng: number;
  altitude: number;
  velocity: number;
  timestamp: number;
}

export interface NaturalEvent {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
}

export interface CityWeather {
  lat: number;
  lng: number;
  label: string;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** USGS: Erdbeben der letzten 24 Stunden (GeoJSON). */
export async function fetchEarthquakes(signal?: AbortSignal): Promise<Earthquake[]> {
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    { signal },
  );
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const data: Json = await res.json();
  return (data.features ?? []).map((f: Json) => ({
    id: f.id,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    magnitude: f.properties.mag ?? 0,
    place: f.properties.place ?? "Unbekannt",
    time: f.properties.time,
    url: f.properties.url,
  }));
}

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

/** NASA EONET: offene Naturereignisse (Braende, Stuerme, Vulkane, ...). */
export async function fetchNaturalEvents(signal?: AbortSignal): Promise<NaturalEvent[]> {
  const res = await fetch(
    "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80",
    { signal },
  );
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data: Json = await res.json();
  const events: NaturalEvent[] = [];
  for (const ev of data.events ?? []) {
    const geos = ev.geometry ?? [];
    const last = geos[geos.length - 1]; // aktuellste Position (bei Stuermen: Ende der Zugbahn)
    if (!last || last.type !== "Point") continue;
    events.push({
      id: ev.id,
      title: ev.title,
      category: ev.categories?.[0]?.id ?? "unknown",
      lng: last.coordinates[0],
      lat: last.coordinates[1],
    });
  }
  return events;
}

/** Open-Meteo: aktuelles Wetter fuer mehrere Koordinaten in einem Request. */
export async function fetchWeather(
  points: { lat: number; lng: number; label?: string }[],
  signal?: AbortSignal,
): Promise<CityWeather[]> {
  if (points.length === 0) return [];
  const lats = points.map((c) => c.lat).join(",");
  const lngs = points.map((c) => c.lng).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,weather_code,wind_speed_10m`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data: Json = await res.json();
  // Bei mehreren Koordinaten liefert Open-Meteo ein Array, bei einer ein Objekt.
  const arr: Json[] = Array.isArray(data) ? data : [data];
  return arr.map((d, i) => ({
    lat: points[i].lat,
    lng: points[i].lng,
    label: points[i].label ?? "",
    temperature: d.current?.temperature_2m ?? 0,
    weatherCode: d.current?.weather_code ?? 0,
    windSpeed: d.current?.wind_speed_10m ?? 0,
  }));
}

export interface AuroraPoint {
  lat: number;
  lng: number;
  value: number;
}

/** NOAA SWPC OVATION aurora nowcast; returns grid points above a visibility threshold. */
export async function fetchAurora(signal?: AbortSignal): Promise<AuroraPoint[]> {
  const res = await fetch(
    "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
    { signal },
  );
  if (!res.ok) throw new Error(`OVATION ${res.status}`);
  const data: Json = await res.json();
  const coords: [number, number, number][] = data.coordinates ?? [];
  const points: AuroraPoint[] = [];
  for (const [lng, lat, value] of coords) {
    if (value >= 3) {
      points.push({ lat, lng: lng > 180 ? lng - 360 : lng, value });
    }
  }
  return points;
}
