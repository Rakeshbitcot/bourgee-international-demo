import { Component } from '@theme/component';
import { sectionRenderer } from '@theme/section-renderer';
import { RecentlyViewed } from '@theme/recently-viewed-products';

/**
 * Renders the "Recently Viewed" grid on the wishlist page.
 * `viewedProducts` (see `assets/recently-viewed-products.js`) only stores
 * numeric product IDs, and the storefront has no public "get product by id"
 * JSON endpoint — so this resolves the IDs into full product cards by
 * re-requesting the wishlist section through the Section Rendering API with
 * a `?q=id:1 OR id:2` search query. Shopify's native search resolves the IDs
 * into real products server-side, and the section skips any id it can't
 * find (deleted/unavailable products).
 *
 * The fetched response also contains a fresh (empty) copy of the unrelated
 * wishlist grid above, since it's the same section — only the recently
 * viewed grid/empty-state markup is extracted and copied in, so the
 * client-rendered wishlist grid is never touched.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} grid - The product grid list element.
 * @property {HTMLElement} emptyState - The empty-state message element.
 *
 * @extends {Component<Refs>}
 */
class WishlistRecentlyViewed extends Component {
  requiredRefs = ['grid', 'emptyState'];

  connectedCallback() {
    super.connectedCallback();
    this.#render();
  }

  async #render() {
    const productIds = RecentlyViewed.getProducts();

    if (productIds.length === 0) {
      this.refs.emptyState.classList.remove('hidden');
      return;
    }

    const sectionId = this.dataset.sectionId;
    if (!sectionId) return;

    const url = new URL(Theme.routes.search_url, location.origin);
    url.searchParams.set('q', productIds.map((id) => `id:${id}`).join(' OR '));
    url.searchParams.set('resources[type]', 'product');

    try {
      const html = await sectionRenderer.getSectionHTML(sectionId, false, url);
      const fragment = new DOMParser().parseFromString(html, 'text/html');
      const freshGrid = fragment.querySelector('wishlist-recently-viewed [ref="grid"]');
      const freshEmptyState = fragment.querySelector('wishlist-recently-viewed [ref="emptyState"]');

      if (freshGrid) this.refs.grid.replaceChildren(...freshGrid.children);
      if (freshEmptyState) this.refs.emptyState.classList.toggle('hidden', freshEmptyState.classList.contains('hidden'));
    } catch (error) {
      console.error('[wishlist] Could not load recently viewed products.', error);
    }
  }
}

if (!customElements.get('wishlist-recently-viewed')) {
  customElements.define('wishlist-recently-viewed', WishlistRecentlyViewed);
}
