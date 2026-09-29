// @ts-nocheck
"use strict";

/* KEWA TRADE TRACKER */

const STORAGE_KEY = "kewa_trade_tracker_v1";
const $ = (id) => document.getElementById(id);

const pages = {
  dashboard: $("dashboardPage"),
  trades: $("tradesPage"),
  addTrade: $("addTradePage")
};

let trades = loadTrades();
let toastTimer;
let editing = false;
let currentPage = "dashboard";

function loadTrades() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidTrade) : [];
  } catch (error) {
    console.error("Could not read saved trades:", error);
    return [];
  }
}

function isValidTrade(trade) {
  return trade &&
    typeof trade.id === "string" &&
    typeof trade.symbol === "string" &&
    ["Stocks", "Crypto", "Forex"].includes(trade.market) &&
    ["Long", "Short"].includes(trade.direction) &&
    ["Open", "Closed"].includes(trade.status) &&
    Number.isFinite(Number(trade.entryPrice)) &&
    Number.isFinite(Number(trade.quantity));
}

function saveTrades() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    return true;
  } catch (error) {
    console.error("Could not save trades:", error);
    showToast("Saving failed. Check browser storage.");
    return false;
  }
}

function money(value, currency = "INR") {
  const symbols = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    USDT: "USDT "
  };

  const amount = Number(value) || 0;
  const formatted = Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return (amount < 0 ? "-" : "") +
    (symbols[currency] || currency + " ") + formatted;
}

function getPnl(trade) {
  if (trade.status !== "Closed") return 0;

  const entry = Number(trade.entryPrice);
  const exit = Number(trade.exitPrice);
  const qty = Number(trade.quantity);
  const fees = Number(trade.fees) || 0;

  const difference = trade.direction === "Short"
    ? entry - exit
    : exit - entry;

  return difference * qty - fees;
}

function getResult(trade) {
  if (trade.status === "Open") return "open";

  const pnl = getPnl(trade);
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

/* NAVIGATION */

function navigate(page, addHistory = true) {
  if (!pages[page]) return;

  currentPage = page;

  Object.entries(pages).forEach(([name, element]) => {
    element.classList.toggle("active", name === page);
  });

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page &&
      button.classList.contains("nav-btn")
    );
  });

  $("sidebar").classList.remove("open");

  if (addHistory) {
    try {
      history.pushState({ kewaPage: page }, "", location.href);
    } catch (error) {
      // Some local preview environments restrict history changes.
    }
  }

  if (page === "dashboard") renderDashboard();
  if (page === "trades") renderTrades();
  if (page === "addTrade") updatePnlPreview();

  window.scrollTo({ top: 0, behavior: "auto" });
}

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(button.dataset.page);
  });
});

$("menuBtn").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

/*
 * Browser Back: keep the dashboard inside the app.
 * Acode's own Preview/Editor exit button may be controlled
 * by Acode itself and cannot always be intercepted by a webpage.
 */

try {
  history.replaceState({ kewaApp: true }, "", location.href);
  history.pushState({ kewaApp: true }, "", location.href);

  window.addEventListener("popstate", () => {
    if (currentPage !== "dashboard") {
      navigate("dashboard", false);
    }

    try {
      history.pushState({ kewaApp: true }, "", location.href);
    } catch (error) {
      // Leave the app usable if history is restricted.
    }
  });
} catch (error) {
  // The app still works if the preview disables history.
}

/* FORM */

function setTodayIfEmpty() {
  if (!$("tradeDate").value) {
    const now = new Date();
    const localDate = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

    $("tradeDate").value = localDate;
  }
}

function updatePnlPreview() {
  const entry = Number($("entryPrice").value) || 0;
  const exit = Number($("exitPrice").value) || 0;
  const quantity = Number($("quantity").value) || 0;
  const fees = Number($("fees").value) || 0;
  const currency = $("currency").value;
  const direction = $("direction").value;
  const status = $("status").value;

  const pnl = status === "Closed"
    ? (direction === "Short" ? entry - exit : exit - entry) *
      quantity - fees
    : 0;

  $("pnlPreview").textContent = money(pnl, currency);
  $("pnlPreview").className =
    pnl > 0 ? "positive" : pnl < 0 ? "negative" : "";
}

