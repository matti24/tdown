export interface SubsolarPoint {
  lat: number;
  lng: number;
}

/**
 * Approximate subsolar point (where the Sun is directly overhead) for a given time.
 * Accurate to ~1° — good enough for a live day/night visualisation.
 */
export function subsolarPoint(date: Date = new Date()): SubsolarPoint {
  const rad = Math.PI / 180;

  // Day of year (1-based, UTC).
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86_400_000;

  // Solar declination (degrees).
  const decl = -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * rad);

  // Subsolar longitude: where it is solar noon (ignores the equation of time).
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  let lng = -15 * (utcHours - 12);
  lng = ((((lng + 180) % 360) + 360) % 360) - 180; // normalise to -180..180

  return { lat: decl, lng };
}
