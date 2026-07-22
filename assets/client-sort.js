import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

/**
 * Client-side sort for Color / Size / Availability.
 *
 * Reorders the already-rendered `<li ref="cards[]">` product cards in the
 * browser using the `data-sort-color` / `data-sort-size` / `data-sort-available`
 * attributes rendered server-side on each card (see `sections/main-collection.liquid`).
 *
 * Deliberately independent from `assets/facets.js` — never builds a request or
 * touches the native filter/sort form. Resets to "Featured" whenever a native
 * filter/sort change fires (`ThemeEvents.FilterUpdate`), and re-applies itself
 * after the grid is replaced by the native ajax re-render (via MutationObserver),
 * reordering existing nodes only (never cloning/regenerating them).
 */
export class ClientSortComponent extends Component {
  /** @type {MutationObserver | null} */
  #observer = null;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
    this.#observeGrid();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
    this.#observer?.disconnect();
  }

  /**
   * @returns {HTMLElement | null}
   */
  #getGrid() {
    return /** @type {HTMLElement | null} */ (
      this.closest('results-list')?.querySelector(':scope [ref="grid"]') ??
        document.querySelector('#ResultsList [ref="grid"]')
    );
  }

  #observeGrid() {
    const grid = this.#getGrid();
    if (!grid) return;

    this.#observer?.disconnect();
    this.#observer = new MutationObserver(() => {
      const select = this.querySelector('select');
      if (select instanceof HTMLSelectElement && select.value) {
        this.#applySort(select.value);
      }
    });
    this.#observer.observe(grid, { childList: true });
  }

  #handleFilterUpdate = () => {
    const select = this.querySelector('select');
    if (select instanceof HTMLSelectElement) select.value = '';
  };

  /**
   * @param {Event} event
   */
  handleChange(event) {
    const { target } = event;
    if (!(target instanceof HTMLSelectElement)) return;
    this.#applySort(target.value);
  }

  /**
   * @param {string} value - e.g. 'color-asc', 'size-desc', 'available-desc'
   */
  #applySort(value) {
    if (!value) return;

    const grid = this.#getGrid();
    if (!grid) return;

    const [key, direction] = value.split('-');
    const attribute = `data-sort-${key}`;
    const cards = Array.from(grid.querySelectorAll(':scope > [ref="cards[]"]'));

    cards.sort((a, b) => {
      const aValue = a.getAttribute(attribute) ?? '';
      const bValue = b.getAttribute(attribute) ?? '';
      const comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
      return direction === 'desc' ? -comparison : comparison;
    });

    for (const card of cards) {
      grid.append(card);
    }
  }
}

if (!customElements.get('client-sort-component')) {
  customElements.define('client-sort-component', ClientSortComponent);
}
