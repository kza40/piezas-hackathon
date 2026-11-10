// Satellite imagery under the farm map: one image, shared by the 2D map and the 3D scene, of a fixed stretch of
// ground centred on the farm pin. It is fetched only when the map is drawn (the farm's location goes to Esri then),
// and never prefetched. Esri marks it uncacheable (max-age=0) and it takes seconds to make, so it is downloaded
// once into a local blob URL: the map is redrawn often, and each redraw must not fetch it again.
import { esriImageryUrl, mercatorBBox, M_PER_UNIT } from './geo';
import { S } from './state';

/** The ground the image covers, in map units: twice the 2D view each way (4 km × 2.6 km), centred on the pin. */
export const SAT_W = 1600;
export const SAT_H = 1040;
/** Pixel size: same shape as the ground, about 2 m per pixel. */
const SAT_PX: [number, number] = [2000, 1300];

/** The imagery URL for the signed-in farm, or null when the farm has no location. */
export function farmImageryUrl(): string | null {
  if (S.farmLat == null || S.farmLng == null) return null;
  return esriImageryUrl(mercatorBBox([S.farmLng, S.farmLat], SAT_W * M_PER_UNIT, SAT_H * M_PER_UNIT), SAT_PX);
}

/** After a failed download, how long to wait before the next try: doubling from the first wait up to the most. */
export const RETRY_FIRST_MS = 30_000;
export const RETRY_MAX_MS = 10 * 60_000;
/** The clock the retry waits use (tests set their own). */
export const imageryClock = { now: () => Date.now() };

interface Load {
  promise: Promise<string>;
  retryAt?: number; // set when it failed: until then, asking again gets the same failure, without a download
}
const loads = new Map<string, Load>();
const ready = new Map<string, string>(); // URL to blob URL, for the farm on screen only (about 650 KB each)
const failures = new Map<string, number>(); // failed downloads in a row, per URL
let wanted: string | null = null; // the URL asked for last: the farm on screen
let generation = 0; // bumped by forgetImagery, so a download started before it is dropped when it lands

/** Releases every downloaded image except the one for `keep`. */
function keepOnly(keep: string | null) {
  for (const [url, local] of ready) {
    if (url === keep) continue;
    URL.revokeObjectURL(local);
    ready.delete(url);
    loads.delete(url); // its blob URL is gone: asking again downloads it again
  }
}

/**
 * Downloads the image once per URL, shared by whoever asks, and resolves to a local blob URL for it. Esri
 * answers some errors with 200 and a JSON body, so anything that is not an image counts as a failure.
 *
 * The map is redrawn often and asks each time it is drawn without the image, so a failure is not retried at
 * once: until its wait is over, asking again gets the same failure without a download. The wait doubles with
 * each failure in a row (30 s, 1 min, 2 min, up to 10 min). Each failure is logged once.
 */
export function loadImagery(url: string): Promise<string> {
  wanted = url;
  const known = loads.get(url);
  if (known && (known.retryAt === undefined || imageryClock.now() < known.retryAt)) return known.promise;
  const gen = generation;
  const load: Load = {
    promise: fetch(url)
      .then((r) => {
        if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error(`Satellite imagery could not be loaded (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        if (gen !== generation) throw new Error('Satellite imagery is no longer needed (signed out)');
        const local = URL.createObjectURL(blob);
        ready.set(url, local);
        failures.delete(url);
        keepOnly(wanted); // if the farm on screen changed while this downloaded, this one goes too
        return local;
      }),
  };
  loads.set(url, load);
  load.promise.catch((e) => {
    if (gen !== generation) return;
    const n = (failures.get(url) ?? 0) + 1;
    failures.set(url, n);
    const wait = Math.min(RETRY_FIRST_MS * 2 ** (n - 1), RETRY_MAX_MS);
    load.retryAt = imageryClock.now() + wait;
    console.warn(`${e instanceof Error ? e.message : e}; showing the drawn map, trying again in ${wait / 1000} s`);
  });
  return load.promise;
}

/** The downloaded image's local URL, or null if it has not arrived (yet). */
export const imageryIfReady = (url: string): string | null => ready.get(url) ?? null;

/** On sign-out: releases the downloaded images and drops any still downloading. */
export function forgetImagery() {
  generation++;
  keepOnly(null);
  loads.clear();
  failures.clear();
  wanted = null;
}
