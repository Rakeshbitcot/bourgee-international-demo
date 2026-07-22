import { Component } from '@theme/component';
import { formatMoney } from '@theme/money-formatting';

const STORAGE_KEY = 'bourgee:wishlist';

function writeWishlist(handles) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(handles));
  } catch (error) {
    // localStorage unavailable (private mode, quota, etc.) — fail silently.
  }
}

function readWishlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    // Earlier versions of this feature stored numeric product IDs instead of
    // handles — drop those so stale entries don't 404 against /products/{handle}.js.
    const handles = parsed.filter((entry) => typeof entry === 'string' && !/^\d+$/.test(entry));
    if (handles.length !== parsed.length) writeWishlist(handles);

    return handles;
  } catch (error) {
    return [];
  }
}

/**
 * @typedef {object} WishlistProduct
 * @property {string} handle
 * @property {string} title
 * @property {number} price
 * @property {string} [featured_image]
 * @property {string[]} [images]
 */

/**
 * Renders the wishlist grid on the dedicated wishlist page. Wishlist state has
 * no backend — this fetches each saved product handle from the storefront's
 * public `/products/{handle}.js` JSON endpoint (no auth required) so prices
 * and availability are always current, rather than trusting a stale snapshot.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} grid - The product grid list element.
 * @property {HTMLElement} emptyState - The empty-state message element.
 *
 * @extends {Component<Refs>}
 */
