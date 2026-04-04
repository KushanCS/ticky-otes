(() => {
  let sidebar = null;
  let cardsContainer = null;

  function createEmptyState() {
    const empty = document.createElement("div");
    empty.className = "ai-branch-empty-state";
    empty.textContent = "No branch cards in this conversation yet.";
    return empty;
  }

  function ensureSidebar() {
    if (sidebar) return { sidebar, cardsContainer };

    sidebar = document.createElement("div");
    sidebar.id = "ai-branch-sidebar";

    const header = document.createElement("div");
    header.className = "ai-branch-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "ai-branch-header-title-wrap";

    const title = document.createElement("div");
    title.className = "ai-branch-header-title";
    title.textContent = "Branch Cards";


    titleWrap.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ai-branch-close-btn";
    closeBtn.textContent = "✕";

    closeBtn.addEventListener("click", () => {
      sidebar.remove();
      sidebar = null;
      cardsContainer = null;
    });

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    cardsContainer = document.createElement("div");
    cardsContainer.id = "ai-branch-cards";

    sidebar.appendChild(header);
    sidebar.appendChild(cardsContainer);
    document.body.appendChild(sidebar);

    return { sidebar, cardsContainer };
  }

  function getCardsContainer() {
    return cardsContainer;
  }

  function showEmptyState() {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = "";
    cardsContainer.appendChild(createEmptyState());
  }

  window.SidebarUI = {
    ensureSidebar,
    getCardsContainer,
    showEmptyState
  };
})();