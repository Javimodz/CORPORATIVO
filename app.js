/**
 * APP.JS - Control Central, UI de Juegos, RTP, Seguridad Anti-Manipulación y Raspe 3x3
 */

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db, DEFAULT_GAMES_CATALOG, escapeHtml, isSafeMediaUrl, formatGs } from "./firebase-config.js";

const GAME_KEYS = Object.keys(DEFAULT_GAMES_CATALOG);
const RTP_MODES = ["retention", "balanced", "jackpot"];
const FILLER_ICONS = ["🍒", "🔔", "🍋", "🍇", "🍉", "🎲", "🃏", "🎯", "🪙"];

let globalData = {};
let usersDB = {};
let prizesDB = [];
let cardConfigDB = {};
let gamesConfigDB = {};
let resolvedGamesMap = cloneDefaultGames();
let currentUser = sessionStorage.getItem("raspa_logged_user") || null;
let selectedGameKey = "raspada";

let gridData = [];
let winningItem = null;
let roundCount = 1;
let audioCtx = null;
let currentCode = "0000";
let currentSerie = "A0000";
let currentRoundBet = 2500;
let currentRoundGameTitle = "FORTUNA JUEGOS CASINO";
let isSpinning = false;
let revealedCount = 0;
let roundEvaluated = false;
let activeScratchIndex = null;
let toastTimer = null;
let manifestBlobUrl = null;
const jsConfetti = new JSConfetti();

function cloneDefaultGames() {
  return JSON.parse(JSON.stringify(DEFAULT_GAMES_CATALOG));
}

function clampRtp(val) {
  const n = Number(val);
  if (Number.isNaN(n)) return 85;
  return Math.max(20, Math.min(99, n));
}

function clampWeight(val) {
  const n = Number(val);
  if (Number.isNaN(n)) return 1;
  return Math.max(0.25, Math.min(2.5, n));
}

function isVisualPrize(item) {
  if (!item || typeof item !== "object") return false;
  if (item.type === "visual" || item.mode === "visual") return true;
  const flag = item.isVisual ?? item.visual ?? item.esVisual ?? item.soloVisual;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "number") return flag === 1;
  if (typeof flag === "string") {
    return ["true", "1", "si", "sí", "visual"].includes(flag.trim().toLowerCase());
  }
  return false;
}

function getPrizeAmount(item) {
  return Math.max(0, Number(item?.amount ?? item?.prize ?? item?.valor ?? item?.value ?? 0) || 0);
}

function getPrizeSignature(item) {
  return `${String(item?.val || "").trim()}__${getPrizeAmount(item)}__${isVisualPrize(item) ? "V" : "W"}`;
}

function getTopThreeBigPrizes(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return [...list]
    .sort((a, b) => getPrizeAmount(b) - getPrizeAmount(a))
    .slice(0, 3);
}

function renderPrizeVisualHtml(prize, sizeClass = "w-4 h-4") {
  if (!prize || typeof prize !== "object") return "<span>💎</span>";
  const rawVal = String(prize.val ?? prize.icon ?? "").trim();
  const label = escapeHtml(prize.label || prize.name || "Premio");

  if (prize.type === "image" || isSafeMediaUrl(rawVal)) {
    return `<img src="${escapeHtml(rawVal)}" alt="${label}" class="${sizeClass} object-contain rounded shrink-0" loading="lazy" onerror="this.style.display='none'">`;
  }
  if (prize.type === "icon" || /^fa-[a-z0-9-]+$/i.test(rawVal)) {
    const iconName = rawVal.startsWith("fa-") ? rawVal : `fa-${rawVal}`;
    return `<i class="fa-solid ${escapeHtml(iconName)} text-amber-300 shrink-0"></i>`;
  }
  return `<span class="shrink-0 leading-none">${escapeHtml(rawVal || "💎")}</span>`;
}

function renderItemVisual(item, sizeClass = "w-9 h-9") {
  const rawVal = String(item?.val ?? item?.icon ?? "").trim();
  if (item?.type === "image" || isSafeMediaUrl(rawVal)) {
    return `<img src="${escapeHtml(rawVal)}" alt="${escapeHtml(item?.name || "Premio")}" class="${sizeClass} object-contain rounded-lg mx-auto mb-1 drop-shadow" onerror="this.style.display='none'">`;
  }
  if (item?.type === "icon" || rawVal.startsWith("fa-")) {
    const cls = rawVal.startsWith("fa-") ? rawVal : `fa-${rawVal}`;
    return `<i class="fa-solid ${escapeHtml(cls)} text-amber-300 text-3xl mx-auto mb-1 drop-shadow"></i>`;
  }
  return `<span class="text-3xl leading-none mx-auto mb-1 drop-shadow">${escapeHtml(rawVal || "💎")}</span>`;
}

