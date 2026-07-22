import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartAddEvent, CartErrorEvent } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

/**
 * Lets a shopper add the current product plus any checked companion products
 * to the cart in a single request.
 *
 * @typedef {object} FrequentlyBoughtTogetherRefs
 * @property {HTMLButtonElement} addButton
 * @property {HTMLElement} totalPrice
 * @property {HTMLElement} [liveRegion]
 *
 * @extends {Component<FrequentlyBoughtTogetherRefs>}
 */
class FrequentlyBoughtTogetherComponent extends Component {
  requiredRefs = ['addButton', 'totalPrice'];

  connectedCallback() {
    super.connectedCallback();
    this.#updateTotal();
  }

  handleToggle() {
    this.#updateTotal();
  }

  /** @returns {HTMLInputElement[]} */
  #checkboxes() {
    return Array.from(this.querySelectorAll('input[type="checkbox"][data-price]'));
  }

  #updateTotal() {
    const checked = this.#checkboxes().filter((checkbox) => checkbox.checked);
    const totalMinorUnits = checked.reduce((sum, checkbox) => sum + Number(checkbox.dataset.price || 0), 0);

    this.refs.totalPrice.textContent = formatMoney(
      totalMinorUnits,
      this.dataset.moneyFormat || '{{amount}}',
      this.dataset.currency || ''
    );
    this.refs.addButton.disabled = checked.length === 0;
  }

  addSelectedToCart() {
    const items = this.#checkboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => ({ id: Number(checkbox.dataset.variantId), quantity: 1 }));

    if (items.length === 0) return;

    this.refs.addButton.disabled = true;

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionIds = [];
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) sectionIds.push(item.dataset.sectionId);
    });

    const body = JSON.stringify({ items, sections: sectionIds.join(',') });

    fetch(Theme.routes.cart_add_url, fetchConfig('json', { body }))
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.dispatchEvent(new CartErrorEvent(this.id, response.message, response.description, response.errors));

          if (this.refs.liveRegion) this.refs.liveRegion.textContent = response.message;
          return;
        }

        if (this.refs.liveRegion) this.refs.liveRegion.textContent = Theme.translations.added;

        const cart = await fetch('/cart.js').then((r) => r.json());

        this.dispatchEvent(
          new CartAddEvent(cart, this.id, {
            source: 'frequently-bought-together',
            itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
            sections: response.sections,
          })
        );
      })
      .catch((error) => console.error(error))
      .finally(() => {
        this.refs.addButton.disabled = false;
      });
  }
}

if (!customElements.get('frequently-bought-together')) {
  customElements.define('frequently-bought-together', FrequentlyBoughtTogetherComponent);
}