[
  "entryPrice", "exitPrice", "quantity",
  "fees", "direction", "status", "currency"
].forEach((id) => {
  $(id).addEventListener("input", updatePnlPreview);
  $(id).addEventListener("change", updatePnlPreview);
});

$("status").addEventListener("change", () => {
  $("exitPrice").required = $("status").value === "Closed";
});

function resetForm() {
  $("tradeForm").reset();
  $("tradeId").value = "";
  $("formHeading").textContent = "Add Trade.";
  $("saveTradeBtn").textContent = "Save Trade";
  $("cancelEditBtn").textContent = "Cancel";
  $("exitPrice").required = true;
  setTodayIfEmpty();
  updatePnlPreview();
  editing = false;
}

$("cancelEditBtn").addEventListener("click", () => {
  resetForm();
  navigate("dashboard");
});

$("tradeForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const status = $("status").value;
  const entryPrice = Number($("entryPrice").value);
  const exitRaw = $("exitPrice").value;
  const exitPrice = exitRaw === "" ? null : Number(exitRaw);
  const quantity = Number($("quantity").value);
  const fees = Number($("fees").value || 0);

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    showToast("Enter a valid entry price.");
    return;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    showToast("Enter a valid quantity.");
    return;
  }

  if (status === "Closed" &&
      (!Number.isFinite(exitPrice) || exitPrice <= 0)) {
    showToast("Enter an exit price for closed trades.");
    return;
  }

  if (!Number.isFinite(fees) || fees < 0) {
    showToast("Enter valid fees.");
    return;
  }

  const existingId = $("tradeId").value;

  const trade = {
    id: existingId || (
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    ),
    market: $("market").value,
    symbol: $("symbol").value.trim().toUpperCase(),
    direction: $("direction").value,
    status,
    entryPrice,
    exitPrice: status === "Closed" ? exitPrice : null,
    quantity,
    fees,
    date: $("tradeDate").value,
    currency: $("currency").value,
    notes: $("notes").value.trim(),
    updatedAt: new Date().toISOString()
  };

  if (!trade.symbol) {
    showToast("Enter an asset symbol.");
    return;
  }

  if (existingId) {
    const index = trades.findIndex((item) => item.id === existingId);
    if (index !== -1) trades[index] = trade;
  } else {
    trades.unshift(trade);
  }

  if (!saveTrades()) return;

  resetForm();
  renderDashboard();
  navigate("dashboard");
  showToast(existingId ? "Trade updated successfully." : "Trade saved successfully.");
});

function editTrade(id) {
  const trade = trades.find((item) => item.id === id);
  if (!trade) return;

  editing = true;
  $("tradeId").value = trade.id;
  $("market").value = trade.market;
  $("symbol").value = trade.symbol;
  $("direction").value = trade.direction;
  $("status").value = trade.status;
  $("entryPrice").value = trade.entryPrice;
  $("exitPrice").value = trade.exitPrice ?? "";
  $("quantity").value = trade.quantity;
  $("fees").value = trade.fees ?? 0;
  $("tradeDate").value = trade.date || "";
  $("currency").value = trade.currency || "INR";
  $("notes").value = trade.notes || "";

  $("formHeading").textContent = "Edit Trade.";
  $("saveTradeBtn").textContent = "Update Trade";
  $("exitPrice").required = trade.status === "Closed";

  updatePnlPreview();
  navigate("addTrade");
}

/* DELETE */

function deleteTrade(id) {
  const trade = trades.find((item) => item.id === id);
  if (!trade) return;

  if (!confirm("Delete " + trade.symbol + " from your journal?")) {
    return;
  }

  const previous = trades;
  trades = trades.filter((item) => item.id !== id);

  if (!saveTrades()) {
    trades = previous;
    return;
  }

  renderDashboard();
  renderTrades();
  showToast("Trade deleted.");
}

