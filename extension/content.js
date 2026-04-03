(() => {
  const STORAGE_KEY = "ai_branch_cards";
  const CHAT_API_URL = "http://127.0.0.1:5000/chat";
  const SUMMARY_API_URL = "http://127.0.0.1:5000/summarize-card-context";

  let explainButton = null;
  let sidebar = null;
  let cardsContainer = null;

  function isExtensionContextValid() {
    return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
  }

  function generateId() {
    return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async function getStoredCards() {
    if (!isExtensionContextValid()) return [];
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
  }

  async function saveStoredCards(cards) {
    if (!isExtensionContextValid()) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
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

  function extractParentContext() {
    const text = document.body.innerText || "";
    return text.slice(-4000);
  }

  function ensureSidebar() {
    if (sidebar) return;

    sidebar = document.createElement("div");
    sidebar.id = "ai-branch-sidebar";

    Object.assign(sidebar.style, {
      position: "fixed",
      top: "0",
      right: "0",
      width: "380px",
      height: "100vh",
      background: "#ffffff",
      borderLeft: "1px solid #e5e7eb",
      boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
      zIndex: "999998",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Arial, sans-serif"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: "1px solid #e5e7eb",
      background: "#f9fafb"
    });

    const title = document.createElement("div");
    title.textContent = "Branch Cards";
    Object.assign(title.style, {
      fontSize: "16px",
      fontWeight: "600",
      color: "#111827"
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
      border: "none",
      background: "transparent",
      fontSize: "18px",
      cursor: "pointer",
      color: "#6b7280"
    });

    closeBtn.addEventListener("click", () => {
      sidebar.remove();
      sidebar = null;
      cardsContainer = null;
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    cardsContainer = document.createElement("div");
    Object.assign(cardsContainer.style, {
      flex: "1",
      overflowY: "auto",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      background: "#f3f4f6"
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
      maxWidth: "85%",
      padding: "10px 12px",
      borderRadius: "12px",
      fontSize: "13px",
      lineHeight: "1.5",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      background: isUser ? "#111827" : "#eef2ff",
      color: isUser ? "#ffffff" : "#1f2937",
      border: isUser ? "none" : "1px solid #c7d2fe"
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
        color: "#6b7280"
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
    sendBtn.textContent = "Sending...";

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

  function createCardElement(cardData) {
    const card = document.createElement("div");
    card.className = "ai-branch-card";
    card.dataset.cardId = cardData.id;

    Object.assign(card.style, {
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      padding: "14px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    });

    const cardHeader = document.createElement("div");
    Object.assign(cardHeader.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "8px"
    });

    const cardTitle = document.createElement("div");
    cardTitle.textContent = cardData.title || "Building context...";
    Object.assign(cardTitle.style, {
      fontSize: "14px",
      fontWeight: "600",
      color: "#111827"
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    Object.assign(deleteBtn.style, {
      border: "none",
      background: "#fee2e2",
      color: "#991b1b",
      padding: "6px 10px",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "12px"
    });

    deleteBtn.addEventListener("click", async () => {
      await deleteCardFromStorage(cardData.id);
      card.remove();
    });

    cardHeader.appendChild(cardTitle);
    cardHeader.appendChild(deleteBtn);

    const label = document.createElement("div");
    label.textContent = "Selected text";
    Object.assign(label.style, {
      fontSize: "12px",
      fontWeight: "600",
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    });

    const selectedTextBox = document.createElement("div");
    selectedTextBox.textContent = cardData.selectedText;
    Object.assign(selectedTextBox.style, {
      fontSize: "14px",
      lineHeight: "1.5",
      color: "#111827",
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      borderRadius: "10px",
      padding: "10px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    });

    const summaryBox = document.createElement("div");
    summaryBox.textContent = cardData.parentSummary || "Building branch context...";
    Object.assign(summaryBox.style, {
      fontSize: "13px",
      lineHeight: "1.5",
      color: "#374151",
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      borderRadius: "10px",
      padding: "10px"
    });

    card.appendChild(cardHeader);
    card.appendChild(label);
    card.appendChild(selectedTextBox);
    card.appendChild(summaryBox);

    if (cardData.keyPoints && cardData.keyPoints.length) {
      const keyPointsTitle = document.createElement("div");
      keyPointsTitle.textContent = "Important points";
      Object.assign(keyPointsTitle.style, {
        fontSize: "12px",
        fontWeight: "600",
        color: "#6b7280",
        textTransform: "uppercase",
        letterSpacing: "0.04em"
      });

      const keyPointsList = document.createElement("ul");
      Object.assign(keyPointsList.style, {
        margin: "0",
        paddingLeft: "18px",
        fontSize: "13px",
        color: "#374151",
        lineHeight: "1.6"
      });

      cardData.keyPoints.forEach((point) => {
        const li = document.createElement("li");
        li.textContent = point;
        keyPointsList.appendChild(li);
      });

      card.appendChild(keyPointsTitle);
      card.appendChild(keyPointsList);
    }

    const sectionTitle = document.createElement("div");
    sectionTitle.textContent = "Branch conversation";
    Object.assign(sectionTitle.style, {
      fontSize: "12px",
      fontWeight: "600",
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    });

    const messagesContainer = document.createElement("div");
    messagesContainer.appendChild(buildMessagesList(cardData.messages || []));

    const inputWrapper = document.createElement("div");
    Object.assign(inputWrapper.style, {
      display: "flex",
      gap: "8px",
      marginTop: "4px"
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask a follow-up...";
    Object.assign(input.style, {
      flex: "1",
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: "10px",
      fontSize: "13px",
      outline: "none"
    });

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";
    Object.assign(sendBtn.style, {
      border: "none",
      background: "#111827",
      color: "#ffffff",
      padding: "10px 14px",
      borderRadius: "10px",
      cursor: "pointer",
      fontSize: "13px"
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
      color: "#6b7280"
    });

    card.appendChild(sectionTitle);
    card.appendChild(messagesContainer);
    card.appendChild(inputWrapper);
    card.appendChild(createdAt);

    return card;
  }

  async function renderStoredCards() {
    const cards = await getStoredCards();
    if (!cards.length) return;

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
      padding: "8px 12px",
      background: "#111827",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "13px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
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

  renderStoredCards();

  console.log("AI Branch Cards Step 6 loaded.");
})();