function renderLobbyGames(gamesMap) {
  if (!gamesMap || typeof gamesMap !== "object") return;
  GAME_KEYS.forEach((key) => {
    const cfg = gamesMap[key];
    const card = document.querySelector(`[data-game-key="${key}"]`);
    if (!card || !cfg) return;

    const nameEl = card.querySelector("[data-game-name]");
    const betEl = card.querySelector("[data-game-bet]");
    const badgeEl = card.querySelector("[data-game-play-badge]");
    const list = Array.isArray(cfg.prizes) ? cfg.prizes : [];
    const hasWinnable = list.length > 0 && list.some((p) => !isVisualPrize(p));

    if (nameEl) nameEl.textContent = String(cfg.shortName || cfg.title || key);
    if (betEl) betEl.textContent = formatGs(cfg.bet ?? cfg.price ?? 0);

    if (!hasWinnable) {
      card.classList.add("is-disabled");
      if (badgeEl) {
        badgeEl.className = "w-5 h-5 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-[9px] shrink-0";
        badgeEl.innerHTML = '<i class="fa-solid fa-lock"></i>';
      }
      return;
    }

    card.classList.remove("is-disabled");
    if (badgeEl) {
      badgeEl.className = "w-5 h-5 rounded-md bg-amber-400/20 border border-amber-300/50 flex items-center justify-center text-amber-200 text-[9px] shrink-0";
      badgeEl.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
  });
}

function renderActiveGameHeader(gameCfg) {
  if (!gameCfg || typeof gameCfg !== "object") return;
  const titleEl = document.getElementById("card-display-title");
  const betBadge = document.getElementById("table-bet-badge");
  const spinText = document.getElementById("btn-spin-text");
  const prizesBar = document.getElementById("active-game-prizes-bar");
  const noPrizesBanner = document.getElementById("no-prizes-banner");
  const listEl = document.getElementById("active-game-prizes-list");

  const betVal = Number(gameCfg.bet ?? gameCfg.price ?? 0);
  const list = Array.isArray(gameCfg.prizes) ? gameCfg.prizes : [];
  const top3 = getTopThreeBigPrizes(list);
  const canPlay = list.length > 0 && list.some((p) => !isVisualPrize(p));

  if (titleEl && gameCfg.title) titleEl.textContent = String(gameCfg.title);
  if (betBadge) betBadge.textContent = `APUESTA: ${formatGs(betVal)}`;
  if (spinText) {
    spinText.textContent = canPlay
      ? `INICIAR NUEVA APUESTA (${formatGs(betVal)})`
      : "SIN PREMIOS DISPONIBLES";
  }

  if (!top3.length) {
    prizesBar?.classList.add("hidden");
    noPrizesBanner?.classList.remove("hidden");
    if (listEl) listEl.innerHTML = "";
    return;
  }

  noPrizesBanner?.classList.add("hidden");
  prizesBar?.classList.remove("hidden");
  if (listEl) {
    listEl.innerHTML = top3
      .map((p) => {
        const vis = renderPrizeVisualHtml(p, "w-4 h-4");
        const amt = formatGs(getPrizeAmount(p));
        return `<span class="inline-flex items-center gap-1 bg-amber-950/75 border border-amber-400/45 text-amber-200 px-2 py-0.5 rounded-md whitespace-nowrap">${vis}<span>${escapeHtml(amt)}</span></span>`;
      })
      .join("");
  }
}

function setupPwaInstallability() {
  try {
    const iconUrl = new URL("logo.png", window.location.href).href;
    const manifestData = {
      name: "FORTUNA JUEGOS CASINO - Oficial",
      short_name: "FORTUNA JUEGOS CASINO",
      start_url: "./",
      scope: "./",
      display: "standalone",
      orientation: "portrait",
      background_color: "#060911",
      theme_color: "#070b14",
      icons: [
        { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }
      ]
    };

    const blob = new Blob([JSON.stringify(manifestData)], { type: "application/manifest+json" });
    manifestBlobUrl = URL.createObjectURL(blob);

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = manifestBlobUrl;

    if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  } catch (_) {}
}

window.addEventListener("unload", () => {
  if (manifestBlobUrl) URL.revokeObjectURL(manifestBlobUrl);
});

function blockTampering(e) {
  if (e) e.preventDefault();
  window.showToast?.("Acción bloqueada por seguridad.", "error");
  return false;
}

function setupSecurityGuards() {
  window.addEventListener("keydown", (e) => {
    const key = (e.key || "").toUpperCase();
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const isDevToolsShortcut =
      key === "F12" ||
      (ctrlOrMeta && e.shiftKey && ["I", "J", "C", "K"].includes(key)) ||
      (ctrlOrMeta && ["U", "S"].includes(key));

    if (isDevToolsShortcut) {
      blockTampering(e);
    }
  }, { capture: true });

  document.addEventListener("contextmenu", (e) => blockTampering(e), { capture: true });
  document.addEventListener("dragstart", (e) => e.preventDefault(), { capture: true });
  document.addEventListener("selectstart", (e) => {
    const tag = e.target?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") e.preventDefault();
  }, { capture: true });

  const isMobileViewport = window.matchMedia("(pointer: coarse)").matches;
  if (!isMobileViewport) {
    let warned = false;
    setInterval(() => {
      const devOpen =
        (window.outerWidth - window.innerWidth > 170) ||
        (window.outerHeight - window.innerHeight > 170);
      if (devOpen && !warned) {
        warned = true;
        window.showToast?.("Cerrá las herramientas de desarrollador para operar.", "error");
      } else if (!devOpen) {
        warned = false;
      }
    }, 1500);
  }
}

function getRtpConfig(gameKey = "raspada") {
  let localRtp = null;
  try {
    const raw = localStorage.getItem("casino_rtp_config") || localStorage.getItem("rtpConfig");
    if (raw) localRtp = JSON.parse(raw);
  } catch (_) {}

  const cloudRtp = globalData?.rtpConfig || cardConfigDB?.rtpConfig || {};
  const merged = { ...(localRtp || {}), ...(cloudRtp || {}) };

  const fallbackRaw =
    merged.targetRtp ??
    merged.rtp ??
    globalData?.globalWinRate ??
    cardConfigDB?.winRate ??
    localStorage.getItem("casino_global_prob") ??
    85;

  let targetRtp = Number(String(fallbackRaw).replace("%", "").trim());
  if (!Number.isNaN(targetRtp) && targetRtp > 0 && targetRtp <= 1) {
    targetRtp *= 100;
  }

  const rawMode = String(merged.mode || "retention").trim().toLowerCase();
  const mode = RTP_MODES.includes(rawMode) ? rawMode : "retention";
  const weights = merged.gameWeights || {};

  return {
    targetRtp: clampRtp(targetRtp),
    mode,
    gameMultiplier: clampWeight(weights[gameKey] ?? 1)
  };
}

function calculateHitChance(gameKey, bet, winnableItems) {
  const { targetRtp, mode, gameMultiplier } = getRtpConfig(gameKey);
  const safeBet = Math.max(100, Number(bet) || 2500);

  const avgPrize = winnableItems.length > 0
    ? winnableItems.reduce((sum, p) => sum + getPrizeAmount(p), 0) / winnableItems.length
    : safeBet;

  const payoutRatio = Math.max(0.25, avgPrize / safeBet);
  let hitRate = (targetRtp / payoutRatio) * gameMultiplier;

  const history = (currentUser && usersDB[currentUser]?.history) ? usersDB[currentUser].history : [];
  const recentLosses = history.slice(0, 6).filter((h) => !h.win).length;

  if (mode === "retention") {
    if (history.length < 3) hitRate *= 1.25;
    if (recentLosses >= 3) hitRate *= 1.22;
    return Math.max(12, Math.min(68, hitRate));
  }

  if (mode === "jackpot") {
    return Math.max(5, Math.min(45, hitRate * 0.72));
  }

  return Math.max(8, Math.min(58, hitRate));
}

function normalizeGamePrizes(rawPrizes, gameKey) {
  if (!Array.isArray(rawPrizes) || !rawPrizes.length) return [];
  return rawPrizes
    .map((p, idx) => {
      if (p === null || p === undefined) return null;
      if (typeof p === "number") {
        const amt = Math.max(0, Number(p) || 0);
        return {
          id: `prize_${gameKey}_${idx}`,
          name: formatGs(amt),
          label: formatGs(amt),
          amount: amt,
          prize: amt,
          type: "emoji",
          val: "💎",
          weight: Math.max(1, 50 - idx * 10),
          isVisual: false
        };
      }
      const amt = Math.max(0, Number(p.amount ?? p.prize ?? p.valor ?? p.value ?? 0) || 0);
      const val = String(p.val ?? p.icon ?? (isSafeMediaUrl(p.label) ? p.label : "💎")).trim();
      const type = p.type || (isSafeMediaUrl(val) ? "image" : (val.startsWith("fa-") ? "icon" : "emoji"));
      const name = String(p.name || p.label || formatGs(amt)).trim();
      return {
        id: p.id || `prize_${gameKey}_${idx}`,
        name,
        label: name,
        amount: amt,
        prize: amt,
        type,
        val,
        weight: Math.max(1, Number(p.weight ?? p.peso ?? p.probabilidad ?? 1)),
        isVisual: isVisualPrize(p)
      };
    })
    .filter(Boolean);
}

function rebuildGamesMap() {
  let localGames = null;
  try {
    const rawLocal = localStorage.getItem("casino_games_config") || localStorage.getItem("gamesConfig");
    if (rawLocal) localGames = JSON.parse(rawLocal);
  } catch (_) {}

  const nextMap = cloneDefaultGames();

  GAME_KEYS.forEach((key) => {
    const cloudGame = gamesConfigDB?.[key] || cardConfigDB?.games?.[key] || {};
    const localGame = localGames?.[key] || localGames?.games?.[key] || {};
    const override = { ...localGame, ...cloudGame };

    if (override.title) nextMap[key].title = String(override.title);
    if (override.shortName) nextMap[key].shortName = String(override.shortName);

    const rawBet = override.bet ?? override.price ?? override.precio ?? override.apuesta;
    if (rawBet !== undefined && !Number.isNaN(Number(rawBet)) && Number(rawBet) >= 100) {
      nextMap[key].bet = Number(rawBet);
    }

    const explicitPrizes = override.prizes ?? override.premios;
    if (Array.isArray(explicitPrizes)) {
      nextMap[key].prizes = normalizeGamePrizes(explicitPrizes, key);
    } else if (key === "raspada" && Array.isArray(prizesDB) && prizesDB.length > 0) {
      nextMap[key].prizes = normalizeGamePrizes(prizesDB, key);
    } else {
      nextMap[key].prizes = [];
    }

    nextMap[key].hasPrizes = nextMap[key].prizes.length > 0;
    nextMap[key].canPlay = nextMap[key].prizes.some((item) => !isVisualPrize(item));
  });

  resolvedGamesMap = nextMap;
  renderLobbyGames(resolvedGamesMap);
}

function getActiveGameSettings() {
  const key = resolvedGamesMap[selectedGameKey] ? selectedGameKey : "raspada";
  const cfg = resolvedGamesMap[key] || DEFAULT_GAMES_CATALOG.raspada;
  const prizes = Array.isArray(cfg.prizes) ? cfg.prizes : [];
  return {
    key,
    title: cfg.title || DEFAULT_GAMES_CATALOG[key]?.title || "FORTUNA JUEGOS CASINO",
    shortName: cfg.shortName || cfg.title || key,
    bet: Math.max(100, Number(cfg.bet) || 2500),
    prizes,
    hasPrizes: prizes.length > 0,
    canPlay: prizes.length > 0 && prizes.some((p) => !isVisualPrize(p))
  };
}

function syncGameUIWithSettings() {
  const settings = getActiveGameSettings();
  renderActiveGameHeader(settings);

  const btn = document.getElementById("btn-spin-chips");
  const spinText = document.getElementById("btn-spin-text");
  if (btn && !isSpinning) btn.disabled = !settings.canPlay;
  if (spinText && !isSpinning) {
    spinText.innerText = settings.canPlay
      ? `INICIAR NUEVA APUESTA (${formatGs(settings.bet)})`
      : "SIN PREMIOS DISPONIBLES";
  }
}

async function initDB() {
  try {
    const docRef = doc(db, "sistema", "datos_globales");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      globalData = docSnap.data() || {};
      usersDB = globalData.users || {};
      prizesDB = Array.isArray(globalData.prizes) ? globalData.prizes : [];
      cardConfigDB = globalData.cardConfig || {};
      gamesConfigDB = globalData.gamesConfig || cardConfigDB.games || {};
    }
  } catch (e) {
    console.error("Error al conectar con Firebase:", e);
    window.showToast("Error de conexión con el Casino", "error");
  } finally {
    rebuildGamesMap();
    syncGameUIWithSettings();
  }
}

