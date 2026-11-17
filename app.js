/**
 * APP.JS - Lógica Centralizada, Autenticación, Sincronización y Raspe Físico Interactivo
 * Casino Royal - Sistema de Raspaditas y Saldo de Juego
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWpmrXx2lVToxDykBWmJrA1H0Sw4TN8O4",
  authDomain: "raspadita-delasuerte.firebaseapp.com",
  projectId: "raspadita-delasuerte",
  storageBucket: "raspadita-delasuerte.firebasestorage.app",
  messagingSenderId: "144755637640",
  appId: "1:144755637640:web:9cdd16bbcbb23214140e3d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Contraseña maestra de administración fija y segura
const ADMIN_MASTER_PASSWORD = "2003";

let globalData = {};
let usersDB = {};
let prizesDB = [];
let cardConfigDB = {};
let currentUser = sessionStorage.getItem('raspa_logged_user') || null;

async function initDB() {
  try {
    const docRef = doc(db, "sistema", "datos_globales");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      globalData = docSnap.data();
      usersDB = globalData.users || {};
      prizesDB = globalData.prizes || [];
      cardConfigDB = globalData.cardConfig || {};
    }
  } catch (e) {
    console.error("Error al conectar con Firebase:", e);
    showToast("Error de conexión con el Casino", "error");
  }
}

async function saveToCloud() {
  try {
    const docRef = doc(db, "sistema", "datos_globales");
    await setDoc(docRef, { 
      users: usersDB,
      prizes: prizesDB,
      cardConfig: cardConfigDB,
      withdrawals: globalData.withdrawals || [],
      subAdmins: globalData.subAdmins || {},
      ticketLogs: globalData.ticketLogs || []
    }, { merge: true });
  } catch (e) {
    console.error("Error al guardar en Firebase:", e);
    showToast("Error al sincronizar con el Casino", "error");
  }
}

/**
 * Valida la contraseña de administrador leída directamente desde app.js
 */
window.validateAdminLogin = function(passwordInput) {
  if (!passwordInput) return false;
  const cleanInput = passwordInput.trim();
  
  if (cleanInput === ADMIN_MASTER_PASSWORD) {
    sessionStorage.setItem('admin_logged', 'true');
    sessionStorage.setItem('admin_name', 'Administrador General');
    return true;
  }
  return false;
};

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
  checkSession();
};

window.logout = function() {
  if (currentUser) saveToCloud();
  currentUser = null;
  sessionStorage.removeItem('raspa_logged_user');
  checkSession();
};

async function checkSession() {
  await initDB();
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
  document.getElementById('dash-tickets').innerText = gameBalance.toLocaleString('es-PY') + ' GS';
  document.getElementById('dash-balance').innerText = prizes.toLocaleString('es-PY') + ' GS';

  const liveChipsEl = document.getElementById('game-live-chips');
  const livePrizesEl = document.getElementById('game-live-prizes');
  if (liveChipsEl) liveChipsEl.innerText = gameBalance.toLocaleString('es-PY') + ' GS';
  if (livePrizesEl) livePrizesEl.innerText = prizes.toLocaleString('es-PY') + ' GS';

  const historyContainer = document.getElementById('history-list');
  if (!data.history || data.history.length === 0) {
    historyContainer.innerHTML = `<div class="text-center text-slate-400 text-[10px] py-3">Aún no has realizado jugadas.</div>`;
  } else {
    historyContainer.innerHTML = data.history.map(item => `
      <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 text-[11px] shadow-sm">
        <div class="flex items-center gap-2">
          <i class="fa-solid ${item.win ? 'fa-trophy text-emerald-600' : 'fa-wallet text-slate-400'}"></i>
          <div>
            <div class="font-bold text-slate-800">Jugada #${item.code} (${item.serie})</div>
            <div class="text-[9px] text-slate-500">${item.date} • Apuesta: 2.500 GS</div>
          </div>
        </div>
        <div class="font-black ${item.win ? 'text-emerald-600' : 'text-slate-400'}">
          ${item.win ? '+' + item.prize.toLocaleString('es-PY') + ' GS' : 'SIN PREMIO'}
        </div>
      </div>
    `).join('');
  }
}

function copyToClipboard(text, label) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(label + ' copiado: ' + text));
  }
}

