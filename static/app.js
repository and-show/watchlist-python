const searchInput = document.getElementById("search");
const resultsDiv = document.getElementById("results");
const listDiv = document.getElementById("list");
const watchedDiv = document.getElementById("watched");
const listCount = document.getElementById("list-count");
const watchedCount = document.getElementById("watched-count");
const listEmpty = document.getElementById("list-empty");
const watchedEmpty = document.getElementById("watched-empty");
const raffleResult = document.getElementById("raffleResult");
const modal = document.getElementById("modalDetail");
const modalBody = document.getElementById("modalBody");
const modalClose = document.querySelector(".modal-close");
const personRadios = document.querySelectorAll("input[name='added_by']");

const people = {
  and: "and",
  lelet: "lelet",
};

let currentList = [];
let currentWatched = [];
let addedBy = "and";
let searchTimeout;
let currentDetailItem = null;

personRadios.forEach((radio) => {
  radio.addEventListener("change", (event) => {
    addedBy = event.target.value;
  });
});

modalClose.addEventListener("click", () => modal.classList.remove("open"));
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.classList.remove("open");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    modal.classList.remove("open");
    searchInput.value = "";
    resultsDiv.innerHTML = "";
  }
});

function fallbackPoster(width = 150, height = 220) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'%3E%3Crect fill='%231e293b' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%2394a3b8' text-anchor='middle' dy='.3em'%3ESem imagem%3C/text%3E%3C/svg%3E`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemPayload(item) {
  return encodeURIComponent(JSON.stringify(item)).replaceAll("'", "%27");
}

function itemFromPayload(payload) {
  return JSON.parse(decodeURIComponent(payload));
}

function formatDate(value) {
  if (!value) return "Data desconhecida";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data desconhecida";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderStars(rating = 0, interactive = false) {
  return Array.from({ length: 5 }, (_, index) => {
    const value = index + 1;
    const activeClass = value <= rating ? "active" : "";
    const label = `${value} estrela${value > 1 ? "s" : ""}`;

    if (!interactive) {
      return `<span class="star ${activeClass}" aria-hidden="true">&#9733;</span>`;
    }

    return `<button class="star ${activeClass}" type="button" onclick="setRating(${value})" aria-label="Avaliar com ${label}">&#9733;</button>`;
  }).join("");
}

function renderRatingText(rating) {
  return rating ? `${rating}/5` : "Sem nota";
}

function renderDateInfo(item) {
  if (item.watched) {
    return {
      label: "Assistido em",
      value: formatDate(item.watched_at),
    };
  }

  return {
    label: `Escolhido por ${people[item.added_by] || "Alguem"}`,
    value: formatDate(item.added_at),
  };
}

