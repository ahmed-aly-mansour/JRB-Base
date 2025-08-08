class PredictiveSearch extends HTMLElement {
  constructor() {
    super();

    this.input = this.querySelector('input[type="search"]');
    this.predictiveSearchResults = this.querySelector('#predictive-search');
    this.searchTerm = this.input.value.trim();
    this.isOpen = false;
    this.abortController = new AbortController();

    if (this.searchTerm.length) {
      this.getSearchResults(this.searchTerm);
    }

    this.input.addEventListener('input', this.debounce(() => this.onChange(), 300));
    this.addEventListener('search-input-cleared', () => this.onChange());
  }

  onChange() {
    const newSearchTerm = this.input.value.trim();
    this.searchTerm = newSearchTerm;

    if (!this.searchTerm.length) {
      const resultsElement = this.querySelector('#predictive-search-results');
      if (resultsElement) resultsElement.remove();
      this.close();
      return;
    }

    if (!this.isOpen) {
      this.toggleLoading(true);
    }
    this.getSearchResults(this.searchTerm);
  }

  getSearchResults(searchTerm) {
    fetch(`/search/suggest?q=${encodeURIComponent(searchTerm)}&section_id=predictive-results&resources[type]=product&resources[limit]=3`, {
      signal: this.abortController.signal,
    })
      .then(response => {
        if (!response.ok) {
          this.close();
          return Promise.reject(new Error(`Failed to fetch: ${response.status}`));
        }
        return response.text();
      })
      .then(text => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const resultsMarkup = doc.querySelector('#shopify-section-predictive-results')?.innerHTML || '';
        this.updateResults(resultsMarkup);
      })
      .catch(error => {
        console.error('Error fetching search results:', error);
        this.close();
      });
  }

  updateResults(resultsMarkup) {
    this.predictiveSearchResults.innerHTML = resultsMarkup;
    this.open();
  }

  open() {
    this.toggleLoading(false);
    this.predictiveSearchResults.style.display = 'block';
    this.isOpen = true;
  }

  close() {
    this.predictiveSearchResults.style.display = 'none';
    this.isOpen = false;
  }

  toggleLoading(show) {
    this.querySelector('.predictive-search__loading')?.classList.toggle('hidden', !show);
  }

  debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), wait);
    };
  }
}

customElements.define('predictive-search', PredictiveSearch);  