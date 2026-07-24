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
    // handles — drop those so stale entries don't linger as "wishlisted" but
    // unresolvable.
    const handles = parsed.filter((entry) => typeof entry === 'string' && !/^\d+$/.test(entry));
    if (handles.length !== parsed.length) writeWishlist(handles);

    return handles;
  } catch (error) {
    return [];
  }
}

class WishlistButton extends HTMLElement {
  connectedCallback() {
    this.productHandle = this.dataset.productHandle;
    this.button = this.querySelector('button');

    if (!this.button || !this.productHandle) return;

    this.render();
    this.button.addEventListener('click', this.handleClick.bind(this));
  }

  isActive() {
    return readWishlist().includes(this.productHandle);
  }

  handleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const handles = readWishlist();
    const index = handles.indexOf(this.productHandle);
    const nowActive = index === -1;

    if (nowActive) {
      handles.push(this.productHandle);
    } else {
      handles.splice(index, 1);
    }

    writeWishlist(handles);
    this.render();

    document.dispatchEvent(
      new CustomEvent('wishlist:change', {
        bubbles: true,
        detail: { productHandle: this.productHandle, active: nowActive, handles },
      })
    );
  }

  render() {
    const active = this.isActive();
    this.setAttribute('data-active', active ? 'true' : 'false');
    this.button.setAttribute('aria-pressed', active ? 'true' : 'false');
    this.button.setAttribute(
      'aria-label',
      active ? this.dataset.removeLabel || 'Remove from wishlist' : this.dataset.addLabel || 'Add to wishlist'
    );
  }
}

if (!customElements.get('wishlist-button')) {
  customElements.define('wishlist-button', WishlistButton);
}