async function saveToCloud() {
  try {
    const rtpCfg = getRtpConfig(selectedGameKey);
    const docRef = doc(db, "sistema", "datos_globales");
    await setDoc(docRef, {
      ...globalData,
      users: usersDB,
      prizes: prizesDB,
      cardConfig: cardConfigDB,
      gamesConfig: gamesConfigDB,
      rtpConfig: globalData.rtpConfig || cardConfigDB.rtpConfig || {
        targetRtp: rtpCfg.targetRtp,
        mode: rtpCfg.mode
      },
      globalWinRate: rtpCfg.targetRtp
    }, { merge: true });
  } catch (e) {
    console.error("Error al guardar en Firebase:", e);
    window.showToast("Error al sincronizar con el Casino", "error");
  }
}

window.showToast = function(message, type = "info") {
  const toast = document.getElementById("toast");
  const msgEl = document.getElementById("toast-msg");
  const iconEl = document.getElementById("toast-icon");
  const badgeEl = document.getElementById("toast-badge");
  if (!toast || !msgEl) return;

  msgEl.textContent = String(message ?? "");
  toast.classList.remove("toast-success", "toast-error");

  if (type === "error" || type === "danger") {
    toast.classList.add("toast-error");
    if (iconEl) iconEl.className = "fa-solid fa-triangle-exclamation text-red-300 text-[10px]";
    if (badgeEl) badgeEl.className = "w-5 h-5 rounded-full bg-red-500/20 border border-red-400/50 flex items-center justify-center shrink-0";
  } else if (type === "success" || type === "win") {
    toast.classList.add("toast-success");
    if (iconEl) iconEl.className = "fa-solid fa-gem text-emerald-300 text-[10px]";
    if (badgeEl) badgeEl.className = "w-5 h-5 rounded-full bg-emerald-400/20 border border-emerald-300/50 flex items-center justify-center shrink-0";
  } else {
    if (iconEl) iconEl.className = "fa-solid fa-crown text-amber-300 text-[10px]";
    if (badgeEl) badgeEl.className = "w-5 h-5 rounded-full bg-amber-400/20 border border-amber-300/50 flex items-center justify-center shrink-0";
  }

  toast.classList.remove("opacity-0", "-translate-y-2");
  toast.classList.add("opacity-100", "translate-y-0");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "-translate-y-2");
  }, 2800);
};

