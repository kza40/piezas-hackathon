// Ground geometry for the farm map. The 2D map and the 3D scene share one scale, so the satellite imagery,
// the fields drawn from their real boundary and the scale bar all agree.

export type LngLat = [number, number];

/** Metres of ground per map unit, in both views: the 2D viewBox is 800×520 units and the 3D scene uses the same units. */
export const M_PER_UNIT = 2.5;
/** Where the farm pin sits on the map, in map units: the middle of the 2D view, the origin of the 3D scene. */
export const PIN_XY: [number, number] = [400, 260];

const M_PER_DEG_LAT = 111_320;
const EARTH_R = 6_378_137; // the Web Mercator sphere (EPSG:3857)
const rad = (deg: number) => (deg * Math.PI) / 180;

export function hasBoundary(b: LngLat[] | null | undefined): b is LngLat[] {
  return Array.isArray(b) && b.length >= 3;
}

/**
 * A point's place on the map, in map units, with the farm pin at PIN_XY and north up. Flat ground around the
 * pin: off by well under a metre across the few kilometres the map shows.
 */
export function toMapXY([lng, lat]: LngLat, pin: LngLat): [number, number] {
  const east = (lng - pin[0]) * M_PER_DEG_LAT * Math.cos(rad(pin[1]));
  const north = (lat - pin[1]) * M_PER_DEG_LAT;
  return [PIN_XY[0] + east / M_PER_UNIT, PIN_XY[1] - north / M_PER_UNIT];
}

/**
 * The Web Mercator box (xmin, ymin, xmax, ymax) holding a stretch of ground widthM × heightM metres centred on a
 * point. Mercator stretches ground by 1/cos(latitude) in both directions, so the box is that much larger, and an
 * image of it is undistorted: its pixels are square on the ground.
 */
export function mercatorBBox([lng, lat]: LngLat, widthM: number, heightM: number): [number, number, number, number] {
  const x = EARTH_R * rad(lng);
  const y = EARTH_R * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
  const stretch = 1 / Math.cos(rad(lat));
  const hw = (widthM / 2) * stretch;
  const hh = (heightM / 2) * stretch;
  return [x - hw, y - hh, x + hw, y + hh];
}

/** Esri World Imagery for a Web Mercator box, as a JPEG of the given pixel size. No key needed; credit IMAGERY_CREDIT. */
export function esriImageryUrl(bbox: [number, number, number, number], [w, h]: [number, number]): string {
  return (
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
    `?bbox=${bbox.map((v) => v.toFixed(1)).join(',')}&bboxSR=3857&imageSR=3857&size=${w},${h}&format=jpg&f=image`
  );
}

/** The attribution Esri requires wherever World Imagery is shown. */
export const IMAGERY_CREDIT = 'Esri, Maxar, Earthstar Geographics, and the GIS User Community';
