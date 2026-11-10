export type LngLat = [number, number];
const M_PER_DEG_LAT = 111_320;

export function hasBoundary(b: LngLat[] | null | undefined): b is LngLat[] {
  return Array.isArray(b) && b.length >= 3;
}

export function toLocalMeters(lng: number, lat: number, originLng: number, originLat: number): [number, number] {
  const x = (lng - originLng) * M_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180);
  const y = (lat - originLat) * M_PER_DEG_LAT;
  return [x, y];
}

export function ringToLocal(ring: LngLat[], originLng: number, originLat: number): [number, number][] {
  return ring.map(([lng, lat]) => toLocalMeters(lng, lat, originLng, originLat));
}

export function fitToView(points: [number, number][], viewW: number, viewH: number, pad = 40) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const scale = Math.min((viewW - pad * 2) / w, (viewH - pad * 2) / h);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const pts = points.map(([x, y]) => [viewW / 2 + (x - cx) * scale, viewH / 2 - (y - cy) * scale] as [number, number]);
  return { pts, scale };
}

export type LngLatBBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export function ringsBBox(rings: LngLat[][], padFrac = 0.2): LngLatBBox {
  const pts = rings.flat();
  let minLng = pts[0][0], maxLng = pts[0][0], minLat = pts[0][1], maxLat = pts[0][1];
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const padLng = Math.max((maxLng - minLng) * padFrac, 0.0015);
  const padLat = Math.max((maxLat - minLat) * padFrac, 0.0015);
  return { minLng: minLng - padLng, maxLng: maxLng + padLng, minLat: minLat - padLat, maxLat: maxLat + padLat };
}

/** Same bbox → SVG so an imagery image lines up with polygons. */
export function projectLngLat(lng: number, lat: number, b: LngLatBBox, viewW: number, viewH: number): [number, number] {
  const x = ((lng - b.minLng) / (b.maxLng - b.minLng)) * viewW;
  const y = ((b.maxLat - lat) / (b.maxLat - b.minLat)) * viewH;
  return [x, y];
}

/** Free Esri World Imagery export (no API key). Attribution: Esri. */
export function esriImageryUrl(b: LngLatBBox, viewW: number, viewH: number): string {
  const size = `${Math.round(viewW)},${Math.round(viewH)}`;
  const bbox = `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;
  return (
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
    `?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${size}&format=jpg&f=image`
  );
}

