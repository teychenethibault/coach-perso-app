"use strict";

/* Coach Perso — appli statique.
 * Les donnees viennent du depot prive Coach-Perso, lues avec un jeton GitHub
 * personnel stocke uniquement sur cet appareil. Aucune donnee n'est dans ce depot-ci.
 */

const DEPOT = "teychenethibault/Coach-Perso";
const FICHIER_JOUR = "data/app/aujourdhui.json";
const WORKFLOW_SYNCHRO = "sync-garmin.yml";
const CLE_JETON = "coach-perso-jeton";


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

/* ------------------------------------------------------------------ tendances */

const TENDANCE_COULEUR = { hausse: "#30d158", stable: "#0a84ff", baisse: "#ff453a" };
const TENDANCE_TEXTE = { 3: "Forte amélioration", 2: "Amélioration", 1: "Légère amélioration", 0: "Stable",
  "-1": "Léger recul", "-2": "Recul", "-3": "Fort recul" };

/** Fleches : 1 a 3 chevrons verts vers le haut, une fleche bleue horizontale, 1 a 3 chevrons rouges vers le bas. */
function fleches(niveau) {
  if (niveau == null) return svg(`<text x="22" y="26" text-anchor="middle" style="fill:#636369;font-size:18px">–</text>`, { viewBox: "0 0 44 36", class: "fleches", "aria-hidden": "true" });
  if (niveau === 0) {
    return svg(`<path d="M8 18H34M26 10l8 8-8 8" fill="none" stroke="${TENDANCE_COULEUR.stable}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
      { viewBox: "0 0 44 36", class: "fleches", "aria-hidden": "true" });
  }
  const n = Math.abs(niveau), haut = niveau > 0, couleur = haut ? TENDANCE_COULEUR.hausse : TENDANCE_COULEUR.baisse;
  const pas = 9, total = (n - 1) * pas, y0 = 18 - total / 2;
  let html = "";
  for (let i = 0; i < n; i++) {
    const y = y0 + i * pas;
    html += haut
      ? `<path d="M11 ${y + 5}l11-9 11 9" fill="none" stroke="${couleur}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M11 ${y - 5}l11 9 11-9" fill="none" stroke="${couleur}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return svg(html, { viewBox: "0 0 44 36", class: "fleches", "aria-hidden": "true" });
}

function caseTendance(t) {
  const sens = t.niveau == null ? "" : t.niveau > 0 ? "hausse" : t.niveau < 0 ? "baisse" : "stable";
  let ecart = "";
  if (t.ecart != null) {
    const v = t.unite === "h" ? `${Math.round(Math.abs(t.ecart) * 60)} min` : `${Math.round(Math.abs(t.ecart))}${t.unite ? " " + t.unite : ""}`;
    ecart = Math.round(Math.abs(t.ecart) * (t.unite === "h" ? 60 : 1)) === 0 ? "=" : `${t.ecart > 0 ? "+" : "−"}${v}`;
  }
  return el("div", { class: `case-tendance ${sens}`, role: "img",
    "aria-label": `${t.nom} : ${t.niveau == null ? "pas assez de données" : TENDANCE_TEXTE[t.niveau]}` },
    el("div", { class: "case-nom" }, t.nom),
    fleches(t.niveau),
    el("div", { class: "case-ecart" }, ecart));
}

/* ------------------------------------------------------------------ progression */

function courbe(points, cle, couleur, inverse, formatAxe) {
  const L = 340, H = 120, g = 44, bas = 18, haut = 8;
  const valides = points.map((p, i) => ({ i, v: p[cle], date: p.date })).filter((p) => p.v != null);
  if (valides.length < 2) return null;
  const vals = valides.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  const marge = (max - min) * 0.15 || 1;
  min -= marge; max += marge;
  const x = (i) => g + (i / (points.length - 1)) * (L - g - 6);
  const y = (v) => {
    const r = (v - min) / (max - min);
    return haut + (inverse ? r : 1 - r) * (H - bas - haut);
  };
  let html = "";
  [inverse ? max - marge : min + marge, inverse ? min + marge : max - marge].forEach((v) => {
    html += `<line x1="${g}" x2="${L}" y1="${y(v)}" y2="${y(v)}" stroke="#26262c"/><text x="0" y="${y(v) + 4}">${formatAxe(v)}</text>`;
  });
  points.forEach((p, i) => {
    const d = new Date(p.date);
    if (i % 4 === 1) html += `<text x="${x(i)}" y="${H - 2}" text-anchor="middle">${d.getDate()}/${d.getMonth() + 1}</text>`;
  });
  const chemin = valides.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const aire = `${chemin}L${x(valides[valides.length - 1].i)} ${H - bas}L${x(valides[0].i)} ${H - bas}Z`;
  const id = `degrade-${cle}`;
  html = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${couleur}" stop-opacity="0.3"/><stop offset="1" stop-color="${couleur}" stop-opacity="0"/></linearGradient></defs>`
    + html + `<path d="${aire}" fill="url(#${id})"/>`
    + `<path d="${chemin}" fill="none" stroke="${couleur}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  const dernier = valides[valides.length - 1];
  html += `<circle cx="${x(dernier.i)}" cy="${y(dernier.v)}" r="4.5" fill="${couleur}" stroke="#000" stroke-width="2"/>`;
  return svg(html, { viewBox: `0 0 ${L} ${H}`, class: "graphique", "aria-hidden": "true" });
}

function evolution(points, cle, semaines) {
  const valides = points.filter((p) => p[cle] != null);
  if (valides.length < 2) return null;
  const actuel = valides[valides.length - 1][cle];
  const ancien = points.slice(-semaines - 1).find((p) => p[cle] != null);
  return ancien ? { actuel, delta: actuel - ancien[cle] } : null;
}

function blocProgression(points) {
  const cond = evolution(points, "condition", 12);
  const chr = evolution(points, "chrono_10km_s", 12);
  const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  const elements = [];
  if (cond) {
    const bien = cond.delta >= 0;
    elements.push(el("div", { class: "progression-tete" },
      el("div", {},
        el("div", { class: "legende" }, "Condition physique"),
        el("div", { class: "grand-chiffre" }, Math.round(cond.actuel))),
      el("div", { class: `progression-delta ${bien ? "bien" : "mal"}` },
        `${signe(cond.delta)}${Math.abs(Math.round(cond.delta))} en 3 mois`)));
    elements.push(courbe(points, "condition", "#2ee6a6", false, (v) => Math.round(v)));
  }
  if (chr) {
    const bien = chr.delta <= 0; // un chrono qui baisse est un progres
    elements.push(el("div", { class: "progression-tete separe" },
      el("div", {},
        el("div", { class: "legende" }, "10 km estimé"),
        el("div", { class: "grand-chiffre" }, chrono(chr.actuel))),
      el("div", { class: `progression-delta ${bien ? "bien" : "mal"}` },
        `${bien ? "−" : "+"}${chrono(Math.abs(chr.delta))} en 3 mois`)));
    elements.push(courbe(points, "chrono_10km_s", "#ff9f1c", true, (v) => chrono(v)));
  }
  elements.push(el("p", { class: "note" }, "Sur 6 mois. Courbe du chrono : plus elle monte, plus tu vas vite."));
  return el("section", { class: "carte" }, elements);
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

  if (d.diagnostic && d.diagnostic.length) {
    frag.push(el("h2", {}, "État de forme"));
    frag.push(el("section", { class: "carte diagnostic" }, d.diagnostic.map((p) => el("p", {}, p))));
  }

  if (d.tendances) {
    frag.push(el("section", { class: "tendances", "aria-label": "Tendances de récupération sur 7 jours" },
      ["vfc", "fc_repos", "sommeil", "body_battery"].map((cle) => caseTendance(d.tendances[cle]))));
    frag.push(el("p", { class: "note" }, "Moyenne des 7 derniers jours comparée à ta normale du mois précédent."));
  }

  if (d.progression && d.progression.length > 4) {
    frag.push(el("h2", {}, "Progression"));
    frag.push(blocProgression(d.progression));
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
      `Calculés depuis ta meilleure portion de ${e.reference.distance_m / 1000} km (${chrono(e.reference.temps_s)}) des 6 dernières semaines.`));
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
