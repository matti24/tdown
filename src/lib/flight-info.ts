// Enriches a selected flight with route (origin/destination airport + airline)
// and aircraft (model, operator, photo) data from the free adsbdb.com API.
// Route is looked up by callsign; the aircraft model needs the transponder
// hex (mode-s / icao24), which the flights proxy must expose as `i` (state[0]).

export interface FlightInfo {
  airline?: string;
  originCity?: string;
  originIata?: string;
  originName?: string;
  originCountry?: string;
  originLat?: number;
  originLng?: number;
  destCity?: string;
  destIata?: string;
  destName?: string;
  destCountry?: string;
  destLat?: number;
  destLng?: number;
  model?: string;
  manufacturer?: string;
  registration?: string;
  owner?: string;
  photo?: string;
}

const ADSBDB = "https://api.adsbdb.com/v0";
const cache = new Map<string, FlightInfo>();

/** Common ICAO airline designators -> name, as an offline fallback. */
const AIRLINES: Record<string, string> = {
  DLH: "Lufthansa",
  BAW: "British Airways",
  AFR: "Air France",
  KLM: "KLM",
  UAE: "Emirates",
  QTR: "Qatar Airways",
  UAL: "United Airlines",
  AAL: "American Airlines",
  DAL: "Delta Air Lines",
  SWA: "Southwest Airlines",
  RYR: "Ryanair",
  EZY: "easyJet",
  WZZ: "Wizz Air",
  EIN: "Aer Lingus",
  SWR: "Swiss",
  AUA: "Austrian Airlines",
  TAP: "TAP Air Portugal",
  IBE: "Iberia",
  VLG: "Vueling",
  THY: "Turkish Airlines",
  SAS: "SAS",
  FIN: "Finnair",
  NAX: "Norwegian",
  ANA: "All Nippon Airways",
  JAL: "Japan Airlines",
  SIA: "Singapore Airlines",
  CPA: "Cathay Pacific",
  QFA: "Qantas",
  ANZ: "Air New Zealand",
  ACA: "Air Canada",
  AMX: "Aeroméxico",
  GLO: "GOL",
  TAM: "LATAM Brasil",
  LAN: "LATAM",
  AVA: "Avianca",
  ETH: "Ethiopian Airlines",
  MSR: "EgyptAir",
  SAA: "South African Airways",
  ETD: "Etihad Airways",
  SVA: "Saudia",
  AIC: "Air India",
  IGO: "IndiGo",
  AXB: "Air India Express",
  CCA: "Air China",
  CES: "China Eastern",
  CSN: "China Southern",
  KAL: "Korean Air",
  AAR: "Asiana Airlines",
  THA: "Thai Airways",
  MAS: "Malaysia Airlines",
  GIA: "Garuda Indonesia",
  JBU: "JetBlue",
  ASA: "Alaska Airlines",
  FDX: "FedEx",
  UPS: "UPS Airlines",
  DHL: "DHL",
  EWG: "Eurowings",
  CFG: "Condor",
  TVF: "Transavia France",
  TRA: "Transavia",
  VOI: "Volaris",
  JZA: "Air Canada Jazz",
  ROU: "Air Canada Rouge",
  WJA: "WestJet",
  PGT: "Pegasus",
  FDB: "flydubai",
  GFA: "Gulf Air",
  KAC: "Kuwait Airways",
  ELY: "El Al",
  RJA: "Royal Jordanian",
  MEA: "Middle East Airlines",
  LOT: "LOT Polish Airlines",
  CSA: "Czech Airlines",
  AEE: "Aegean Airlines",
  ITY: "ITA Airways",
  BEL: "Brussels Airlines",
  EJA: "NetJets",
};

/** Guess an operating airline from the callsign's 3-letter ICAO prefix. */
export function airlineFromCallsign(callsign: string): string {
  const prefix = callsign.trim().slice(0, 3).toUpperCase();
  return AIRLINES[prefix] ?? prefix;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Fetch route + aircraft metadata for a flight (cached per callsign+icao24). */
export async function fetchFlightInfo(
  callsign: string,
  icao24?: string,
  signal?: AbortSignal,
): Promise<FlightInfo> {
  const key = `${callsign}|${icao24 ?? ""}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const info: FlightInfo = {};

  const [routeData, aircraftData] = await Promise.all([
    fetchJson(`${ADSBDB}/callsign/${encodeURIComponent(callsign)}`, signal),
    icao24
      ? fetchJson(`${ADSBDB}/aircraft/${encodeURIComponent(icao24)}`, signal)
      : Promise.resolve(null),
  ]);

  const fr = (routeData as { response?: { flightroute?: Record<string, any> } })
    ?.response?.flightroute;
  if (fr) {
    if (fr.airline?.name) info.airline = fr.airline.name;
    const o = fr.origin;
    if (o) {
      info.originCity = o.municipality;
      info.originIata = o.iata_code;
      info.originName = o.name;
      info.originCountry = o.country_name;
      if (Number.isFinite(o.latitude)) {
        info.originLat = o.latitude;
        info.originLng = o.longitude;
      }
    }
    const d = fr.destination;
    if (d) {
      info.destCity = d.municipality;
      info.destIata = d.iata_code;
      info.destName = d.name;
      info.destCountry = d.country_name;
      if (Number.isFinite(d.latitude)) {
        info.destLat = d.latitude;
        info.destLng = d.longitude;
      }
    }
  }

  const a = (aircraftData as { response?: { aircraft?: Record<string, any> } })
    ?.response?.aircraft;
  if (a) {
    info.model = a.type;
    info.manufacturer = a.manufacturer;
    info.registration = a.registration;
    info.owner = a.registered_owner;
    info.photo = a.url_photo_thumbnail || a.url_photo;
  }

  if (!info.airline) info.airline = info.owner ?? airlineFromCallsign(callsign);

  cache.set(key, info);
  return info;
}
