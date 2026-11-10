import { satUrl2d } from '../satCache';
import { S } from '../state';

export function satMapBackdrop(viewW: number, viewH: number): string | null {
  if (S.farmLat == null || S.farmLng == null) return null;
  const img = satUrl2d();
  if (!img) return null;
  const scale = 3;
  const w = viewW * scale;
  const h = viewH * scale;
  const x = (viewW - w) / 2;
  const y = (viewH - h) / 2;
  return (
    `<image href="${img}" xlink:href="${img}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" />` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1b2229" fill-opacity="0.08"/>` +
    `<text x="12" y="${viewH - 10}" font-size="10" fill="#fff" fill-opacity="0.9">Imagery (c) Esri</text>`
  );
}
