const STORAGE_KEY = 'ai_latex_gemini_api_key';

export const apiKeyManager = {
  getKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  },

  setKey(key) {
    try {
      if (!key || !key.trim()) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, key.trim());
      }
    } catch (e) {
      console.warn('Nem sikerült elmenteni az API kulcsot a localStorage-be:', e);
    }
  },

  clearKey() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Nem sikerült törölni az API kulcsot:', e);
    }
  },

  hasCustomKey() {
    return Boolean(this.getKey());
  },

  getMaskedKey() {
    const key = this.getKey();
    if (!key) return '';
    if (key.length <= 10) return '••••••••';
    return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
  }
};
