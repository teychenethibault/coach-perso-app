"use strict";

/* Coach Perso — appli statique.
 * Les donnees viennent du depot prive Coach-Perso, lues avec un jeton GitHub
 * personnel stocke uniquement sur cet appareil. Aucune donnee n'est dans ce depot-ci.
 */

const DEPOT = "teychenethibault/Coach-Perso";
const FICHIER_JOUR = "data/app/aujourdhui.json";
const WORKFLOW_SYNCHRO = "sync-garmin.yml";
const CLE_JETON = "coach-perso-jeton";

const INDICATEURS = [
  { cle: "vfc", couleur: "var(--vfc)", format: (v) => Math.round(v), unite: "ms" },
  { cle: "fc_repos", couleur: "var(--fc)", format: (v) => Math.round(v), unite: "bpm" },
  { cle: "sommeil", couleur: "var(--sommeil)", format: heuresMinutes, unite: "" },
  { cle: "body_battery", couleur: "var(--bb)", format: (v) => Math.round(v), unite: "" },
];

const ecran = document.getElementById("ecran");
let donnees = null;

/* ------------------------------------------------------------------ stockage */

function lireJeton() {
  try { return localStorage.getItem(CLE_JETON) || ""; } catch { return ""; }
}
function ecrireJeton(j) {
  try { j ? localStorage.setItem(CLE_JETON, j) : localStorage.removeItem(CLE_JETON); } catch { /* stockage indisponible */ }
}

/* ------------------------------------------------------------------ outils */

function el(balise, attrs = {}, ...enfants) {
  const n = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) n.append(e.nodeType ? e : String(e));
  return n;
}

function svg(html, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.innerHTML = html; // contenu genere ici a partir de nombres uniquement
  return n;
}

function heuresMinutes(h) {
  const t = Math.round(h * 60);
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, "0")}`;
}

function chrono(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function allure(vitesseMs) {
  if (!vitesseMs) return "–";
  const s = 1000 / vitesseMs;
  return `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function ilYa(iso) {
  if (!iso) return "jamais";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const fmtCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function toast(message) {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toast.minuteur);
  toast.minuteur = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ------------------------------------------------------------------ GitHub */

async function github(chemin, options = {}) {
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${lireJeton()}`,
      Accept: options.accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (r.status === 401) throw new Error("jeton");
  if (r.status === 403 || r.status === 404) throw new Error("acces");
  if (!r.ok) throw new Error(`http-${r.status}`);
  return r;
}

async function chargerDonnees() {
  const r = await github(`contents/${FICHIER_JOUR}?t=${Date.now()}`, { accept: "application/vnd.github.raw+json", cache: "no-store" });
  return r.json();
}

async function lancerSynchro(bouton) {
  bouton.classList.add("en-cours");
  bouton.querySelector("span").textContent = "Synchro…";
  try {
    const depart = new Date().toISOString();
    await github(`actions/workflows/${WORKFLOW_SYNCHRO}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
    toast("Synchro lancée. Elle prend une à deux minutes.");
    for (let i = 0; i < 40; i++) {
      await new Promise((ok) => setTimeout(ok, 8000));
      const runs = await (await github(`actions/workflows/${WORKFLOW_SYNCHRO}/runs?per_page=1&created=>=${depart.slice(0, 19)}`)).json();
      const run = runs.workflow_runs && runs.workflow_runs[0];
      if (run && run.status === "completed") {
        if (run.conclusion !== "success") throw new Error("synchro-echec");
        donnees = await chargerDonnees();
        afficher("aujourdhui");
        toast("Données à jour.");
        return;
      }
    }
    throw new Error("synchro-longue");
  } catch (e) {
    const messages = {
      jeton: "Le jeton GitHub n'est plus valide. Remplace-le dans les réglages.",
      acces: "Le jeton n'a pas le droit de lancer la synchro (permission Actions en écriture).",
      "synchro-echec": "La synchro a échoué. Détail dans l'onglet Actions du dépôt Coach-Perso.",
      "synchro-longue": "La synchro est toujours en cours. Rouvre l'appli dans quelques minutes.",
    };
    toast(messages[e.message] || "Synchro impossible : connexion indisponible.");
    bouton.classList.remove("en-cours");
    bouton.querySelector("span").textContent = ilYa(donnees && donnees.derniere_synchro);
  }
}

