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
  for (const e of enfants.flat(Infinity)) if (e != null && e !== false) n.append(e.nodeType ? e : String(e));
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

/** Feuille plein ecran qui monte du bas (formulaires, chat). Renvoie { fermer, corps }. */
function feuille(titre, construire, { classe = "" } = {}) {
  const fond = el("div", { class: `feuille-fond ${classe}` });
  const corps = el("div", { class: "feuille-corps" });
  const fermer = () => { fond.classList.add("sortie"); document.body.classList.remove("feuille-ouverte"); setTimeout(() => fond.remove(), 220); };
  fond.append(el("section", { class: "feuille", role: "dialog", "aria-modal": "true", "aria-label": titre },
    el("header", { class: "feuille-tete" },
      el("h2", {}, titre),
      el("button", { class: "feuille-fermer", "aria-label": "Fermer", onclick: fermer }, "Fermer")),
    corps));
  fond.addEventListener("click", (e) => { if (e.target === fond) fermer(); });
  document.body.append(fond);
  document.body.classList.add("feuille-ouverte");
  construire(corps, fermer);
  return { fermer, corps };
}

const enMinutes = (s) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtKm = (v) => `${String(Math.round(v * 10) / 10).replace(".", ",")} km`;
const dateLocale = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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

/** Fichiers du depot prive deja charges pendant cette session (vides apres une synchro). */
const cache = new Map();

/** Lit un fichier JSON du depot prive ; renvoie null s'il n'existe pas encore. */
async function charger(chemin, { frais = false } = {}) {
  if (!frais && cache.has(chemin)) return cache.get(chemin);
  let r;
  try {
    r = await github(`contents/${chemin}?t=${Date.now()}`, { accept: "application/vnd.github.raw+json", cache: "no-store" });
  } catch (e) {
    if (e.message === "acces" && chemin !== FICHIER_JOUR) { cache.set(chemin, null); return null; }
    throw e;
  }
  const json = await r.json();
  cache.set(chemin, json);
  return json;
}

async function chargerDonnees() {
  return charger(FICHIER_JOUR, { frais: true });
}

/* ------------------------------------------------------------------ ecriture dans le depot prive */

function versBase64(texte) {
  const octets = new TextEncoder().encode(texte);
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Etat actuel d'un fichier (empreinte sha necessaire pour le modifier) ; null s'il n'existe pas. */
async function etatFichier(chemin) {
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/contents/${chemin}?t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${lireJeton()}`, Accept: "application/vnd.github+json" }, cache: "no-store",
  });
  if (r.status === 404) return null;
  if (r.status === 401) throw new Error("jeton");
  if (!r.ok) throw new Error(`http-${r.status}`);
  const j = await r.json();
  let contenu = null;
  if (j.content) {
    const bin = atob(j.content.replace(/\n/g, ""));
    contenu = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  return { sha: j.sha, contenu };
}

/** Ecrit un fichier du depot prive. `contenu` : objet (ecrit en JSON) ou { base64 } pour une image. */
async function ecrireFichier(chemin, contenu, message) {
  for (let essai = 0; essai < 3; essai++) {
    const actuel = await etatFichier(chemin);
    const base64 = contenu && contenu.base64 ? contenu.base64 : versBase64(JSON.stringify(contenu, null, 1));
    const r = await fetch(`https://api.github.com/repos/${DEPOT}/contents/${chemin}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${lireJeton()}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: base64, ...(actuel ? { sha: actuel.sha } : {}) }),
    });
    if (r.ok) { cache.delete(chemin); return; }
    if (r.status === 409 || r.status === 422) continue; // modifie entre-temps : on relit et on recommence
    if (r.status === 403 || r.status === 404) throw new Error("ecriture");
    throw new Error(`http-${r.status}`);
  }
  throw new Error("conflit");
}

async function supprimerFichier(chemin, message) {
  const actuel = await etatFichier(chemin);
  if (!actuel) return;
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/contents/${chemin}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${lireJeton()}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha: actuel.sha }),
  });
  if (!r.ok) throw new Error(r.status === 403 ? "ecriture" : `http-${r.status}`);
  cache.delete(chemin);
}

