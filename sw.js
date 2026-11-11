// Service worker : garde l'appli disponible hors connexion.
// Les donnees personnelles ne sont jamais mises en cache ici : elles viennent
// de l'API GitHub a chaque ouverture.
const VERSION = "coach-v3";
const COQUILLE = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API GitHub : jamais en cache
  // reseau d'abord, cache en secours : les mises a jour de l'appli arrivent tout de suite
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copie = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copie));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