/* ------------------------------------------------------------------ graphiques */

/** Score de 0 a 1 pour remplir l'anneau d'un indicateur. */
function score(ind) {
  if (ind.valeur == null) return 0;
  const base = { vert: 0.88, orange: 0.58, rouge: 0.3, inconnu: 0.1 }[ind.statut] ?? 0.1;
  let nuance = 0;
  if (ind.normale) nuance = Math.max(-0.1, Math.min(0.12, (ind.sens * (ind.valeur - ind.normale)) / ind.normale));
  return Math.max(0.05, Math.min(1, base + nuance));
}

function anneaux(rec) {
  const taille = 148, centre = taille / 2, epaisseur = 13, ecart = 3;
  let html = "";
  INDICATEURS.forEach((def, i) => {
    const r = centre - epaisseur / 2 - i * (epaisseur + ecart);
    const tour = 2 * Math.PI * r;
    const plein = score(rec[def.cle]);
    html += `<circle class="fond" cx="${centre}" cy="${centre}" r="${r}" stroke="${def.couleur}" stroke-width="${epaisseur}"/>`;
    html += `<circle class="arc" cx="${centre}" cy="${centre}" r="${r}" stroke="${def.couleur}" stroke-width="${epaisseur}"
      stroke-dasharray="${tour}" stroke-dashoffset="${tour}" data-cible="${tour * (1 - plein)}"
      transform="rotate(-90 ${centre} ${centre})"/>`;
  });
  const n = svg(html, { viewBox: `0 0 ${taille} ${taille}`, class: "anneaux", role: "img",
    "aria-label": "Récupération : VFC, FC au repos, sommeil et Body Battery" });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    n.querySelectorAll(".arc").forEach((a) => a.setAttribute("stroke-dashoffset", a.dataset.cible));
  }));
  return n;
}

function tendance(points, couleur, normale) {
  const vals = points.map((p) => p.valeur);
  const connus = vals.filter((v) => v != null);
  if (connus.length < 2) return svg("", { viewBox: "0 0 84 34", class: "tendance" });
  const min = Math.min(...connus, normale ?? Infinity), max = Math.max(...connus, normale ?? -Infinity);
  const y = (v) => 30 - ((v - min) / (max - min || 1)) * 26;
  const x = (i) => 2 + (i / (vals.length - 1)) * 80;
  let d = "", enCours = false;
  vals.forEach((v, i) => {
    if (v == null) { enCours = false; return; }
    d += `${enCours ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    enCours = true;
  });
  const dernier = vals.length - 1;
  const ligneNormale = normale != null
    ? `<line x1="2" x2="82" y1="${y(normale)}" y2="${y(normale)}" stroke="#3a3a42" stroke-dasharray="2 3"/>` : "";
  const point = vals[dernier] != null ? `<circle cx="${x(dernier)}" cy="${y(vals[dernier])}" r="3" fill="${couleur}"/>` : "";
  return svg(`${ligneNormale}<path d="${d}" fill="none" stroke="${couleur}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${point}`,
    { viewBox: "0 0 84 34", class: "tendance", "aria-hidden": "true" });
}

function graphiqueCharge(points) {
  const L = 340, H = 140, g = 26, bas = 18;
  const vals = points.flatMap((p) => [p.aigue, p.chronique]);
  const max = Math.max(...vals, 1) * 1.1;
  const x = (i) => g + (i / (points.length - 1)) * (L - g);
  const y = (v) => H - bas - (v / max) * (H - bas - 6);
  const ligne = (cle) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[cle]).toFixed(1)}`).join("");
  const graduations = [0, Math.round(max / 2), Math.round(max)]
    .map((v) => `<line x1="${g}" x2="${L}" y1="${y(v)}" y2="${y(v)}" stroke="#26262c"/><text x="0" y="${y(v) + 4}">${v}</text>`).join("");
  const mois = [];
  points.forEach((p, i) => {
    if (p.date.slice(8) === "01") mois.push(`<text x="${x(i) - 8}" y="${H - 2}">${new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(p.date))}</text>`);
  });
  const aire = `${ligne("chronique")}L${x(points.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`;
  return svg(`
    <defs><linearGradient id="degrade-forme" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2ee6a6" stop-opacity="0.35"/><stop offset="1" stop-color="#2ee6a6" stop-opacity="0"/>
    </linearGradient></defs>
    ${graduations}${mois.join("")}
    <path d="${aire}" fill="url(#degrade-forme)"/>
    <path d="${ligne("chronique")}" fill="none" stroke="#2ee6a6" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="${ligne("aigue")}" fill="none" stroke="#ff9f1c" stroke-width="1.6" stroke-linejoin="round" opacity="0.9"/>`,
  { viewBox: `0 0 ${L} ${H}`, class: "graphique", role: "img", "aria-label": "Condition physique et fatigue sur 4 mois" });
}

function graphiqueSemaines(semaines) {
  const L = 340, H = 130, bas = 18, haut = 16;
  const max = Math.max(...semaines.map((s) => s.km), 1);
  const largeur = L / semaines.length;
  let html = "";
  semaines.forEach((s, i) => {
    const h = (s.km / max) * (H - bas - haut);
    const courante = i === semaines.length - 1;
    const x = i * largeur + largeur * 0.18;
    html += `<rect x="${x}" y="${H - bas - h}" width="${largeur * 0.64}" height="${Math.max(h, 2)}" rx="4"
      fill="${courante ? "#ff9f1c" : "#3a3a42"}"/>`;
    if (courante || s.km === max) html += `<text x="${x + largeur * 0.32}" y="${H - bas - h - 5}" text-anchor="middle" style="fill:${courante ? "#ff9f1c" : "#9a9aa3"}">${Math.round(s.km)}</text>`;
    if (i % 3 === 2 || courante) {
      const d = new Date(s.debut);
      html += `<text x="${x + largeur * 0.32}" y="${H - 2}" text-anchor="middle">${d.getDate()}/${d.getMonth() + 1}</text>`;
    }
  });
  return svg(html, { viewBox: `0 0 ${L} ${H}`, class: "graphique", role: "img", "aria-label": "Kilomètres courus par semaine" });
}