class WishlistPage extends Component {
  requiredRefs = ['grid', 'emptyState'];

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener('wishlist:change', this.onWishlistChange);
    this.renderGrid();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener('wishlist:change', this.onWishlistChange);
  }

  onWishlistChange = (event) => {
    const { productHandle, active } = event.detail;

    // `productHandle` is null for the event `renderGrid()` dispatches after
    // pruning an unresolvable handle — that cleanup already updated this
    // grid directly, so there's nothing else to do here.
    if (!productHandle) return;

    const existingItem = this.refs.grid.querySelector(`[data-product-handle="${CSS.escape(productHandle)}"]`);

    if (!active) {
      if (existingItem) {
        existingItem.remove();
        this.#toggleEmptyState();
      }
      return;
    }

    // Added elsewhere (e.g. the Recently Viewed grid below) — reflect it
    // here immediately instead of waiting for the next page load.
    if (existingItem) return;

    this.#fetchProduct(productHandle)
      .then((product) => {
        if (!product) return;
        this.refs.grid.append(this.#buildItem(product));
        this.#toggleEmptyState();
      })
      .catch((error) => {
        console.error(`[wishlist] Could not load product "${productHandle}" after adding it to the wishlist.`, error);
      });
  };

  async renderGrid() {
    const handles = readWishlist();

    if (handles.length === 0) {
      this.#toggleEmptyState();
      return;
    }

    const results = await Promise.allSettled(handles.map((handle) => this.#fetchProduct(handle)));

    /** @type {string[]} */
    const notFoundHandles = [];
    const fragment = document.createDocumentFragment();

    results.forEach((result, index) => {
      const handle = handles[index];

      if (result.status === 'rejected') {
        // Network error, non-2xx response other than 404, or a response that
        // wasn't valid JSON (e.g. a password-protected storefront redirecting
        // to the password page). Leave the handle in the wishlist and just
        // skip rendering it this time, since the failure may be transient.
        console.error(`[wishlist] Could not load product "${handle}" — leaving it in your wishlist.`, result.reason);
      } else if (result.value) {
        fragment.append(this.#buildItem(result.value));
      } else {
        // #fetchProduct returns null only for a confirmed 404 — the product
        // was deleted/unpublished, so it's safe to drop from the wishlist.
        notFoundHandles.push(handle);
      }
    });

    this.refs.grid.append(fragment);
    this.#toggleEmptyState();

    if (notFoundHandles.length > 0) {
      const remainingHandles = handles.filter((handle) => !notFoundHandles.includes(handle));
      writeWishlist(remainingHandles);

      // writeWishlist() doesn't notify other components in this tab (the
      // native `storage` event only fires in *other* tabs) — dispatch the
      // same event `wishlist-button.js` uses so the header badge count
      // corrects immediately instead of staying stale until the next reload.
      document.dispatchEvent(
        new CustomEvent('wishlist:change', {
          bubbles: true,
          detail: { productHandle: null, active: false, handles: remainingHandles },
        })
      );
    }
  }

  /**
   * @param {string} handle
   * @returns {Promise<WishlistProduct | null>} The product JSON, or `null` if
   *   the product was confirmed not to exist (HTTP 404). Any other failure
   *   throws, so the caller can tell "gone" apart from "temporarily unreachable".
   */
  async #fetchProduct(handle) {
    const response = await fetch(`/products/${handle}.js`);

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(`Unexpected HTTP ${response.status} fetching /products/${handle}.js`);
    }

    // Shopify serves this endpoint as `content-type: text/javascript` even
    // though the body is JSON — only reject if it looks like an HTML page
    // (e.g. a password-protected storefront redirecting to a login page).
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error(
        `/products/${handle}.js returned HTML instead of product data (content-type: "${contentType}") — the storefront may be password-protected or the request was redirected.`
      );
    }

    return response.json();
  }

  /**
   * @param {{
   *   handle: string,
   *   title: string,
   *   price: number,
   *   featured_image?: string,
   *   images?: string[],
   * }} product
   */
  #buildItem(product) {
    const productUrl = `/products/${product.handle}`;
    const moneyFormat = this.dataset.moneyFormat || '${{amount}}';
    const currency = this.dataset.currency || 'USD';
    const price = formatMoney(product.price, moneyFormat, currency);
    const image = product.featured_image || product.images?.[0] || '';

    const item = document.createElement('li');
    item.className = 'wishlist-page__item';
    item.dataset.productHandle = product.handle;

    const media = document.createElement('a');
    media.href = productUrl;
    media.className = 'wishlist-page__item-media';

    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = product.title;
      img.loading = 'lazy';
      img.width = 500;
      img.height = 500;
      media.append(img);
    }

    const title = document.createElement('a');
    title.href = productUrl;
    title.className = 'wishlist-page__item-title';
    title.textContent = product.title;

    const priceEl = document.createElement('span');
    priceEl.className = 'wishlist-page__item-price';
    priceEl.textContent = price;

    const wishlistButton = document.createElement('wishlist-button');
    wishlistButton.className = 'wishlist-button';
    wishlistButton.dataset.productHandle = product.handle;
    wishlistButton.dataset.addLabel = this.dataset.addLabel || '';
    wishlistButton.dataset.removeLabel = this.dataset.removeLabel || '';
    wishlistButton.innerHTML = `
      <button type="button" class="wishlist-button__toggle" aria-pressed="true">
        <svg class="wishlist-button__icon" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 5.2393L8.5149 3.77392C6.79996 2.08174 4.01945 2.08174 2.30451 3.77392C0.589562 5.4661 0.589563 8.2097 2.30451 9.90188L10 17.4952L17.6955 9.90188C19.4104 8.2097 19.4104 5.4661 17.6955 3.77392C15.9805 2.08174 13.2 2.08174 11.4851 3.77392L10 5.2393ZM10.765 3.06343C12.8777 0.978857 16.3029 0.978856 18.4155 3.06343C20.5282 5.148 20.5282 8.52779 18.4155 10.6124L10.72 18.2057C10.3224 18.5981 9.67763 18.5981 9.27996 18.2057L1.58446 10.6124C-0.528154 8.52779 -0.528154 5.14801 1.58446 3.06343C3.69708 0.978859 7.12233 0.978858 9.23495 3.06343L10 3.81832L10.765 3.06343Z" />
        </svg>
      </button>
    `;

    const viewButton = document.createElement('a');
    viewButton.href = productUrl;
    viewButton.className = 'wishlist-page__view-button';
    viewButton.setAttribute(
      'aria-label',
      (this.dataset.viewLabelTemplate || 'View __PRODUCT_NAME__').replace('__PRODUCT_NAME__', product.title)
    );
    viewButton.innerHTML = `
      <svg class="wishlist-page__view-icon" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20">
        <path d="M9.5235 4.79973C6.76257 4.92905 4.08307 6.62063 1.1722 9.66543C0.993412 9.85244 0.993412 10.1474 1.1722 10.3344C4.08307 13.3793 6.76258 15.0709 9.52351 15.2003C12.2733 15.3291 15.2667 13.9138 18.8217 10.3399C19.0086 10.152 19.0086 9.84814 18.8217 9.6602C15.2667 6.0863 12.2733 4.67093 9.5235 4.79973ZM9.47509 3.7592C12.6521 3.61039 15.9149 5.26347 19.5564 8.92433C20.1479 9.5189 20.1479 10.4812 19.5564 11.0758C15.9149 14.7366 12.6521 16.3897 9.47508 16.2408C6.30917 16.0924 3.3912 14.1603 0.42305 11.0555C-0.141017 10.4655 -0.141017 9.53435 0.423051 8.94433C3.3912 5.8396 6.30918 3.90749 9.47509 3.7592Z" />
        <path d="M13.5807 10.0002C13.5807 11.9741 11.9742 13.5586 10.012 13.5586C8.04979 13.5586 6.44327 11.9741 6.44327 10.0002C6.44327 8.02617 8.04979 6.44176 10.012 6.44176C11.9742 6.44176 13.5807 8.02617 13.5807 10.0002ZM10.012 12.5169C11.4096 12.5169 12.5426 11.3901 12.5426 10.0002C12.5426 8.6102 11.4096 7.48342 10.012 7.48342C8.61438 7.48342 7.48138 8.6102 7.48138 10.0002C7.48138 11.3901 8.61438 12.5169 10.012 12.5169Z" />
      </svg>
    `;

    item.append(media, title, priceEl, wishlistButton, viewButton);

    return item;
  }

  #toggleEmptyState() {
    const isEmpty = this.refs.grid.children.length === 0;
    this.refs.emptyState.classList.toggle('hidden', !isEmpty);
  }
}

if (!customElements.get('wishlist-page')) {
  customElements.define('wishlist-page', WishlistPage);
}
