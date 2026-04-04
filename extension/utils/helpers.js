window.Helpers = {
  isExtensionContextValid() {
    return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
  },

  getConversationKey() {
    return window.location.pathname || "default_conversation";
  },

  generateId() {
    return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
};