/* ------------------------------------------------------------------ vues */

function enTete() {
  const bouton = el("button", { class: "synchro", "aria-label": "Synchroniser maintenant", onclick: (e) => lancerSynchro(e.currentTarget) },
    svg(`<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>`, { viewBox: "0 0 24 24", "aria-hidden": "true" }),
    el("span", {}, ilYa(donnees.derniere_synchro)));
  return el("div", { class: "entete" },
    el("span", { class: "date-jour" }, majuscule(fmtJour.format(new Date()))),
    bouton);
}

function vueAujourdhui() {
  const d = donnees, rec = d.recuperation, sug = d.suggestion;
  const frag = [enTete(), el("h1", {}, "Aujourd'hui")];

  frag.push(el("section", { class: `recommandation ${sug.niveau}`, "aria-label": "Recommandation du jour" },
    el("p", { class: "recommandation-libelle" }, "Recommandation du jour"),
    el("p", { class: "suggestion-titre" }, sug.titre),
    sug.consigne ? el("p", { class: "consigne" }, sug.consigne) : null,
    sug.raisons.length ? el("ul", { class: "raisons" }, sug.raisons.map((r) => el("li", {}, r))) : null));

  frag.push(el("section", { class: "forme", "aria-label": "Récupération de la nuit" },
    anneaux(rec),
    el("ul", { class: "legende-anneaux" },
      INDICATEURS.map((def) => {
        const ind = rec[def.cle];
        return el("li", { class: ind.statut },
          el("i", { style: `background:${def.couleur}`, "aria-hidden": "true" }),
          el("span", {}, ind.nom),
          el("b", {}, { vert: "Bon", orange: "Moyen", rouge: "Bas", inconnu: "–" }[ind.statut]));
      }))));

  frag.push(el("section", { class: "indicateurs", "aria-label": "Récupération de la nuit" },
    INDICATEURS.map((def) => {
      const ind = rec[def.cle];
      const normale = ind.normale != null ? `Normale ${def.format(ind.normale)}${def.unite ? " " + def.unite : ""}` : "Normale en cours de calcul";
      const extra = def.cle === "sommeil" && ind.score != null ? `, score ${ind.score}` : "";
      return el("div", { class: `indicateur ${ind.statut}` },
        el("div", {},
          el("div", { class: "nom" }, el("span", { class: "pastille", "aria-hidden": "true" }), ind.nom),
          el("div", { class: "normale" }, normale + extra)),
        el("div", { class: "valeur" }, ind.valeur != null ? def.format(ind.valeur) : "–", def.unite ? el("small", {}, def.unite) : null),
        tendance(ind.quatorze_jours, def.couleur, ind.normale));
    })));

  const ch = d.charge;
  if (ch && ch.points && ch.points.length > 1) {
    const fraicheur = ch.forme ?? 0;
    const lecture = fraicheur > 10 ? "Fatigue basse par rapport à ta condition : tu as de la marge pour charger."
      : fraicheur < -25 ? "Fatigue accumulée importante : priorité à la récupération."
      : fraicheur < -10 ? "Fatigue d'entraînement normale en période de travail."
      : "Charge et récupération équilibrées.";
    frag.push(el("h2", {}, "Forme et fatigue"));
    frag.push(el("section", { class: "carte" },
      el("div", { class: "carte-tete" },
        el("div", {},
          el("div", { class: "grand-chiffre" }, `${fraicheur > 0 ? "+" : ""}${Math.round(fraicheur)}`),
          el("div", { class: "legende" }, "Fraîcheur (condition moins fatigue)")),
        el("div", { class: "legende" },
          el("span", {}, el("i", { style: "background:#2ee6a6" }), "Condition, 6 sem."),
          el("span", {}, el("i", { style: "background:#ff9f1c" }), "Fatigue, 7 j"))),
      graphiqueCharge(ch.points),
      el("p", { class: "note" }, lecture)));
  }

  if (d.semaines && d.semaines.length) {
    const cetteSemaine = d.semaines[d.semaines.length - 1];
    frag.push(el("h2", {}, "Volume"));
    frag.push(el("section", { class: "carte" },
      el("div", { class: "carte-tete" },
        el("div", {},
          el("div", { class: "grand-chiffre" }, `${cetteSemaine.km} km`),
          el("div", { class: "legende" }, `Cette semaine : ${cetteSemaine.courses} course${cetteSemaine.courses > 1 ? "s" : ""}, ${cetteSemaine.renfo} renfo`))),
      graphiqueSemaines(d.semaines)));
  }

  if (d.estimations) {
    const e = d.estimations;
    frag.push(el("h2", {}, "Chronos estimés"));
    frag.push(el("section", { class: "chronos" },
      Object.entries(e.chronos_s).map(([dist, s]) => el("div", { class: "chrono" },
        el("div", { class: "distance" }, dist),
        el("div", { class: "temps" }, chrono(s))))));
    frag.push(el("p", { class: "note" },
      `Calculés depuis ta meilleure portion de ${e.reference.distance_m / 1000} km (${chrono(e.reference.temps_s)}) des 90 derniers jours.`));
  }

  const a = d.derniere_activite;
  if (a) {
    frag.push(el("h2", {}, "Dernière sortie"));
    frag.push(el("section", { class: "carte" },
      el("p", { class: "sortie-nom" }, a.nom || "Activité"),
      el("p", { class: "sortie-date" }, majuscule(fmtCourt.format(new Date(a.date)))),
      el("div", { class: "stats" },
        stat("Distance", a.distance_m ? `${(a.distance_m / 1000).toFixed(2)} km` : "–"),
        stat("Durée", a.duree_s ? chrono(a.duree_s) : "–"),
        stat("Allure", `${allure(a.vitesse_ms)} /km`),
        stat("FC moy.", a.fc_moy ? `${Math.round(a.fc_moy)}` : "–"),
        stat("Charge", a.charge ? `${Math.round(a.charge)}` : "–"),
        stat("Effet", effet(a.effet))),
      el("p", { class: "debrief-attente" }, "Le débrief du coach apparaîtra ici dans une prochaine version.")));
  }

  frag.push(el("button", { class: "lien-discret", onclick: oublierJeton }, "Réglages : changer de jeton GitHub"));
  return frag;
}

