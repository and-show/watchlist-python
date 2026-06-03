/* ═══════════════════════════════════════════════════════════════
   app.js — Lero-Lero & Nhenhenhe
   Fixes aplicados:
   - addedBy() vira função (lê radio em tempo real)
   - toggleWatched usa /watch e /unwatch em vez de /update
   - itemPayload removido; itens acessados por índice no array
   - polling aumentado para 30s
   - tipos consistentes com o backend (Filme / Série / Anime)
═══════════════════════════════════════════════════════════════ */

// ── DOM REFS ──────────────────────────────────────────────────
const searchInput  = document.getElementById("search");
const resultsDiv   = document.getElementById("results");
const listDiv      = document.getElementById("list");
const watchedDiv   = document.getElementById("watched");
const listCount    = document.getElementById("list-count");
const watchedCount = document.getElementById("watched-count");
const listEmpty    = document.getElementById("list-empty");
const watchedEmpty = document.getElementById("watched-empty");
const raffleResult = document.getElementById("raffleResult");
const modal        = document.getElementById("modalDetail");
const modalBody    = document.getElementById("modalBody");
const modalClose   = document.querySelector(".modal-close");

// ── STATE ─────────────────────────────────────────────────────
let currentList    = [];
let currentWatched = [];
let currentDetail  = null;   // item aberto no modal
let searchTimeout  = null;

// ── HELPERS ───────────────────────────────────────────────────

// FIX: lê o radio em tempo real em vez de usar variável stale
function addedBy() {
  return document.querySelector("input[name='added_by']:checked")?.value ?? "and";
}

const PEOPLE = { and: "and", lelet: "lelet" };

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fallbackPoster(w = 150, h = 220) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'%3E%3Crect fill='%231e293b' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%2394a3b8' text-anchor='middle' dy='.3em'%3ESem imagem%3C/text%3E%3C/svg%3E`;
}

function formatDate(value) {
  if (!value) return "Data desconhecida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data desconhecida";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function renderStars(rating = 0, interactive = false) {
  return Array.from({ length: 5 }, (_, i) => {
    const value      = i + 1;
    const activeClass = value <= rating ? "active" : "";
    if (!interactive) {
      return `<span class="star ${activeClass}" aria-hidden="true">&#9733;</span>`;
    }
    return `<button class="star ${activeClass}" type="button"
      onclick="setRating(${value})"
      aria-label="Avaliar com ${value} estrela${value > 1 ? "s" : ""}">&#9733;</button>`;
  }).join("");
}

function renderRatingText(rating) {
  return rating ? `${rating}/5` : "Sem nota";
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  // FastAPI retorna detail no corpo em erros HTTP
  const data = await res.json().catch(() => ({}));
  return data;
}

// ── MODAL ─────────────────────────────────────────────────────

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    searchInput.value = "";
    resultsDiv.innerHTML = "";
  }
});

function closeModal() {
  modal.classList.remove("open");
  currentDetail = null;
}