/* ------------------------------------------------------------------ taches GitHub (synchro, coach) */

/* Etapes des taches GitHub traduites pour l'ecran. */
const ETAPES = {
  "Set up job": "Préparation",
  "Run actions/checkout@v5": "Ouverture de ton dossier",
  "Recuperer les donnees Garmin": "Récupération des données Garmin",
  "Calculer le diagnostic et le plan": "Calcul du diagnostic et du plan",
  "Semaine en cours": "Réveil du coach",
  "Reprendre Claude Code": "Réveil du coach",
  "Installer Claude Code": "Réveil du coach",
  "Debriefs du coach": "Le coach rédige ses débriefs",
  "Revue du plan par le coach": "Le coach revoit ton plan",
  "Integrer le travail du coach": "Mise à jour de l'appli",
  "Le coach repond": "Le coach lit tes données et te répond",
  "Mettre a jour le plan": "Mise à jour du plan",
  "Enregistrer dans le depot": "Enregistrement",
};
const nomEtape = (n) => ETAPES[n] || "Finalisation";

/** Lance une tache GitHub et suit son avancement ; `suivi(etape, fraction)` est appele a chaque etape.
    `termine` (facultatif) : verification qui permet de s'arreter des que le resultat est enregistre. */
async function executerTache(fichier, inputs, suivi, { termine = null, pas = 3000 } = {}) {
  const depart = new Date(Date.now() - 5000).toISOString().slice(0, 19);
  suivi("Envoi de la demande à GitHub", null);
  await github(`actions/workflows/${fichier}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs }) });
  let run = null;
  for (let i = 0; i < 900000 / pas; i++) { // jusqu'a 15 minutes
    await new Promise((ok) => setTimeout(ok, pas));
    if (termine && run && await termine().catch(() => false)) return;
    if (!run) {
      const runs = await (await github(`actions/workflows/${fichier}/runs?per_page=5&event=workflow_dispatch&created=>=${depart}`)).json();
      const liste = runs.workflow_runs || [];
      run = liste[liste.length - 1] || null;
      if (!run) { suivi("En attente d'un serveur GitHub", null); continue; }
    }
    const r = await (await github(`actions/runs/${run.id}`)).json();
    if (r.status === "completed") {
      if (r.conclusion !== "success") throw new Error("tache-echec");
      return;
    }
    const jobs = await (await github(`actions/runs/${run.id}/jobs`)).json();
    const etapes = (jobs.jobs && jobs.jobs[0] && jobs.jobs[0].steps) || [];
    if (!etapes.length) { suivi(r.status === "queued" ? "En file d'attente chez GitHub" : "Démarrage", null); continue; }
    const finies = etapes.filter((e) => e.status === "completed").length;
    const courante = etapes.find((e) => e.status === "in_progress") || etapes.find((e) => e.status !== "completed");
    suivi(courante ? nomEtape(courante.name) : "Finalisation", finies / etapes.length);
  }
  throw new Error("tache-longue");
}

const MESSAGES_ERREUR = {
  jeton: "Le jeton GitHub n'est plus valide. Remplace-le dans les réglages.",
  acces: "Le jeton n'a pas le droit de lancer cette tâche (permission Actions en écriture).",
  ecriture: "Le jeton n'a pas le droit d'écrire dans ton dépôt (permission Contents en lecture et écriture).",
  "tache-echec": "La tâche a échoué. Le détail est dans l'onglet Actions du dépôt Coach-Perso.",
  "tache-longue": "C'est plus long que prévu. Rouvre l'appli dans quelques minutes.",
  conflit: "Le fichier a changé pendant l'enregistrement. Réessaie.",
};
const messageErreur = (e) => MESSAGES_ERREUR[e.message] || "Connexion indisponible. Vérifie ton réseau et réessaie.";

let synchroEnCours = false;

/** Panneau de progression fixe en haut de l'ecran. */
function panneauSynchro() {
  let p = document.getElementById("panneau-synchro");
  if (!p) {
    p = el("div", { id: "panneau-synchro", class: "panneau-synchro", role: "status", "aria-live": "polite" },
      el("div", { class: "ps-ligne" }, el("b", { class: "ps-titre" }, "Synchro"), el("span", { class: "ps-temps" }, "")),
      el("div", { class: "ps-etape" }, ""),
      el("div", { class: "ps-barre" }, el("span", { class: "ps-plein" })));
    document.body.append(p);
  }
  return {
    maj(etape, fraction, titre) {
      p.querySelector(".ps-etape").textContent = etape;
      if (titre) p.querySelector(".ps-titre").textContent = titre;
      const plein = p.querySelector(".ps-plein");
      plein.classList.toggle("indetermine", fraction == null);
      if (fraction != null) plein.style.width = `${Math.max(4, Math.round(fraction * 100))}%`;
    },
    temps(t) { p.querySelector(".ps-temps").textContent = t; },
    etat(cls) { p.className = `panneau-synchro ${cls || ""}`; },
    fermer(delai = 0) { setTimeout(() => p.remove(), delai); },
  };
}

/** Synchro complete avec panneau de progression. `titre` : ce qui l'a declenchee (par defaut, le bouton). */
async function lancerSynchro(titre = "Synchro") {
  if (synchroEnCours) return toast("Une synchro est déjà en cours.");
  synchroEnCours = true;
  const bouton = document.querySelector(".synchro");
  if (bouton) bouton.classList.add("en-cours");
  const panneau = panneauSynchro();
  panneau.maj("", null, titre);
  const debut = Date.now();
  const minuteur = setInterval(() => {
    const s = Math.round((Date.now() - debut) / 1000);
    panneau.temps(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  }, 1000);
  try {
    await executerTache(WORKFLOW_SYNCHRO, {}, (etape, f) => panneau.maj(etape, f));
    panneau.maj("Chargement de tes nouvelles données", 1);
    cache.clear();
    donnees = await chargerDonnees();
    afficher(routeActuelle());
    panneau.maj("Tes données sont à jour", 1, "Synchro terminée");
    panneau.etat("ok");
    panneau.fermer(2500);
  } catch (e) {
    panneau.maj(messageErreur(e), 1, "Synchro interrompue");
    panneau.etat("erreur");
    panneau.fermer(7000);
  } finally {
    clearInterval(minuteur);
    synchroEnCours = false;
    const b = document.querySelector(".synchro");
    if (b) { b.classList.remove("en-cours"); b.querySelector("span").textContent = ilYa(donnees && donnees.derniere_synchro); }
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
  const bouton = el("button", { class: `synchro${synchroEnCours ? " en-cours" : ""}`, "aria-label": "Synchroniser maintenant", onclick: () => lancerSynchro() },
    svg(`<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>`, { viewBox: "0 0 24 24", "aria-hidden": "true" }),
    el("span", {}, ilYa(donnees.derniere_synchro)));
  return el("div", { class: "entete" },
    el("span", { class: "date-jour" }, majuscule(fmtJour.format(new Date()))),
    bouton);
}

function vueAujourdhui() {
  const d = donnees, rec = d.recuperation, sug = d.suggestion;
  const frag = [enTete(), el("h1", {}, "Aujourd'hui")];

  const db = d.debrief_du_jour;
  if (db) {
    // une course faite aujourd'hui : le debrief prend la place de la recommandation
    frag.push(el("a", { class: `recommandation debrief-jour ${db.tonalite || ""}`, href: `#/seance/${db.id}`, "aria-label": "Débrief du jour" },
      el("p", { class: "recommandation-libelle" }, `Débrief du jour${db.auteur === "coach" ? ", par ton coach" : ""}`),
      el("p", { class: "debrief-seance" }, [db.nom, db.distance_m ? `${(db.distance_m / 1000).toFixed(1)} km` : null,
        db.vitesse_ms ? `${allure(db.vitesse_ms)}/km` : null, db.fc_moy ? `${Math.round(db.fc_moy)} bpm` : null].filter(Boolean).join(", ")),
      // sur l'accueil : le titre court, le verdict et le point a corriger ; le reste est dans la seance
      el("p", { class: "suggestion-titre" }, db.resume || db.verdict),
      db.resume ? el("p", { class: "debrief-verdict-accueil" }, db.verdict) : null,
      (db.points || []).slice(0, 1).map((p) => el("p", { class: "point-accueil" }, el("b", {}, `${p.titre} : `), p.texte.replace(/\n+/g, " "))),
      db.seance_demain ? ligneDemain(db.seance_demain) : db.demain ? el("p", { class: "demain" }, el("b", {}, "Demain : "), db.demain) : null,
      el("span", { class: "voir-detail" }, "Voir le détail de la séance")));
  } else {
    frag.push(carteSeanceDuJour(sug));
  }

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
    frag.push(el("a", { class: "carte carte-lien", href: `#/seance/${a.id}` },
      el("p", { class: "sortie-nom" }, a.nom || "Activité"),
      el("p", { class: "sortie-date" }, majuscule(fmtCourt.format(new Date(a.date)))),
      el("div", { class: "stats" },
        stat("Distance", a.distance_m ? `${(a.distance_m / 1000).toFixed(2)} km` : "–"),
        stat("Durée", a.duree_s ? chrono(a.duree_s) : "–"),
        stat("Allure", `${allure(a.vitesse_ms)} /km`),
        stat("FC moy.", a.fc_moy ? `${Math.round(a.fc_moy)}` : "–"),
        stat("Charge", a.charge ? `${Math.round(a.charge)}` : "–"),
        stat("Effet", effet(a.effet))),
      el("p", { class: "debrief-attente" }, "Voir le détail de la séance")));
  }

  frag.push(el("button", { class: "lien-discret", onclick: oublierJeton }, "Réglages : changer de jeton GitHub"));
  return frag;
}

