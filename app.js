/**
 * APP.JS - Lógica Centralizada, Autenticación, Sincronización y Raspe Físico Interactivo
 * Casino Royal - Sistema de Raspaditas y Saldo de Juego
 */

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db, DEFAULT_GAMES_CATALOG, escapeHtml, isSafeMediaUrl, formatGs } from "./firebase-config.js";

let globalData = {};
let usersDB = {};
let prizesDB = [];
let cardConfigDB = {};
let gamesConfigDB = {};
let resolvedGamesMap = JSON.parse(JSON.stringify(DEFAULT_GAMES_CATALOG));
let currentUser = sessionStorage.getItem('raspa_logged_user') || null;

let gridData = [];
let winningItem = null;
let roundCount = 1;
let audioCtx = null;
let currentCode = '0000';
let currentSerie = 'A0000';
let currentRoundBet = 2500;
let currentRoundGameTitle = 'RASPADITA REAL VIP';
let isSpinning = false;
let revealedCount = 0;
let roundEvaluated = false;
let activeScratchIndex = null;
const jsConfetti = new JSConfetti();

function isVisualPrize(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.type === 'visual' || item.mode === 'visual') return true;

  const rawFlag = item.isVisual ?? item.visual ?? item.esVisual ?? item.soloVisual;
  if (typeof rawFlag === 'boolean') return rawFlag;
  if (typeof rawFlag === 'number') return rawFlag === 1;
  if (typeof rawFlag === 'string') {
    const clean = rawFlag.trim().toLowerCase();
    return ['true', '1', 'si', 'sí', 'visual'].includes(clean);
  }
  return false;
}

function renderItemVisual(item, sizeClass = 'w-7 h-7') {
  if (window.CasinoUI?.renderPrizeVisualHtml) {
    return window.CasinoUI.renderPrizeVisualHtml(item, sizeClass);
  }
  const rawVal = String(item?.val ?? item?.icon ?? '').trim();
  if (item?.type === 'image' || isSafeMediaUrl(rawVal)) {
    return `<img src="${escapeHtml(rawVal)}" alt="${escapeHtml(item?.name || 'Premio')}" class="${sizeClass} object-contain rounded-md mb-0.5" onerror="this.style.display='none'">`;
  }
  if (item?.type === 'icon' || rawVal.startsWith('fa-')) {
    const iconCls = rawVal.startsWith('fa-') ? rawVal : `fa-${rawVal}`;
    return `<i class="fa-solid ${escapeHtml(iconCls)} text-amber-400 text-xl mb-0.5"></i>`;
  }
  return `<span class="text-2xl leading-none mb-0.5">${escapeHtml(rawVal || '💎')}</span>`;
}

function getGlobalWinPercent() {
  const candidates = [
    globalData?.globalWinRate,
    globalData?.globalProbability,
    globalData?.winRate,
    cardConfigDB?.winRate,
    localStorage.getItem('casino_global_prob'),
    localStorage.getItem('global_win_probability')
  ];

  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      let num = Number(String(val).replace('%', '').trim());
      if (!Number.isNaN(num)) {
        if (num > 0 && num <= 1) num *= 100;
        return Math.max(0, Math.min(100, num));
      }
    }
  }
  return 25;
}

