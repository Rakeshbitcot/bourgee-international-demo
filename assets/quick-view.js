import { morph } from '@theme/morph';
import { Component } from '@theme/component';
import { DialogComponent } from '@theme/dialog';

/**
 * Quick View trigger — opens a lightweight, read-only preview of a product in
 * the shared `#quick-view-dialog`. Mirrors the fetch + cache + morph pattern
 * used by `assets/quick-add.js`, under its own component/dialog ids so both
 * can coexist on the same page without colliding. Deliberately does not sync
 * variant selection back to the product card (unlike quick-add) — Quick View
 * is a preview, not a variant picker for the card's own swatches.
 */
export class QuickViewComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;
  /** @type {Map<string, Element>} */
  #cachedContent = new Map();

  get productPageUrl() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    const productLink = productCard?.getProductCardLink();

    if (!productLink?.href) return '';

    const url = new URL(productLink.href);

    if (url.searchParams.has('variant')) return url.toString();

    const selectedVariantId = productCard?.getSelectedVariantId();
    if (selectedVariantId) {
      url.searchParams.set('variant', selectedVariantId);
    }

    return url.toString();
  }

  /**
   * @param {Event} event
   */
  handleClick = async (event) => {
    event.preventDefault();

    const currentUrl = this.productPageUrl;
    if (!currentUrl) return;

    let content = this.#cachedContent.get(currentUrl);

    if (!content) {
      const html = await this.#fetchProductPage(currentUrl);
      if (html) {
        const gridElement = html.querySelector('[data-product-grid-content]');
        if (gridElement) {
          content = /** @type {Element} */ (gridElement.cloneNode(true));
          this.#cachedContent.set(currentUrl, content);
        }
      }
    }

    if (!content) return;

    const freshContent = /** @type {Element} */ (content.cloneNode(true));
    this.#updateQuickViewModal(freshContent, currentUrl);
    this.#openQuickViewModal();
  };

  /**
   * @param {string} productPageUrl
   * @returns {Promise<Document | null>}
   */
  async #fetchProductPage(productPageUrl) {
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      const response = await fetch(productPageUrl, {
        signal: this.#abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch product page: HTTP error ${response.status}`);
      }

      const responseText = await response.text();
      return new DOMParser().parseFromString(responseText, 'text/html');
    } catch (error) {
      if (error.name === 'AbortError') {
        return null;
      } else {
        throw error;
      }
    } finally {
      this.#abortController = null;
    }
  }

  /**
   * @param {Element} content
   * @param {string} productPageUrl
   */
  #updateQuickViewModal(content, productPageUrl) {
    const modalContent = document.getElementById('quick-view-modal-content');
    if (!modalContent) return;

    morph(modalContent, content);

    const dialogComponent = document.getElementById('quick-view-dialog');
    const link =
      dialogComponent instanceof QuickViewDialog ? dialogComponent.refs.viewFullDetailsLink : undefined;

    if (link instanceof HTMLAnchorElement) {
      link.href = productPageUrl;
    }
  }

  #openQuickViewModal = () => {
    const dialogComponent = document.getElementById('quick-view-dialog');
    if (!(dialogComponent instanceof QuickViewDialog)) return;

    dialogComponent.showDialog();
  };
}

if (!customElements.get('quick-view-trigger')) {
  customElements.define('quick-view-trigger', QuickViewComponent);
}

/**
 * @typedef {object} QuickViewDialogRefs
 * @property {HTMLAnchorElement} [viewFullDetailsLink]
 */

/**
 * @extends {DialogComponent<QuickViewDialogRefs>}
 */
class QuickViewDialog extends DialogComponent {}

if (!customElements.get('quick-view-dialog')) {
  customElements.define('quick-view-dialog', QuickViewDialog);
}
