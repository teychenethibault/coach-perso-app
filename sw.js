// Service worker : garde l'appli disponible hors connexion.
// Les donnees personnelles ne sont jamais mises en cache ici : elles viennent
// de l'API GitHub a chaque ouverture.
const VERSION = "coach-v13";
const COQUILLE = ["./", "index.html", "styles.css", "app.js", "diagnostic.js", "plan.js", "objectif.js", "coach.js", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"];

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
  if (e.request.method !== "GET") return;
  // reseau d'abord, en ignorant le cache du navigateur (GitHub Pages le garde 10 min) :
  // une nouvelle version de l'appli s'affiche des la prochaine ouverture.
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache" })
      .then((r) => {
        const copie = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copie));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
