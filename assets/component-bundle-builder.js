class BundleBuilder extends HTMLElement {
  constructor() {
    super();
    this.selectedItems = {};
    this.currentFirstStepQuantity = 0;
    this.previousFirstStepQuantity = 0;
    this.initializeElements();
    this.attachEventListeners();
  }

  // Initialize element references
  initializeElements() {
    this.summaryContainer = this.querySelector('#summary-items-container');
    this.originalTotalEl = this.querySelector('#bundle-original-total');
    this.finalTotalEl = this.querySelector('#bundle-final-total');
    this.savingsEl = this.querySelector('#bundle-savings');
    this.savingsHeadlineEl = this.querySelector('#bundle-savings-headline');
    this.savingsSubheadlineEl = this.querySelector('#bundle-savings-subheadline');
    this.checkoutButton = this.querySelector('.checkout-button');
    this.announcementBar = document.querySelector('.shopify-section-group-header-group');
    this.headerElement = document.querySelector('.shopify-section-group-header-group.section-header');
    // Find the block ID of the first 'step' type block
    this.firstStepBlockId = this.querySelector('.step-container[data-block-type="step"]')?.dataset.blockId;

    if (this.announcementBar && this.headerElement && this.announcementBar === this.headerElement) {
      this.announcementBar = null;
    }
  }

  // Set up event listeners
  attachEventListeners() {
    this.addEventListener('click', (event) => {
      if (event.target.closest('.variant-swatch-button')) {
        this.handleSwatchClick(event);
      } else if (event.target.closest('.quantity-button') && !event.target.closest('.summary-item')) {
        this.handleQuantityClick(event);
      } else if (event.target.closest('.next-button')) {
        this.handleNextClick(event);
      } else if (event.target.closest('.plan-card__action-button')) {
        this.handlePlanSelectionClick(event);
      }
    });

    if (this.summaryContainer) {
      this.summaryContainer.addEventListener('click', this.handleSummaryQuantityClick.bind(this));
    }

    // Add listener for the Add to Cart button
    if (this.checkoutButton) {
      this.checkoutButton.addEventListener('click', this.handleAddToCart.bind(this));
    }
  }

  connectedCallback() {
    this.querySelectorAll('.plan-card__action-button').forEach(button => {
      button.dataset.originalText = button.textContent;
    });
    this.renderSummary();
  }

  // Handle clicks on variant swatches
  handleSwatchClick(event) {
    const clickedButton = event.target.closest('.variant-swatch-button');
    if (!clickedButton) return;

    const productCard = clickedButton.closest('.product-card');
    if (!productCard) return;

    const optionsContainer = clickedButton.closest('.variant-options');
    if (!optionsContainer) return;

    this.updateSwatchSelection(clickedButton, optionsContainer);
    const selectedOptions = this.collectSelectedOptions(productCard);
    const productData = this.getProductData(productCard);

    if (!productData) return;

    // Find matching variant
    if (!this.areAllOptionsSelected(productCard, selectedOptions)) {
      console.log('Selection incomplete, cannot determine final variant yet.');
      return;
    }

    const newVariant = this.findMatchingVariant(productData, selectedOptions);
    if (!newVariant) {
      this.resetProductCard(productCard);
      return;
    }

    this.updateProductCardWithVariant(productCard, productData, newVariant);
  }

  // Update swatch selection visually
  updateSwatchSelection(clickedButton, optionsContainer) {
    const siblingSwatches = optionsContainer.querySelectorAll('.variant-swatch-button');
    siblingSwatches.forEach((swatch) => swatch.classList.remove('selected'));
    clickedButton.classList.add('selected');
  }

  // Collect all selected options from a product card
  collectSelectedOptions(productCard) {
    const selectedOptions = [];
    const allOptionContainers = productCard.querySelectorAll('.variant-options');

    allOptionContainers.forEach((container) => {
      const position = parseInt(container.dataset.optionPosition, 10) - 1;
      const selectedButton = container.querySelector('.variant-swatch-button.selected');
      selectedOptions[position] = selectedButton ? selectedButton.dataset.optionValue : null;
    });

    return selectedOptions;
  }

  // Check if all options have been selected
  areAllOptionsSelected(productCard, selectedOptions) {
    return selectedOptions.every((option) => option !== null);
  }

  // Get product data from the product card
  getProductData(productCard) {
    const productJsonScript = productCard.querySelector(`script[data-product-json-for="${productCard.dataset.productId}"]`);
    if (!productJsonScript || !productJsonScript.textContent) {
      console.error('Product JSON script tag missing or empty for card:', productCard);
      return null;
    }

    try {
      return JSON.parse(productJsonScript.textContent);
    } catch (e) {
      console.error('Failed to parse product JSON:', e, productJsonScript.textContent);
      return null;
    }
  }

  // Find variant matching selected options
  findMatchingVariant(productData, selectedOptions) {
    return productData.variants.find((variant) => variant.options.every((optionValue, index) => optionValue === selectedOptions[index]));
  }

  // Reset product card when no variant is found
  resetProductCard(productCard) {
    const quantityValueEl = productCard.querySelector('.quantity-value');
    if (quantityValueEl) quantityValueEl.textContent = '0';
    productCard.classList.remove('product-card--highlighted');
  }

  // Update product card UI with selected variant
  updateProductCardWithVariant(productCard, productData, variant) {
    // Get image to display
    const imageToShow = this.getVariantImage(variant, productData);

    // Update card data and UI elements in sequence
    this.updateProductCardDataAttributes(productCard, variant, imageToShow);
    this.updatePriceDisplay(productCard, variant);
    this.updateProductImage(productCard, imageToShow, variant, productData);
    this.updateQuantityDisplay(productCard, variant.id);
    this.updateSoldOutState(productCard, variant);
  }

  // Get variant image to display
  getVariantImage(variant, productData) {
    const variantImage = variant.featured_image;
    const productFeaturedImage = productData.featured_image;
    return variantImage || productFeaturedImage;
  }

  // Update sold out state for a product card
  updateSoldOutState(productCard, variant) {
    const isAvailable = variant.available;
    const soldOutMessageEl = productCard.querySelector('.sold-out-message');
    const quantityUpButton = productCard.querySelector('.quantity-up');
    const quantityDownButton = productCard.querySelector('.quantity-down');

    // Update visual indicators
    productCard.classList.toggle('product-card--unavailable', !isAvailable);

    if (soldOutMessageEl) {
      soldOutMessageEl.style.display = isAvailable ? 'none' : 'block';
    }

    // Update button states
    if (quantityUpButton) {
      quantityUpButton.disabled = !isAvailable;
    }

    // Keep down button enabled unless quantity is 0
    if (quantityDownButton) {
      const currentQuantity = parseInt(productCard.querySelector('.quantity-value').textContent, 10);
      quantityDownButton.disabled = currentQuantity <= 0;
    }

    // Reset quantity if variant is unavailable but was previously selected
    if (!isAvailable && this.selectedItems[variant.id]) {
      console.log(`Variant ${variant.id} is sold out, removing from selection.`);
      const quantityValueEl = productCard.querySelector('.quantity-value');
      if (quantityValueEl) quantityValueEl.textContent = '0';
      this.updateState(productCard, 0);
      this.updateProductCardHighlight(productCard, 0);
    }
  }

  // Update product card data attributes
  updateProductCardDataAttributes(productCard, variant, imageToShow) {
    productCard.dataset.variantId = variant.id;
    productCard.dataset.price = variant.price;
    productCard.dataset.comparePrice = variant.compare_at_price || 0;
    productCard.dataset.variantTitle = variant.title;
    productCard.dataset.available = variant.available;

    if (imageToShow && imageToShow.src) {
      productCard.dataset.imageUrl = imageToShow.src;
    }
  }

  // Update price display
  updatePriceDisplay(productCard, variant) {
    const priceContainer = productCard.querySelector('.price');
    const originalPriceEl = priceContainer.querySelector('.original-price');
    const salePriceEl = priceContainer.querySelector('.sale-price');
    const freePriceEl = priceContainer.querySelector('.free-price');

    // Update regular price
    salePriceEl.textContent = this.formatMoney(variant.price);
    salePriceEl.style.display = variant.price === 0 ? 'none' : 'inline';

    // Update compare-at price
    if (originalPriceEl) {
      if (variant.compare_at_price && variant.compare_at_price > variant.price) {
        originalPriceEl.textContent = this.formatMoney(variant.compare_at_price);
        originalPriceEl.style.display = 'inline';
      } else {
        originalPriceEl.style.display = 'none';
      }
    }

    // Update free price display
    if (freePriceEl) {
      freePriceEl.style.display = variant.price === 0 ? 'inline' : 'none';
    }
  }

  // Update product image
  updateProductImage(productCard, imageToShow, variant, productData) {
    const productImageEl = productCard.querySelector('.product-image');
    if (!productImageEl) return;

    if (imageToShow && imageToShow.src) {
      productImageEl.src = imageToShow.src;
      productImageEl.alt = imageToShow.alt || variant.title || productData.title;
      productImageEl.style.display = '';
    }
  }

  // Update quantity display
  updateQuantityDisplay(productCard, variantId) {
    const quantityValueEl = productCard.querySelector('.quantity-value');
    const existingItem = this.selectedItems[variantId];

    if (existingItem) {
      quantityValueEl.textContent = existingItem.quantity;
      productCard.classList.add('product-card--highlighted');
    } else {
      quantityValueEl.textContent = '0';
      productCard.classList.remove('product-card--highlighted');
    }
  }

  // Handle clicks on quantity buttons in main product grid
  handleQuantityClick(event) {
    const quantityButton = event.target.closest('.quantity-button');
    if (!quantityButton || event.target.closest('.summary-item')) return;

    const productCard = event.target.closest('.product-card');
    if (!productCard) return;

    // Check availability before processing increment
    const isAvailable = productCard.dataset.available === 'true';
    const isIncrement = quantityButton.classList.contains('quantity-up');

    if (isIncrement && !isAvailable) {
      console.log('Attempted to increment unavailable variant.');
      return;
    }

    const quantitySelector = quantityButton.closest('.quantity-selector');
    const valueEl = quantitySelector.querySelector('.quantity-value');
    let currentVal = parseInt(valueEl.textContent, 10);
    let newVal = this.calculateNewQuantity(currentVal, quantityButton);

    if (!isIncrement && !isAvailable && newVal > 0) {
      newVal = 0;
    }

    if (newVal !== currentVal) {
      valueEl.textContent = newVal;
      this.updateState(productCard, newVal);
      this.updateProductCardHighlight(productCard, newVal);

      // Update down button disabled state based on new value
      const quantityDownButton = quantitySelector.querySelector('.quantity-down');
      if (quantityDownButton) {
        quantityDownButton.disabled = newVal <= 0;
      }
    }
  }

  // Handle quantity clicks in summary section
  handleSummaryQuantityClick(event) {
    const quantityButton = event.target.closest('.quantity-down-summary, .quantity-up-summary');
    if (!quantityButton) return;

    const summaryItem = event.target.closest('.summary-item');
    if (!summaryItem) return;

    const variantId = summaryItem.dataset.variantId;
    if (!variantId || !this.selectedItems[variantId]) return;

    let currentQuantity = this.selectedItems[variantId].quantity;
    let newQuantity = this.calculateNewQuantity(currentQuantity, quantityButton);

    if (newQuantity !== currentQuantity) {
      this.updateQuantityInProductCard(variantId, newQuantity);
      this.updateStateFromVariantId(variantId, newQuantity);
    }
  }

  // Calculate new quantity based on button clicked
  calculateNewQuantity(currentVal, button) {
    if (button.classList.contains('quantity-down') || button.classList.contains('quantity-down-summary')) {
      return currentVal > 0 ? currentVal - 1 : 0;
    } else if (button.classList.contains('quantity-up') || button.classList.contains('quantity-up-summary')) {
      return currentVal + 1;
    }
    return currentVal;
  }

  // Update product card highlight based on quantity
  updateProductCardHighlight(productCard, quantity) {
    if (quantity > 0) {
      productCard.classList.add('product-card--highlighted');
    } else {
      productCard.classList.remove('product-card--highlighted');
    }
  }

  // Update quantity in the original product card
  updateQuantityInProductCard(variantId, quantity) {
    const originalProductCard = this.querySelector(`.product-card[data-variant-id="${variantId}"]`);
    if (originalProductCard) {
      const valueEl = originalProductCard.querySelector('.quantity-value');
      if (valueEl) valueEl.textContent = quantity;
      this.updateProductCardHighlight(originalProductCard, quantity);
    }
  }

  // Update state with product information
  updateState(productCardElement, quantity) {
    const variantId = productCardElement.dataset.variantId;
    const productId = productCardElement.dataset.productId;
    if (!variantId || !productId) return;

    const blockType = productCardElement.closest('.step-container')?.dataset.blockType;
    if (blockType === 'plan_step' && !productCardElement.classList.contains('product-card--highlighted')) {
      const quantityValueEl = productCardElement.querySelector('.quantity-value');
      if (quantityValueEl) quantityValueEl.textContent = '0';
      return;
    }

    if (quantity <= 0) {
      delete this.selectedItems[variantId];
    } else {
      const optionsMap = this.buildOptionsMap(productCardElement, variantId);

      this.selectedItems[variantId] = {
        quantity: quantity,
        productId: productId,
        variantId: variantId,
        blockId: productCardElement.dataset.blockId,
        collectionTitle: productCardElement.dataset.collectionTitle,
        price: parseInt(productCardElement.dataset.price, 10),
        comparePrice: parseInt(productCardElement.dataset.comparePrice, 10),
        title: productCardElement.dataset.title,
        variantTitle: productCardElement.dataset.variantTitle,
        imageUrl: productCardElement.dataset.imageUrl,
        optionsMap: optionsMap,
        isPlan: blockType === 'plan_step'
      };
    }

    this.renderSummary();
  }

  // Build options map from product card and variant
  buildOptionsMap(productCardElement, variantId) {
    const optionsMap = {};
    const productId = productCardElement.dataset.productId;
    const productJsonScript = this.querySelector(`script[data-product-json-for="${productId}"]`);

    if (productJsonScript && productJsonScript.textContent) {
      try {
        const productData = JSON.parse(productJsonScript.textContent);
        const selectedVariant = productData.variants.find((v) => v.id == variantId);

        if (selectedVariant && selectedVariant.options) {
          selectedVariant.options.forEach((optionValue, index) => {
            const optionIndex = index + 1;
            const optionNameFromAttr = productCardElement.dataset[`option${optionIndex}Name`];
            const optionName = optionNameFromAttr || `option${optionIndex}`;
            optionsMap[optionName] = optionValue;
          });
        }
      } catch (e) {
        console.error('Failed to parse product JSON in buildOptionsMap:', e);
      }
    }

    return optionsMap;
  }

  // Update state from variant ID
  updateStateFromVariantId(variantId, quantity) {
    if (!variantId) return;

    const item = this.selectedItems[variantId];

    if (item && item.isPlan) {
      console.log("Cannot change plan quantity from summary.");
      return;
    }

    if (quantity <= 0) {
      if (this.selectedItems[variantId]) {
        delete this.selectedItems[variantId];
      }
    } else if (this.selectedItems[variantId]) {
      this.selectedItems[variantId].quantity = quantity;
    } else {
      // Find product card to reconstruct item data
      const productId = this.getProductIdFromVariantId(variantId);
      const productCard = productId ? this.querySelector(`.product-card[data-product-id="${productId}"]`) : null;

      if (productCard) {
        this.addItemFromVariantId(variantId, quantity, productCard);
      } else {
        console.error(`Cannot find any product card for variant ${variantId} to update state from summary.`);
      }
    }

    this.renderSummary();
  }

  // Get product ID from variant ID
  getProductIdFromVariantId(variantId) {
    const productCard = this.querySelector(`.product-card[data-variant-id="${variantId}"]`);
    return productCard ? productCard.dataset.productId : null;
  }

  // Add item to state from variant ID
  addItemFromVariantId(variantId, quantity, productCardElement) {
    const productId = productCardElement.dataset.productId;
    const productJsonScript = productCardElement.querySelector(`script[data-product-json-for="${productId}"]`);
    if (!productJsonScript || !productJsonScript.textContent) return;

    try {
      const productData = JSON.parse(productJsonScript.textContent);
      const variant = productData.variants.find((v) => v.id == variantId);

      if (!variant) {
        console.error(`Cannot find variant details for ID ${variantId} in product JSON.`);
        return;
      }

      const variantImage = variant.featured_image || productData.featured_image;
      const optionsMap = this.buildOptionsMap(productCardElement, variantId);

      this.selectedItems[variantId] = {
        quantity: quantity,
        productId: productId,
        variantId: variantId,
        blockId: productCardElement.dataset.blockId,
        collectionTitle: productCardElement.dataset.collectionTitle,
        price: variant.price,
        comparePrice: variant.compare_at_price || 0,
        title: productData.title,
        variantTitle: variant.title,
        imageUrl: variantImage ? variantImage.src : '',
        optionsMap: optionsMap,
      };
    } catch (e) {
      console.error('Failed to parse product JSON in addItemFromVariantId:', e);
    }
  }

  // Format money values
  formatMoney(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  // Render summary section
  renderSummary() {
    // 1. Calculate initial summary data
    let { finalTotal, originalTotal, itemsGroupedByBlock, blockCollectionTitles, blockQuantities } = this.calculateSummaryData();
    const firstStepQuantity = blockQuantities[this.firstStepBlockId] || 0;
    this.currentFirstStepQuantity = firstStepQuantity;

    // 2. Check if plan selection should be reset based on first step quantity change
    const { planWasReset, planBlockId, planStepContainer } = this.checkPlanSelectionReset(firstStepQuantity);

    // 3. Reset plan if needed and recalculate data
    if (planWasReset) {
      this.resetPlanSelection(planBlockId, planStepContainer);
      ({ finalTotal, originalTotal, itemsGroupedByBlock, blockCollectionTitles, blockQuantities } = this.calculateSummaryData());
    }

    // 4. Update UI components with calculated data
    this.updateStepCounters(blockQuantities);
    this.updateSummaryHTML(finalTotal, originalTotal, itemsGroupedByBlock, blockCollectionTitles);
    this.updateTotals(finalTotal, originalTotal);
    this.filterPlanStep(firstStepQuantity);
    
    // 5. Store current quantity for future comparisons
    this.previousFirstStepQuantity = firstStepQuantity;
  }

  // Check if plan selection should be reset based on first step quantity change
  checkPlanSelectionReset(firstStepQuantity) {
    const planStepContainer = this.querySelector('.step-container[data-block-type="plan_step"]');
    const planBlockId = planStepContainer?.dataset.blockId;
    let planWasReset = false;

    if (this.previousFirstStepQuantity === 1 && firstStepQuantity > 1 && planBlockId) {
      console.log("Quantity changed from 1 to >1, resetting plan selection.");
      planWasReset = true;
    } else if (this.previousFirstStepQuantity > 1 && firstStepQuantity === 1 && planBlockId) {
      console.log("Quantity changed from >1 to 1, resetting plan selection.");
      planWasReset = true;
    }

    return { planWasReset, planBlockId, planStepContainer };
  }

  // Reset plan selection when needed
  resetPlanSelection(planBlockId, planStepContainer) {
    if (!planBlockId || !planStepContainer) return;

    // Remove plan items from state
    let itemsToRemove = [];
    for (const key in this.selectedItems) {
      if (this.selectedItems[key].blockId === planBlockId) {
        itemsToRemove.push(key);
      }
    }
    itemsToRemove.forEach(key => delete this.selectedItems[key]);

    // Reset plan card UI
    const allPlanCards = planStepContainer.querySelectorAll('.plans-grid .product-card');
    allPlanCards.forEach(card => {
      card.classList.remove('product-card--highlighted');
      const button = card.querySelector('.plan-card__action-button');
      if (button && button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    });
  }

  // Calculate summary data
  calculateSummaryData() {
    let finalTotal = 0;
    let originalTotal = 0;
    const itemsGroupedByBlock = {};
    const blockCollectionTitles = {};
    const blockQuantities = {};

    // Calculate totals and group items/quantities
    for (const variantId in this.selectedItems) {
      const item = this.selectedItems[variantId];
      const blockId = item.blockId;

      if (!itemsGroupedByBlock[blockId]) {
        itemsGroupedByBlock[blockId] = [];
        blockCollectionTitles[blockId] = item.collectionTitle;
        blockQuantities[blockId] = 0;
      }

      itemsGroupedByBlock[blockId].push(item);
      blockQuantities[blockId] += item.quantity;

      const itemPrice = item.price;
      const itemComparePrice = item.comparePrice > itemPrice ? item.comparePrice : itemPrice;
      finalTotal += item.quantity * itemPrice;
      originalTotal += item.quantity * itemComparePrice;
    }

    return { finalTotal, originalTotal, itemsGroupedByBlock, blockCollectionTitles, blockQuantities };
  }

  // Update step counters
  updateStepCounters(blockQuantities) {
    const stepContainers = this.querySelectorAll('.step-container[data-block-id]');
    stepContainers.forEach((container) => {
      const blockId = container.dataset.blockId;
      const blockType = container.dataset.blockType;
      const countSpan = container.querySelector(`.step-selected-wrapper span:first-child`); // More robust selector
      const wrapper = container.querySelector('.step-selected-wrapper');

      if (wrapper && countSpan) {
        if (blockType === 'plan_step') {
          const planIsSelected = Object.values(this.selectedItems).some(item => item.blockId === blockId && item.isPlan);
          countSpan.textContent = planIsSelected ? '1' : '0';
        } else {
          const totalQuantity = blockQuantities[blockId] || 0;
          countSpan.textContent = totalQuantity;
        }
      } else {
        console.warn("Could not find count span or wrapper for step:", blockId);
      }
    });
  }

  // Update summary HTML
  updateSummaryHTML(finalTotal, originalTotal, itemsGroupedByBlock, blockCollectionTitles) {
    const placeholder = this.summaryContainer.querySelector('.summary-section-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    let summaryHTML = '';

    // Generate HTML for each block group
    for (const blockId in itemsGroupedByBlock) {
      summaryHTML += this.generateBlockSummaryHTML(blockId, itemsGroupedByBlock[blockId], blockCollectionTitles[blockId]);
    }

    // Update summary container HTML
    if (Object.keys(this.selectedItems).length === 0) {
      this.summaryContainer.innerHTML = `<div class="summary-section-placeholder" style="text-align: center; color: #666; padding: 20px 0;">
          Select items to build your bundle.
        </div>`;
      this.checkoutButton.disabled = true;
    } else {
      this.summaryContainer.innerHTML = summaryHTML;
      this.checkoutButton.disabled = false;
    }
  }

  // Generate HTML for a block in the summary
  generateBlockSummaryHTML(blockId, items, collectionTitle) {
    const totalQuantityInBlock = items.reduce((total, item) => total + item.quantity, 0);

    const blockElement = this.querySelector(`.step-container[data-block-id="${blockId}"]`);
    const blockType = blockElement ? blockElement.dataset.blockType : null;

    let blockHTML = `<div class="summary-section" data-summary-block-id="${blockId}">`;

    if (blockType === 'plan_step') {
      blockHTML += `<h4 class="collection-title">${collectionTitle || 'Selected Plan'}</h4>`;
    } else {
      blockHTML += `<h4 class="collection-title">${collectionTitle || 'Selected Items'} (${totalQuantityInBlock})</h4>`;
    }

    items.forEach((item) => {
      blockHTML += this.generateItemSummaryHTML(item);
    });

    blockHTML += `</div>`;
    return blockHTML;
  }

  // Generate HTML for an individual item in the summary
  generateItemSummaryHTML(item) {
    const linePrice = item.quantity * item.price;
    const lineComparePrice = item.quantity * (item.comparePrice > item.price ? item.comparePrice : item.price);

    let detailsHTML = `<div class="item-name-title">${item.title}</div>`;
    if (item.optionsMap && Object.keys(item.optionsMap).length > 0) {
      for (const optionName in item.optionsMap) {
        detailsHTML += `<div class="item-option">${optionName}: ${item.optionsMap[optionName]}</div>`;
      }
    } else if (item.variantTitle && item.variantTitle !== 'Default Title') {
      detailsHTML += `<div class="item-option">Variant: ${item.variantTitle}</div>`;
    }

    // Determine if quantity buttons should be shown
    const showQuantityButtons = !item.isPlan && !item.isFreeRequired;

    let quantityDisplayHTML = `<span class="quantity-value">${item.quantity}</span>`;
    if (showQuantityButtons) {
      quantityDisplayHTML = `
        <button class="quantity-button quantity-down-summary" aria-label="Decrease quantity">-</button>
        ${quantityDisplayHTML} 
        <button class="quantity-button quantity-up-summary" aria-label="Increase quantity">+</button>
      `;
    }

    // Determine price display (show FREE for free item)
    let priceDisplayHTML = '';
    if (item.isFreeRequired) {
      priceDisplayHTML = `<span class="free-price">${lineComparePrice > 0 ? `<span class="original-price">${this.formatMoney(lineComparePrice)}</span>` : ''} FREE</span>`;
    } else {
      const originalPriceSpan = lineComparePrice > linePrice ? `<span class="original-price">${this.formatMoney(lineComparePrice)}</span>` : '';
      const salePriceSpan = `<span class="sale-price">${this.formatMoney(linePrice)}</span>`;
      priceDisplayHTML = `${originalPriceSpan} ${salePriceSpan}`.trim();
    }

    return `
        <div class="summary-item" data-variant-id="${item.variantId}">
          <img src="${item.imageUrl}" alt="${item.title}" class="summary-image" width="40" height="40">
          <div class="item-details">
            ${detailsHTML}
          </div>
          <div class="item-quantity">
            ${quantityDisplayHTML}
          </div>
          <div class="item-price">
            ${priceDisplayHTML}
          </div>
        </div>
      `;
  }

  // Update totals and savings
  updateTotals(finalTotal, originalTotal) {
    const savings = originalTotal - finalTotal;
    this.originalTotalEl.textContent = this.formatMoney(originalTotal);
    this.finalTotalEl.textContent = this.formatMoney(finalTotal);
    this.savingsEl.textContent = `You Save ${this.formatMoney(savings)}`;

    if (this.savingsSubheadlineEl) {
      this.savingsSubheadlineEl.textContent = `You're saving ${this.formatMoney(savings)} today!`;
    }

    this.checkoutButton.disabled = Object.keys(this.selectedItems).length === 0;
  }

  // Handle next button clicks
  handleNextClick(event) {
    const nextButton = event.target.closest('.next-button');
    if (!nextButton) return;

    const currentStep = nextButton.closest('.step-container');
    if (!currentStep) return;

    const nextStep = this.findNextStep(currentStep);
    if (nextStep) {
      this.navigateToStep(currentStep, nextStep);
    } else {
      this.scrollToSummary();
    }
  }

  // Find the next step
  findNextStep(currentStep) {
    let nextStep = currentStep.nextElementSibling;
    while (nextStep && !nextStep.classList.contains('step-container')) {
      nextStep = nextStep.nextElementSibling;
    }
    return nextStep;
  }

  // Navigate to next step
  navigateToStep(currentStep, nextStep) {
    const currentAlpineData = Alpine.$data(currentStep);
    const nextAlpineData = Alpine.$data(nextStep);

    if (currentAlpineData) {
      currentAlpineData.open = false;
    }
    if (nextAlpineData) {
      nextAlpineData.open = true;
    }

    // Use setTimeout to allow Alpine to render the element before calculating position
    setTimeout(() => {
      if (nextStep) {
        let headerOffset = 0;
        if (this.announcementBar && this.announcementBar.offsetHeight > 0 && this.announcementBar.getBoundingClientRect().top <= 1) {
          headerOffset += this.announcementBar.offsetHeight;
        }
        if (
          this.headerElement &&
          this.headerElement.offsetHeight > 0 &&
          this.headerElement.getBoundingClientRect().top <= headerOffset + 1
        ) {
          headerOffset += this.headerElement.offsetHeight;
        }

        const elementPosition = nextStep.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    }, 100);
  }

  // Handle Add to Cart button click
  async handleAddToCart(event) {
    event.preventDefault();

    if (this.checkoutButton.disabled || this.checkoutButton.classList.contains('loading')) {
      return;
    }

    if (!this.checkoutButton.dataset.originalText) {
      this.checkoutButton.dataset.originalText = this.checkoutButton.textContent;
    }
    const originalButtonText = this.checkoutButton.dataset.originalText;

    // Prepare items and update button state
    const itemsToAdd = this.prepareItemsForCart();
    if (itemsToAdd.length === 0) {
      console.warn('Add to Cart clicked with no items selected.');
      return;
    }

    this.updateButtonState('Adding...', true);

    try {
      const response = await this.sendAddToCartRequest(itemsToAdd);
      const cartData = await this.processCartResponse(response);
      
      if (response.ok) {
        this.handleSuccessfulCartAdd(cartData);
      } else {
        this.handleFailedCartAdd(cartData);
      }
    } catch (error) {
      this.handleCartError(error);
    } finally {
      this.resetButtonStateAfterDelay(originalButtonText);
    }
  }

  // Prepare items to be added to cart
  prepareItemsForCart() {
    const itemsToAdd = [];
    let planSelected = false;

    // Add regular items first
    Object.values(this.selectedItems).forEach((item) => {
      if (!item.isPlan) {
        itemsToAdd.push({
          id: item.variantId,
          quantity: item.quantity,
        });
      } else {
        planSelected = true;
        itemsToAdd.push({
          id: item.variantId,
          quantity: 1
        });
      }
    });

    // If a plan was selected, add the required free product if needed
    if (planSelected) {
      this.addFreeProductToCart(itemsToAdd);
    }

    return itemsToAdd;
  }

  // Add free product to cart if a plan was selected
  addFreeProductToCart(itemsToAdd) {
    const planStepContainer = this.querySelector('.step-container[data-block-type="plan_step"]');
    const freeProductCard = planStepContainer?.querySelector('.bundle-plan__required-item-grid .product-card');
    
    if (freeProductCard) {
      const freeVariantId = freeProductCard.dataset.variantId;
      if (freeVariantId && !itemsToAdd.some(item => item.id == freeVariantId)) {
        this.addFreeVariantToCart(freeProductCard, itemsToAdd);
      }
    } else {
      console.warn("Could not find the free required product card to add to cart.");
    }
  }

  // Add the free variant to cart items
  addFreeVariantToCart(freeProductCard, itemsToAdd) {
    const requiredProductJsonScript = freeProductCard.querySelector(`script[data-product-json-for="${freeProductCard.dataset.productId}"]`);
    if (requiredProductJsonScript) {
      try {
        const requiredProductData = JSON.parse(requiredProductJsonScript.textContent);
        const freeVariant = requiredProductData.variants.find(v => v.price === 0) || requiredProductData.selected_or_first_available_variant;
        if (freeVariant) {
          console.log(`Adding free required product variant: ${freeVariant.id}`);
          itemsToAdd.push({
            id: freeVariant.id,
            quantity: 1
          });
        }
      } catch (e) {
        console.error("Error parsing JSON for free required product:", e);
      }
    }
  }

  // Update button state
  updateButtonState(text, isDisabled) {
    this.checkoutButton.textContent = text;
    this.checkoutButton.disabled = isDisabled;
    if (isDisabled) {
      this.checkoutButton.classList.add('loading');
    } else {
      this.checkoutButton.classList.remove('loading');
    }
  }

  // Send items to cart endpoint
  async sendAddToCartRequest(itemsToAdd) {
    console.log("Items being added to cart:", itemsToAdd);
    return await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items: itemsToAdd }),
    });
  }

  // Process cart response
  async processCartResponse(response) {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return await response.json();
    } else {
      const textData = await response.text();
      console.error("Non-JSON response from cart/add.js:", textData);
      return textData;
    }
  }

  // Handle successful cart add
  handleSuccessfulCartAdd(cartData) {
    console.log('Items added to cart response:', cartData);

    if (typeof cartData === 'object' && cartData !== null) {
      document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true, detail: cartData }));
    } else {
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    }

    window.location.href = '/cart';
    this.checkoutButton.textContent = 'Redirecting...';
  }

  // Handle failed cart add
  handleFailedCartAdd(cartData) {
    const errorMessage = (typeof cartData === 'object' && cartData !== null) ? (cartData.description || cartData.message) : cartData;
    console.error('Error adding items to cart:', errorMessage || 'Unknown error');
    this.checkoutButton.textContent = 'Error';
    alert(`Error adding items: ${errorMessage || 'Please try again.'}`);
  }

  // Handle cart error
  handleCartError(error) {
    console.error('Network error adding items to cart:', error);
    this.checkoutButton.textContent = 'Error';
    alert('Could not add items to cart. Please check your connection.');
  }

  // Reset button state after delay
  resetButtonStateAfterDelay(originalButtonText) {
    if (this.checkoutButton.textContent !== 'Redirecting...' && this.checkoutButton.textContent !== 'Added!') {
      setTimeout(() => {
        this.checkoutButton.textContent = originalButtonText;
        this.checkoutButton.disabled = Object.keys(this.selectedItems).length === 0;
        this.checkoutButton.classList.remove('loading');
      }, 1500);
    }
  }

  // Handle clicks on plan selection buttons
  handlePlanSelectionClick(event) {
    const clickedButton = event.target.closest('.plan-card__action-button');
    if (!clickedButton) return;

    const clickedCard = clickedButton.closest('.product-card');
    if (!clickedCard) return;

    const variantId = clickedCard.dataset.variantId;
    const blockId = clickedCard.dataset.blockId;
    const planStepContainer = clickedCard.closest('.step-container[data-block-type="plan_step"]');

    if (!variantId || !blockId || !planStepContainer) {
      console.error('Missing data attributes or container on plan card:', clickedCard);
      return;
    }

    const isCurrentlySelected = this.selectedItems[variantId] && this.selectedItems[variantId].isPlan;

    // Clear all selected plans
    this.clearSelectedPlans(blockId, planStepContainer);

    // Add new plan if not already selected
    if (!isCurrentlySelected) {
      this.selectNewPlan(clickedCard, clickedButton);
    }

    // Re-render the summary
    this.renderSummary();
  }

  // Extract selected plans from state and reset plan cards UI
  clearSelectedPlans(blockId, planStepContainer) {
    // Remove all plan items with this blockId from state
    let itemsToRemove = [];
    for (const key in this.selectedItems) {
      if (this.selectedItems[key].blockId === blockId) {
        itemsToRemove.push(key);
      }
    }
    itemsToRemove.forEach(key => {
      delete this.selectedItems[key];
    });

    // Reset all plan cards UI
    const allPlanCards = planStepContainer.querySelectorAll('.plans-grid .product-card');
    allPlanCards.forEach(card => {
      card.classList.remove('product-card--highlighted');
      const button = card.querySelector('.plan-card__action-button');
      if (button && button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    });
  }

  // Add the new plan to state and update UI
  selectNewPlan(clickedCard, clickedButton) {
    this.addPlanToState(clickedCard);
    
    // Add free product if there are multiple items in the first step
    if (this.currentFirstStepQuantity > 1) {
      this.addFreeProductIfNeeded(clickedCard);
    }

    // Update UI for selected plan
    clickedCard.classList.add('product-card--highlighted');
    clickedButton.textContent = 'Remove';
  }

  // Add free product to state if needed
  addFreeProductIfNeeded(clickedCard) {
    const planStepContainer = clickedCard.closest('.step-container[data-block-type="plan_step"]');
    const blockId = clickedCard.dataset.blockId;
    const freeProductCard = planStepContainer.querySelector('.bundle-plan__required-item-grid .product-card');
    
    if (freeProductCard) {
      this.addFreeProductToState(freeProductCard, blockId);
    } else {
      console.warn("Could not find free product card to add to state.");
    }
  }

  // Helper to add free product data to state
  addFreeProductToState(freeProductCard, planBlockId) {
    const productId = freeProductCard.dataset.productId;
    const variantId = freeProductCard.dataset.variantId;

    if (!productId || !variantId) {
      console.error("Could not get product/variant ID from free product card.");
      return;
    }
    if (this.selectedItems[variantId]) return;

    const title = freeProductCard.querySelector('h3')?.innerText || 'Free Item';
    const imageEl = freeProductCard.querySelector('.product-image');
    const comparePriceEl = freeProductCard.querySelector('.price .original-price');
    let comparePrice = 0;
    if (comparePriceEl && comparePriceEl.offsetParent !== null && comparePriceEl.textContent) {
      try {
        const priceString = comparePriceEl.textContent.replace(/[^\d.]/g, '');
        comparePrice = Math.round(parseFloat(priceString) * 100);
      } catch (e) { console.error("Could not parse free product compare price:", comparePriceEl.textContent); }
    }

    this.selectedItems[variantId] = {
      quantity: 1,
      productId: productId,
      variantId: variantId,
      blockId: planBlockId,
      collectionTitle: '',
      price: 0,
      comparePrice: comparePrice,
      title: title,
      variantTitle: '',
      imageUrl: imageEl ? imageEl.src : '',
      optionsMap: {},
      isPlan: false,
      isFreeRequired: true
    };
  }

  addPlanToState(planCardElement) {
    const variantId = planCardElement.dataset.variantId;
    const productId = planCardElement.dataset.productId;
    const blockId = planCardElement.dataset.blockId;
    const collectionTitle = planCardElement.closest('.step-container')?.querySelector('h2')?.textContent || 'Plan'; // Get title from step header


    if (!variantId || !productId || !blockId) return;

    const priceEl = planCardElement.querySelector('.plan-card__price .sale-price');
    const comparePriceEl = planCardElement.querySelector('.plan-card__price .original-price');
    const titleEl = planCardElement.querySelector('.bundle-plan__title');
    const imageEl = planCardElement.querySelector('.bundle-plan__icon img');

    let price = 0;
    if (priceEl && priceEl.textContent) {
      try {
        price = parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10);
      } catch (e) { console.error("Could not parse plan price:", priceEl.textContent); }
    }

    let comparePrice = 0;
    if (comparePriceEl && comparePriceEl.offsetParent !== null && comparePriceEl.textContent) {
      try {
        comparePrice = parseInt(comparePriceEl.textContent.replace(/[^0-9]/g, ''), 10);
      } catch (e) { console.error("Could not parse plan compare price:", comparePriceEl.textContent); }
    }
    if (comparePrice <= price) comparePrice = 0;


    this.selectedItems[variantId] = {
      quantity: 1,
      productId: productId,
      variantId: variantId,
      blockId: blockId,
      collectionTitle: collectionTitle,
      price: price,
      comparePrice: comparePrice,
      title: titleEl ? titleEl.innerText.replace(/\s+/g, ' ').trim() : 'Selected Plan',
      variantTitle: '',
      imageUrl: imageEl ? imageEl.src : '',
      optionsMap: {},
      isPlan: true
    };
  }

  // Filter plans based on first step quantity (Visual only)
  filterPlanStep(firstStepQuantity) {
    const planStepContainer = this.querySelector('.step-container[data-block-type="plan_step"]');
    if (!planStepContainer) {
      return;
    }

    const planCards = planStepContainer.querySelectorAll('.plans-grid .product-card');
    const freeProductContainer = planStepContainer.querySelector('.bundle-plan__required-item-grid');

    // Logic to hide/show based on quantity (no state changes here)
    if (firstStepQuantity === 1 || firstStepQuantity === 0) {
      if (freeProductContainer) freeProductContainer.style.display = 'none';
      if (planCards) {
        planCards.forEach(card => {
          const isCamPlus = card.dataset.isCamPlus === 'true';
          card.style.display = isCamPlus ? '' : 'none';
        });
      }
    } else {
      if (freeProductContainer) freeProductContainer.style.display = '';
      if (planCards) {
        planCards.forEach(card => {
          card.style.display = '';
        });
      }
    }
  }
}

if (!customElements.get('bundle-builder')) {
  customElements.define('bundle-builder', BundleBuilder);
}
