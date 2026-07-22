/**
 * Desktop hover-zoom for the product media gallery.
 *
 * Adds a cursor-follow magnify effect to the main product image (mouse + fine
 * pointer only — touch devices keep the existing tap-to-open zoom-dialog
 * lightbox). Reuses the `data-max-resolution` source already rendered by
 * snippets/product-media.liquid for the click-to-zoom dialog, so no markup
 * changes are required upstream.
 */

const ZOOM_SCALE = 2.2;
const SELECTOR = '.product-media-container--image.product-media-container--zoomable';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function attach(container) {
  if (container.dataset.hoverZoomInit) return;
  if (container.closest('.dialog-zoomed-gallery')) return;

  const image = container.querySelector('img.product-media__image[data-max-resolution]');
  const media = container.querySelector('.product-media');
  if (!image || !media) return;

  container.dataset.hoverZoomInit = 'true';
  media.style.position = 'relative';
  media.style.overflow = 'hidden';

  const pane = document.createElement('div');
  pane.className = 'hover-zoom-pane';
  pane.style.backgroundImage = `url("${image.dataset.maxResolution}")`;
  pane.setAttribute('aria-hidden', 'true');
  media.appendChild(pane);

  let rafId = null;
  let lastEvent = null;

  function update() {
    rafId = null;
    if (!lastEvent) return;
    const rect = media.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const pctX = clamp((lastEvent.clientX - rect.left) / rect.width, 0, 1) * 100;
    const pctY = clamp((lastEvent.clientY - rect.top) / rect.height, 0, 1) * 100;
    pane.style.transformOrigin = `${pctX}% ${pctY}%`;
    pane.style.transform = `scale(${ZOOM_SCALE})`;
  }

  function queueUpdate(event) {
    lastEvent = event;
    if (rafId === null) rafId = requestAnimationFrame(update);
  }

  container.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    container.classList.add('hover-zoom-active');
    queueUpdate(event);
  });

  container.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (!container.classList.contains('hover-zoom-active')) return;
    queueUpdate(event);
  });

  container.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    container.classList.remove('hover-zoom-active');
    lastEvent = null;
  });
}

function scan() {
  document.querySelectorAll(SELECTOR).forEach(attach);
}

function init() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  scan();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        scan();
        break;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
