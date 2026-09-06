// ===================== SETUP =====================
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const CATEGORY_COLORS = [
  "#2F6F5E", "#C1583F", "#8A6FC9", "#D9A441", "#4E8FA8",
  "#C9709A", "#6F9E7A", "#E08066", "#5C7CBF", "#B0763F"
];

const DEFAULT_CATEGORIES = [
  { name: "Salary", type: "income", color: "#2F6F5E" },
  { name: "Freelance", type: "income", color: "#4E8FA8" },
  { name: "Gifts", type: "income", color: "#C9709A" },
  { name: "Food", type: "expense", color: "#C1583F" },
  { name: "Transport", type: "expense", color: "#D9A441" },
  { name: "Shopping", type: "expense", color: "#8A6FC9" },
  { name: "Bills", type: "expense", color: "#5C7CBF" },
  { name: "Other", type: "expense", color: "#B0763F" }
];

const state = {
  user: null,
  categories: [],
  transactions: [],
  theme: "clean-light",
  calendarCursor: new Date(),
  selectedCalDate: null,
  txSearch: "",
  txTypeFilter: "all",
  anRange: "month",
  editingTxId: null,
  formType: "expense",
  catFormType: "expense",
  catFormColor: CATEGORY_COLORS[0]
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function money(n) {
  const v = Number(n) || 0;
  return "฿" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ===================== AUTH =====================
let authMode = "signin";

$("#auth-toggle").addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  $("#auth-submit").textContent = authMode === "signin" ? "Sign in" : "Create account";
  $("#auth-toggle").textContent = authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in";
  $("#auth-error").hidden = true;
});

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  $("#auth-error").hidden = true;
  $("#auth-submit").disabled = true;

  const { data, error } = authMode === "signin"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });

  $("#auth-submit").disabled = false;

  if (error) {
    $("#auth-error").textContent = error.message;
    $("#auth-error").hidden = false;
    return;
  }

  if (authMode === "signup" && !data.session) {
    $("#auth-error").textContent = "Account created — check your email to confirm, then sign in.";
    $("#auth-error").hidden = false;
    authMode = "signin";
    $("#auth-submit").textContent = "Sign in";
    return;
  }

  await onAuthed(data.user);
});

async function signOutFlow() {
  await sb.auth.signOut();
  location.reload();
}
$("#sign-out").addEventListener("click", signOutFlow);
$("#settings-sign-out").addEventListener("click", signOutFlow);

async function checkExistingSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await onAuthed(data.session.user);
  }
}

async function onAuthed(user) {
  state.user = user;
  $("#auth-screen").hidden = true;
  $("#app").hidden = false;
  $("#settings-email").textContent = user.email;

  await ensurePreferences();
  await ensureDefaultCategories();
  await loadCategories();
  await loadTransactions();

  applyTheme(state.theme);
  renderAll();
}

// ===================== PREFERENCES / THEME =====================
async function ensurePreferences() {
  const { data, error } = await sb.from("preferences").select("theme").eq("user_id", state.user.id).maybeSingle();
  if (!error && data) {
    state.theme = data.theme;
  } else {
    await sb.from("preferences").insert({ user_id: state.user.id, theme: state.theme });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $$(".theme-swatch").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.theme === theme);
  });
}

$("#theme-grid").addEventListener("click", async (e) => {
  const btn = e.target.closest(".theme-swatch");
  if (!btn) return;
  state.theme = btn.dataset.theme;
  applyTheme(state.theme);
  await sb.from("preferences").update({ theme: state.theme, updated_at: new Date().toISOString() }).eq("user_id", state.user.id);
});

// ===================== CATEGORIES =====================
async function ensureDefaultCategories() {
  const { count } = await sb.from("categories").select("id", { count: "exact", head: true }).eq("user_id", state.user.id);
  if (!count) {
    const rows = DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: state.user.id }));
    await sb.from("categories").insert(rows);
  }
}

async function loadCategories() {
  const { data, error } = await sb.from("categories").select("*").eq("user_id", state.user.id).order("name");
  if (!error) state.categories = data;
}

function categoryById(id) {
  return state.categories.find((c) => c.id === id);
}

// ===================== TRANSACTIONS =====================
async function loadTransactions() {
  const { data, error } = await sb.from("transactions").select("*").eq("user_id", state.user.id).order("occurred_at", { ascending: false });
  if (!error) state.transactions = data;
}

function txDate(t) { return new Date(t.occurred_at); }

function isSameMonth(d, ref) {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}
function isSameYear(d, ref) {
  return d.getFullYear() === ref.getFullYear();
}
function isSameDay(d, ref) {
  return isSameMonth(d, ref) && d.getDate() === ref.getDate();
}