function renderItem(item) {
  const imageUrl = item.poster || fallbackPoster(150, 220);
  const dateInfo = renderDateInfo(item);

  return `
    <article class="item-card" title="${escapeHtml(item.title)}" onclick="openItemDetailFromPayload('${itemPayload(item)}')">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
      <div class="overlay">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="couple-status">
          <span>${escapeHtml(dateInfo.label)}</span>
          <span>${escapeHtml(dateInfo.value)}</span>
          <span class="mini-rating"><span class="mini-stars">${renderStars(item.rating || 0)}</span><span class="rating-label">${escapeHtml(renderRatingText(item.rating))}</span></span>
        </div>
        <div class="item-actions">
          <button class="item-btn watch-btn" onclick="event.stopPropagation(); toggleWatchedFromPayload('${itemPayload(item)}')">
            ${item.watched ? "Voltar" : "Marcar assistido"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderSearchResult(item) {
  const imageUrl = item.poster || fallbackPoster(150, 220);

  return `
    <article class="item-card" onclick="addToListFromPayload('${itemPayload(item)}')" title="Adicionar: ${escapeHtml(item.title)}">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
      <div class="overlay">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-actions">
          <button class="item-btn add-btn">+ Adicionar</button>
        </div>
      </div>
    </article>
  `;
}

function openItemDetailFromPayload(payload) {
  openItemDetail(itemFromPayload(payload));
}

function toggleWatchedFromPayload(payload) {
  toggleWatched(itemFromPayload(payload));
}

function addToListFromPayload(payload) {
  addToList(itemFromPayload(payload));
}

function openItemDetail(item) {
  currentDetailItem = item;
  const addedByLabel = people[item.added_by] || "Alguem";
  const dateInfo = renderDateInfo(item);

  modalBody.innerHTML = `
    <div class="detail-header">
      <img src="${escapeHtml(item.poster || fallbackPoster(200, 300))}" alt="${escapeHtml(item.title)}">
      <div>
        <p class="eyebrow">${escapeHtml(item.type || "item")}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>Escolhido por ${escapeHtml(addedByLabel)}</p>
        <p>${escapeHtml(dateInfo.label)}: ${escapeHtml(dateInfo.value)}</p>
      </div>
    </div>

    <section class="detail-section status-panel">
      <h3>Status</h3>
      <span class="watched-badge ${item.watched ? "yes" : "no"}">
        ${item.watched ? "Assistido" : "Ainda na lista"}
      </span>
    </section>

    <section class="detail-section rating-panel">
      <h3>Avaliacao do lero-lero</h3>
      <div class="stars" role="group" aria-label="Avaliacao em estrelas">
        ${renderStars(item.rating || 0, true)}
      </div>
      <p>${escapeHtml(renderRatingText(item.rating))}</p>
    </section>

    <div class="modal-actions">
      <button class="item-btn watch-btn" onclick="toggleWatchedFromModal()">
        ${item.watched ? "Voltar para a lista" : "Marcar assistido"}
      </button>
      <button class="item-btn remove-btn" onclick="deleteItemConfirm()">Remover</button>
    </div>
  `;

  modal.classList.add("open");
}

async function setRating(rating) {
  await updateItem({ rating });
  showNotification(`Nota salva: ${rating}/5`);
}

async function updateItem(changes, refreshModal = true) {
  const response = await fetch("/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: currentDetailItem.title,
      ...changes,
    }),
  });

  const data = await response.json();
  if (data.status !== "ok") {
    showNotification(data.message || "Nao foi possivel atualizar");
    return;
  }

  currentDetailItem = data.item;
  await loadLists();
  if (refreshModal && modal.classList.contains("open")) openItemDetail(data.item);
}

async function toggleWatched(item) {
  currentDetailItem = item;
  const nextValue = !Boolean(item.watched);
  await updateItem({ watched: nextValue }, false);
  showNotification(nextValue ? "Marcado como assistido" : "Voltou para a lista");
}

async function toggleWatchedFromModal() {
  await toggleWatched(currentDetailItem);
  if (currentDetailItem) openItemDetail(currentDetailItem);
}

async function addToList(item) {
  const exists = [...currentList, ...currentWatched].some((movie) => movie.title === item.title);
  if (exists) {
    showNotification("Ja esta na lista");
    return;
  }

  const response = await fetch("/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, added_by: addedBy }),
  });

  const data = await response.json();
  if (data.status === "ok") {
    showNotification("Entrou no Lero-Lero & Nhenhenhe");
    searchInput.value = "";
    resultsDiv.innerHTML = "";
    await loadLists();
    return;
  }

  showNotification(data.message || "Erro ao adicionar");
}

async function deleteItemConfirm() {
  if (!confirm("Tem certeza que deseja remover este item?")) return;

  await fetch("/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: currentDetailItem.title }),
  });

  showNotification("Item removido");
  modal.classList.remove("open");
  await loadLists();
}

async function loadLists() {
  try {
    const [list, watched] = await Promise.all([
      fetch("/list").then((response) => response.json()),
      fetch("/watched").then((response) => response.json()),
    ]);

    currentList = list;
    currentWatched = watched;
    listCount.textContent = list.length;
    watchedCount.textContent = watched.length;

    listEmpty.style.display = list.length ? "none" : "flex";
    watchedEmpty.style.display = watched.length ? "none" : "flex";
    listDiv.innerHTML = list.map(renderItem).join("");
    watchedDiv.innerHTML = watched.map(renderItem).join("");
  } catch (error) {
    console.error("Erro ao carregar listas:", error);
    showNotification("Erro ao carregar listas");
  }
}

async function sorteiaFilme() {
  try {
    const data = await fetch("/random").then((response) => response.json());
    raffleResult.style.display = "block";

    if (data.status !== "ok") {
      raffleResult.innerHTML = `<h2>${escapeHtml(data.message || "Nada para sortear")}</h2>`;
      return;
    }

    const item = data.item;
    raffleResult.innerHTML = `
      <h2>Sorteado: ${escapeHtml(item.title)}</h2>
      <img src="${escapeHtml(item.poster || fallbackPoster(250, 350))}" alt="${escapeHtml(item.title)}">
      <p>Foi escolhido por ${escapeHtml(people[item.added_by] || "alguem")} em ${escapeHtml(formatDate(item.added_at))}</p>
      <button class="item-btn watch-btn raffle-open" onclick="openItemDetailFromPayload('${itemPayload(item)}')">Abrir detalhes</button>
    `;
  } catch (error) {
    console.error("Erro no sorteio:", error);
    showNotification("Erro ao sortear");
  }
}

searchInput.addEventListener("input", (event) => {
  const query = event.target.value.trim();
  clearTimeout(searchTimeout);

  if (!query) {
    resultsDiv.innerHTML = "";
    return;
  }

  resultsDiv.innerHTML = '<div class="search-message">Buscando...</div>';

  searchTimeout = setTimeout(async () => {
    try {
      const data = await fetch(`/search?q=${encodeURIComponent(query)}`).then((response) => response.json());
      resultsDiv.innerHTML = data.length
        ? data.map(renderSearchResult).join("")
        : '<div class="search-message">Nenhum resultado encontrado</div>';
    } catch (error) {
      console.error("Erro na busca:", error);
      resultsDiv.innerHTML = '<div class="search-message error">Erro ao buscar</div>';
    }
  }, 300);
});

function showNotification(message) {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("leaving");
    setTimeout(() => notification.remove(), 250);
  }, 2400);
}

loadLists();
setInterval(loadLists, 5000);
