(() => {
  let explainButton = null;
  const { createBranchCard } = window.CardUI;

  function removeExplainButton() {
    if (explainButton) {
      explainButton.remove();
      explainButton = null;
    }
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection) return "";
    return selection.toString().trim();
  }

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

  function isInsideChatArea(element) {
    if (!element) return false;

    const main = document.querySelector("main");
    if (!main) return false;

    if (!main.contains(element)) return false;

    // Avoid our own injected UI even if it ends up inside main later
    if (isInsideExtensionUI(element)) return false;

    return true;
  }

  function createExplainButton(x, y, selectedText) {
    removeExplainButton();

    explainButton = document.createElement("button");
    explainButton.id = "ai-branch-explain-btn";
    explainButton.textContent = "Explain";
    explainButton.style.top = `${y + window.scrollY + 8}px`;
    explainButton.style.left = `${x + window.scrollX}px`;

    explainButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      removeExplainButton();
      await createBranchCard(selectedText);
    });

    document.body.appendChild(explainButton);
  }

  function handleSelection() {
    const selectedText = getSelectedText();
    const selectionContainer = getSelectionContainer();

    if (!selectedText) {
      removeExplainButton();
      return;
    }

    // Block selections outside actual chat content
    if (!isInsideChatArea(selectionContainer)) {
      removeExplainButton();
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      removeExplainButton();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      removeExplainButton();
      return;
    }

    createExplainButton(rect.right, rect.bottom, selectedText);
  }

  function initSelectionHandling() {
    document.addEventListener("mouseup", () => {
      setTimeout(handleSelection, 10);
    });

    document.addEventListener("mousedown", (event) => {
      if (
        explainButton &&
        event.target !== explainButton &&
        !explainButton.contains(event.target)
      ) {
        removeExplainButton();
      }
    });

    document.addEventListener("keydown", () => {
      removeExplainButton();
    });
  }

  window.SelectionFeature = {
    initSelectionHandling
  };
})();