function stat(libelle, chiffre) {
  return el("div", { class: "stat" }, el("div", { class: "libelle" }, libelle), el("div", { class: "chiffre" }, chiffre));
}

function effet(cle) {
  const noms = { RECOVERY: "Récup.", AEROBIC_BASE: "Endurance", TEMPO: "Tempo", LACTATE_THRESHOLD: "Seuil", VO2MAX: "VO2max", ANAEROBIC_CAPACITY: "Anaérobie", SPEED: "Vitesse" };
  return noms[cle] || "–";
}

function vueEnConstruction(titre, texte) {
  return [el("div", { class: "entete" }), el("h1", {}, titre), el("p", { class: "note" }, texte)];
}

function vueConfiguration(erreur) {
  return [el("section", { class: "panneau" },
    el("h1", {}, "Coach Perso"),
    el("p", {}, "L'appli lit tes données dans ton dépôt privé Coach-Perso. Il lui faut un jeton d'accès GitHub, enregistré uniquement sur cet appareil."),
    el("ol", {},
      el("li", {}, "Sur github.com : ta photo, puis ", el("strong", {}, "Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token"), "."),
      el("li", {}, "Repository access : ", el("strong", {}, "Only select repositories → Coach-Perso"), "."),
      el("li", {}, "Permissions : ", el("strong", {}, "Contents : Read-only"), " et ", el("strong", {}, "Actions : Read and write"), "."),
      el("li", {}, "Génère le jeton, copie-le et colle-le ci-dessous.")),
    erreur ? el("p", { class: "erreur" }, erreur) : null,
    el("form", { onsubmit: async (e) => {
      e.preventDefault();
      const valeur = e.currentTarget.jeton.value.trim();
      if (!valeur) return;
      ecrireJeton(valeur);
      demarrer();
    } },
      el("input", { class: "champ", name: "jeton", type: "password", autocomplete: "off", placeholder: "github_pat_…", "aria-label": "Jeton GitHub" }),
      el("button", { class: "bouton", type: "submit" }, "Enregistrer le jeton")))];
}