window.toggleTermsModal = function(show) {
  document.getElementById("modal-terms")?.classList.toggle("hidden", !show);
};

window.toggleAccountHistory = function(show = true) {
  const modal = document.getElementById("modal-history");
  if (!modal) return;
  modal.classList.toggle("hidden", !show);
};

window.handleLoginWithTerms = async function(e) {
  e.preventDefault();
  const checkbox = document.getElementById("accept-terms");
  if (!checkbox || !checkbox.checked) {
    window.showToast("Debes aceptar los Términos y Condiciones para continuar.", "error");
    return;
  }

  await initDB();
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const pass = document.getElementById("login-password").value;

  if (!usersDB[username] || usersDB[username].password !== pass) {
    window.showToast("Usuario o contraseña incorrectos", "error");
    return;
  }

  if (usersDB[username].role === "agent") {
    window.showToast("Las cuentas de agentes deben iniciar sesión en su panel correspondiente", "error");
    return;
  }

  currentUser = username;
  sessionStorage.setItem("raspa_logged_user", currentUser);
  showLoggedInView();
};

window.logout = function() {
  if (currentUser) saveToCloud();
  currentUser = null;
  sessionStorage.removeItem("raspa_logged_user");
  document.getElementById("view-auth").classList.remove("hidden");
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-game").classList.add("hidden");
};

