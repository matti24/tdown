// Fetches a representative image + short description for a topic from the
// Wikipedia REST summary API (free, CORS-enabled). Used to illustrate the
// selected satellite / ship type / ISS in the detail panel.

export interface WikiInfo {
  title: string;
  extract: string;
  image?: string;
}

const cache = new Map<string, WikiInfo | null>();

export async function fetchWikiInfo(topic: string): Promise<WikiInfo | null> {
  const cached = cache.get(topic);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(topic.replace(/ /g, "_")),
    );
    if (!res.ok) {
      cache.set(topic, null);
      return null;
    }
    const j = await res.json();
    const info: WikiInfo = {
      title: j.title ?? topic,
      extract: j.extract ?? "",
      image: j.thumbnail?.source,
    };
    cache.set(topic, info);
    return info;
  } catch {
    cache.set(topic, null);
    return null;
  }
}