function openItemDetail(item) {
  currentDetail = item;
  const addedByLabel = PEOPLE[item.added_by] || "Alguém";
  const dateInfo = item.watched
    ? { label: "Assistido em", value: formatDate(item.watched_at) }
    : { label: `Escolhido por ${addedByLabel}`, value: formatDate(item.added_at) };

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
      <h3>Avaliação do lero-lero</h3>
      <div class="stars" role="group" aria-label="Avaliação em estrelas">
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

// ── RATING ────────────────────────────────────────────────────

async function setRating(rating) {
  if (!currentDetail) return;
  const data = await apiFetch("/update", {
    method: "POST",
    body: JSON.stringify({ title: currentDetail.title, rating }),
  });
  if (data.status !== "ok") {
    showNotification(data.detail?.message || data.message || "Não foi possível salvar nota");
    return;
  }
  showNotification(`Nota salva: ${rating}/5`);
  currentDetail = data.item;
  await loadLists();
  if (modal.classList.contains("open")) openItemDetail(currentDetail);
}

// ── WATCH / UNWATCH ───────────────────────────────────────────
// FIX: usa /watch e /unwatch em vez de /update com watched:bool
// Isso garante que o item seja movido entre coleções no Firestore.

async function toggleWatched(item) {
  const endpoint = item.watched ? "/unwatch" : "/watch";
  const data = await apiFetch(endpoint, {
    method: "POST",
    body: JSON.stringify({ title: item.title }),
  });
  if (data.status !== "ok") {
    showNotification(data.detail?.message || data.message || "Erro ao atualizar status");
    return;
  }
  showNotification(item.watched ? "Voltou para a lista" : "Marcado como assistido");
  await loadLists();
  return data.item;
}

async function toggleWatchedFromModal() {
  if (!currentDetail) return;
  const updated = await toggleWatched(currentDetail);
  if (updated && modal.classList.contains("open")) openItemDetail(updated);
}

// ── LISTS ─────────────────────────────────────────────────────

async function loadLists() {
  try {
    if (!currentList.length && !currentWatched.length) {
      listDiv.innerHTML = renderSkeletonCards();
      watchedDiv.innerHTML = renderSkeletonCards();
    }

    const [list, watched] = await Promise.all([
      apiFetch("/list"),
      apiFetch("/watched"),
    ]);

    // apiFetch retorna o array direto nesses endpoints
    currentList    = Array.isArray(list)    ? list    : [];
    currentWatched = Array.isArray(watched) ? watched : [];

    listCount.textContent    = currentList.length;
    watchedCount.textContent = currentWatched.length;

    listEmpty.style.display    = currentList.length    ? "none" : "flex";
    watchedEmpty.style.display = currentWatched.length ? "none" : "flex";

    // FIX: passa índice ao card em vez de serializar o objeto inteiro
    listDiv.innerHTML    = currentList.map((item, i) => renderItem(item, i, false)).join("");
    watchedDiv.innerHTML = currentWatched.map((item, i) => renderItem(item, i, true)).join("");
  } catch (error) {
    console.error("Erro ao carregar listas:", error);
    showNotification("Erro ao carregar listas");
  }
}

// FIX: recebe índice; onclick usa getItem() em vez de payload serializado
function renderSkeletonCards(count = 6) {
  return Array.from({ length: count }, () => `
    <article class="item-card skeleton-card" aria-hidden="true">
      <div class="skeleton-poster"></div>
      <div class="skeleton-overlay">
        <span></span>
        <span></span>
      </div>
    </article>
  `).join("");
}

function renderItem(item, index, isWatched) {
  const imageUrl  = item.poster || fallbackPoster(150, 220);
  const dateInfo  = isWatched
    ? { label: "Assistido em",  value: formatDate(item.watched_at) }
    : { label: `Por ${PEOPLE[item.added_by] || "alguém"}`, value: formatDate(item.added_at) };

  return `
    <article class="item-card" title="${escapeHtml(item.title)}"
      onclick="openItemByIndex(${index}, ${isWatched})">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
      <div class="overlay">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="couple-status">
          <span>${escapeHtml(dateInfo.label)}</span>
          <span>${escapeHtml(dateInfo.value)}</span>
          <span class="mini-rating">
            <span class="mini-stars">${renderStars(item.rating || 0)}</span>
            <span class="rating-label">${escapeHtml(renderRatingText(item.rating))}</span>
          </span>
        </div>
        <div class="item-actions">
          <button class="item-btn watch-btn"
            onclick="event.stopPropagation(); toggleWatchedByIndex(${index}, ${isWatched})">
            ${isWatched ? "Voltar" : "Marcar assistido"}
          </button>
        </div>
      </div>
    </article>
  `;
}

// FIX: acessa item pelo índice no array em memória — sem serialização frágil
function openItemByIndex(index, isWatched) {
  const item = isWatched ? currentWatched[index] : currentList[index];
  if (item) openItemDetail(item);
}

async function toggleWatchedByIndex(index, isWatched) {
  const item = isWatched ? currentWatched[index] : currentList[index];
  if (item) await toggleWatched(item);
}

// ── SEARCH ────────────────────────────────────────────────────

searchInput.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchTimeout);
  if (!query) { resultsDiv.innerHTML = ""; return; }

  resultsDiv.innerHTML = '<div class="search-message">Buscando...</div>';

  searchTimeout = setTimeout(async () => {
    try {
      const data = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
      const items = Array.isArray(data) ? data : [];
      resultsDiv.innerHTML = items.length
        ? items.map((item, i) => renderSearchResult(item, i)).join("")
        : '<div class="search-message">Nenhum resultado encontrado</div>';
      resultsDiv._searchResults = items;
    } catch {
      resultsDiv.innerHTML = '<div class="search-message error">Erro ao buscar</div>';
    }
  }, 300);
});