function showLoggedInView() {
  if (currentUser && usersDB[currentUser]) {
    document.getElementById("view-auth").classList.add("hidden");
    document.getElementById("view-dashboard").classList.remove("hidden");
    document.getElementById("view-dashboard").classList.add("flex");
    updateBalancesUI();
  } else {
    document.getElementById("view-auth").classList.remove("hidden");
    document.getElementById("view-dashboard").classList.add("hidden");
    document.getElementById("view-game").classList.add("hidden");
  }
}

async function checkSession() {
  await initDB();
  showLoggedInView();
}

async function saveUserData() {
  updateBalancesUI();
  await saveToCloud();
}

function updateBalancesUI() {
  if (!currentUser || !usersDB[currentUser]) return;
  const data = usersDB[currentUser];

  const gameBalance = data.tickets || 0;
  const prizes = data.balance || 0;

  document.getElementById("dash-username").innerText = data.name || data.username;
  document.getElementById("user-id-val").innerText = data.id || "N/A";
  document.getElementById("dash-tickets").innerText = formatGs(gameBalance);
  document.getElementById("dash-balance").innerText = formatGs(prizes);

  const liveChipsEl = document.getElementById("game-live-chips");
  const livePrizesEl = document.getElementById("game-live-prizes");
  if (liveChipsEl) liveChipsEl.innerText = formatGs(gameBalance);
  if (livePrizesEl) livePrizesEl.innerText = formatGs(prizes);

  const historyContainer = document.getElementById("history-list");
  if (!data.history || !data.history.length) {
    historyContainer.innerHTML = `<div class="text-center text-slate-400 text-[10px] py-6">Aún no has realizado jugadas.</div>`;
  } else {
    historyContainer.innerHTML = data.history.map((item) => `
      <div class="flex items-center justify-between bg-slate-950/90 p-2.5 rounded-xl border border-slate-800 text-[11px] shadow-sm">
        <div class="flex items-center gap-2 min-w-0">
          <i class="fa-solid ${item.win ? "fa-trophy text-amber-400" : "fa-coins text-slate-500"} shrink-0"></i>
          <div class="min-w-0">
            <div class="font-bold text-slate-200 truncate">${item.gameTitle ? escapeHtml(item.gameTitle) + " • " : ""}Jugada #${escapeHtml(item.code)} (${escapeHtml(item.serie)})</div>
            <div class="text-[9px] text-slate-400">${escapeHtml(item.date)} • Apuesta: ${formatGs(item.bet || 2500)}</div>
          </div>
        </div>
        <div class="font-black shrink-0 ml-2 ${item.win ? "text-emerald-400" : "text-slate-500"}">
          ${item.win ? "+" + formatGs(item.prize) : "SIN PREMIO"}
        </div>
      </div>
    `).join("");
  }
}

