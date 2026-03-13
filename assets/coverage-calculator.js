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

      this.widthInput = this.querySelector('input[id^="calc-width"]');
      this.heightInput = this.querySelector('input[id^="calc-height"]');
      this.resultEl = this.querySelector('.coverage-calc__result');
      this.panelsEl = this.querySelector('.coverage-calc__panels-needed');
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

      // Formula: (wall width m × wall height m) ÷ panel area m² = panels needed
      const wallAreaSqm = width * height;
      const panelsRaw = wallAreaSqm / this.panelAreaSqm;
      const panelsWithWaste = panelsRaw * (1 + this.wasteFactor);
      const panelsNeeded = Math.ceil(panelsWithWaste);

      // Adhesive: ~1 tube per N panels
      const adhesiveTubes = Math.ceil(panelsNeeded / this.adhesivePerTube);

      const totalCost = (panelsNeeded * this.productPrice) / 100;

      this.panelsEl.textContent = panelsNeeded;
      this.addQtyEl.textContent = panelsNeeded;
      this.costEl.textContent = 'Estimated cost: ' + this.currency + totalCost.toFixed(2);
      this.adhesiveEl.textContent = 'Construction adhesive needed: ~' + adhesiveTubes + ' tube' + (adhesiveTubes !== 1 ? 's' : '');
      this.resultEl.classList.add('visible');
      this._panelsNeeded = panelsNeeded;
    }

    addToCart() {
      if (!this._panelsNeeded || !this.productId) return;
      this.addBtn.setAttribute('disabled', '');
      this.addBtn.textContent = 'Adding...';

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(this.productId, 10), quantity: this._panelsNeeded }] })
      })
      .then(res => {
        if (!res.ok) throw new Error('Add to cart failed');
        return res.json();
      })
      .then(() => {
        this.addBtn.textContent = 'Added!';
        setTimeout(() => {
          this.addBtn.removeAttribute('disabled');
          this.addBtn.innerHTML = 'Add <span class="add-qty">' + this._panelsNeeded + '</span> Panels to Cart';
          this.addQtyEl = this.querySelector('.add-qty');
        }, 2000);
        document.dispatchEvent(new CustomEvent('cart:refresh'));
      })
      .catch(() => {
        this.addBtn.textContent = 'Error - try again';
        setTimeout(() => {
          this.addBtn.removeAttribute('disabled');
          this.addBtn.innerHTML = 'Add <span class="add-qty">' + this._panelsNeeded + '</span> Panels to Cart';
          this.addQtyEl = this.querySelector('.add-qty');
        }, 2000);
      });
    }
  }

  customElements.define('coverage-calculator', CoverageCalculator);
}
