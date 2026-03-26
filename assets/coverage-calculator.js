if (!customElements.get('coverage-calculator')) {
  class CoverageCalculator extends HTMLElement {
    constructor() {
      super();
      this.panelAreaSqm = parseFloat(this.dataset.panelArea) || 0.5;
      this.adhesivePerTube = parseInt(this.dataset.adhesivePerTube, 10) || 5;
      this.wasteFactor = (parseFloat(this.dataset.wasteFactor) || 10) / 100;
      this.productId = this.dataset.productId;
      this.productPrice = parseInt(this.dataset.productPrice, 10) || 0;
      this.currency = this.dataset.currency || '$';
      this.unit = 'ft';

      /* Parse variants for pack detection */
      this.variants = [];
      try { this.variants = JSON.parse(this.dataset.variants || '[]'); } catch (e) { /* ignore */ }
      this.packSize = 1;
      this._detectPack(this.productId);

      this.widthInput = this.querySelector('input[id^="calc-width"]');
      this.heightInput = this.querySelector('input[id^="calc-height"]');
      this.resultEl = this.querySelector('.coverage-calc__result');
      this.panelsEl = this.querySelector('.coverage-calc__panels-needed');
      this.panelsLabelEl = this.querySelector('.coverage-calc__panels-label');
      this.costEl = this.querySelector('.coverage-calc__cost');
      this.adhesiveEl = this.querySelector('.coverage-calc__adhesive');
      this.addBtn = this.querySelector('.coverage-calc__add-btn');
      this.addQtyEl = this.querySelector('.add-qty');
      this.unitLabels = this.querySelectorAll('.unit-label');
      this.unitBtns = this.querySelectorAll('.coverage-calc__unit-btn');
    }

    connectedCallback() {
      this.widthInput.addEventListener('input', () => this.calculate());
      this.heightInput.addEventListener('input', () => this.calculate());
      this.addBtn.addEventListener('click', () => this.addToCart());

      this.unitBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.unit = btn.dataset.unit;
          this.unitBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.unitLabels.forEach(l => { l.textContent = this.unit; });
          this.calculate();
        });
      });

      /* Listen for variant changes from the product form */
      document.addEventListener('variant:changed', (e) => this._onVariantChange(e));
      /* Also listen for Shopify's native variant change event (Be Yours / Dawn) */
      document.addEventListener('change', (e) => {
        if (e.target && e.target.name === 'id' && e.target.closest('[data-section-id]')) {
          this._onNativeVariantChange(e.target.value);
        }
      });
    }

    _detectPack(variantId) {
      const id = parseInt(variantId, 10);
      const variant = this.variants.find(v => v.id === id);
      if (!variant) { this.packSize = 1; return; }

      const title = variant.title.toLowerCase();
      /* Match "pack of 2", "pack of 9", "2-pack", "9 pack", etc. */
      const match = title.match(/pack\s*(?:of\s*)?(\d+)|(\d+)\s*-?\s*pack/i);
      this.packSize = match ? parseInt(match[1] || match[2], 10) : 1;
      this.productId = String(variant.id);
      this.productPrice = variant.price;
    }

    _onVariantChange(e) {
      const variant = e.detail && e.detail.variant;
      if (!variant) return;
      this._detectPack(variant.id);
      this.calculate();
    }

    _onNativeVariantChange(variantId) {
      this._detectPack(variantId);
      this.calculate();
    }

    calculate() {
      let width = parseFloat(this.widthInput.value);
      let height = parseFloat(this.heightInput.value);
      if (!width || !height || width <= 0 || height <= 0) {
        this.resultEl.classList.remove('visible');
        return;
      }

      // Convert to meters
      if (this.unit === 'ft') {
        width *= 0.3048;
        height *= 0.3048;
      }

      // Total panels needed (individual)
      const wallAreaSqm = width * height;
      const panelsRaw = wallAreaSqm / this.panelAreaSqm;
      const panelsWithWaste = panelsRaw * (1 + this.wasteFactor);
      const panelsNeeded = Math.ceil(panelsWithWaste);

      // If pack variant, calculate packs needed
      let qtyToAdd, qtyLabel, totalPanels;
      if (this.packSize > 1) {
        qtyToAdd = Math.ceil(panelsNeeded / this.packSize);
        totalPanels = qtyToAdd * this.packSize;
        qtyLabel = qtyToAdd + ' pack' + (qtyToAdd !== 1 ? 's' : '') + ' of ' + this.packSize + ' (' + totalPanels + ' panels)';
      } else {
        qtyToAdd = panelsNeeded;
        totalPanels = panelsNeeded;
        qtyLabel = 'panels needed';
      }

      // Adhesive
      const adhesiveTubes = Math.ceil(totalPanels / this.adhesivePerTube);

      // Cost: qtyToAdd × variant price (pack price already includes pack)
      const totalCost = (qtyToAdd * this.productPrice) / 100;

      this.panelsEl.textContent = this.packSize > 1 ? qtyToAdd : panelsNeeded;
      if (this.panelsLabelEl) this.panelsLabelEl.textContent = qtyLabel;
      this.addQtyEl.textContent = qtyToAdd;
      this.costEl.textContent = 'Estimated cost: ' + this.currency + totalCost.toFixed(2);
      this.adhesiveEl.textContent = 'Construction adhesive needed: ~' + adhesiveTubes + ' tube' + (adhesiveTubes !== 1 ? 's' : '');

      // Update button text
      if (this.packSize > 1) {
        this.addBtn.innerHTML = 'Add <span class="add-qty">' + qtyToAdd + '</span> Pack' + (qtyToAdd !== 1 ? 's' : '') + ' to Cart';
      } else {
        this.addBtn.innerHTML = 'Add <span class="add-qty">' + qtyToAdd + '</span> Panels to Cart';
      }
      this.addQtyEl = this.querySelector('.add-qty');

      this.resultEl.classList.add('visible');
      this._qtyToAdd = qtyToAdd;
    }

    addToCart() {
      if (!this._qtyToAdd || !this.productId) return;
      this.addBtn.setAttribute('disabled', '');
      this.addBtn.textContent = 'Adding...';

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(this.productId, 10), quantity: this._qtyToAdd }] })
      })
      .then(res => {
        if (!res.ok) throw new Error('Add to cart failed');
        return res.json();
      })
      .then(() => {
        this.addBtn.textContent = 'Added!';
        setTimeout(() => {
          this.addBtn.removeAttribute('disabled');
          this.calculate(); // Re-render button text
        }, 2000);
        document.dispatchEvent(new CustomEvent('cart:refresh'));
      })
      .catch(() => {
        this.addBtn.textContent = 'Error - try again';
        setTimeout(() => {
          this.addBtn.removeAttribute('disabled');
          this.calculate();
        }, 2000);
      });
    }
  }

  customElements.define('coverage-calculator', CoverageCalculator);
}
