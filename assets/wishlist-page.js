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
    const item = this.refs.grid.querySelector(`[data-product-handle="${CSS.escape(event.detail.productHandle)}"]`);
    if (item && !event.detail.active) {
      item.remove();
      this.#toggleEmptyState();
    }
  };

  async renderGrid() {
    const handles = readWishlist();

    if (handles.length === 0) {
      this.#toggleEmptyState();
      return;
    }

    const results = await Promise.allSettled(handles.map((handle) => this.#fetchProduct(handle)));

    const notFoundHandles = [];
    const fragment = document.createDocumentFragment();

    results.forEach((result, index) => {
      const handle = handles[index];

      if (result.status === 'fulfilled' && result.value) {
        fragment.append(this.#buildItem(result.value));
      } else if (result.status === 'fulfilled' && result.value === null) {
        // #fetchProduct returns null only for a confirmed 404 — the product
        // was deleted/unpublished, so it's safe to drop from the wishlist.
        notFoundHandles.push(handle);
      } else {
        // Network error, non-2xx response other than 404, or a response that
        // wasn't valid JSON (e.g. a password-protected storefront redirecting
        // to the password page). Leave the handle in the wishlist and just
        // skip rendering it this time, since the failure may be transient.
        console.error(`[wishlist] Could not load product "${handle}" — leaving it in your wishlist.`, result.reason);
      }
    });

    this.refs.grid.append(fragment);
    this.#toggleEmptyState();

    if (notFoundHandles.length > 0) {
      writeWishlist(handles.filter((handle) => !notFoundHandles.includes(handle)));
    }
  }

  /**
   * @param {string} handle
   * @returns {Promise<object | null>} The product JSON, or `null` if the
   *   product was confirmed not to exist (HTTP 404). Any other failure throws,
   *   so the caller can tell "gone" apart from "temporarily unreachable".
   */
  async #fetchProduct(handle) {
    const response = await fetch(`/products/${handle}.js`);

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(`Unexpected HTTP ${response.status} fetching /products/${handle}.js`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        `/products/${handle}.js did not return JSON (content-type: "${contentType}") — the storefront may be password-protected or the request was redirected.`
      );
    }

    return response.json();
  }

  /**
   * @param {object} product
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

    item.append(media, title, priceEl, wishlistButton);

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