const LIBELLES_NIVEAU = { repos: "Repos", renfo: "Renforcement", alerte: "Séance allégée", facile: "Séance du jour",
  qualite: "Séance du jour", course: "Jour de course" };

function carteSeanceDuJour(sug) {
  return el("section", { class: `recommandation ${sug.niveau}`, "aria-label": "Séance du jour" },
    el("p", { class: "recommandation-libelle" }, LIBELLES_NIVEAU[sug.niveau] || "Recommandation du jour"),
    el("p", { class: "suggestion-titre" }, sug.titre),
    sug.duree_min || sug.distance_km ? el("p", { class: "seance-chiffres" },
      [sug.duree_min ? `${sug.duree_min} min` : null, sug.distance_km ? `${String(sug.distance_km).replace(".", ",")} km` : null]
        .filter(Boolean).join(" · ")) : null,
    sug.structure && sug.structure.length ? el("ol", { class: "structure" }, sug.structure.map((x) => el("li", {}, x))) : null,
    sug.complement ? el("p", { class: "complement" }, el("b", {}, "En plus : "), `${sug.complement.titre}.`) : null,
    sug.consigne && !(sug.structure || []).length ? el("p", { class: "consigne" }, sug.consigne) : null,
    sug.raisons && sug.raisons.length ? el("ul", { class: "raisons" }, sug.raisons.map((r) => el("li", {}, r))) : null,
    el("a", { class: "voir-detail", href: "#/plan" }, "Voir la semaine"));
}

