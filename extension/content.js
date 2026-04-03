(() => {
  const STORAGE_KEY = "ai_branch_cards_by_conversation";
  const CHAT_API_URL = "http://127.0.0.1:5000/chat";
  const SUMMARY_API_URL = "http://127.0.0.1:5000/summarize-card-context";

  let explainButton = null;
  let sidebar = null;
  let cardsContainer = null;

  function isExtensionContextValid() {
    return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
  }

  function getConversationKey() {
    return window.location.pathname || "default_conversation";
  }

  function generateId() {
    return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

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

  function findRelevantTextBlock(element) {
    if (!element) return null;

    let current = element;

    while (current && current !== document.body) {
      const text = current.innerText?.trim() || "";
      if (text.length > 80 && text.length < 3000) {
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
      .map((el) => ({
        el,
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

  function ensureSidebar() {
    if (sidebar) return;

    sidebar = document.createElement("div");
    sidebar.id = "ai-branch-sidebar";

    Object.assign(sidebar.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      width: "390px",
      height: "calc(100vh - 32px)",
      background: "rgba(255, 255, 255, 0.14)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      border: "1px solid rgba(255, 255, 255, 0.24)",
      boxShadow: "0 12px 40px rgba(0,0,0,0.16)",
      borderRadius: "24px",
      zIndex: "999998",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      fontFamily: "Inter, Arial, sans-serif"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "18px 18px 14px 18px",
      borderBottom: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.08)"
    });

    const titleWrap = document.createElement("div");
    Object.assign(titleWrap.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    });

    const title = document.createElement("div");
    title.textContent = "Branch Cards";
    Object.assign(title.style, {
      fontSize: "17px",
      fontWeight: "700",
      color: "#111827"
    });

    const subtitle = document.createElement("div");
    subtitle.textContent = "Context-aware side branches";
    Object.assign(subtitle.style, {
      fontSize: "12px",
      color: "rgba(17,24,39,0.68)"
    });

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
      width: "34px",
      height: "34px",
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.14)",
      color: "#374151",
      borderRadius: "12px",
      fontSize: "16px",
      cursor: "pointer",
      backdropFilter: "blur(8px)"
    });

    closeBtn.addEventListener("click", () => {
      sidebar.remove();
      sidebar = null;
      cardsContainer = null;
    });

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    cardsContainer = document.createElement("div");
    Object.assign(cardsContainer.style, {
      flex: "1",
      overflowY: "auto",
      padding: "14px",
      display: "flex",
      flexDirection: "column",
      gap: "14px",
      background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
    });

    sidebar.appendChild(header);
    sidebar.appendChild(cardsContainer);
    document.body.appendChild(sidebar);
  }

  function buildMessageBubble(message) {
    const bubble = document.createElement("div");
    const isUser = message.role === "user";

    Object.assign(bubble.style, {
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "88%",
      padding: "11px 13px",
      borderRadius: "16px",
      fontSize: "13px",
      lineHeight: "1.55",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      background: isUser
        ? "linear-gradient(135deg, rgba(17,24,39,0.95), rgba(31,41,55,0.88))"
        : "rgba(255,255,255,0.30)",
      color: isUser ? "#ffffff" : "#1f2937",
      border: isUser
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(255,255,255,0.26)",
      boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
      backdropFilter: "blur(12px)"
    });

    bubble.textContent = message.content;
    return bubble;
  }

  function buildMessagesList(messages) {
    const wrapper = document.createElement("div");

    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "4px"
    });

    if (!messages || messages.length === 0) {
      const emptyText = document.createElement("div");
      emptyText.textContent = "No follow-up messages yet.";
      Object.assign(emptyText.style, {
        fontSize: "12px",
        color: "rgba(55,65,81,0.72)"
      });
      wrapper.appendChild(emptyText);
      return wrapper;
    }

    messages.forEach((message) => {
      wrapper.appendChild(buildMessageBubble(message));
    });

    return wrapper;
  }

  async function summarizeCardContext(selectedText, parentContext) {
    const response = await fetch(SUMMARY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        selectedText,
        parentContext
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }

    return data;
  }

  async function askGemini(card) {
    if (!isExtensionContextValid()) {
      throw new Error("Extension reloaded. Refresh the page.");
    }

    const messages = card.messages || [];
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        selectedText: card.selectedText,
        parentSummary: card.parentSummary || "",
        keyPoints: card.keyPoints || [],
        messages,
        question: lastUserMessage ? lastUserMessage.content : ""
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }

    return data.answer;
  }

  async function refreshCard(cardId, cardElement) {
    const cardData = await getCardById(cardId);
    if (!cardData || !cardElement) return;

    const newCard = createCardElement(cardData);
    cardElement.replaceWith(newCard);
  }

  async function handleSendMessage(cardId, input, sendBtn, cardElement) {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;

    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Thinking...";

    await updateCardInStorage(cardId, (card) => ({
      ...card,
      messages: [
        ...(card.messages || []),
        {
          role: "user",
          content: text,
          timestamp: Date.now()
        },
        {
          role: "assistant",
          content: "Thinking...",
          timestamp: Date.now(),
          pending: true
        }
      ]
    }));

    await refreshCard(cardId, cardElement);

    try {
      const card = await getCardById(cardId);
      const aiAnswer = await askGemini(card);

      await updateCardInStorage(cardId, (storedCard) => {
        const updatedMessages = [...(storedCard.messages || [])];
        const lastIndex = updatedMessages.findLastIndex((m) => m.pending);

        if (lastIndex !== -1) {
          updatedMessages[lastIndex] = {
            role: "assistant",
            content: aiAnswer,
            timestamp: Date.now()
          };
        }

        return {
          ...storedCard,
          messages: updatedMessages
        };
      });
    } catch (error) {
      await updateCardInStorage(cardId, (storedCard) => {
        const updatedMessages = [...(storedCard.messages || [])];
        const lastIndex = updatedMessages.findLastIndex((m) => m.pending);

        if (lastIndex !== -1) {
          updatedMessages[lastIndex] = {
            role: "assistant",
            content: `Error: ${error.message}`,
            timestamp: Date.now()
          };
        }

        return {
          ...storedCard,
          messages: updatedMessages
        };
      });
    }

    const updatedCardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    if (updatedCardElement) {
      await refreshCard(cardId, updatedCardElement);
    }
  }

  function createSectionLabel(text) {
    const label = document.createElement("div");
    label.textContent = text;
    Object.assign(label.style, {
      fontSize: "11px",
      fontWeight: "700",
      color: "rgba(55,65,81,0.66)",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    });
    return label;
  }

  function createCardElement(cardData) {
    const card = document.createElement("div");
    card.className = "ai-branch-card";
    card.dataset.cardId = cardData.id;

    Object.assign(card.style, {
      background: "rgba(255, 255, 255, 0.18)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.26)",
      borderRadius: "22px",
      padding: "16px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    });

    const cardHeader = document.createElement("div");
    Object.assign(cardHeader.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "10px"
    });

    const cardTitleWrap = document.createElement("div");
    Object.assign(cardTitleWrap.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      minWidth: "0"
    });

    const cardTitle = document.createElement("div");
    cardTitle.textContent = cardData.title || "Building context...";
    Object.assign(cardTitle.style, {
      fontSize: "15px",
      fontWeight: "700",
      color: "#111827",
      lineHeight: "1.35"
    });

    const conversationTag = document.createElement("div");
    conversationTag.textContent = getConversationKey();
    Object.assign(conversationTag.style, {
      fontSize: "11px",
      color: "rgba(55,65,81,0.68)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "240px"
    });

    cardTitleWrap.appendChild(cardTitle);
    cardTitleWrap.appendChild(conversationTag);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    Object.assign(deleteBtn.style, {
      border: "1px solid rgba(255,255,255,0.24)",
      background: "rgba(255, 99, 132, 0.10)",
      color: "#991b1b",
      padding: "7px 12px",
      borderRadius: "12px",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "600",
      backdropFilter: "blur(10px)"
    });

    deleteBtn.addEventListener("click", async () => {
      await deleteCardFromStorage(cardData.id);
      card.remove();
    });

    cardHeader.appendChild(cardTitleWrap);
    cardHeader.appendChild(deleteBtn);

    const selectedLabel = createSectionLabel("Selected text");

    const selectedTextBox = document.createElement("div");
    selectedTextBox.textContent = cardData.selectedText;
    Object.assign(selectedTextBox.style, {
      fontSize: "13px",
      lineHeight: "1.6",
      color: "#1f2937",
      background: "rgba(255,255,255,0.22)",
      border: "1px solid rgba(255,255,255,0.24)",
      borderRadius: "16px",
      padding: "12px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)"
    });

    const summaryLabel = createSectionLabel("Parent summary");

    const summaryBox = document.createElement("div");
    summaryBox.textContent = cardData.parentSummary || "Building branch context...";
    Object.assign(summaryBox.style, {
      fontSize: "13px",
      lineHeight: "1.6",
      color: "#374151",
      background: "rgba(255,255,255,0.20)",
      border: "1px solid rgba(255,255,255,0.24)",
      borderRadius: "16px",
      padding: "12px"
    });

    card.appendChild(cardHeader);
    card.appendChild(selectedLabel);
    card.appendChild(selectedTextBox);
    card.appendChild(summaryLabel);
    card.appendChild(summaryBox);

    if (cardData.keyPoints && cardData.keyPoints.length) {
      const keyPointsTitle = createSectionLabel("Important points");

      const keyPointsWrap = document.createElement("div");
      Object.assign(keyPointsWrap.style, {
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      });

      cardData.keyPoints.forEach((point) => {
        const pointRow = document.createElement("div");
        Object.assign(pointRow.style, {
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          background: "rgba(255,255,255,0.16)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: "14px",
          padding: "10px 12px"
        });

        const dot = document.createElement("div");
        dot.textContent = "•";
        Object.assign(dot.style, {
          fontSize: "16px",
          lineHeight: "1",
          color: "#111827",
          marginTop: "1px"
        });

        const text = document.createElement("div");
        text.textContent = point;
        Object.assign(text.style, {
          fontSize: "13px",
          lineHeight: "1.55",
          color: "#374151"
        });

        pointRow.appendChild(dot);
        pointRow.appendChild(text);
        keyPointsWrap.appendChild(pointRow);
      });

      card.appendChild(keyPointsTitle);
      card.appendChild(keyPointsWrap);
    }

    const sectionTitle = createSectionLabel("Branch conversation");

    const messagesContainer = document.createElement("div");
    messagesContainer.appendChild(buildMessagesList(cardData.messages || []));

    const inputWrapper = document.createElement("div");
    Object.assign(inputWrapper.style, {
      display: "flex",
      gap: "8px",
      marginTop: "2px"
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask a follow-up...";
    Object.assign(input.style, {
      flex: "1",
      padding: "12px 14px",
      border: "1px solid rgba(255,255,255,0.24)",
      borderRadius: "16px",
      fontSize: "13px",
      outline: "none",
      background: "rgba(255,255,255,0.20)",
      color: "#111827",
      backdropFilter: "blur(10px)"
    });

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";
    Object.assign(sendBtn.style, {
      border: "1px solid rgba(255,255,255,0.18)",
      background: "linear-gradient(135deg, rgba(17,24,39,0.95), rgba(31,41,55,0.86))",
      color: "#ffffff",
      padding: "12px 15px",
      borderRadius: "16px",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      boxShadow: "0 8px 20px rgba(0,0,0,0.12)"
    });

    sendBtn.addEventListener("click", async () => {
      await handleSendMessage(cardData.id, input, sendBtn, card);
    });

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await handleSendMessage(cardData.id, input, sendBtn, card);
      }
    });

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(sendBtn);

    const createdAt = document.createElement("div");
    createdAt.textContent = `Created: ${new Date(cardData.createdAt).toLocaleString()}`;
    Object.assign(createdAt.style, {
      fontSize: "11px",
      color: "rgba(55,65,81,0.64)"
    });

    card.appendChild(sectionTitle);
    card.appendChild(messagesContainer);
    card.appendChild(inputWrapper);
    card.appendChild(createdAt);

    return card;
  }

  async function renderStoredCards() {
    const cards = await getStoredCards();

    if (!cards.length) {
      if (cardsContainer) {
        cardsContainer.innerHTML = "";
      }
      return;
    }

    ensureSidebar();
    cardsContainer.innerHTML = "";

    for (const card of cards) {
      cardsContainer.appendChild(createCardElement(card));
    }
  }

  async function createBranchCard(selectedText) {
    ensureSidebar();

    const cardId = generateId();
    const parentContext = extractParentContext();

    const initialCard = {
      id: cardId,
      title: "Building context...",
      selectedText,
      parentContext,
      parentSummary: "Building branch context...",
      keyPoints: [],
      messages: [],
      createdAt: Date.now()
    };

    await addCardToStorage(initialCard);
    cardsContainer.prepend(createCardElement(initialCard));

    try {
      const summaryData = await summarizeCardContext(selectedText, parentContext);

      await updateCardInStorage(cardId, (card) => ({
        ...card,
        title: summaryData.title || "New Branch Card",
        parentSummary: summaryData.summary || "",
        keyPoints: summaryData.keyPoints || []
      }));

      const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
      if (cardElement) {
        await refreshCard(cardId, cardElement);
      }
    } catch (error) {
      await updateCardInStorage(cardId, (card) => ({
        ...card,
        title: "Context Error",
        parentSummary: `Could not build branch context: ${error.message}`,
        keyPoints: []
      }));

      const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
      if (cardElement) {
        await refreshCard(cardId, cardElement);
      }
    }
  }

  function createExplainButton(x, y, selectedText) {
    removeExplainButton();

    explainButton = document.createElement("button");
    explainButton.textContent = "Explain";

    Object.assign(explainButton.style, {
      position: "absolute",
      top: `${y + window.scrollY + 8}px`,
      left: `${x + window.scrollX}px`,
      zIndex: "999999",
      padding: "9px 13px",
      background: "rgba(17,24,39,0.88)",
      color: "#ffffff",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "14px",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
      backdropFilter: "blur(10px)"
    });

    explainButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      removeExplainButton();
      await createBranchCard(selectedText);
    });

    document.body.appendChild(explainButton);
  }

  function handleSelection() {
    const selectedText = getSelectedText();

    if (!selectedText) {
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

  let currentConversationKey = getConversationKey();

  setInterval(async () => {
    const newKey = getConversationKey();
    if (newKey !== currentConversationKey) {
      currentConversationKey = newKey;
      if (sidebar && cardsContainer) {
        cardsContainer.innerHTML = "";
      }
      await renderStoredCards();
    }
  }, 1000);

  renderStoredCards();

  console.log("AI Branch Cards Step 8 loaded.");
})();