// Gestione degli overlay UI HTML/CSS (menu, HUD, game over, loading).
// Tiene la logica del DOM fuori dalle scene 3D.
import { CONFIG, formatMoney } from "../config/index.js";

const screens = {
  loading: document.getElementById("loading"),
  menu: document.getElementById("menu"),
  hud: document.getElementById("hud"),
  gameover: document.getElementById("gameover"),
};

const els = {
  hudCoins: document.getElementById("hud-coins"),
  hudDistance: document.getElementById("hud-distance"),
  wonAmount: document.getElementById("won-amount"),
  goCoins: document.getElementById("go-coins"),
  goDistance: document.getElementById("go-distance"),
  menuTitle: document.getElementById("menu-title"),
  menuSubtitle: document.getElementById("menu-subtitle"),
};

// Applica titolo/sottotitolo dalla config statica (una volta all'avvio).
export function applyBranding() {
  document.title = CONFIG.game.title;
  els.menuTitle.textContent = CONFIG.game.title;
  els.menuSubtitle.textContent = CONFIG.game.subtitle;
}

// Mostra solo gli overlay indicati, nasconde gli altri.
export function show(...names) {
  for (const [name, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", !names.includes(name));
  }
}

export function updateHud({ coins, distance }) {
  els.hudCoins.textContent = coins;
  els.hudDistance.textContent = Math.floor(distance);
}

export function updateGameOver({ coins, distance, amount }) {
  els.goCoins.textContent = coins;
  els.goDistance.textContent = Math.floor(distance);
  els.wonAmount.textContent = formatMoney(amount);
}

// Collega i pulsanti una sola volta; ritorna gli handler da riassegnare.
export function bindButtons({ onPlay, onRetry, onMenu }) {
  document.getElementById("btn-play").addEventListener("click", onPlay);
  document.getElementById("btn-retry").addEventListener("click", onRetry);
  document.getElementById("btn-menu").addEventListener("click", onMenu);
}
