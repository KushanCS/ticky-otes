(() => {
  const { BACKEND_BASE_URL, CHAT_API_URL, SUMMARY_API_URL } = window.AppConstants;
  const { isExtensionContextValid } = window.Helpers;

  async function fetchJson(url, payload) {
    let response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new Error(
        `Cannot reach the backend at ${BACKEND_BASE_URL}. Make sure \`./.venv/bin/python backend/app.py\` is running, then reload the ChatGPT tab.`
      );
    }

    let data = {};

    try {
      data = await response.json();
    } catch (error) {
      if (!response.ok) {
        throw new Error("Backend returned an invalid response.");
      }
    }

    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Backend request failed."
      );
    }

    return data;
  }

  async function summarizeCardContext(selectedText, parentContext) {
    if (!isExtensionContextValid()) {
      throw new Error("Extension reloaded. Refresh the page.");
    }

    return fetchJson(SUMMARY_API_URL, {
      selectedText,
      parentContext
    });
  }

  async function askGemini(card) {
    if (!isExtensionContextValid()) {
      throw new Error("Extension reloaded. Refresh the page.");
    }

    const messages = (card.messages || []).filter((message) => !message.pending);
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

    if (!lastUserMessage) {
      throw new Error("Missing question for this branch card.");
    }

    const data = await fetchJson(CHAT_API_URL, {
      selectedText: card.selectedText,
      parentSummary: card.parentSummary || "",
      keyPoints: card.keyPoints || [],
      messages,
      question: lastUserMessage ? lastUserMessage.content : ""
    });

    return data.answer;
  }

  window.ApiUtils = {
    summarizeCardContext,
    askGemini
  };
})();