function oublierJeton() {
  ecrireJeton("");
  donnees = null;
  afficher("configuration");
}

/* ------------------------------------------------------------------ navigation */

const VUES = {
  aujourdhui: () => vueAujourdhui(),
  diagnostic: () => vueEnConstruction("Diagnostic", "Les analyses détaillées de récupération, de charge et de qualité de course arrivent dans la prochaine version."),
  plan: () => vueEnConstruction("Plan", "Le plan d'entraînement, recalculé à chaque synchro, arrive après le coach."),
  objectif: () => vueEnConstruction("Objectif", "Crée un objectif de course, ou laisse le coach te faire progresser sans plafond. Bientôt disponible."),
};

function afficher(vue, erreur) {
  ecran.replaceChildren(...(vue === "configuration" ? vueConfiguration(erreur) : VUES[vue]()));
  const configuration = vue === "configuration";
  document.querySelector(".onglets").hidden = configuration;
  document.getElementById("bulle-coach").hidden = configuration;
  document.querySelectorAll(".onglet").forEach((o) => {
    const actif = o.dataset.vue === vue;
    o.classList.toggle("actif", actif);
    actif ? o.setAttribute("aria-current", "page") : o.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

document.querySelectorAll(".onglet").forEach((o) => o.addEventListener("click", () => donnees && afficher(o.dataset.vue)));
document.getElementById("bulle-coach").addEventListener("click", () => toast("Le coach arrive dans une prochaine version."));

async function demarrer() {
  if (!lireJeton()) return afficher("configuration");
  ecran.replaceChildren(el("p", { class: "note panneau" }, "Chargement de tes données…"));
  try {
    donnees = await chargerDonnees();
    afficher("aujourdhui");
  } catch (e) {
    if (e.message === "jeton") { ecrireJeton(""); return afficher("configuration", "Ce jeton n'est pas valide. Vérifie-le et recommence."); }
    if (e.message === "acces") { ecrireJeton(""); return afficher("configuration", "Ce jeton n'a pas accès au dépôt Coach-Perso, ou le diagnostic n'a pas encore été généré."); }
    ecran.replaceChildren(el("section", { class: "panneau" },
      el("h1", {}, "Connexion impossible"),
      el("p", {}, "Tes données n'ont pas pu être chargées. Vérifie ta connexion internet."),
      el("button", { class: "bouton discret", onclick: demarrer }, "Réessayer")));
  }
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
demarrer();
