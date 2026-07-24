class ShareButton extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('.share-button__toggle');
    this.label = this.button?.querySelector('.product-action-link__text');

    if (!this.button) return;

    this.button.addEventListener('click', this.handleClick.bind(this));
  }

  async handleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const url = this.dataset.url;
    const title = this.dataset.title;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        // User cancelled the share sheet or it failed — nothing to do.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.showCopiedFeedback();
    } catch (error) {
      // Clipboard API unavailable — fail silently.
    }
  }

  showCopiedFeedback() {
    if (!this.label) return;

    const originalText = this.label.textContent;
    this.label.textContent = this.dataset.copiedLabel || 'Link copied';

    clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.label.textContent = originalText;
    }, 2000);
  }
}

if (!customElements.get('share-button')) {
  customElements.define('share-button', ShareButton);
}
