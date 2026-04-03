(() => {
  const STORAGE_KEY = "ai_branch_cards";
  const API_URL = "http://127.0.0.1:5000/chat";

  let explainButton = null;
  let sidebar = null;
  let cardsContainer = null;

  function generateId() {
    return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async function getStoredCards() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
  }

  async function saveStoredCards(cards) {
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
    cardsContainer.id = "ai-branch-cards";
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

  async function askGemini(card) {
  const messages = card.messages || [];
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        selectedText: card.selectedText,
        messages,
        question: lastUserMessage ? lastUserMessage.content : ""
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : JSON.stringify(data.error)
      );
    }

    return data.answer;
  } catch (error) {
    console.error("Fetch error details:", error);
    throw new Error("Could not connect to backend. Make sure Flask server is running.");
  }
}

  async function refreshCardMessages(cardId, messagesContainer) {
    const updatedCard = await getCardById(cardId);
    messagesContainer.innerHTML = "";
    messagesContainer.appendChild(buildMessagesList(updatedCard.messages || []));
  }

  async function handleSendMessage(cardId, input, messagesContainer, sendBtn) {
    const text = input.value.trim();
    if (!text) return;

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
        }
      ]
    }));

    await refreshCardMessages(cardId, messagesContainer);

    try {
      const card = await getCardById(cardId);
      const aiAnswer = await askGemini(card);

      await updateCardInStorage(cardId, (storedCard) => ({
        ...storedCard,
        messages: [
          ...(storedCard.messages || []),
          {
            role: "assistant",
            content: aiAnswer,
            timestamp: Date.now()
          }
        ]
      }));

      await refreshCardMessages(cardId, messagesContainer);
    } catch (error) {
      await updateCardInStorage(cardId, (storedCard) => ({
        ...storedCard,
        messages: [
          ...(storedCard.messages || []),
          {
            role: "assistant",
            content: `Error: ${error.message}`,
            timestamp: Date.now()
          }
        ]
      }));

      await refreshCardMessages(cardId, messagesContainer);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
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
    cardTitle.textContent = cardData.title || "New Card";
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

    const introMessage = document.createElement("div");
    introMessage.textContent =
      cardData.message || "Branch card ready. Ask a follow-up question.";
    Object.assign(introMessage.style, {
      fontSize: "13px",
      lineHeight: "1.5",
      color: "#374151",
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      borderRadius: "10px",
      padding: "10px"
    });

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
      await handleSendMessage(cardData.id, input, messagesContainer, sendBtn);
    });

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await handleSendMessage(cardData.id, input, messagesContainer, sendBtn);
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

    card.appendChild(cardHeader);
    card.appendChild(label);
    card.appendChild(selectedTextBox);
    card.appendChild(introMessage);
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

  async function createDummyCard(selectedText) {
    ensureSidebar();

    const cardData = {
      id: generateId(),
      title: "New Branch Card",
      selectedText,
      message: "Branch card ready. Ask a follow-up question.",
      messages: [],
      createdAt: Date.now()
    };

    await addCardToStorage(cardData);
    cardsContainer.prepend(createCardElement(cardData));
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
      await createDummyCard(selectedText);
      removeExplainButton();
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

  console.log("AI Branch Cards Step 5 with Gemini loaded.");
})();