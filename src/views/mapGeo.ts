import { IMAGERY_CREDIT, PIN_XY } from '../geo';
import { farmImageryUrl, imageryIfReady, loadImagery, SAT_H, SAT_W } from '../satCache';
import { esc } from '../ui/helpers';

/**
 * The satellite image for the 2D map, centred on the farm pin, or '' without a farm location. It is drawn over
 * the sketched landscape, which shows until the image has arrived, and for good if it never does. Drawing the
 * map starts the download; when it lands, the image is put into the map as drawn, without a redraw.
 */
export function satMapBackdrop(): string {
  const url = farmImageryUrl();
  if (!url) return '';
  const local = imageryIfReady(url);
  if (!local) {
    loadImagery(url).then(
      (src) => {
        const img = document.getElementById('sat');
        if (img?.dataset.for !== url) return; // the map now shows another farm, or none
        img.setAttribute('href', src);
        img.removeAttribute('visibility');
        revealImageryCredit();
      },
      () => {}, // logged once by loadImagery; the drawn map stays
    );
  }
  const x = PIN_XY[0] - SAT_W / 2;
  const y = PIN_XY[1] - SAT_H / 2;
  return `<image id=sat data-for="${esc(url)}" href="${local ?? ''}"${local ? '' : ' visibility="hidden"'} x="${x}" y="${y}" width="${SAT_W}" height="${SAT_H}" preserveAspectRatio="none" data-testid="satellite-image"/>`;
}

/** The imagery credit, fixed in a corner of the map in both views; hidden until the imagery is on it. */
export function satCredit(): string {
  const url = farmImageryUrl();
  if (!url) return '';
  return `<div class=mcredit data-testid=imagery-credit${imageryIfReady(url) ? '' : ' hidden'}>Imagery: ${esc(IMAGERY_CREDIT)}</div>`;
}

/** Shows the credit once the imagery has been put on the map (without a redraw). */
export function revealImageryCredit() {
  document.querySelector('[data-testid=imagery-credit]')?.removeAttribute('hidden');
}
