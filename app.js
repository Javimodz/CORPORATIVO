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

// Cargar todos los datos desde Firebase
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

// Guardar los datos actuales en Firebase de manera segura
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
    historyContainer.innerHTML = `<div class="text-center text-slate-500 text-xs py-3">Aún no has realizado jugadas VIP.</div>`;
  } else {
    historyContainer.innerHTML = data.history.map(item => `
      <div class="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-amber-500/20 text-xs">
        <div class="flex items-center gap-2">
          <i class="fa-solid ${item.win ? 'fa-trophy text-amber-400' : 'fa-circle-xmark text-slate-500'}"></i>
          <div>
            <div class="font-bold text-slate-200">Juego #${item.code} (${item.serie})</div>
            <div class="text-[10px] text-slate-400">${item.date}</div>
          </div>
        </div>
        <div class="font-black ${item.win ? 'text-amber-400' : 'text-slate-500'}">
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
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 ${type === 'error' ? 'bg-red-500 text-white' : 'bg-amber-500 text-slate-950'} px-4 py-2 rounded-full text-xs font-black shadow-2xl opacity-100 pointer-events-auto transition-all duration-300 z-50 flex items-center gap-2`;
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

let gridData = [], winningItem = null, isScratchedCompleted = false, isDrawing = false, lastPos = null, fichasCount = 1, audioCtx = null, checkThrottler = null;
let currentCode = '4777', currentSerie = 'A3606';
const scratchCanvas = document.getElementById('scratch-canvas');
const scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
const jsConfetti = new JSConfetti();

function initCanvas() {
  const rect = scratchCanvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  scratchCanvas.width = rect.width * dpr;
  scratchCanvas.height = rect.height * dpr;
  scratchCanvas.style.width = rect.width + 'px';
  scratchCanvas.style.height = rect.height + 'px';
  
  scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  
  scratchCtx.globalCompositeOperation = 'source-over';
  scratchCtx.clearRect(0, 0, w, h);
  
  const grad = scratchCtx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#b45309');
  grad.addColorStop(0.5, '#d97706');
  grad.addColorStop(1, '#78350f');
  scratchCtx.fillStyle = grad;
  scratchCtx.fillRect(0, 0, w, h);
  
  scratchCtx.font = '900 20px Poppins, sans-serif';
  scratchCtx.fillStyle = '#fef3c7';
  scratchCtx.textAlign = 'center';
  scratchCtx.fillText('★ RASPA AQUÍ ★', w / 2, h / 2);
}

function generateCardData() {
  let ITEMS = prizesDB && prizesDB.length > 0 ? prizesDB : [
    { id: 'p1', name: 'Premio Chico (Recarga)', type: 'emoji', val: '🎟️', color: '', prize: 5000 },
    { id: 'p2', name: 'Premio Chico (Suerte)', type: 'emoji', val: '🍀', color: '', prize: 10000 },
    { id: 'p3', name: 'Corona Real', type: 'icon', val: 'fa-crown', color: 'text-yellow-400', prize: 50000 }
  ];

  if (cardConfigDB && Object.keys(cardConfigDB).length > 0) {
    document.getElementById('card-display-title').innerText = cardConfigDB.title || 'CASINO ROYAL';
    document.getElementById('card-display-subtitle').innerText = cardConfigDB.subtitle || 'JACKPOT MILLONARIO';
    document.getElementById('card-display-max').innerText = cardConfigDB.maxPrizeText || 'PREMIO MÁXIMO 5.000.000 GS';
    document.getElementById('card-price-badge').innerText = (cardConfigDB.price || 5000).toLocaleString('es-PY');
  }

  // PROBABILIDAD GLOBAL CONTROLADA DESDE EL PANEL DE ADMINISTRACIÓN
  const configuredRate = cardConfigDB && cardConfigDB.winRate !== undefined ? Number(cardConfigDB.winRate) : 15;
  const winRate = configuredRate / 100;

  gridData = [];
  const isWinner = Math.random() < winRate;
  
  if (isWinner) {
    winningItem = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    for (let i = 0; i < 3; i++) gridData.push({ ...winningItem });
    const count = {};
    count[winningItem.id || winningItem.name] = 3;
    
    for (let i = 0; i < 6; i++) {
      let item;
      do {
        item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
      } while ((count[item.id || item.name] || 0) >= 2 || (winningItem && (item.id === winningItem.id || item.name === winningItem.name)));
      count[item.id || item.name] = (count[item.id || item.name] || 0) + 1;
      gridData.push({ ...item });
    }
  } else {
    // SI PIERDE, EL ALGORITMO IMPIDE RIGUROSAMENTE QUE APAREZCAN 3 SÍMBOLOS IGUALES
    winningItem = null;
    const count = {};
    for (let i = 0; i < 9; i++) {
      let item;
      do {
        item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
      } while ((count[item.id || item.name] || 0) >= 2);
      count[item.id || item.name] = (count[item.id || item.name] || 0) + 1;
      gridData.push({ ...item });
    }
  }
  
  gridData.sort(() => Math.random() - 0.5);
  
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  gridData.forEach((item, i) => {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.id = `cell-${i}`;

    let renderHtml = '';
    if (item.type === 'image') {
      renderHtml = `<img src="${item.val}" class="w-10 h-10 object-contain mb-1">`;
    } else if (item.type === 'emoji') {
      renderHtml = `<span class="text-3xl mb-1">${item.val}</span>`;
    } else {
      renderHtml = `<i class="fa-solid ${item.val || item.icon || 'fa-gem'} ${item.color || 'text-amber-400'} text-3xl mb-1"></i>`;
    }

    cell.innerHTML = `
      ${renderHtml}
      <span class="text-[11px] font-black text-amber-200">${item.prize.toLocaleString('es-PY')} GS</span>
    `;
    grid.appendChild(cell);
  });
}

function getPos(e) {
  const r = scratchCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - r.left, y: clientY - r.top };
}

function erase(x, y) {
  if (isScratchedCompleted) return;
  
  scratchCtx.save();
  scratchCtx.globalCompositeOperation = 'destination-out';
  scratchCtx.lineCap = 'round';
  scratchCtx.lineJoin = 'round';
  scratchCtx.lineWidth = 50;
  
  if (lastPos) {
    scratchCtx.beginPath();
    scratchCtx.moveTo(lastPos.x, lastPos.y);
    scratchCtx.lineTo(x, y);
    scratchCtx.stroke();
  }
  
  scratchCtx.beginPath();
  scratchCtx.arc(x, y, 25, 0, Math.PI * 2);
  scratchCtx.fill();
  scratchCtx.restore();
  
  lastPos = { x, y };
  throttledCheck();
}

function throttledCheck() {
  if (checkThrottler) return;
  checkThrottler = setTimeout(() => {
    checkThrottler = null;
    checkPercent();
  }, 50);
}

function checkPercent() {
  const w = scratchCanvas.width;
  const h = scratchCanvas.height;
  try {
    const data = scratchCtx.getImageData(0, 0, w, h).data;
    let transparentPixels = 0, totalPixels = 0;
    
    for (let i = 3; i < data.length; i += 32) {
      totalPixels++;
      if (data[i] < 20) transparentPixels++;
    }
    
    const percent = Math.min(100, Math.round((transparentPixels / totalPixels) * 100));
    document.getElementById('scratch-progress').style.width = percent + '%';
    document.getElementById('progress-text').innerText = percent + '%';
    
    if (percent >= 90 && !isScratchedCompleted) {
      isScratchedCompleted = true;
      scratchCanvas.style.transition = 'opacity 0.3s ease-out';
      scratchCanvas.style.opacity = '0';
      setTimeout(() => scratchCanvas.style.display = 'none', 300);
      evaluate();
    }
  } catch (e) {}
}

function evaluate() {
  let winAmount = 0;
  let isWin = false;

  const overlay = document.getElementById('game-stamp-overlay');
  const stampLose = document.getElementById('stamp-lose');
  const stampWin = document.getElementById('stamp-win');
  const stampWinAmount = document.getElementById('stamp-win-amount');

  overlay.classList.remove('hidden');

  if (winningItem) {
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

  usersDB[currentUser].tickets = Math.max(0, (usersDB[currentUser].tickets || 0) - 1);
  if (!usersDB[currentUser].history) usersDB[currentUser].history = [];
  
  usersDB[currentUser].history.unshift({
    code: currentCode,
    serie: currentSerie,
    win: isWin,
    prize: winAmount,
    date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  isScratchedCompleted = false;
  isDrawing = false;
  lastPos = null;
  
  document.getElementById('game-stamp-overlay').classList.add('hidden');
  document.getElementById('stamp-lose').classList.add('hidden');
  document.getElementById('stamp-win').classList.add('hidden');

  scratchCanvas.style.display = 'block';
  scratchCanvas.style.opacity = '1';
  document.getElementById('scratch-progress').style.width = '0%';
  document.getElementById('progress-text').innerText = '0%';
  
  currentCode = Math.floor(1000 + Math.random() * 9000).toString();
  currentSerie = 'A' + Math.floor(1000 + Math.random() * 9000);
  
  document.getElementById('fichas-code').innerText = currentCode;
  document.getElementById('card-big-number').innerText = currentCode;
  document.getElementById('serie-code-top').innerText = 'SERIE ' + currentSerie;
  document.getElementById('card-big-serie').innerText = 'SERIE ' + currentSerie;
  
  generateCardData();
  initCanvas();
}

window.nextCard = async function() {
  await initDB();
  if (!usersDB[currentUser].tickets || usersDB[currentUser].tickets <= 0) {
    showToast('No tienes más fichas. Volviendo al inicio...', 'error');
    setTimeout(goToDashboard, 1500);
    return;
  }
  fichasCount++;
  document.getElementById('fichas-num').innerText = fichasCount;
  resetGame();
};

function setupEvents() {
  scratchCanvas.addEventListener('mousedown', e => {
    e.preventDefault();
    isDrawing = true;
    lastPos = null;
    const p = getPos(e);
    erase(p.x, p.y);
  });
  
  scratchCanvas.addEventListener('mousemove', e => {
    if (isDrawing) {
      e.preventDefault();
      const p = getPos(e);
      erase(p.x, p.y);
    }
  });
  
  window.addEventListener('mouseup', () => {
    isDrawing = false;
    lastPos = null;
  });
  
  scratchCanvas.addEventListener('touchstart', e => {
    isDrawing = true;
    lastPos = null;
    const p = getPos(e);
    erase(p.x, p.y);
  }, { passive: false });
  
  scratchCanvas.addEventListener('touchmove', e => {
    if (isDrawing) {
      e.preventDefault();
      const p = getPos(e);
      erase(p.x, p.y);
    }
  }, { passive: false });
  
  scratchCanvas.addEventListener('touchend', () => {
    isDrawing = false;
    lastPos = null;
  });
}

window.addEventListener('beforeunload', () => {
  if (currentUser && usersDB[currentUser]) {
    saveToCloud();
  }
});

window.onload = () => {
  checkSession();
  setupEvents();
};

window.onresize = () => {
  if (!isScratchedCompleted && !document.getElementById('view-game').classList.contains('hidden')) {
    initCanvas();
  }
};
