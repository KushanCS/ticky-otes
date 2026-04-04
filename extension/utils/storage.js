(() => {
  const { STORAGE_KEY } = window.AppConstants;
  const { isExtensionContextValid, getConversationKey } = window.Helpers;

  async function getAllConversationCards() {
    if (!isExtensionContextValid()) return {};
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || {};
  }

  async function saveAllConversationCards(data) {
    if (!isExtensionContextValid()) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }

  async function getStoredCards() {
    const allCards = await getAllConversationCards();
    const conversationKey = getConversationKey();
    return allCards[conversationKey] || [];
  }

  async function saveStoredCards(cards) {
    const allCards = await getAllConversationCards();
    const conversationKey = getConversationKey();
    allCards[conversationKey] = cards;
    await saveAllConversationCards(allCards);
  }

  async function addCardToStorage(card) {
    const cards = await getStoredCards();
    cards.unshift(card);
    await saveStoredCards(cards);
  }

  async function deleteCardFromStorage(cardId) {
    const cards = await getStoredCards();
    const updatedCards = cards.filter((card) => card.id !== cardId);
    await saveStoredCards(updatedCards);
  }

  async function updateCardInStorage(cardId, updater) {
    const cards = await getStoredCards();
    const updatedCards = cards.map((card) => {
      if (card.id !== cardId) return card;
      return updater(card);
    });
    await saveStoredCards(updatedCards);
  }

  async function getCardById(cardId) {
    const cards = await getStoredCards();
    return cards.find((card) => card.id === cardId);
  }

  async function clearCurrentConversationCards() {
    await saveStoredCards([]);
  }

  async function clearAllCards() {
    await saveAllConversationCards({});
  }

  window.StorageUtils = {
    getStoredCards,
    saveStoredCards,
    addCardToStorage,
    deleteCardFromStorage,
    updateCardInStorage,
    getCardById,
    clearCurrentConversationCards,
    clearAllCards
  };
})();
