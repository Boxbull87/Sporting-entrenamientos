// Service worker mínimo.
// Su único propósito es cumplir el requisito técnico de Chrome/Android
// para poder "Instalar app" con el icono correcto (en vez de crear un
// simple acceso directo a partir del favicon, que es lo que hace que
// el icono salga metido en un círculo blanco enorme en según qué
// launchers, como el de Xiaomi/MIUI).
// No cachea nada: simplemente deja pasar todas las peticiones.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