// ===================== NAVIGATION =====================
function setView(name) {
  $$(".view").forEach((v) => v.classList.remove("is-active"));
  $(`#view-${name}`).classList.add("is-active");
  $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  if (name === "calendar") renderCalendar();
  if (name === "transactions") renderTransactionsView();
  if (name === "analytics") renderAnalytics();
  if (name === "categories") renderCategories();
}

$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-view-link]");
  if (link) setView(link.dataset.viewLink);
});

// ===================== RENDER: DASHBOARD =====================
function monthLabel(d) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function renderDashboard() {
  const now = new Date();
  $("#dash-month-label").textContent = monthLabel(now);

  const monthTx = state.transactions.filter((t) => isSameMonth(txDate(t), now));
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  $("#hero-balance-amount").textContent = money(income - expense);
  $("#stat-income").textContent = money(income);
  $("#stat-expense").textContent = money(expense);
  $("#stat-count").textContent = monthTx.length;

  drawCategoryDonut("#dash-chart", "#dash-chart-empty", monthTx.filter((t) => t.type === "expense"));

  const recent = state.transactions.slice(0, 6);
  renderTxList("#dash-recent-list", recent);
  $("#dash-recent-empty").hidden = recent.length > 0;
}

// ===================== TX LIST RENDERING =====================
function renderTxList(selector, list) {
  const el = $(selector);
  el.innerHTML = "";
  list.forEach((t) => {
    const cat = categoryById(t.category_id);
    const li = document.createElement("li");
    li.className = "tx-row";
    li.innerHTML = `
      <span class="tx-dot" style="background:${cat ? cat.color : "#999"}"></span>
      <div class="tx-main">
        <div class="tx-category">${cat ? cat.name : "Uncategorized"}</div>
        <div class="tx-meta">${formatDateTime(txDate(t))}${t.note ? " · " + escapeHtml(t.note) : ""}</div>
      </div>
      <div class="tx-amount ${t.type === "income" ? "is-income" : "is-expense"}">${t.type === "income" ? "+" : "−"}${money(t.amount)}</div>
    `;
    li.addEventListener("click", () => openTransactionModal(t));
    el.appendChild(li);
  });
}

function formatDateTime(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ===================== CANVAS DONUT CHART =====================
function drawCategoryDonut(canvasSelector, emptySelector, txList) {
  const canvas = $(canvasSelector);
  const ctx = canvas.getContext("2d");
  const emptyNote = $(emptySelector);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!txList.length) {
    emptyNote.hidden = false;
    canvas.style.display = "none";
    return;
  }
  emptyNote.hidden = true;
  canvas.style.display = "block";

  const totals = {};
  txList.forEach((t) => {
    const cat = categoryById(t.category_id);
    const key = cat ? cat.id : "uncategorized";
    if (!totals[key]) totals[key] = { amount: 0, color: cat ? cat.color : "#999", name: cat ? cat.name : "Other" };
    totals[key].amount += Number(t.amount);
  });

  const entries = Object.values(totals).sort((a, b) => b.amount - a.amount);
  const total = entries.reduce((s, e) => s + e.amount, 0);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outerR = Math.min(cx, cy) - 8;
  const innerR = outerR * 0.6;

  let startAngle = -Math.PI / 2;
  entries.forEach((e) => {
    const slice = (e.amount / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = e.color;
    ctx.fill();
    startAngle += slice;
  });

  // punch the hole
  const bg = getComputedStyle(document.body).getPropertyValue("--surface").trim() || "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text").trim() || "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 15px Fraunces, serif";
  ctx.fillText(money(total), cx, cy);
}

// ===================== CALENDAR =====================
function renderCalendar() {
  const cursor = state.calendarCursor;
  $("#cal-month-label").textContent = monthLabel(cursor);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid = $("#calendar-grid");
  grid.innerHTML = "";

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell is-empty";
    grid.appendChild(empty);
  }

  const today = new Date();

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dayTx = state.transactions.filter((t) => isSameDay(txDate(t), cellDate));

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (isSameDay(cellDate, today)) cell.classList.add("is-today");
    if (dayTx.length) cell.classList.add("has-activity");

    const dots = dayTx.slice(0, 4).map((t) => {
      const cat = categoryById(t.category_id);
      return `<span class="cal-dot" style="background:${cat ? cat.color : "#999"}"></span>`;
    }).join("");

    cell.innerHTML = `<span>${day}</span><span class="cal-cell-dots">${dots}</span>`;
    cell.addEventListener("click", () => openCalendarDay(cellDate, dayTx));
    grid.appendChild(cell);
  }
}