/* SAFE HTML OUTPUT */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function tradeMarkup(trade) {
  const pnl = getPnl(trade);
  const result = getResult(trade);
  const currency = trade.currency || "INR";

  const resultLabel = {
    win: "WIN",
    loss: "LOSS",
    open: "OPEN",
    breakeven: "BREAKEVEN"
  }[result];

  const date = escapeHTML(trade.date || "No date");
  const symbol = escapeHTML(trade.symbol);
  const market = escapeHTML(trade.market);
  const direction = escapeHTML(trade.direction);
  const status = escapeHTML(trade.status);
  const notes = escapeHTML(trade.notes || "");

  return `
    <div class="trade-item">
      <div class="trade-main">
        <div class="trade-symbol">${symbol}</div>
        <div class="trade-meta">
          ${market} · ${direction} · ${date}<br>
          Entry: ${escapeHTML(trade.entryPrice)}
          ${trade.status === "Closed"
            ? " · Exit: " + escapeHTML(trade.exitPrice)
            : ""}
        </div>
        <span class="pill ${result}">${resultLabel}</span>
        ${notes ? `<div class="trade-meta">${notes}</div>` : ""}
      </div>
      <div class="trade-pnl ${pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""}">
        ${money(pnl, currency)}
        <small>${status}</small>
      </div>
      <div class="trade-actions">
        <button class="icon-btn" data-action="edit" data-id="${escapeHTML(trade.id)}">Edit</button>
        <button class="icon-btn delete" data-action="delete" data-id="${escapeHTML(trade.id)}">Delete</button>
      </div>
    </div>`;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  if (button.dataset.action === "edit") editTrade(id);
  if (button.dataset.action === "delete") deleteTrade(id);
});

/* JOURNAL FILTERS */

function getFilteredTrades() {
  const search = $("searchTrades").value.trim().toLowerCase();
  const market = $("filterMarket").value;
  const result = $("filterResult").value;

  return trades.filter((trade) => {
    const matchesSearch = trade.symbol.toLowerCase().includes(search);
    const matchesMarket = market === "all" || trade.market === market;
    const matchesResult = result === "all" || getResult(trade) === result;

    return matchesSearch && matchesMarket && matchesResult;
  });
}

function renderTrades() {
  const filtered = getFilteredTrades();

  $("allTrades").innerHTML = filtered.length
    ? filtered.map(tradeMarkup).join("")
    : `<div class="empty-state">No matching trades found.<br>Add a trade or change your filters.</div>`;
}

["searchTrades", "filterMarket", "filterResult"].forEach((id) => {
  $(id).addEventListener(id === "searchTrades" ? "input" : "change", renderTrades);
});

/* DASHBOARD */

function renderDashboard() {
  const closed = trades.filter((trade) => trade.status === "Closed");
  const wins = closed.filter((trade) => getPnl(trade) > 0);
  const losses = closed.filter((trade) => getPnl(trade) < 0);

  const currencies = [...new Set(closed.map((trade) => trade.currency || "INR"))];
  const totalPnl = closed.reduce((sum, trade) => sum + getPnl(trade), 0);

  $("totalTrades").textContent = trades.length;
  $("winningTrades").textContent = wins.length;
  $("losingCaption").textContent = losses.length + " losing trades";

  $("winRate").textContent = closed.length
    ? Math.round((wins.length / closed.length) * 100) + "%"
    : "0%";

  if (currencies.length > 1) {
    $("netPnl").textContent = "Mixed";
    $("netPnl").className = "stat-value";
    $("netPnl").title = "Multiple currencies are recorded. Review each currency separately.";
  } else {
    const currency = currencies[0] || "INR";
    $("netPnl").textContent = money(totalPnl, currency);
    $("netPnl").className =
      "stat-value " + (totalPnl > 0 ? "positive" : totalPnl < 0 ? "negative" : "");
    $("netPnl").title = "";
  }

  const recent = trades.slice(0, 5);
  $("recentTrades").innerHTML = recent.length
    ? recent.map(tradeMarkup).join("")
    : `<div class="empty-state">No trades yet.<br>Tap “Add Trade” to record your first trade.</div>`;

  renderMarkets();
  drawChart();
}

function renderMarkets() {
  const markets = ["Stocks", "Crypto", "Forex"];
  const total = trades.length;

  $("marketBreakdown").innerHTML = markets.map((market) => {
    const count = trades.filter((trade) => trade.market === market).length;
    const percent = total ? (count / total) * 100 : 0;

    return `
      <div>
        <div class="market-row-top">
          <span class="market-name">${market}</span>
          <span class="market-count">${count} trades · ${Math.round(percent)}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${percent}%"></div>
        </div>
      </div>`;
  }).join("");
}

