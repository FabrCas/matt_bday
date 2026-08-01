// Gestione degli overlay UI HTML/CSS (menu, HUD, game over, loading).
// Tiene la logica del DOM fuori dalle scene 3D.
import { CONFIG, formatMoney } from "../config/index.js";

const screens = {
  loading: document.getElementById("loading"),
  menu: document.getElementById("menu"),
  hud: document.getElementById("hud"),
  gameover: document.getElementById("gameover"),
  wishes: document.getElementById("wishes"),
};

const els = {
  hudCoins: document.getElementById("hud-coins"),
  hudDistance: document.getElementById("hud-distance"),
  hudLives: document.getElementById("hud-lives"),
  wonAmount: document.getElementById("won-amount"),
  endMessage: document.getElementById("endgame-message"),
  goCoins: document.getElementById("go-coins"),
  goDistance: document.getElementById("go-distance"),
  menuTitle: document.getElementById("menu-title"),
  menuSubtitle: document.getElementById("menu-subtitle"),
  btnRetry: document.getElementById("btn-retry"),
  wishesMessage: document.getElementById("wishes-message"),
  hitFlash: document.getElementById("hit-flash"),
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

export function updateHud({ coins, distance, lives, maxLives }) {
  els.hudCoins.textContent = coins + " €";
  els.hudDistance.textContent = Math.floor(distance);
  if (lives !== undefined && maxLives !== undefined) {
    els.hudLives.textContent = "❤️".repeat(lives) + "🖤".repeat(maxLives - lives);
  }
}

export function updateGameOver({ coins, distance, amount, message}) {
  els.goCoins.textContent = coins;
  els.goDistance.textContent = Math.floor(distance);
  els.wonAmount.textContent = formatMoney(amount);
  els.endMessage.textContent = message;
  els.btnRetry.classList.toggle("hidden", !CONFIG.debug && !CONFIG.game.allowReplay);
}
export function updateWishes() {
  els.wishesMessage.textContent = CONFIG.game.wishesMessage;
}

// Flash rosso a schermo intero al momento di un colpo (vedi hitObstacle() in
// game.js). Rimuove/riaggiunge la classe forzando un reflow (`offsetWidth`)
// così un colpo che arriva mentre il flash precedente sta ancora sfumando
// riparte da capo invece di restare "agganciato" alla transizione in corso.
export function flashHit() {
  els.hitFlash.classList.remove("active");
  void els.hitFlash.offsetWidth;
  els.hitFlash.classList.add("active");
  setTimeout(() => els.hitFlash.classList.remove("active"), 80);
}

// Collega i pulsanti una sola volta; ritorna gli handler da riassegnare.
export function bindButtons({ onPlay, onRetry, onContinue, onMenu }) {
  document.getElementById("btn-play").addEventListener("click", onPlay);
  document.getElementById("btn-retry").addEventListener("click", onRetry);
  document.getElementById("btn-continue").addEventListener("click", onContinue);
  document.getElementById("btn-wishes-menu").addEventListener("click", onMenu);
}
