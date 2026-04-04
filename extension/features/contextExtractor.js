(() => {
  function getSelectionContainer() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    let node = selection.getRangeAt(0).startContainer;
    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    return node instanceof Element ? node : null;
  }

  function isInsideExtensionUI(element) {
    if (!element) return false;
    return !!element.closest("#ai-branch-sidebar, #ai-branch-explain-btn");
  }

  function findRelevantTextBlock(element) {
    if (!element || isInsideExtensionUI(element)) return null;

    let current = element;
    const main = document.querySelector("main");

    while (current && current !== document.body) {
      if (isInsideExtensionUI(current)) return null;

      const text = current.innerText?.trim() || "";

      if (
        text.length > 80 &&
        text.length < 3000 &&
        main &&
        main.contains(current)
      ) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function getRecentChatBlocks() {
    const main = document.querySelector("main");
    if (!main) return [];

    const candidates = Array.from(main.querySelectorAll("div, article, section"))
      .filter((el) => !el.closest("#ai-branch-sidebar"))
      .map((el) => ({
        text: el.innerText?.trim() || ""
      }))
      .filter((item) => item.text.length > 80 && item.text.length < 4000);

    const uniqueTexts = [];
    const seen = new Set();

    for (const item of candidates) {
      const normalized = item.text.replace(/\s+/g, " ").trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueTexts.push(item.text);
      }
    }

    return uniqueTexts.slice(-6);
  }

  function extractParentContext() {
    const selectedContainer = getSelectionContainer();
    const relevantBlock = findRelevantTextBlock(selectedContainer);

    const selectedBlockText = relevantBlock?.innerText?.trim() || "";
    const recentBlocks = getRecentChatBlocks();

    const contextParts = [];

    if (selectedBlockText) {
      contextParts.push("Selected message block:");
      contextParts.push(selectedBlockText);
    }

    if (recentBlocks.length) {
      contextParts.push("Recent conversation context:");
      contextParts.push(recentBlocks.join("\n\n"));
    }

    return contextParts.join("\n\n").trim().slice(-5000);
  }

  window.ContextExtractor = {
    extractParentContext
  };
})();