window.copyUsername = function() {
  copyToClipboard(usersDB[currentUser].username, 'Usuario');
};

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  toastMsg.innerText = msg;
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 ${type === 'error' ? 'bg-red-600 text-white border-red-300' : 'bg-slate-900 text-white border-emerald-500'} px-4 py-2 rounded-full text-xs font-black shadow-2xl opacity-100 pointer-events-auto transition-all duration-300 z-50 flex items-center gap-2 border`;
  setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2500);
}

window.goToGame = async function() {
  await initDB();
  
  const gameBalance = usersDB[currentUser].tickets || 0;
  if (gameBalance < 2500) {
    showToast('Saldo de juego insuficiente. Necesitas al menos 2.500 GS para jugar.', 'error');
    return;
  }

  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-game').classList.remove('hidden');
  document.getElementById('view-game').classList.add('flex');
  updateBalancesUI();
  prepareEmptyTable();
};

window.goToDashboard = function() {
  if (isSpinning) return;
  document.getElementById('view-game').classList.add('hidden');
  document.getElementById('view-game').classList.remove('flex');
  document.getElementById('view-dashboard').classList.remove('hidden');
  updateBalancesUI();
};

let gridData = [], winningItem = null, roundCount = 1, audioCtx = null;
let currentCode = '4777', currentSerie = 'A3606';
let isSpinning = false;
let revealedCount = 0;
let roundEvaluated = false;
const jsConfetti = new JSConfetti();

function prepareEmptyTable() {
  document.getElementById('game-stamp-overlay').classList.add('hidden');
  document.getElementById('stamp-lose').classList.add('hidden');
  document.getElementById('stamp-win').classList.add('hidden');

  if (cardConfigDB && Object.keys(cardConfigDB).length > 0) {
    document.getElementById('card-display-title').innerText = cardConfigDB.title || 'MESA VIP DE LA SUERTE';
  }

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  revealedCount = 0;
  roundEvaluated = false;

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.id = `cell-${i}`;
    cell.innerHTML = `
      <div id="content-${i}" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 opacity-0 transition-opacity duration-300"></div>
      <canvas id="scratch-${i}" class="scratch-canvas"></canvas>
    `;
    grid.appendChild(cell);
  }
}

function generateRoundData() {
  let ALL_ITEMS = prizesDB && prizesDB.length > 0 ? prizesDB : [
    { id: 'p1', name: 'Premio Chico', type: 'emoji', val: '🎟️', prize: 5000, isVisual: false },
    { id: 'p2', name: 'Premio Medio', type: 'emoji', val: '🍀', prize: 10000, isVisual: false },
    { id: 'p3', name: 'Corona Real', type: 'icon', val: 'fa-crown', color: 'text-emerald-600', prize: 50000, isVisual: false },
    { id: 'p4', name: 'Jackpot', type: 'emoji', val: '🏆', prize: 5000000, isVisual: true }
  ];

  const realWinItems = ALL_ITEMS.filter(item => !item.isVisual);
  const visualItems = ALL_ITEMS.filter(item => item.isVisual);
  const configuredRate = cardConfigDB && cardConfigDB.winRate !== undefined ? Number(cardConfigDB.winRate) : 15;
  const winRate = configuredRate / 100;

  gridData = [];
  const isWinner = Math.random() < winRate;
  
  if (isWinner && realWinItems.length > 0) {
    winningItem = realWinItems[Math.floor(Math.random() * realWinItems.length)];
    for (let i = 0; i < 3; i++) gridData.push({ ...winningItem });
    const count = {};
    count[winningItem.id || winningItem.name] = 3;
    
    for (let i = 0; i < 6; i++) {
      let item;
      do {
        item = ALL_ITEMS[Math.floor(Math.random() * ALL_ITEMS.length)];
      } while ((count[item.id || item.name] || 0) >= 2 || (winningItem && (item.id === winningItem.id || item.name === winningItem.name)));
      count[item.id || item.name] = (count[item.id || item.name] || 0) + 1;
      gridData.push({ ...item });
    }
  } else {
    winningItem = null;
    const count = {};
    if (visualItems.length > 0 && Math.random() < 0.7) {
      const vItem = visualItems[Math.floor(Math.random() * visualItems.length)];
      gridData.push({ ...vItem }, { ...vItem });
      count[vItem.id || vItem.name] = 2;
    }

    for (let i = gridData.length; i < 9; i++) {
      let item;
      do {
        item = ALL_ITEMS[Math.floor(Math.random() * ALL_ITEMS.length)];
      } while ((count[item.id || item.name] || 0) >= 2);
      count[item.id || item.name] = (count[item.id || item.name] || 0) + 1;
      gridData.push({ ...item });
    }
  }
  
  gridData.sort(() => Math.random() - 0.5);
}

async function playCasinoChipRound() {
  if (isSpinning) return;

  await initDB();
  const gameBalance = usersDB[currentUser].tickets || 0;

  if (gameBalance < 2500) {
    showToast('Saldo de juego insuficiente. Tus premios ganados están seguros.', 'error');
    setTimeout(() => {
      goToDashboard();
    }, 1500);
    return;
  }

  isSpinning = true;
  const btn = document.getElementById('btn-spin-chips');
  const btnText = document.getElementById('btn-spin-text');
  btn.disabled = true;
  btnText.innerText = 'PARTIDA EN CURSO (2.500 GS)...';

  usersDB[currentUser].tickets = gameBalance - 2500;
  await saveUserData();

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

function setupScratchCanvas(index, item) {
  const cell = document.getElementById(`cell-${index}`);
  const contentDiv = document.getElementById(`content-${index}`);
  const canvas = document.getElementById(`scratch-${index}`);
  const ctx = canvas.getContext('2d');

  let renderHtml = '';
  if (item.type === 'image') {
    renderHtml = `<img src="${item.val}" class="w-7 h-7 object-contain mb-0.5">`;
  } else if (item.type === 'emoji') {
    renderHtml = `<span class="text-2xl mb-0.5">${item.val}</span>`;
  } else {
    renderHtml = `<i class="fa-solid ${item.val || item.icon || 'fa-gem'} ${item.color || 'text-emerald-600'} text-xl mb-0.5"></i>`;
  }
  contentDiv.innerHTML = `
    ${renderHtml}
    <span class="text-[8px] font-extrabold text-slate-800">${item.prize.toLocaleString('es-PY')} GS</span>
  `;

  canvas.width = cell.clientWidth || 80;
  canvas.height = cell.clientHeight || 80;

  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RASPA AQUÍ', canvas.width / 2, canvas.height / 2 + 3);

  let isDrawing = false;
  let totalPixels = canvas.width * canvas.height;
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

  canvas.addEventListener('mousedown', (e) => { isDrawing = true; scratch(e.offsetX, e.offsetY); });
  canvas.addEventListener('mousemove', (e) => { if (isDrawing) scratch(e.offsetX, e.offsetY); });
  window.addEventListener('mouseup', () => { isDrawing = false; });

  canvas.addEventListener('touchstart', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    scratch(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
  });
  canvas.addEventListener('touchmove', (e) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    scratch(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
  });
  canvas.addEventListener('touchend', () => { isDrawing = false; });
}

function revealCellCompletely(index) {
  const cell = document.getElementById(`cell-${index}`);
  const contentDiv = document.getElementById(`content-${index}`);
  const canvas = document.getElementById(`scratch-${index}`);

  if (cell.classList.contains('revealed')) return;

  cell.classList.add('revealed');
  contentDiv.style.opacity = '1';
  canvas.style.display = 'none';

  revealedCount++;

  if (revealedCount === 9 && !roundEvaluated) {
    roundEvaluated = true;
    setTimeout(() => {
      evaluateRound();
    }, 400);
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

  if (winningItem && !winningItem.isVisual) {
    isWin = true;
    winAmount = winningItem.prize;
    gridData.forEach((it, i) => {
      if ((it.id && it.id === winningItem.id) || (it.name === winningItem.name)) {
        document.getElementById(`cell-${i}`).classList.add('matched');
      }
    });
    playWinSound();
    jsConfetti.addConfetti({ emojis: ['🏆', '💰', '👑', '💎', '⭐'], confettiNumber: 80 });

    usersDB[currentUser].balance = (usersDB[currentUser].balance || 0) + winAmount;

    stampWin.classList.remove('hidden');
    stampLose.classList.add('hidden');
    stampWinAmount.innerText = '+' + winAmount.toLocaleString('es-PY') + ' GS';
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
    win: isWin,
    prize: winAmount,
    date: formattedDate
  });

  saveUserData();

  const btn = document.getElementById('btn-spin-chips');
  const btnText = document.getElementById('btn-spin-text');
  btn.disabled = false;
  btnText.innerText = 'INICIAR NUEVA APUESTA (2.500 GS)';

  if ((usersDB[currentUser].tickets || 0) < 2500) {
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
  } catch (e) {}
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
  } catch (e) {}
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
  } catch (e) {}
}

function setupSpinButton() {
  const btn = document.getElementById('btn-spin-chips');
  if (!btn) return;
  btn.replaceWith(btn.cloneNode(true));
  const newBtn = document.getElementById('btn-spin-chips');
  newBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playCasinoChipRound();
  });
}

window.addEventListener('beforeunload', () => {
  if (currentUser && usersDB[currentUser]) saveToCloud();
});

window.onload = () => {
  checkSession();
  setupSpinButton();
};
