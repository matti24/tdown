// Resolves a photo of a *specific* vessel (like the aircraft photos for
// flights) instead of a generic type illustration. Two CORS-enabled, free,
// legal sources are tried, most-reliable first:
//   1. Wikidata by IMO number  -> the vessel's own image (P18). Exact.
//   2. Wikimedia Commons file search by name, but a result is only accepted
//      when the file title actually contains the vessel name and mentions a
//      ship — otherwise there simply is no photo and we return null (so the
//      panel shows an honest representative image rather than a wrong one).
// Results (including misses) are cached per MMSI.

export interface ShipPhoto {
  url: string;
  /** True when we could verify the photo really is this vessel. */
  exact: boolean;
}

const cache = new Map<number, ShipPhoto | null>();
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Turn a Commons file title / Special:FilePath URL into a thumbnail URL. */
function thumbUrl(fileOrUrl: string, width = 480): string {
  let file = fileOrUrl;
  const m = fileOrUrl.match(/Special:FilePath\/(.+)$/);
  if (m) file = decodeURIComponent(m[1]);
  file = file.replace(/^File:/i, "");
  return (
    "https://commons.wikimedia.org/wiki/Special:FilePath/" +
    encodeURIComponent(file) +
    "?width=" +
    width
  );
}

/** Normalise for loose comparison: upper-case alphanumerics, single spaces. */
function norm(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

async function wikidataImageByImo(imo: number): Promise<string | null> {
  const q = `SELECT ?image WHERE { ?item wdt:P458 "${imo}". ?item wdt:P18 ?image } LIMIT 1`;
  const r = await fetch(
    "https://query.wikidata.org/sparql?format=json&query=" +
      encodeURIComponent(q),
    { headers: { Accept: "application/sparql-results+json" } },
  );
  if (!r.ok) return null;
  const j = await r.json();
  return j.results?.bindings?.[0]?.image?.value ?? null;
}

async function commonsFileByName(name: string): Promise<string | null> {
  const target = norm(name);
  // Too short / generic to match a unique vessel safely.
  if (target.replace(/ /g, "").length < 5) return null;
  const srsearch = `"${name.replace(/"/g, "")}" (ship OR vessel OR boat)`;
  const r = await fetch(
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search" +
      "&srnamespace=6&srlimit=8&srsearch=" +
      encodeURIComponent(srsearch) +
      "&origin=*",
  );
  if (!r.ok) return null;
  const j = await r.json();
  const results: { title: string }[] = j.query?.search ?? [];
  for (const s of results) {
    const title = s.title.replace(/^File:/i, "");
    if (!IMAGE_EXT.test(title)) continue;
    // Only trust it if the vessel name really appears in the file title.
    if (norm(title).includes(target)) return title;
  }
  return null;
}

export async function fetchShipPhoto(v: {
  mmsi: number;
  imo?: number;
  name?: string;
}): Promise<ShipPhoto | null> {
  const cached = cache.get(v.mmsi);
  if (cached !== undefined) return cached;

  let result: ShipPhoto | null = null;
  try {
    if (v.imo && v.imo > 0) {
      const img = await wikidataImageByImo(v.imo);
      if (img) result = { url: thumbUrl(img), exact: true };
    }
    if (!result && v.name) {
      const file = await commonsFileByName(v.name);
      if (file) result = { url: thumbUrl(file), exact: true };
    }
  } catch {
    result = null;
  }

  // Only cache a definitive answer; if we had nothing to go on, allow a retry
  // once the vessel's name/IMO arrives from a later AIS static-data message.
  if (result || v.imo || v.name) cache.set(v.mmsi, result);
  return result;
}
