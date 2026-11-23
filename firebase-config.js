import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBWpmrXx2lVToxDykBWmJrA1H0Sw4TN8O4",
  authDomain: "raspadita-delasuerte.firebaseapp.com",
  projectId: "raspadita-delasuerte",
  storageBucket: "raspadita-delasuerte.firebasestorage.app",
  messagingSenderId: "144755637640",
  appId: "1:144755637640:web:9cdd16bbcbb23214140e3d"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const DEFAULT_GAMES_CATALOG = {
  raspada: {
    key: 'raspada',
    title: 'RASPADITA REAL VIP',
    shortName: 'Raspadita Real',
    bet: 2500,
    prizes: []
  },
  '777': {
    key: '777',
    title: 'FORTUNA 777 GOLD',
    shortName: 'Fortuna 777',
    bet: 2500,
    prizes: []
  },
  esmeralda: {
    key: 'esmeralda',
    title: 'ESMERALDA VIP CLUB',
    shortName: 'Esmeralda VIP',
    bet: 2500,
    prizes: []
  },
  diamante: {
    key: 'diamante',
    title: 'DIAMANTE GOLD ROYALE',
    shortName: 'Diamante Gold',
    bet: 2500,
    prizes: []
  }
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSafeMediaUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) return true;
  if (/^(https?:\/\/)/i.test(trimmed)) return true;
  if (/^(\.\/|\.\.\/|[a-zA-Z0-9_-]+\/)[a-zA-Z0-9_./-]+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(trimmed)) return true;
  return false;
}

export function formatGs(amount) {
  return `${(Number(amount) || 0).toLocaleString('es-PY')} GS`;
}
