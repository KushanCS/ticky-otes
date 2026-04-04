(() => {
  const { getConversationKey } = window.Helpers;
  const { renderStoredCards } = window.CardUI;
  const { initSelectionHandling } = window.SelectionFeature;

  let currentConversationKey = getConversationKey();

  async function rerenderConversationCards() {
    await renderStoredCards();
  }

  async function initApp() {
    initSelectionHandling();
    await rerenderConversationCards();

    setInterval(async () => {
      const newKey = getConversationKey();
      if (newKey !== currentConversationKey) {
        currentConversationKey = newKey;
        await rerenderConversationCards();
      }
    }, 1000);

    console.log("AI Branch Cards loaded.");
  }

  initApp();
})();