window.copyUsername = function() {
  if (!currentUser || !usersDB[currentUser]) return;
  const text = usersDB[currentUser].username;
  navigator.clipboard?.writeText(text).then(() => window.showToast("Usuario copiado: " + text));
};

window.selectCasinoGame = async function(gameKey) {
  if (!GAME_KEYS.includes(gameKey)) return;
  selectedGameKey = gameKey;
  await window.goToGame();
};

window.goToGame = async function() {
  if (!currentUser || !usersDB[currentUser]) {
    window.showToast("Iniciá sesión primero", "error");
    return;
  }
  await initDB();
  const settings = getActiveGameSettings();
  if (!settings.canPlay) {
    window.showToast("Este juego aún no tiene premios configurados en el panel", "error");
    return;
  }

  const gameBalance = usersDB[currentUser].tickets || 0;
  if (gameBalance < settings.bet) {
    window.showToast(`Saldo de juego insuficiente. Necesitas al menos ${formatGs(settings.bet)} para este juego.`, "error");
    return;
  }

  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-game").classList.remove("hidden");
  document.getElementById("view-game").classList.add("flex");
  syncGameUIWithSettings();
  updateBalancesUI();
  prepareEmptyTable();
};

window.goToDashboard = function() {
  if (isSpinning) return;
  document.getElementById("view-game").classList.add("hidden");
  document.getElementById("view-game").classList.remove("flex");
  document.getElementById("view-dashboard").classList.remove("hidden");
  rebuildGamesMap();
  updateBalancesUI();
};

function prepareEmptyTable() {
  document.getElementById("game-stamp-overlay").classList.add("hidden");
  document.getElementById("stamp-lose").classList.add("hidden");
  document.getElementById("stamp-win").classList.add("hidden");

  syncGameUIWithSettings();

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  revealedCount = 0;
  roundEvaluated = false;

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "grid-cell";
    cell.id = `cell-${i}`;
    cell.innerHTML = `
      <div id="content-${i}" class="w-full h-full flex flex-col items-center justify-center text-center bg-slate-950/90 opacity-0 transition-opacity duration-300 px-1.5"></div>
      <canvas id="scratch-${i}" class="scratch-canvas"></canvas>
    `;
    grid.appendChild(cell);
  }
}

function pickWeightedPrize(pool, gameKey, bet) {
  const { mode } = getRtpConfig(gameKey);
  const safeBet = Math.max(100, Number(bet) || 2500);

  const entries = pool.map((p) => {
    const baseWeight = Math.max(1, Number(p.weight) || 1);
    const mult = getPrizeAmount(p) / safeBet;

    let factor = 1;
    if (mode === "retention") {
      factor = mult <= 3 ? 1.45 : mult <= 8 ? 1.0 : 0.55;
    } else if (mode === "jackpot") {
      factor = mult >= 5 ? 1.55 : mult >= 2 ? 1.1 : 0.65;
    }

    return { item: p, weight: Math.max(0.1, baseWeight * factor) };
  });

  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return entries[0].item;
}

