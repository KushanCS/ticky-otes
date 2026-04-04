(() => {
  const { generateId } = window.Helpers;
  const {
    getStoredCards,
    addCardToStorage,
    deleteCardFromStorage,
    updateCardInStorage,
    getCardById
  } = window.StorageUtils;
  const { summarizeCardContext, askGemini } = window.ApiUtils;
  const { extractParentContext } = window.ContextExtractor;
  const { ensureSidebar, getCardsContainer, showEmptyState } = window.SidebarUI;

  function buildMessageBubble(message) {
    const bubble = document.createElement("div");
    bubble.className = `ai-branch-bubble ${message.role === "user" ? "user" : "assistant"}`;
    bubble.textContent = message.content;
    return bubble;
  }

  function buildMessagesList(messages) {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-branch-messages";

    if (!messages || messages.length === 0) {
      const emptyText = document.createElement("div");
      emptyText.className = "ai-branch-empty-text";
      emptyText.textContent = "No follow-up messages yet.";
      wrapper.appendChild(emptyText);
      return wrapper;
    }

    messages.forEach((message) => {
      wrapper.appendChild(buildMessageBubble(message));
    });

    return wrapper;
  }

  function createSectionLabel(text) {
    const label = document.createElement("div");
    label.className = "ai-branch-section-label";
    label.textContent = text;
    return label;
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
      if (!card) return;

      const aiAnswer = await askGemini(card);

      await updateCardInStorage(cardId, (storedCard) => {
        if (!storedCard) return storedCard;

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
        if (!storedCard) return storedCard;

        const updatedMessages = [...(storedCard.messages || [])];
        const lastIndex = updatedMessages.findLastIndex((m) => m.pending);

        if (lastIndex !== -1) {
          updatedMessages[lastIndex] = {
            role: "assistant",
            content: error.message,
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

    const cardHeader = document.createElement("div");
    cardHeader.className = "ai-branch-card-header";

    const cardTitleWrap = document.createElement("div");
    cardTitleWrap.className = "ai-branch-card-title-wrap";

    const cardTitle = document.createElement("div");
    cardTitle.className = "ai-branch-card-title";
    cardTitle.textContent = cardData.title || "Building context...";


    cardTitleWrap.appendChild(cardTitle);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ai-branch-delete-btn";
    deleteBtn.textContent = "Delete";

    deleteBtn.addEventListener("click", async () => {
      await deleteCardFromStorage(cardData.id);
      await renderStoredCards();
    });

    cardHeader.appendChild(cardTitleWrap);
    cardHeader.appendChild(deleteBtn);

    const selectedLabel = createSectionLabel("Selected text");

    const selectedTextBox = document.createElement("div");
    selectedTextBox.className = "ai-branch-selected-text";
    selectedTextBox.textContent = cardData.selectedText;

    const summaryLabel = createSectionLabel("Parent summary");

    const summaryBox = document.createElement("div");
    summaryBox.className = "ai-branch-summary-box";
    summaryBox.textContent = cardData.parentSummary || "Building branch context...";

    card.appendChild(cardHeader);
    card.appendChild(selectedLabel);
    card.appendChild(selectedTextBox);
    card.appendChild(summaryLabel);
    card.appendChild(summaryBox);

    if (cardData.keyPoints && cardData.keyPoints.length) {
      const keyPointsTitle = createSectionLabel("Important points");

      const keyPointsWrap = document.createElement("div");
      keyPointsWrap.className = "ai-branch-keypoints-wrap";

      cardData.keyPoints.forEach((point) => {
        const pointRow = document.createElement("div");
        pointRow.className = "ai-branch-keypoint-row";

        const dot = document.createElement("div");
        dot.className = "ai-branch-keypoint-dot";
        dot.textContent = "•";

        const text = document.createElement("div");
        text.className = "ai-branch-keypoint-text";
        text.textContent = point;

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
    inputWrapper.className = "ai-branch-input-row";

    const input = document.createElement("input");
    input.className = "ai-branch-input";
    input.type = "text";
    input.placeholder = "Ask a follow-up...";

    const sendBtn = document.createElement("button");
    sendBtn.className = "ai-branch-send-btn";
    sendBtn.textContent = "Send";

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
    createdAt.className = "ai-branch-meta";
    createdAt.textContent = `Created: ${new Date(cardData.createdAt).toLocaleString()}`;

    card.appendChild(sectionTitle);
    card.appendChild(messagesContainer);
    card.appendChild(inputWrapper);
    card.appendChild(createdAt);

    return card;
  }

  async function renderStoredCards() {
    const cards = await getStoredCards();
    const existingContainer = getCardsContainer();

    if (!cards.length) {
      if (!existingContainer) return;
      showEmptyState();
      return;
    }

    ensureSidebar();

    const cardsContainer = getCardsContainer();
    cardsContainer.innerHTML = "";

    for (const card of cards) {
      cardsContainer.appendChild(createCardElement(card));
    }
  }

  async function createBranchCard(selectedText) {
    const normalizedSelectedText = (selectedText || "").trim();
    if (!normalizedSelectedText) return;

    ensureSidebar();

    const cardId = generateId();
    const parentContext = extractParentContext();

    const initialCard = {
      id: cardId,
      title: "Building context...",
      selectedText: normalizedSelectedText,
      parentContext,
      parentSummary: "Building branch context...",
      keyPoints: [],
      messages: [],
      createdAt: Date.now()
    };

    await addCardToStorage(initialCard);
    await renderStoredCards();

    try {
      const summaryData = await summarizeCardContext(normalizedSelectedText, parentContext);

      await updateCardInStorage(cardId, (card) => {
        if (!card) return card;

        return {
          ...card,
          title: summaryData.title || "New Branch Card",
          parentSummary: summaryData.summary || "",
          keyPoints: summaryData.keyPoints || []
        };
      });

      const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
      if (cardElement) {
        await refreshCard(cardId, cardElement);
      }
    } catch (error) {
      await updateCardInStorage(cardId, (card) => {
        if (!card) return card;

        return {
          ...card,
          title: "Context Error",
          parentSummary: `Could not build branch context: ${error.message || String(error)}`,
          keyPoints: []
        };
      });

      const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
      if (cardElement) {
        await refreshCard(cardId, cardElement);
      }
    }
  }

  window.CardUI = {
    renderStoredCards,
    createBranchCard
  };
})();