/* LIGHTWEIGHT CANVAS CHART: no external chart library needed */

function drawChart() {
  const canvas = $("performanceChart");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, rect.width);
  const height = Math.max(150, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 15, right: 12, bottom: 25, left: 48 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const closed = trades
    .filter((trade) => trade.status === "Closed")
    .slice()
    .reverse();

  if (!closed.length) {
    ctx.fillStyle = "#8d98ad";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Your performance chart will appear here", width / 2, height / 2);
    return;
  }

  const values = [];
  let cumulative = 0;

  closed.forEach((trade) => {
    cumulative += getPnl(trade);
    values.push(cumulative);
  });

  // The chart plots recorded numeric amounts; it does not convert currencies.
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = maxValue - minValue || 1;
  const extra = range * 0.15;
  const min = minValue - extra;
  const max = maxValue + extra;
  const y = (value) => padding.top +
    ((max - value) / (max - min)) * plotH;
  const x = (index) => padding.left +
    (values.length === 1 ? plotW / 2 : (index / (values.length - 1)) * plotW);

  ctx.strokeStyle = "#273044";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#8d98ad";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";

  for (let i = 0; i <= 4; i++) {
    const value = max - ((max - min) * i / 4);
    const yy = y(value);

    ctx.beginPath();
    ctx.moveTo(padding.left, yy);
    ctx.lineTo(width - padding.right, yy);
    ctx.stroke();

    ctx.fillText(value.toFixed(1), padding.left - 7, yy + 3);
  }

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height);
  gradient.addColorStop(0, "rgba(139,122,255,0.30)");
  gradient.addColorStop(1, "rgba(139,122,255,0.01)");

  ctx.beginPath();
  values.forEach((value, index) => {
    if (index === 0) ctx.moveTo(x(index), y(value));
    else ctx.lineTo(x(index), y(value));
  });

  if (values.length === 1) {
    ctx.lineTo(x(0) + 1, y(values[0]));
  }

  ctx.lineTo(x(values.length - 1), y(0));
  ctx.lineTo(x(0), y(0));
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  values.forEach((value, index) => {
    if (index === 0) ctx.moveTo(x(index), y(value));
    else ctx.lineTo(x(index), y(value));
  });

  ctx.strokeStyle = "#9a8cff";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  values.forEach((value, index) => {
    ctx.beginPath();
    ctx.arc(x(index), y(value), 3, 0, Math.PI * 2);
    ctx.fillStyle = "#c2b8ff";
    ctx.fill();
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#8d98ad";
  ctx.fillText("1", padding.left, height - 7);
  ctx.textAlign = "right";
  ctx.fillText(String(values.length), width - padding.right, height - 7);
}

window.addEventListener("resize", drawChart);

/* BACKUP EXPORT / IMPORT */

$("exportBtn").addEventListener("click", () => {
  const backup = {
    app: "Kewa Trade Tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    trades
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kewa-trades-backup.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("Backup export started.");
});

$("importBtn").addEventListener("click", () => {
  $("importFile").click();
});

$("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = Array.isArray(parsed) ? parsed : parsed.trades;

    if (!Array.isArray(imported) || !imported.every(isValidTrade)) {
      throw new Error("Invalid trade backup");
    }

    if (!confirm(
      "Import " + imported.length +
      " trades? This replaces your current journal."
    )) {
      return;
    }

    const ids = new Set();
    const cleaned = imported.map((trade) => {
      let id = trade.id;
      if (ids.has(id)) id = id + "_" + Math.random().toString(36).slice(2, 7);
      ids.add(id);

      return {
        ...trade,
        id,
        symbol: String(trade.symbol).slice(0, 30),
        fees: Number(trade.fees) || 0,
        notes: String(trade.notes || "").slice(0, 1000)
      };
    });

    const previous = trades;
    trades = cleaned;

    if (!saveTrades()) {
      trades = previous;
      return;
    }

    renderDashboard();
    renderTrades();
    showToast("Backup imported successfully.");
  } catch (error) {
    console.error("Import failed:", error);
    showToast("Invalid backup file.");
  } finally {
    event.target.value = "";
  }
});

/* START APP */

resetForm();
renderDashboard();
renderTrades();
navigate("dashboard", false);