function openCalendarDay(date, dayTx) {
  state.selectedCalDate = date;
  const panel = $("#cal-day-panel");
  panel.hidden = false;
  $("#cal-day-title").textContent = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  renderTxList("#cal-day-list", dayTx.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)));
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

$("#cal-prev").addEventListener("click", () => {
  state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1);
  $("#cal-day-panel").hidden = true;
  renderCalendar();
});
$("#cal-next").addEventListener("click", () => {
  state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1);
  $("#cal-day-panel").hidden = true;
  renderCalendar();
});
$("#cal-day-add").addEventListener("click", () => {
  openTransactionModal(null, state.selectedCalDate);
});

// ===================== TRANSACTIONS VIEW =====================
function renderTransactionsView() {
  const q = state.txSearch.trim().toLowerCase();
  let list = state.transactions.filter((t) => {
    if (state.txTypeFilter !== "all" && t.type !== state.txTypeFilter) return false;
    if (!q) return true;
    const cat = categoryById(t.category_id);
    const haystack = ((cat ? cat.name : "") + " " + (t.note || "")).toLowerCase();
    return haystack.includes(q);
  });
  renderTxList("#tx-full-list", list);
  $("#tx-full-empty").hidden = list.length > 0;
}

$("#tx-search").addEventListener("input", (e) => {
  state.txSearch = e.target.value;
  renderTransactionsView();
});

$("#tx-type-filter").addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  $$("#tx-type-filter .segmented-btn").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  state.txTypeFilter = btn.dataset.type;
  renderTransactionsView();
});

// ===================== ANALYTICS =====================
function renderAnalytics() {
  const now = new Date();
  let list = state.transactions;
  if (state.anRange === "month") list = list.filter((t) => isSameMonth(txDate(t), now));
  else if (state.anRange === "year") list = list.filter((t) => isSameYear(txDate(t), now));

  const expenses = list.filter((t) => t.type === "expense");
  const incomes = list.filter((t) => t.type === "income");

  drawCategoryDonut("#an-expense-chart", "#an-expense-empty", expenses);
  drawCategoryDonut("#an-income-chart", "#an-income-empty", incomes);

  const totals = {};
  list.forEach((t) => {
    const cat = categoryById(t.category_id);
    const key = cat ? cat.id : "uncategorized";
    if (!totals[key]) totals[key] = { amount: 0, color: cat ? cat.color : "#999", name: cat ? cat.name : "Other", type: t.type };
    totals[key].amount += Number(t.amount) * (t.type === "expense" ? 1 : 1);
  });
  const entries = Object.values(totals).sort((a, b) => b.amount - a.amount);
  const maxAmount = Math.max(1, ...entries.map((e) => e.amount));

  const breakdownEl = $("#an-breakdown-list");
  breakdownEl.innerHTML = "";
  entries.forEach((e) => {
    const li = document.createElement("li");
    li.className = "breakdown-row";
    li.innerHTML = `
      <span class="tx-dot" style="background:${e.color}"></span>
      <span style="width:110px">${e.name}</span>
      <span class="breakdown-bar-track"><span class="breakdown-bar-fill" style="width:${(e.amount / maxAmount) * 100}%;background:${e.color}"></span></span>
      <span class="breakdown-amount">${money(e.amount)}</span>
    `;
    breakdownEl.appendChild(li);
  });
}

$("#an-range-filter").addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  $$("#an-range-filter .segmented-btn").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  state.anRange = btn.dataset.range;
  renderAnalytics();
});

// ===================== CATEGORIES VIEW =====================
function renderCategories() {
  const income = state.categories.filter((c) => c.type === "income");
  const expense = state.categories.filter((c) => c.type === "expense");

  const build = (list) => list.map((c) => `
    <li class="category-row">
      <span class="category-swatch" style="background:${c.color}"></span>
      <span class="category-name">${escapeHtml(c.name)}</span>
      <button class="category-remove" data-cat-id="${c.id}">Remove</button>
    </li>
  `).join("");

  $("#cat-income-list").innerHTML = build(income) || `<p class="empty-note">No income categories yet.</p>`;
  $("#cat-expense-list").innerHTML = build(expense) || `<p class="empty-note">No expense categories yet.</p>`;
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".category-remove");
  if (!btn) return;
  if (!confirm("Remove this category? Existing transactions will become uncategorized.")) return;
  await sb.from("categories").delete().eq("id", btn.dataset.catId);
  await loadCategories();
  renderCategories();
  populateCategorySelect();
});

