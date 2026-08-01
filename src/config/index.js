// Loader di configurazione: importa il YAML (parsato da Vite in fase di build),
// lo fonde con i default e congela il risultato. In questo modo se una chiave
// manca o è malformata nel file YAML il gioco continua a funzionare.
import userConfig from "./game.config.yaml";

// Valori di fallback = "fonte di verità" della forma della config.
const defaults = {
  debug: false,
  game: {
    title: "Runner",
    subtitle: "",
    allowReplay: true,
    wishesMessage: "",
    lives: 3, // ogni ostacolo colpito ne toglie una; a 0 si va a game over
  },
  economy: {
    currencySymbol: "€",
    coinValue: 0.5,
    maxPayout: 0,
  },
  wishes: {
    galleryPlaneCount: 6, // numero di piani che orbitano intorno al testo
  },
  billboards: {
    count: 8,   // numero di coppie sx/dx lungo il corridoio
    images: [], // pool di immagini pescate a caso senza ripetizioni (vedi game.js)
  },
  gameplay: {
    lanes: [-2.2, 0, 2.2],
    startSpeed: 14,
    maxSpeed: 30,
    acceleration: 0.35,
    laneChangeSpeed: 12,
    jumpSpeed: 9,
    gravity: -22,
    fastFallSpeed: 26, // velocità di discesa forzata col comando "giù" durante il salto
    spawnAhead: 70,
    rowGap: 9,
    coinRowLength: 3,
    coinSpawnChance: 0.8,
    redCoinChance: 0.03,   // probabilità (0..1) che una fila generi una moneta rossa bonus
    redCoinValueMultiplier: 10, // valore della moneta rossa = coinValue * questo fattore
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
  /*
    ritorna array[int, bool] con primo elemento  valore di monete guadagnato come 
    minimo tra vincita effettiva e massimo dispobile e secondo elemento un assegnazione 
    booleana che indica se il player ha guadagnato piu' del massimo 
  */
  const raw = coins * CONFIG.economy.coinValue;
  const cap = CONFIG.economy.maxPayout;
  return [cap > 0 ? Math.min(raw, cap) : raw, raw > cap ? true : false]
}
