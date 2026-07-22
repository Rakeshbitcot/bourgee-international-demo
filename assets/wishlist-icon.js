import { Component } from '@theme/component';

const STORAGE_KEY = 'bourgee:wishlist';

function readWishlistCount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return 0;

    // Earlier versions of this feature stored numeric product IDs instead of
    // handles — drop those so the badge doesn't count stale, unresolvable entries.
    const handles = parsed.filter((entry) => typeof entry === 'string' && !/^\d+$/.test(entry));
    if (handles.length !== parsed.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(handles));
      } catch (error) {
        // localStorage unavailable (private mode, quota, etc.) — fail silently.
      }
    }

    return handles.length;
  } catch (error) {
    return 0;
  }
}

/**
 * Displays a header link to the wishlist page with a live item-count badge.
 * Wishlist state lives entirely in localStorage (no backend), so the badge is
 * kept in sync via the `wishlist:change` event dispatched by `wishlist-button.js`,
 * plus the native `storage` event for updates made in other tabs.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} wishlistBubble - The badge container element.
 * @property {HTMLElement} wishlistBubbleCount - The badge count text element.
 *
 * @extends {Component<Refs>}
 */
class WishlistIcon extends Component {
  requiredRefs = ['wishlistBubble', 'wishlistBubbleCount'];

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener('wishlist:change', this.onWishlistChange);
    window.addEventListener('storage', this.onStorage);
    this.renderCount(readWishlistCount());
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener('wishlist:change', this.onWishlistChange);
    window.removeEventListener('storage', this.onStorage);
  }

  onWishlistChange = (event) => {
    this.renderCount(event.detail.handles.length);
  };

  onStorage = (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    this.renderCount(readWishlistCount());
  };

  /**
   * @param {number} count
   */
  renderCount = (count) => {
    this.refs.wishlistBubble.classList.toggle('hidden', count === 0);
    this.refs.wishlistBubbleCount.textContent = count < 100 ? String(count) : '99+';
  };
}

if (!customElements.get('wishlist-icon')) {
  customElements.define('wishlist-icon', WishlistIcon);
}