// ===================== TRANSACTION MODAL =====================
function populateCategorySelect() {
  const sel = $("#tx-category");
  const options = state.categories.filter((c) => c.type === state.formType);
  sel.innerHTML = options.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
    || `<option value="">No categories — add one first</option>`;
}

function setFormType(type) {
  state.formType = type;
  $$("#tx-form-type .segmented-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.type === type));
  populateCategorySelect();
}

$("#tx-form-type").addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  setFormType(btn.dataset.type);
});

function openTransactionModal(tx, presetDate) {
  state.editingTxId = tx ? tx.id : null;
  $("#tx-modal-title").textContent = tx ? "Edit transaction" : "Add transaction";
  $("#tx-delete").hidden = !tx;

  const d = tx ? txDate(tx) : (presetDate ? new Date(presetDate) : new Date());
  setFormType(tx ? tx.type : "expense");

  $("#tx-amount").value = tx ? Number(tx.amount).toFixed(2) : "";
  $("#tx-note").value = tx ? (tx.note || "") : "";
  $("#tx-date").value = toDateInputValue(d);
  $("#tx-time").value = toTimeInputValue(tx ? d : new Date());

  setTimeout(() => { if (tx) $("#tx-category").value = tx.category_id || ""; }, 0);

  $("#tx-modal").hidden = false;
}

function toDateInputValue(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function toTimeInputValue(d) {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-action='open-add-transaction']")) openTransactionModal(null);
  if (e.target.closest("[data-action='close-modal']")) $("#tx-modal").hidden = true;
  if (e.target === $("#tx-modal")) $("#tx-modal").hidden = true;
});

$("#tx-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = parseFloat($("#tx-amount").value);
  const categoryId = $("#tx-category").value || null;
  const note = $("#tx-note").value.trim();
  const date = $("#tx-date").value;
  const time = $("#tx-time").value;
  const occurredAt = new Date(`${date}T${time}:00`).toISOString();

  const payload = {
    user_id: state.user.id,
    category_id: categoryId,
    type: state.formType,
    amount,
    note: note || null,
    occurred_at: occurredAt
  };

  if (state.editingTxId) {
    await sb.from("transactions").update(payload).eq("id", state.editingTxId);
  } else {
    await sb.from("transactions").insert(payload);
  }

  $("#tx-modal").hidden = true;
  await loadTransactions();
  renderAll();
  showToast("Saved");
});

$("#tx-delete").addEventListener("click", async () => {
  if (!state.editingTxId) return;
  if (!confirm("Delete this transaction?")) return;
  await sb.from("transactions").delete().eq("id", state.editingTxId);
  $("#tx-modal").hidden = true;
  await loadTransactions();
  renderAll();
  showToast("Deleted");
});

// ===================== CATEGORY MODAL =====================
function buildColorSwatches() {
  const wrap = $("#cat-color-swatches");
  wrap.innerHTML = CATEGORY_COLORS.map((c) =>
    `<button type="button" class="color-swatch-btn ${c === state.catFormColor ? "is-selected" : ""}" style="background:${c}" data-color="${c}"></button>`
  ).join("");
}

$("#cat-color-swatches").addEventListener("click", (e) => {
  const btn = e.target.closest(".color-swatch-btn");
  if (!btn) return;
  state.catFormColor = btn.dataset.color;
  buildColorSwatches();
});

$("#cat-form-type").addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  $$("#cat-form-type .segmented-btn").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  state.catFormType = btn.dataset.type;
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-action='open-add-category']")) {
    state.catFormType = "expense";
    state.catFormColor = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
    $("#cat-name").value = "";
    $$("#cat-form-type .segmented-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.type === "expense"));
    buildColorSwatches();
    $("#cat-modal").hidden = false;
  }
  if (e.target.closest("[data-action='close-cat-modal']")) $("#cat-modal").hidden = true;
  if (e.target === $("#cat-modal")) $("#cat-modal").hidden = true;
});

$("#cat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#cat-name").value.trim();
  if (!name) return;
  await sb.from("categories").insert({
    user_id: state.user.id,
    name,
    type: state.catFormType,
    color: state.catFormColor
  });
  $("#cat-modal").hidden = true;
  await loadCategories();
  renderCategories();
  populateCategorySelect();
  showToast("Category added");
});

// ===================== RENDER ALL =====================
function renderAll() {
  renderDashboard();
  populateCategorySelect();
  const activeView = $(".view.is-active").id.replace("view-", "");
  if (activeView === "calendar") renderCalendar();
  if (activeView === "transactions") renderTransactionsView();
  if (activeView === "analytics") renderAnalytics();
  if (activeView === "categories") renderCategories();
}

// ===================== INIT =====================
checkExistingSession();