function normalizeGamePrizes(rawPrizes, gameKey) {
  if (!Array.isArray(rawPrizes) || rawPrizes.length === 0) return [];
  return rawPrizes
    .map((p, idx) => {
      if (!p) return null;
      if (typeof p === 'number') {
        const amt = Math.max(0, Number(p) || 0);
        return {
          id: `prize_${gameKey}_${idx}`,
          name: formatGs(amt),
          label: formatGs(amt),
          amount: amt,
          prize: amt,
          type: 'emoji',
          val: '💎',
          weight: Math.max(1, 50 - idx * 10),
          isVisual: false
        };
      }
      const visualFlag = isVisualPrize(p);
      const amt = Math.max(0, Number(p.amount ?? p.prize ?? p.valor ?? p.value ?? 0) || 0);
      const val = String(p.val ?? p.icon ?? (isSafeMediaUrl(p.label) ? p.label : '💎')).trim();
      const type = p.type || (isSafeMediaUrl(val) ? 'image' : (val.startsWith('fa-') ? 'icon' : 'emoji'));
      const name = String(p.name || p.label || formatGs(amt)).trim();
      return {
        id: p.id || `prize_${gameKey}_${idx}`,
        name,
        label: name,
        amount: amt,
        prize: amt,
        type,
        val,
        weight: Math.max(1, Number(p.weight ?? p.peso ?? p.probabilidad ?? 25)),
        isVisual: visualFlag
      };
    })
    .filter(Boolean);
}

function rebuildGamesMap() {
  let localGames = null;
  try {
    const rawLocal = localStorage.getItem('casino_games_config') || localStorage.getItem('gamesConfig');
    if (rawLocal) localGames = JSON.parse(rawLocal);
  } catch (_) {}

  const nextMap = JSON.parse(JSON.stringify(DEFAULT_GAMES_CATALOG));

  Object.keys(nextMap).forEach((key) => {
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
    } else if (key === 'raspada' && Array.isArray(prizesDB) && prizesDB.length > 0) {
      nextMap[key].prizes = normalizeGamePrizes(prizesDB, key);
    } else {
      nextMap[key].prizes = [];
    }

    nextMap[key].hasPrizes = nextMap[key].prizes.length > 0;
    nextMap[key].canPlay = nextMap[key].prizes.some((item) => !isVisualPrize(item));
  });

  resolvedGamesMap = nextMap;
  window.CasinoUI?.renderLobbyGames?.(resolvedGamesMap);
}

function getActiveGameKey() {
  const uiKey = window.CasinoUI?.getSelectedGameKey?.() || 'raspada';
  return resolvedGamesMap[uiKey] ? uiKey : 'raspada';
}

function getActiveGameSettings() {
  const key = getActiveGameKey();
  const cfg = resolvedGamesMap[key] || DEFAULT_GAMES_CATALOG.raspada;
  const prizes = Array.isArray(cfg.prizes) ? cfg.prizes : [];
  const hasPrizes = prizes.length > 0;
  const canPlay = hasPrizes && prizes.some((p) => !isVisualPrize(p));

  return {
    key,
    title: cfg.title || DEFAULT_GAMES_CATALOG[key]?.title || 'MESA VIP DE LA SUERTE',
    shortName: cfg.shortName || cfg.title || key,
    bet: Math.max(100, Number(cfg.bet) || 2500),
    prizes,
    hasPrizes,
    canPlay
  };
}

function syncGameUIWithSettings() {
  const settings = getActiveGameSettings();
  window.CasinoUI?.renderActiveGameHeader?.(settings);

  const btn = document.getElementById('btn-spin-chips');
  const spinText = document.getElementById('btn-spin-text');
  if (btn && !isSpinning) btn.disabled = !settings.canPlay;
  if (spinText && !isSpinning) {
    spinText.innerText = settings.canPlay
      ? `INICIAR NUEVA APUESTA (${formatGs(settings.bet)})`
      : 'SIN PREMIOS DISPONIBLES';
  }
}

async function initDB() {
  try {
    const docRef = doc(db, "sistema", "datos_globales");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      globalData = docSnap.data();
      usersDB = globalData.users || {};
      prizesDB = Array.isArray(globalData.prizes) ? globalData.prizes : [];
      cardConfigDB = globalData.cardConfig || {};
      gamesConfigDB = globalData.gamesConfig || cardConfigDB.games || {};
    }
  } catch (e) {
    console.error("Error al conectar con Firebase:", e);
    showToast("Error de conexión con el Casino", "error");
  } finally {
    rebuildGamesMap();
    syncGameUIWithSettings();
  }
}