/** La seance de demain, lue dans le plan : elle suit les changements faits avec le coach. */
function ligneDemain(j) {
  const details = j.type === "repos" ? [] : [j.duree_min && !/min/.test(j.titre) ? `${j.duree_min} min` : null,
    j.distance_km ? fmtKm(j.distance_km) : null, j.fc ? `FC ${j.fc}` : null, j.allure || null].filter(Boolean);
  return el("div", { class: "demain" },
    el("p", { class: "sans-marge" }, el("b", {}, "Demain : "), j.titre, details.length ? `, ${details.join(", ")}` : "", "."),
    j.modifie ? el("p", { class: "demain-modifie" }, "Séance changée avec le coach.") : null);
}

function stat(libelle, chiffre) {
  return el("div", { class: "stat" }, el("div", { class: "libelle" }, libelle), el("div", { class: "chiffre" }, chiffre));
}

function effet(cle) {
  const noms = { RECOVERY: "Récup.", AEROBIC_BASE: "Endurance", TEMPO: "Tempo", LACTATE_THRESHOLD: "Seuil", VO2MAX: "VO2max", ANAEROBIC_CAPACITY: "Anaérobie", SPEED: "Vitesse" };
  return noms[cle] || "–";
}

function vueConfiguration(erreur) {
  return [el("section", { class: "panneau" },
    el("h1", {}, "Coach Perso"),
    el("p", {}, "L'appli lit tes données dans ton dépôt privé Coach-Perso. Il lui faut un jeton d'accès GitHub, enregistré uniquement sur cet appareil."),
    el("ol", {},
      el("li", {}, "Sur github.com : ta photo, puis ", el("strong", {}, "Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token"), "."),
      el("li", {}, "Repository access : ", el("strong", {}, "Only select repositories → Coach-Perso"), "."),
      el("li", {}, "Permissions : ", el("strong", {}, "Contents : Read and write"), " et ", el("strong", {}, "Actions : Read and write"), "."),
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
  diagnostic: (p) => vueDiagnostic(p[0] || "seances"),
  seance: (p) => vueSeance(p[0]),
  plan: () => vuePlan(),
  objectif: () => vueObjectif(),
};
const ONGLET_DE = { seance: "diagnostic" };

function routeActuelle() {
  const morceaux = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return VUES[morceaux[0]] ? morceaux : ["aujourdhui"];
}

let rendu = 0;
async function afficher(route, erreur) {
  const numero = ++rendu;
  const configuration = route === "configuration";
  document.querySelector(".onglets").hidden = configuration;
  document.getElementById("bulle-coach").hidden = configuration;
  if (configuration) {
    ecran.replaceChildren(...vueConfiguration(erreur));
    return;
  }
  const [nom, ...params] = route;
  const onglet = ONGLET_DE[nom] || nom;
  document.querySelectorAll(".onglet").forEach((o) => {
    const actif = o.dataset.vue === onglet;
    o.classList.toggle("actif", actif);
    actif ? o.setAttribute("aria-current", "page") : o.removeAttribute("aria-current");
  });
  let contenu;
  try {
    contenu = await VUES[nom](params);
  } catch (e) {
    if (e.message === "jeton") return afficher("configuration", "Ce jeton n'est plus valide. Colle un nouveau jeton.");
    contenu = [el("div", { class: "entete" }), el("h1", {}, "Chargement impossible"),
      el("p", { class: "note" }, "Ces données n'ont pas pu être chargées. Vérifie ta connexion et réessaie."),
      el("button", { class: "bouton discret", onclick: () => afficher(routeActuelle()) }, "Réessayer")];
  }
  if (numero !== rendu) return; // une autre page a ete demandee entre-temps
  ecran.replaceChildren(...[contenu].flat());
  window.scrollTo(0, 0);
}

function aller(...route) {
  const adresse = "#/" + route.join("/");
  if (location.hash === adresse) afficher(route);
  else location.hash = adresse;
}

window.addEventListener("hashchange", () => {
  document.querySelectorAll(".feuille-fond").forEach((f) => f.remove());
  document.body.classList.remove("feuille-ouverte");
  if (donnees) afficher(routeActuelle());
});
document.querySelectorAll(".onglet").forEach((o) => o.addEventListener("click", () => donnees && aller(o.dataset.vue)));
document.getElementById("bulle-coach").addEventListener("click", () => donnees && ouvrirChat());

async function demarrer() {
  if (!lireJeton()) return afficher("configuration");
  ecran.replaceChildren(el("p", { class: "note panneau" }, "Chargement de tes données…"));
  try {
    donnees = await chargerDonnees();
    afficher(routeActuelle());
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
