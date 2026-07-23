// Loader di configurazione: importa il YAML (parsato da Vite in fase di build),
// lo fonde con i default e congela il risultato. In questo modo se una chiave
// manca o è malformata nel file YAML il gioco continua a funzionare.
import userConfig from "./game.config.yaml";

// Valori di fallback = "fonte di verità" della forma della config.
const defaults = {
  game: {
    title: "Runner",
    subtitle: "",
  },
  economy: {
    currencySymbol: "€",
    coinValue: 0.5,
    maxPayout: 0,
  },
  gameplay: {
    lanes: [-2.2, 0, 2.2],
    startSpeed: 14,
    maxSpeed: 30,
    acceleration: 0.35,
    laneChangeSpeed: 12,
    jumpSpeed: 9,
    gravity: -22,
    spawnAhead: 70,
    rowGap: 9,
    coinRowLength: 3,
    coinSpawnChance: 0.8,
  },
};

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Merge profondo: gli oggetti si fondono ricorsivamente, gli altri valori
// (numeri, stringhe, array) del file utente sovrascrivono il default.
function deepMerge(base, override) {
  if (!isObject(override)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override)) {
    const b = base[key];
    const o = override[key];
    out[key] = isObject(b) && isObject(o) ? deepMerge(b, o) : o;
  }
  return out;
}

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") deepFreeze(value);
  }
  return Object.freeze(obj);
}

export const CONFIG = deepFreeze(deepMerge(defaults, userConfig || {}));

// Formatta un importo secondo la valuta configurata.
export function formatMoney(amount) {
  return `${CONFIG.economy.currencySymbol} ${amount.toFixed(2)}`;
}

// Calcola la vincita a partire dalle monete, applicando l'eventuale tetto.
export function computePayout(coins) {
  const raw = coins * CONFIG.economy.coinValue;
  const cap = CONFIG.economy.maxPayout;
  return cap > 0 ? Math.min(raw, cap) : raw;
}