function generateRoundData() {
  const settings = getActiveGameSettings();
  if (!settings.canPlay) {
    gridData = [];
    winningItem = null;
    return false;
  }

  const allItems = settings.prizes.map((p) => ({ ...p, isVisual: isVisualPrize(p) }));
  const winnableItems = allItems.filter((item) => !item.isVisual);
  const visualItems = allItems.filter((item) => item.isVisual);

  const hitChance = calculateHitChance(settings.key, settings.bet, winnableItems);
  const shouldWin = Math.random() * 100 < hitChance && winnableItems.length > 0;

  gridData = [];
  winningItem = null;
  const counts = {};

  if (shouldWin) {
    const picked = pickWeightedPrize(winnableItems, settings.key, settings.bet);
    winningItem = { ...picked, isVisual: false };
    const winSig = getPrizeSignature(winningItem);
    for (let i = 0; i < 3; i++) gridData.push({ ...winningItem });
    counts[winSig] = 3;
  }

  if (visualItems.length > 0 && gridData.length <= 7 && Math.random() < 0.7) {
    const vItem = visualItems[Math.floor(Math.random() * visualItems.length)];
    const vSig = getPrizeSignature(vItem);
    const desired = Math.min(2, 9 - gridData.length, Math.random() < 0.75 ? 2 : 1);
    for (let i = 0; i < desired; i++) gridData.push({ ...vItem, isVisual: true });
    counts[vSig] = (counts[vSig] || 0) + desired;
  }

  for (let i = gridData.length; i < 9; i++) {
    let candidate = null;
    for (let guard = 0; guard < 100; guard++) {
      const pick = allItems[Math.floor(Math.random() * allItems.length)];
      const sig = getPrizeSignature(pick);
      const currentCount = counts[sig] || 0;
      const isWinSig = winningItem && sig === getPrizeSignature(winningItem);

      if (!isWinSig && currentCount < 2) {
        candidate = { ...pick, isVisual: isVisualPrize(pick) };
        counts[sig] = currentCount + 1;
        break;
      }
    }

    if (!candidate) {
      candidate = {
        id: `filler_${currentCode}_${i}`,
        name: "0 GS",
        type: "emoji",
        val: FILLER_ICONS[i % FILLER_ICONS.length],
        prize: 0,
        isVisual: true
      };
    }
    gridData.push(candidate);
  }

  gridData.sort(() => Math.random() - 0.5);
  return true;
}

async function playCasinoChipRound() {
  if (isSpinning || !currentUser || !usersDB[currentUser]) return;

  await initDB();
  const settings = getActiveGameSettings();

  if (!settings.canPlay) {
    window.showToast("Este juego aún no tiene premios configurados en el panel", "error");
    syncGameUIWithSettings();
    return;
  }

  currentRoundBet = settings.bet;
  currentRoundGameTitle = settings.title;
  const gameBalance = usersDB[currentUser].tickets || 0;

  if (gameBalance < currentRoundBet) {
    window.showToast("Saldo de juego insuficiente. Tus premios ganados están seguros.", "error");
    setTimeout(goToDashboard, 1500);
    return;
  }

  isSpinning = true;
  const btn = document.getElementById("btn-spin-chips");
  const btnText = document.getElementById("btn-spin-text");
  btn.disabled = true;
  btnText.innerText = "DESCONTANDO SALDO...";

  usersDB[currentUser].tickets = gameBalance - currentRoundBet;
  await saveUserData();

  btnText.innerText = "PARTIDA EN CURSO...";
  currentCode = Math.floor(1000 + Math.random() * 9000).toString();
  currentSerie = "A" + Math.floor(1000 + Math.random() * 9000);
  document.getElementById("fichas-num").innerText = roundCount++;
  document.getElementById("card-big-number").innerText = currentCode;
  document.getElementById("card-big-serie").innerText = "SERIE " + currentSerie;

  generateRoundData();
  prepareEmptyTable();

  for (let i = 0; i < 9; i++) {
    setupScratchCanvas(i, gridData[i]);
  }

  isSpinning = false;
}

window.addEventListener("mouseup", () => { activeScratchIndex = null; });
window.addEventListener("touchend", () => { activeScratchIndex = null; });

