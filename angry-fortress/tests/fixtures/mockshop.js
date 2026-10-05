// A stand-in for the NativePurchases plugin (App Store / Google Play), remembering what was
// "bought" across reloads like a store account does. window.__mockShopCancel makes the next
// purchase sheet get cancelled.
(() => {
  const KEY = 'mock.store.account';
  const account = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  window.__afShopMock = {
    calls: [],
    async getProducts({ productIdentifiers }) {
      this.calls.push('getProducts');
      return { products: productIdentifiers.map((id) => ({ identifier: id, title: id, priceString: '₩5,900', price: 5900, currencyCode: 'KRW' })) };
    },
    async purchaseProduct({ productIdentifier }) {
      this.calls.push('purchase');
      if (window.__mockShopCancel) { window.__mockShopCancel = false; throw { code: 'USER_CANCELLED', message: 'User cancelled the purchase' }; }
      localStorage.setItem(KEY, JSON.stringify([...new Set([...account(), productIdentifier])]));
      return { transactionId: 'tx-' + Date.now(), productIdentifier, purchaseDate: new Date().toISOString(), willCancel: null, purchaseState: 'PURCHASED' };
    },
    async restorePurchases() { this.calls.push('restore'); },
    async getPurchases() {
      this.calls.push('getPurchases');
      return { purchases: account().map((id) => ({ transactionId: 'tx', productIdentifier: id, purchaseDate: '', willCancel: null, purchaseState: 'PURCHASED' })) };
    },
  };
})();
