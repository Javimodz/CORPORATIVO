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
  if (currentUser) {
    saveToCloud();
  }
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
    updateDashboardUI();
  } else {
    document.getElementById('view-auth').classList.remove('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-game').classList.add('hidden');
  }
}

async function saveUserData() {
  await saveToCloud();
  updateDashboardUI();
}

function updateDashboardUI() {
  if (!currentUser || !usersDB[currentUser]) return;
  const data = usersDB[currentUser];

  document.getElementById('dash-username').innerText = data.name || data.username;
  document.getElementById('user-id-val').innerText = data.id || 'N/A';
  document.getElementById('dash-balance').innerText = (data.balance || 0).toLocaleString('es-PY') + ' GS';
  document.getElementById('dash-tickets').innerText = data.tickets || 0;

  const historyContainer = document.getElementById('history-list');
  if (!data.history || data.history.length === 0) {
    historyContainer.innerHTML = `<div class="text-center text-slate-400 text-[10px] py-3">Aún no has realizado jugadas VIP.</div>`;
  } else {
    historyContainer.innerHTML = data.history.map(item => `
      <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 text-[11px] shadow-sm">
        <div class="flex items-center gap-2">
          <i class="fa-solid ${item.win ? 'fa-trophy text-emerald-600' : 'fa-circle-xmark text-slate-400'}"></i>
          <div>
            <div class="font-bold text-slate-800">Juego #${item.code} (${item.serie})</div>
            <div class="text-[9px] text-slate-500">${item.date}</div>
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
    navigator.clipboard.writeText(text).then(() => {
      showToast(label + ' copiado: ' + text);
    }).catch(() => {
      fallbackCopyText(text, label);
    });
  } else {
    fallbackCopyText(text, label);
  }
}

function fallbackCopyText(text, label) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showToast(label + ' copiado: ' + text);
    } else {
      showToast('No se pudo copiar', 'error');
    }
  } catch (err) {
    showToast('Error al copiar', 'error');
  }
  document.body.removeChild(el);
}

window.copyUsername = function() {
  const username = usersDB[currentUser].username;
  copyToClipboard(username, 'Usuario');
};

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  toastMsg.innerText = msg;
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 ${type === 'error' ? 'bg-red-500 text-white border-red-300' : 'bg-slate-900 text-white border-emerald-500'} px-4 py-2 rounded-full text-xs font-black shadow-2xl opacity-100 pointer-events-auto transition-all duration-300 z-50 flex items-center gap-2 border`;
  setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2500);
}

window.goToGame = async function() {
  await initDB();
  if (!usersDB[currentUser].tickets || usersDB[currentUser].tickets <= 0) {
    showToast('No tienes fichas disponibles en tu cuenta.', 'error');
    return;
  }
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-game').classList.remove('hidden');
  document.getElementById('view-game').classList.add('flex');
  resetGame();
};

window.goToDashboard = function() {
  document.getElementById('view-game').classList.add('hidden');
  document.getElementById('view-game').classList.remove('flex');
  document.getElementById('view-dashboard').classList.remove('hidden');
  updateDashboardUI();
};

let gridData = [], winningItem = null, fichasCount = 1, audioCtx = null;
let currentCode = '4777', currentSerie = 'A3606';
let isGameLocked = false;       
let isWaitingNextGame = false;  
let cellsScratchedCount = 0;    
let evaluated = false;          
let cardDeducted = false;       
const jsConfetti = new JSConfetti();

function generateCardData() {
  let ALL_ITEMS = prizesDB && prizesDB.length > 0 ? prizesDB : [
    { id: 'p1', name: 'Premio Chico', type: 'emoji', val: '🎟️', prize: 5000, isVisual: false },
    { id: 'p2', name: 'Premio Medio', type: 'emoji', val: '🍀', prize: 10000, isVisual: false },
    { id: 'p3', name: 'Corona Real', type: 'icon', val: 'fa-crown', color: 'text-emerald-600', prize: 50000, isVisual: false },
    { id: 'p4', name: 'Jackpot', type: 'emoji', val: '🏆', prize: 5000000, isVisual: true }
  ];

  if (cardConfigDB && Object.keys(cardConfigDB).length > 0) {
    document.getElementById('card-display-title').innerText = cardConfigDB.title || 'RASPADITA DE LA SUERTE';
    document.getElementById('card-display-subtitle').innerText = cardConfigDB.subtitle || '¡ RASPA Y GANA !';
    document.getElementById('card-price-badge').innerText = (cardConfigDB.price || 5000).toLocaleString('es-PY');
  }

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

function initGridCanvas() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  cellsScratchedCount = 0;
  evaluated = false;
  cardDeducted = false;

  document.getElementById('scratch-progress').style.width = '0%';
  document.getElementById('progress-text').innerText = '0 / 9';

  gridData.forEach((item, i) => {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.id = `cell-${i}`;

    let renderHtml = '';
    if (item.type === 'image') {
      renderHtml = `<img src="${item.val}" class="w-8 h-8 object-contain mb-1">`;
    } else if (item.type === 'emoji') {
      renderHtml = `<span class="text-2xl mb-1">${item.val}</span>`;
    } else {
      renderHtml = `<i class="fa-solid ${item.val || item.icon || 'fa-gem'} ${item.color || 'text-emerald-600'} text-2xl mb-1"></i>`;
    }

    cell.innerHTML = `
      ${renderHtml}
      <span class="text-[9px] font-extrabold text-slate-700">${item.prize.toLocaleString('es-PY')} GS</span>
      <canvas class="cell-canvas" id="canvas-${i}"></canvas>
    `;
    grid.appendChild(cell);

    initCellCanvas(i);
  });
}

function initCellCanvas(index) {
  const canvas = document.getElementById(`canvas-${index}`);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = (rect.width || 80) * dpr;
  canvas.height = (rect.height || 80) * dpr;
  
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width || 80, h = rect.height || 80;

  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#15803d');
  grad.addColorStop(0.5, '#16a34a');
  grad.addColorStop(1, '#22c55e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RASPA', w / 2, h / 2);

  let isDrawing = false;
  let lastPos = null;
  let isDone = false;

  const getCellPos = e => {
    const r = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const eraseCell = (x, y) => {
    if (isDone || isGameLocked) return;

    if (!cardDeducted) {
      cardDeducted = true;
      deductTicketOnStart();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 25;

    if (lastPos) {
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    lastPos = { x, y };

    checkCellCompletion(canvas, ctx, index, () => {
      isDone = true;
    });
  };

  canvas.addEventListener('mousedown', e => {
    if (isGameLocked) return;
    e.preventDefault();
    isDrawing = true;
    lastPos = null;
    const p = getCellPos(e);
    eraseCell(p.x, p.y);
  });

  canvas.addEventListener('mousemove', e => {
    if (isGameLocked || !isDrawing) return;
    e.preventDefault();
    const p = getCellPos(e);
    eraseCell(p.x, p.y);
  });

  window.addEventListener('mouseup', () => { isDrawing = false; lastPos = null; });

  canvas.addEventListener('touchstart', e => {
    if (isGameLocked) return;
    isDrawing = true;
    lastPos = null;
    const p = getCellPos(e);
    eraseCell(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (isGameLocked || !isDrawing) return;
    e.preventDefault();
    const p = getCellPos(e);
    eraseCell(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchend', () => { isDrawing = false; lastPos = null; });
}

function deductTicketOnStart() {
  if (!currentUser || !usersDB[currentUser]) return;
  usersDB[currentUser].tickets = Math.max(0, (usersDB[currentUser].tickets || 0) - 1);
  saveUserData();
}

function checkCellCompletion(canvas, ctx, index, markDoneCallback) {
  try {
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let transparent = 0, total = 0;

    for (let i = 3; i < data.length; i += 32) {
      total++;
      if (data[i] < 20) transparent++;
    }

    const pct = (transparent / total) * 100;
    if (pct >= 85) {
      markDoneCallback();
      canvas.style.transition = 'opacity 0.3s ease';
      canvas.style.opacity = '0';
      setTimeout(() => {
        canvas.style.display = 'none';
      }, 300);

      registerCellScratched();
    }
  } catch (e) {}
}

function registerCellScratched() {
  cellsScratchedCount++;
  if (cellsScratchedCount > 9) cellsScratchedCount = 9;

  const progressPct = Math.round((cellsScratchedCount / 9) * 100);
  document.getElementById('scratch-progress').style.width = progressPct + '%';
  document.getElementById('progress-text').innerText = cellsScratchedCount + ' / 9';

  if (cellsScratchedCount === 9 && !evaluated) {
    evaluated = true;
    evaluate();
  }
}

function evaluate() {
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
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }) + ' - ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  usersDB[currentUser].history.unshift({
    code: currentCode,
    serie: currentSerie,
    win: isWin,
    prize: winAmount,
    date: formattedDate
  });

  saveUserData();
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
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

function resetGame() {
  isGameLocked = false;
  document.getElementById('game-stamp-overlay').classList.add('hidden');
  document.getElementById('stamp-lose').classList.add('hidden');
  document.getElementById('stamp-win').classList.add('hidden');

  currentCode = Math.floor(1000 + Math.random() * 9000).toString();
  currentSerie = 'A' + Math.floor(1000 + Math.random() * 9000);
  
  document.getElementById('fichas-num').innerText = fichasCount;
  document.getElementById('card-big-number').innerText = currentCode;
  document.getElementById('serie-code-top').innerText = 'SERIE ' + currentSerie;
  document.getElementById('card-big-serie').innerText = 'SERIE ' + currentSerie;
  
  generateCardData();
  initGridCanvas();
}

// NUEVA CONFIGURACIÓN DE BOTÓN RÁPIDO SIN DOBLES TOQUES (USA TOUCHSTART Y CLICK)
function setupNextButton() {
  const btn = document.getElementById('btn-next-game');
  if (!btn) return;

  const handleNextAction = async (e) => {
    if (e) e.preventDefault();
    if (isWaitingNextGame || isGameLocked) return;
    
    await initDB();
    if (!usersDB[currentUser].tickets || usersDB[currentUser].tickets <= 0) {
      showToast('No tienes fichas disponibles en tu cuenta.', 'error');
      setTimeout(goToDashboard, 1500);
      return;
    }

    isWaitingNextGame = true;
    isGameLocked = true;
    
    const txt = document.getElementById('btn-next-text');
    btn.disabled = true; // Bloquea físicamente el botón para evitar dobles toques
    
    let countdown = 3;
    if (txt) txt.innerHTML = `⏳ Espera (${countdown}s)...`;

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        if (txt) txt.innerHTML = `⏳ Espera (${countdown}s)...`;
      } else {
        clearInterval(timer);
        isWaitingNextGame = false;
        if (btn) btn.disabled = false; // Desbloquea el botón al terminar
        if (txt) txt.innerHTML = `🎲 Siguiente Juego`;
        
        fichasCount++;
        resetGame();
      }
    }, 1000);
  };

  // Remover eventos anteriores si existían y asignar respuesta táctil instantánea
  btn.replaceWith(btn.cloneNode(true));
  const newBtn = document.getElementById('btn-next-game');
  
  newBtn.addEventListener('touchstart', handleNextAction, { passive: false });
  newBtn.addEventListener('click', handleNextAction);
}

window.addEventListener('beforeunload', () => {
  if (currentUser && usersDB[currentUser]) {
    saveToCloud();
  }
});

window.onload = () => {
  checkSession();
  setupNextButton(); // Inicializa el botón rápido
};

// Asegurar que al cambiar a la vista de juego también se active el botón
const originalGoToGame = window.goToGame;
window.goToGame = async function() {
  await originalGoToGame();
  setupNextButton();
};