function setupScratchCanvas(index, item) {
  const cell = document.getElementById(`cell-${index}`);
  const contentDiv = document.getElementById(`content-${index}`);
  const canvas = document.getElementById(`scratch-${index}`);
  const ctx = canvas.getContext("2d");

  contentDiv.innerHTML = `
    ${renderItemVisual(item, "w-9 h-9")}
    <span class="text-[8.5px] font-black text-amber-200 leading-tight tabular-nums">${formatGs(item.prize)}</span>
  `;

  canvas.width = cell.clientWidth || 80;
  canvas.height = cell.clientHeight || 80;

  const goldGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  goldGrad.addColorStop(0, "#fef9c3");
  goldGrad.addColorStop(0.28, "#f59e0b");
  goldGrad.addColorStop(0.56, "#fef08a");
  goldGrad.addColorStop(0.82, "#d97706");
  goldGrad.addColorStop(1, "#92400e");

  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.beginPath();
  ctx.arc(canvas.width * 0.22, canvas.height * 0.24, 2.2, 0, Math.PI * 2);
  ctx.arc(canvas.width * 0.78, canvas.height * 0.76, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#291502";
  ctx.font = "900 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("★", canvas.width / 2, canvas.height / 2 + 3);

  const totalPixels = canvas.width * canvas.height;
  let isRevealed = false;

  function scratch(x, y) {
    if (isRevealed) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2, false);
    ctx.fill();

    playTickSound(640);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++;
    }

    if (transparent > totalPixels * 0.4 && !isRevealed) {
      isRevealed = true;
      revealCellCompletely(index);
    }
  }

  canvas.addEventListener("mousedown", (e) => { activeScratchIndex = index; scratch(e.offsetX, e.offsetY); });
  canvas.addEventListener("mousemove", (e) => { if (activeScratchIndex === index) scratch(e.offsetX, e.offsetY); });

  canvas.addEventListener("touchstart", (e) => {
    activeScratchIndex = index;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    scratch(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (activeScratchIndex !== index) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    scratch(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
  }, { passive: false });
}

function revealCellCompletely(index) {
  const cell = document.getElementById(`cell-${index}`);
  const contentDiv = document.getElementById(`content-${index}`);
  const canvas = document.getElementById(`scratch-${index}`);

  if (!cell || cell.classList.contains("revealed")) return;

  cell.classList.add("revealed");
  contentDiv.style.opacity = "1";
  canvas.style.display = "none";
  revealedCount++;

  if (revealedCount === 9 && !roundEvaluated) {
    roundEvaluated = true;
    setTimeout(evaluateRound, 400);
  }
}

function evaluateRound() {
  let winAmount = 0;
  let isWin = false;

  const overlay = document.getElementById("game-stamp-overlay");
  const stampLose = document.getElementById("stamp-lose");
  const stampWin = document.getElementById("stamp-win");
  const stampWinAmount = document.getElementById("stamp-win-amount");

  overlay.classList.remove("hidden");

  const grouped = {};
  gridData.forEach((it, idx) => {
    if (!it || isVisualPrize(it)) return;
    const sig = getPrizeSignature(it);
    if (!grouped[sig]) grouped[sig] = { item: it, indices: [] };
    grouped[sig].indices.push(idx);
  });

  const matchedGroup = Object.values(grouped).find((g) => g.indices.length >= 3 && !isVisualPrize(g.item));

  if (matchedGroup) {
    isWin = true;
    winAmount = Number(matchedGroup.item.prize) || 0;
    matchedGroup.indices.forEach((cellIdx) => {
      document.getElementById(`cell-${cellIdx}`)?.classList.add("matched");
    });
    playWinSound();
    jsConfetti.addConfetti({ emojis: ["🏆", "💰", "👑", "💎", "⭐"], confettiNumber: 80 });

    usersDB[currentUser].balance = (usersDB[currentUser].balance || 0) + winAmount;
    stampWin.classList.remove("hidden");
    stampLose.classList.add("hidden");
    stampWinAmount.innerText = "+" + formatGs(winAmount);
  } else {
    playLoseSound();
    stampWin.classList.add("hidden");
    stampLose.classList.remove("hidden");
  }

  if (!usersDB[currentUser].history) usersDB[currentUser].history = [];

  const now = new Date();
  const formattedDate = `${now.toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric"
  })} - ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  usersDB[currentUser].history.unshift({
    code: currentCode,
    serie: currentSerie,
    gameTitle: currentRoundGameTitle,
    bet: currentRoundBet,
    win: isWin,
    prize: winAmount,
    date: formattedDate
  });

  saveUserData();

  const settings = getActiveGameSettings();
  const btn = document.getElementById("btn-spin-chips");
  const btnText = document.getElementById("btn-spin-text");
  btn.disabled = !settings.canPlay;
  btnText.innerText = settings.canPlay
    ? `INICIAR NUEVA APUESTA (${formatGs(settings.bet)})`
    : "SIN PREMIOS DISPONIBLES";

  if ((usersDB[currentUser].tickets || 0) < settings.bet) {
    window.showToast("¡Te has quedado sin saldo de juego suficiente!", "error");
  }
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playToneSequence(notes, type = "sine", volume = 0.1, stepMs = 120, durationSec = 0.2) {
  try {
    initAudio();
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = audioCtx.currentTime + (idx * stepMs) / 1000;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + durationSec);
    });
  } catch (_) {}
}

function playTickSound(freq = 500) {
  playToneSequence([freq], "sine", 0.06, 0, 0.08);
}

function playWinSound() {
  playToneSequence([523, 659, 784, 1046], "sine", 0.15, 120, 0.3);
}

function playLoseSound() {
  playToneSequence([300, 220], "sine", 0.08, 150, 0.2);
}

function setupSpinButton() {
  const btn = document.getElementById("btn-spin-chips");
  if (!btn || btn.dataset.bound === "true") return;
  btn.dataset.bound = "true";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    playCasinoChipRound();
  });
}

window.addEventListener("beforeunload", () => {
  if (currentUser && usersDB[currentUser]) saveToCloud();
});

window.addEventListener("storage", () => {
  rebuildGamesMap();
  syncGameUIWithSettings();
});

window.onload = () => {
  setupPwaInstallability();
  setupSecurityGuards();
  rebuildGamesMap();
  checkSession();
  setupSpinButton();
};