function renderSearchResult(item, index) {
  const imageUrl = item.poster || fallbackPoster(150, 220);
  return `
    <article class="item-card"
      onclick="addToListByIndex(${index})"
      title="Adicionar: ${escapeHtml(item.title)}">
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

async function addToListByIndex(index) {
  const item = resultsDiv._searchResults?.[index];
  if (!item) return;

  const alreadyIn = [...currentList, ...currentWatched]
    .some((m) => m.title.toLowerCase() === item.title.toLowerCase());

  if (alreadyIn) { showNotification("Já está na lista"); return; }

  const data = await apiFetch("/add", {
    method: "POST",
    body: JSON.stringify({ ...item, added_by: addedBy() }),
  });

  if (data.status === "ok") {
    showNotification("Entrou no Lero-Lero & Nhenhenhe!");
    searchInput.value    = "";
    resultsDiv.innerHTML = "";
    await loadLists();
  } else {
    showNotification(data.detail?.message || data.message || "Erro ao adicionar");
  }
}

// ── RAFFLE ────────────────────────────────────────────────────

async function sorteiaFilme() {
  try {
    const data = await apiFetch("/random");
    raffleResult.style.display = "block";

    if (data.status !== "ok") {
      raffleResult.innerHTML = `<h2>${escapeHtml(data.detail?.message || data.message || "Nada para sortear")}</h2>`;
      return;
    }

    const item = data.item;
    raffleResult.innerHTML = `
      <h2>Sorteado: ${escapeHtml(item.title)}</h2>
      <img src="${escapeHtml(item.poster || fallbackPoster(250, 350))}" alt="${escapeHtml(item.title)}">
      <p>Escolhido por ${escapeHtml(PEOPLE[item.added_by] || "alguém")} em ${escapeHtml(formatDate(item.added_at))}</p>
      <button class="item-btn watch-btn raffle-open" onclick="openRaffledItem()">Abrir detalhes</button>
    `;
    // guarda item sorteado para o botão "Abrir detalhes"
    raffleResult._item = item;
  } catch {
    showNotification("Erro ao sortear");
  }
}

function openRaffledItem() {
  const item = raffleResult._item;
  if (item) openItemDetail(item);
}

// ── DELETE ────────────────────────────────────────────────────

async function deleteItemConfirm() {
  if (!currentDetail) return;
  if (!confirm(`Remover "${currentDetail.title}" da lista?`)) return;

  await apiFetch("/delete", {
    method: "POST",
    body: JSON.stringify({ title: currentDetail.title }),
  });

  showNotification("Item removido");
  closeModal();
  await loadLists();
}

// ── NOTIFICATIONS ─────────────────────────────────────────────

function showNotification(message) {
  const el = document.createElement("div");
  el.className  = "notification";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 250);
  }, 2400);
}

// ── INIT ──────────────────────────────────────────────────────

loadLists();
// FIX: polling aumentado para 30s (era 5s — pesado para Firestore free tier)
setInterval(loadLists, 30_000);
