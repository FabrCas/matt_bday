// Rilevamento dispositivo e calibrazione basata sulle dimensioni schermo.
// Breakpoint principale: smartphone (< 768px) vs desktop (>= 768px).

export const MOBILE_BREAKPOINT = 768;

export function isMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// Parametri di camera/gameplay adattati al dispositivo.
// Su mobile la camera è leggermente più vicina e con FOV più ampio
// per mantenere leggibilità su schermi piccoli.
export function getCameraProfile() {
  if (isMobile()) {
    return { fov: 0.95, distance: 9, height: 5.5 };
  }
  return { fov: 0.8, distance: 11, height: 6 };
}

// Registra un callback su resize (con engine.resize già gestito in main).
export function onResize(callback) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