async function saveToCloud() {
  try {
    const docRef = doc(db, "sistema", "datos_globales");
    await setDoc(docRef, {
      users: usersDB,
      prizes: prizesDB,
      cardConfig: cardConfigDB,
      gamesConfig: gamesConfigDB,
      globalWinRate: getGlobalWinPercent(),
      withdrawals: globalData.withdrawals || [],
      subAdmins: globalData.subAdmins || {},
      ticketLogs: globalData.ticketLogs || []
    }, { merge: true });
  } catch (e) {
    console.error("Error al guardar en Firebase:", e);
    showToast("Error al sincronizar con el Casino", "error");
  }
}

window.handleLogin = async function(e) {
  e.preventDefault();
  await initDB();

  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const pass = document.getElementById('login-password').value;

  if (!usersDB[username] || usersDB[username].password !== pass) {
    showToast('Usuario o contraseña incorrectos', 'error');
    return;
  }

  if (usersDB[username].role === 'agent') {
    showToast('Las cuentas de agentes deben iniciar sesión en su panel correspondiente', 'error');
    return;
  }

  currentUser = username;
  sessionStorage.setItem('raspa_logged_user', currentUser);
  showLoggedInView();
};

window.logout = function() {
  if (currentUser) saveToCloud();
  currentUser = null;
  sessionStorage.removeItem('raspa_logged_user');
  document.getElementById('view-auth').classList.remove('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-game').classList.add('hidden');
};

function showLoggedInView() {
  if (currentUser && usersDB[currentUser]) {
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');
    document.getElementById('view-dashboard').classList.add('flex');
    updateBalancesUI();
  } else {
    document.getElementById('view-auth').classList.remove('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-game').classList.add('hidden');
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

  document.getElementById('dash-username').innerText = data.name || data.username;
  document.getElementById('user-id-val').innerText = data.id || 'N/A';
  document.getElementById('dash-tickets').innerText = formatGs(gameBalance);
  document.getElementById('dash-balance').innerText = formatGs(prizes);

  const liveChipsEl = document.getElementById('game-live-chips');
  const livePrizesEl = document.getElementById('game-live-prizes');
  if (liveChipsEl) liveChipsEl.innerText = formatGs(gameBalance);
  if (livePrizesEl) livePrizesEl.innerText = formatGs(prizes);

  const historyContainer = document.getElementById('history-list');
  if (!data.history || data.history.length === 0) {
    historyContainer.innerHTML = `<div class="text-center text-slate-500 text-[10px] py-3">Aún no has realizado jugadas.</div>`;
  } else {
    historyContainer.innerHTML = data.history.map(item => `
      <div class="flex items-center justify-between bg-slate-950/90 p-2 rounded-xl border border-slate-800 text-[11px] shadow-sm">
        <div class="flex items-center gap-2">
          <i class="fa-solid ${item.win ? 'fa-trophy text-amber-400' : 'fa-coins text-slate-500'}"></i>
          <div>
            <div class="font-bold text-slate-200">${item.gameTitle ? escapeHtml(item.gameTitle) + ' • ' : ''}Jugada #${escapeHtml(item.code)} (${escapeHtml(item.serie)})</div>
            <div class="text-[9px] text-slate-500">${escapeHtml(item.date)} • Apuesta: ${formatGs(item.bet || 2500)}</div>
          </div>
        </div>
        <div class="font-black ${item.win ? 'text-emerald-400' : 'text-slate-500'}">
          ${item.win ? '+' + formatGs(item.prize) : 'SIN PREMIO'}
        </div>
      </div>
    `).join('');
  }
}

window.copyUsername = function() {
  if (!currentUser || !usersDB[currentUser]) return;
  const text = usersDB[currentUser].username;
  navigator.clipboard?.writeText(text).then(() => showToast('Usuario copiado: ' + text));
};

window.showToast = function(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;
  toastMsg.innerText = msg;
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 ${type === 'error' ? 'bg-red-700 text-white border-red-400' : 'bg-slate-950 text-amber-300 border-amber-500/60'} px-4 py-2 rounded-full text-xs font-black shadow-2xl opacity-100 pointer-events-auto transition-all duration-300 z-50 flex items-center gap-2 border`;
  setTimeout(() => toast.classList.add('opacity-0', 'pointer-events-none'), 2500);
};

window.onCasinoGameSelected = async function(gameKey) {
  window.CasinoUI?.setSelectedGameKey?.(gameKey);
  await window.goToGame();
};

window.goToGame = async function() {
  if (!currentUser || !usersDB[currentUser]) {
    showToast('Iniciá sesión primero', 'error');
    return;
  }
  await initDB();
  const settings = getActiveGameSettings();
  if (!settings.canPlay) {
    showToast('Este juego aún no tiene premios configurados en el panel', 'error');
    return;
  }

  const gameBalance = usersDB[currentUser].tickets || 0;
  if (gameBalance < settings.bet) {
    showToast(`Saldo de juego insuficiente. Necesitas al menos ${formatGs(settings.bet)} para este juego.`, 'error');
    return;
  }

  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-game').classList.remove('hidden');
  document.getElementById('view-game').classList.add('flex');
  syncGameUIWithSettings();
  updateBalancesUI();
  prepareEmptyTable();
};

window.goToDashboard = function() {
  if (isSpinning) return;
  document.getElementById('view-game').classList.add('hidden');
  document.getElementById('view-game').classList.remove('flex');
  document.getElementById('view-dashboard').classList.remove('hidden');
  rebuildGamesMap();
  updateBalancesUI();
};

function getPrizeMatchSignature(item) {
  return `${String(item.val || '').trim()}__${Number(item.prize) || 0}__${isVisualPrize(item) ? 'V' : 'W'}`;
}

function prepareEmptyTable() {
  document.getElementById('game-stamp-overlay').classList.add('hidden');
  document.getElementById('stamp-lose').classList.add('hidden');
  document.getElementById('stamp-win').classList.add('hidden');

  syncGameUIWithSettings();

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  revealedCount = 0;
  roundEvaluated = false;

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.id = `cell-${i}`;
    cell.innerHTML = `
      <div id="content-${i}" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 opacity-0 transition-opacity duration-300 px-1 text-center"></div>
      <canvas id="scratch-${i}" class="scratch-canvas"></canvas>
    `;
    grid.appendChild(cell);
  }
}

function pickWeightedPrize(pool) {
  const totalWeight = pool.reduce((sum, p) => sum + (Number(p.weight) || 1), 0);
  let r = Math.random() * totalWeight;
  for (const item of pool) {
    r -= (Number(item.weight) || 1);
    if (r <= 0) return item;
  }
  return pool[0];
}

function generateRoundData() {
  const settings = getActiveGameSettings();
  if (!settings.canPlay) {
    gridData = [];
    winningItem = null;
    return false;
  }

  const ALL_ITEMS = settings.prizes.map(p => ({ ...p, isVisual: isVisualPrize(p) }));
  const winnableItems = ALL_ITEMS.filter(item => !item.isVisual);
  const visualItems = ALL_ITEMS.filter(item => item.isVisual);

  const winPercent = getGlobalWinPercent();
  const shouldWin = Math.random() * 100 < winPercent && winnableItems.length > 0;

  gridData = [];
  winningItem = null;
  const counts = {};

  if (shouldWin) {
    const chosenWin = { ...pickWeightedPrize(winnableItems), isVisual: false };
    winningItem = chosenWin;
    const winSig = getPrizeMatchSignature(chosenWin);

    for (let i = 0; i < 3; i++) {
      gridData.push({ ...chosenWin, isVisual: false });
    }
    counts[winSig] = 3;
  }

  if (visualItems.length > 0 && gridData.length <= 7 && Math.random() < 0.7) {
    const vItem = visualItems[Math.floor(Math.random() * visualItems.length)];
    const vSig = getPrizeMatchSignature(vItem);
    const desiredCount = Math.min(2, 9 - gridData.length, Math.random() < 0.75 ? 2 : 1);
    for (let i = 0; i < desiredCount; i++) {
      gridData.push({ ...vItem, isVisual: true });
    }
    counts[vSig] = (counts[vSig] || 0) + desiredCount;
  }

  for (let i = gridData.length; i < 9; i++) {
    let candidate = null;
    let guard = 0;

    while (guard < 100) {
      guard++;
      const pick = ALL_ITEMS[Math.floor(Math.random() * ALL_ITEMS.length)];
      const sig = getPrizeMatchSignature(pick);
      const currentCount = counts[sig] || 0;
      const isWinningSig = winningItem && sig === getPrizeMatchSignature(winningItem);

      if (!isWinningSig && currentCount < 2) {
        candidate = { ...pick, isVisual: isVisualPrize(pick) };
        counts[sig] = currentCount + 1;
        break;
      }
    }

    if (!candidate) {
      const uniqueIcons = ['🍒', '🔔', '🍋', '🍇', '🍉', '🎲', '🃏', '🎯', '🪙'];
      const uniqueIcon = uniqueIcons[i % uniqueIcons.length];
      candidate = {
        id: `filler_${currentCode}_${i}`,
        name: '0 GS',
        type: 'emoji',
        val: uniqueIcon,
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
    showToast('Este juego aún no tiene premios configurados en el panel', 'error');
    syncGameUIWithSettings();
    return;
  }

  currentRoundBet = settings.bet;
  currentRoundGameTitle = settings.title;
  const gameBalance = usersDB[currentUser].tickets || 0;

  if (gameBalance < currentRoundBet) {
    showToast('Saldo de juego insuficiente. Tus premios ganados están seguros.', 'error');
    setTimeout(goToDashboard, 1500);
    return;
  }

  isSpinning = true;
  const btn = document.getElementById('btn-spin-chips');
  const btnText = document.getElementById('btn-spin-text');
  btn.disabled = true;
  btnText.innerText = 'DESCONTANDO SALDO...';

  usersDB[currentUser].tickets = gameBalance - currentRoundBet;
  await saveUserData();

  btnText.innerText = 'PARTIDA EN CURSO...';
  currentCode = Math.floor(1000 + Math.random() * 9000).toString();
  currentSerie = 'A' + Math.floor(1000 + Math.random() * 9000);
  document.getElementById('fichas-num').innerText = roundCount++;
  document.getElementById('card-big-number').innerText = currentCode;
  document.getElementById('card-big-serie').innerText = 'SERIE ' + currentSerie;

  generateRoundData();
  prepareEmptyTable();

  for (let i = 0; i < 9; i++) {
    setupScratchCanvas(i, gridData[i]);
  }

  isSpinning = false;
}

window.addEventListener('mouseup', () => { activeScratchIndex = null; });
window.addEventListener('touchend', () => { activeScratchIndex = null; });

function setupScratchCanvas(index, item) {
  const cell = document.getElementById(`cell-${index}`);
  const contentDiv = document.getElementById(`content-${index}`);
  const canvas = document.getElementById(`scratch-${index}`);
  const ctx = canvas.getContext('2d');

  contentDiv.innerHTML = `
    ${renderItemVisual(item, 'w-7 h-7')}
    <span class="text-[8px] font-extrabold text-amber-300 leading-tight">${formatGs(item.prize)}</span>
  `;

  canvas.width = cell.clientWidth || 80;
  canvas.height = cell.clientHeight || 80;

  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RASPAR', canvas.width / 2, canvas.height / 2 + 3);

  const totalPixels = canvas.width * canvas.height;
  let isRevealed = false;

  function scratch(x, y) {
    if (isRevealed) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2, false);
    ctx.fill();

    playTickSound(600);

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

  canvas.addEventListener('mousedown', (e) => { activeScratchIndex = index; scratch(e.offsetX, e.offsetY); });
  canvas.addEventListener('mousemove', (e) => { if (activeScratchIndex === index) scratch(e.offsetX, e.offsetY); });

  canvas.addEventListener('touchstart', (e) => {
    activeScratchIndex = index;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    scratch(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
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

  if (!cell || cell.classList.contains('revealed')) return;

  cell.classList.add('revealed');
  contentDiv.style.opacity = '1';
  canvas.style.display = 'none';

  revealedCount++;

  if (revealedCount === 9 && !roundEvaluated) {
    roundEvaluated = true;
    setTimeout(evaluateRound, 400);
  }
}

function evaluateRound() {
  let winAmount = 0;
  let isWin = false;

  const overlay = document.getElementById('game-stamp-overlay');
  const stampLose = document.getElementById('stamp-lose');
  const stampWin = document.getElementById('stamp-win');
  const stampWinAmount = document.getElementById('stamp-win-amount');

  overlay.classList.remove('hidden');

  const grouped = {};
  gridData.forEach((it, idx) => {
    if (!it || isVisualPrize(it)) return;
    const sig = getPrizeMatchSignature(it);
    if (!grouped[sig]) grouped[sig] = { item: it, indices: [] };
    grouped[sig].indices.push(idx);
  });

  const matchedGroup = Object.values(grouped).find(g => g.indices.length >= 3 && !isVisualPrize(g.item));

  if (matchedGroup) {
    isWin = true;
    winAmount = Number(matchedGroup.item.prize) || 0;
    matchedGroup.indices.forEach((cellIdx) => {
      document.getElementById(`cell-${cellIdx}`)?.classList.add('matched');
    });
    playWinSound();
    jsConfetti.addConfetti({ emojis: ['🏆', '💰', '👑', '💎', '⭐'], confettiNumber: 80 });

    usersDB[currentUser].balance = (usersDB[currentUser].balance || 0) + winAmount;

    stampWin.classList.remove('hidden');
    stampLose.classList.add('hidden');
    stampWinAmount.innerText = '+' + formatGs(winAmount);
  } else {
    playLoseSound();
    stampWin.classList.add('hidden');
    stampLose.classList.remove('hidden');
  }

  if (!usersDB[currentUser].history) usersDB[currentUser].history = [];

  const now = new Date();
  const formattedDate = now.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }) + ' - ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
  const btn = document.getElementById('btn-spin-chips');
  const btnText = document.getElementById('btn-spin-text');
  btn.disabled = !settings.canPlay;
  btnText.innerText = settings.canPlay
    ? `INICIAR NUEVA APUESTA (${formatGs(settings.bet)})`
    : 'SIN PREMIOS DISPONIBLES';

  if ((usersDB[currentUser].tickets || 0) < settings.bet) {
    showToast('¡Te has quedado sin saldo de juego suficiente!', 'error');
  }
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTickSound(freq = 500) {
  try {
    initAudio();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.08);
  } catch (_) {}
}

function playWinSound() {
  try {
    initAudio();
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, audioCtx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.12 + 0.3);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.12);
      o.stop(audioCtx.currentTime + i * 0.12 + 0.3);
    });
  } catch (_) {}
}

function playLoseSound() {
  try {
    initAudio();
    [300, 220].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.15 + 0.2);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.15);
      o.stop(audioCtx.currentTime + i * 0.15 + 0.2);
    });
  } catch (_) {}
}

function setupSpinButton() {
  const btn = document.getElementById('btn-spin-chips');
  if (!btn || btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    playCasinoChipRound();
  });
}

window.addEventListener('beforeunload', () => {
  if (currentUser && usersDB[currentUser]) saveToCloud();
});

window.addEventListener('storage', () => {
  rebuildGamesMap();
  syncGameUIWithSettings();
});

window.onload = () => {
  rebuildGamesMap();
  checkSession();
  setupSpinButton();
};
