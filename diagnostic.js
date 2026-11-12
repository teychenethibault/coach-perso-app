"use strict";

/* Onglet Diagnostic : liste des seances, detail d'une seance, et les sous-parties
 * Corps, Competences et Bilans. S'appuie sur les outils de app.js. */

const SECTIONS_DIAGNOSTIC = [
  { cle: "seances", nom: "Séances" },
  { cle: "corps", nom: "Corps" },
  { cle: "competences", nom: "Compétences" },
  { cle: "bilans", nom: "Bilans" },
];

const COULEURS_ZONES = ["#8e8e93", "#0a84ff", "#30d158", "#ff9f0a", "#ff453a"];
const NOMS_TYPES = {
  running: "Course", trail_running: "Trail", treadmill_running: "Tapis", track_running: "Piste",
  street_running: "Course", strength_training: "Renforcement", cycling: "Vélo", walking: "Marche",
  hiking: "Randonnée", lap_swimming: "Natation", indoor_cardio: "Cardio", yoga: "Yoga",
};
const EST_COURSE = (t) => ["running", "trail_running", "treadmill_running", "track_running", "street_running"].includes(t);

const fmtJourCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const fmtMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function selecteur(actif) {
  return el("nav", { class: "selecteur", "aria-label": "Parties du diagnostic" },
    SECTIONS_DIAGNOSTIC.map((s) => el("a", {
      href: `#/diagnostic/${s.cle}`, class: s.cle === actif ? "actif" : null,
      "aria-current": s.cle === actif ? "page" : null,
    }, s.nom)));
}

async function vueDiagnostic(section) {
  const tete = [enTete(), el("h1", {}, "Diagnostic"), selecteur(section)];
  const contenu = {
    seances: listeSeances,
    corps: sectionCorps,
    competences: sectionCompetences,
    bilans: sectionBilans,
  }[section] || listeSeances;
  return [...tete, ...(await contenu())];
}

/* ------------------------------------------------------------------ liste des seances */

async function listeSeances() {
  const seances = await charger("data/app/seances.json");
  if (!seances || !seances.length) {
    return [el("p", { class: "note" }, "Aucune séance pour l'instant. Lance une synchro depuis le bouton en haut à droite.")];
  }
  const groupes = new Map();
  for (const s of seances) {
    const mois = majuscule(fmtMois.format(new Date(s.date.replace(" ", "T"))));
    if (!groupes.has(mois)) groupes.set(mois, []);
    groupes.get(mois).push(s);
  }
  const blocs = [];
  for (const [mois, liste] of groupes) {
    const km = liste.filter((s) => EST_COURSE(s.type)).reduce((t, s) => t + (s.distance_m || 0), 0) / 1000;
    blocs.push(el("div", { class: "mois" },
      el("h2", {}, mois),
      el("span", { class: "mois-total" }, `${Math.round(km)} km, ${liste.length} séance${liste.length > 1 ? "s" : ""}`)));
    blocs.push(el("ul", { class: "liste-seances" }, liste.map(ligneSeance)));
  }
  return blocs;
}

function ligneSeance(s) {
  const course = EST_COURSE(s.type);
  const date = new Date(s.date.replace(" ", "T"));
  const details = course
    ? [s.distance_m ? `${(s.distance_m / 1000).toFixed(1)} km` : null, s.vitesse_ms ? `${allure(s.vitesse_ms)}/km` : null,
      s.fc_moy ? `${Math.round(s.fc_moy)} bpm` : null]
    : [s.duree_s ? chrono(s.duree_s) : null, s.fc_moy ? `${Math.round(s.fc_moy)} bpm` : null];
  return el("li", {},
    el("a", { class: `seance ${s.tonalite || ""}`, href: `#/seance/${s.id}` },
      el("span", { class: "seance-repere", style: `background:${couleurEffet(s.effet, course)}`, "aria-hidden": "true" }),
      el("span", { class: "seance-texte" },
        el("span", { class: "seance-titre" }, `${majuscule(fmtJourCourt.format(date))}, ${course ? effetLong(s.effet, s.type) : (NOMS_TYPES[s.type] || "activité").toLowerCase()}`),
        el("span", { class: "seance-details" }, details.filter(Boolean).join("   "))),
      s.verdict ? el("span", { class: "seance-verdict" }, s.verdict) : null,
      el("span", { class: "chevron", "aria-hidden": "true" }, "›")));
}

/** Couleur de la zone que la seance a surtout travaillee (meme code que les zones cardiaques). */
function couleurEffet(cle, course) {
  if (!course) return "#bf5af2";
  return { RECOVERY: COULEURS_ZONES[0], AEROBIC_BASE: COULEURS_ZONES[1], TEMPO: COULEURS_ZONES[2],
    LACTATE_THRESHOLD: COULEURS_ZONES[3], VO2MAX: COULEURS_ZONES[4], ANAEROBIC_CAPACITY: COULEURS_ZONES[4],
    SPEED: COULEURS_ZONES[4] }[cle] || COULEURS_ZONES[1];
}

function effetLong(cle, type) {
  const noms = {
    RECOVERY: "récupération", AEROBIC_BASE: "endurance", TEMPO: "tempo", LACTATE_THRESHOLD: "seuil",
    VO2MAX: "VO2max", ANAEROBIC_CAPACITY: "anaérobie", SPEED: "vitesse",
  };
  return noms[cle] || (NOMS_TYPES[type] || "activité").toLowerCase();
}

/* ------------------------------------------------------------------ detail d'une seance */

async function vueSeance(id) {
  const d = await charger(`data/app/seances/${id}.json`);
  const retour = el("a", { class: "retour", href: "#/diagnostic/seances" }, "‹ Séances");
  if (!d) return [retour, el("h1", {}, "Séance introuvable"), el("p", { class: "note" }, "Elle n'a peut-être pas encore été synchronisée.")];

  const r = d.resume;
  const course = EST_COURSE(r.type);
  const date = new Date(r.date.replace(" ", "T"));
  const debrief = await charger(`data/debriefs/${id}.json`);
  const frag = [
    retour,
    el("p", { class: "date-jour" }, majuscule(fmtCourt.format(date))),
    el("h1", { class: "titre-seance" }, r.nom || "Séance"),
  ];

  frag.push(el("section", { class: "stats stats-seance" },
    course ? stat("Distance", r.distance_m ? `${(r.distance_m / 1000).toFixed(2)} km` : "–") : null,
    stat("Durée", r.duree_s ? chrono(r.duree_s) : "–"),
    course ? stat("Allure", r.vitesse_ms ? `${allure(r.vitesse_ms)} /km` : "–") : null,
    stat("FC moy.", r.fc_moy ? `${Math.round(r.fc_moy)}` : "–"),
    stat("FC max", r.fc_max ? `${Math.round(r.fc_max)}` : "–"),
    course ? stat("Dénivelé", r.d_plus != null ? `${Math.round(r.d_plus)} m` : "–") : null,
    stat("Charge", r.charge ? `${Math.round(r.charge)}` : "–"),
    stat("Effet", effet(r.effet)),
    stat("Aérobie / anaérobie", `${r.effet_aerobie ?? "–"} / ${r.effet_anaerobie ?? "–"}`)));

  frag.push(el("h2", {}, "Le débrief du coach"));
  frag.push(debrief ? blocDebrief(debrief)
    : el("section", { class: "carte" }, el("p", { class: "note sans-marge" },
      "Le débrief de cette séance n'est pas encore rédigé. Dès que le coach sera branché, il l'écrira automatiquement après chaque sortie.")));

  if (course && d.courbes.length > 10) {
    frag.push(el("h2", {}, "Allure et fréquence cardiaque"));
    frag.push(el("section", { class: "carte" }, graphiqueSeance(d.courbes, d.zones_bornes)));
  }

  if (d.zones_s && d.zones_s.some((v) => v > 0)) {
    frag.push(el("h2", {}, "Temps par zone"));
    frag.push(blocZones(d.zones_s, d.zones_bornes));
  }

  if (course && d.derive_pct != null) {
    frag.push(el("h2", {}, "Endurance"));
    frag.push(blocDerive(d.derive_pct, r.d_plus, r.distance_m));
  }

  if (course && d.kilometres.length) {
    frag.push(el("h2", {}, "Kilomètre par kilomètre"));
    frag.push(tableauKilometres(d.kilometres));
  }

  if (course && (r.cadence || r.foulee_cm || r.contact_sol_ms || r.oscillation_cm)) {
    frag.push(el("h2", {}, "Technique"));
    frag.push(el("section", { class: "stats stats-seance carte" },
      stat("Cadence", r.cadence ? `${Math.round(r.cadence)} pas/min` : "–"),
      stat("Foulée", r.foulee_cm ? `${(r.foulee_cm / 100).toFixed(2)} m` : "–"),
      stat("Contact au sol", r.contact_sol_ms ? `${Math.round(r.contact_sol_ms)} ms` : "–"),
      stat("Oscillation", r.oscillation_cm ? `${r.oscillation_cm.toFixed(1)} cm` : "–"),
      stat("Puissance", r.puissance ? `${Math.round(r.puissance)} W` : "–"),
      stat("Efficacité", r.efficacite ? `${r.efficacite}` : "–")));
    frag.push(el("p", { class: "note" }, "Efficacité : mètres parcourus par minute pour chaque battement cardiaque. Plus elle est haute, plus tu cours économiquement."));
  }

  if (d.similaires.length) {
    frag.push(el("h2", {}, "Comparée aux séances similaires"));
    frag.push(blocSimilaires(r, d.similaires));
  }
  return frag;
}

function blocDebrief(db) {
  return el("section", { class: `carte debrief ${db.tonalite || ""}` },
    db.verdict ? el("p", { class: "debrief-verdict" }, db.verdict) : null,
    (db.points || []).map((p) => el("div", { class: "debrief-point" },
      el("h3", {}, p.titre), el("p", {}, p.texte))));
}

/** Deux courbes superposees sur la distance : allure (en haut, plus vite = plus haut) et FC (bandes de zones). */
function graphiqueSeance(points, bornes) {
  const pts = points.filter((p) => p.km != null);
  const L = 340, g = 36, hA = 110, hF = 110, ecart = 22, bas = 18;
  const H = hA + ecart + hF + bas;
  const kmMax = pts[pts.length - 1].km || 1;
  const x = (km) => g + (km / kmMax) * (L - g - 4);

  // allure lissee sur 5 points (environ 50 s) pour lire la tendance plutot que le bruit du GPS
  pts.forEach((p, i) => {
    const voisins = pts.slice(Math.max(0, i - 2), i + 3).map((q) => q.allure).filter(Boolean);
    p.allureLisse = p.allure && voisins.length ? voisins.reduce((a, b) => a + b, 0) / voisins.length : null;
  });
  // bornes robustes (5e et 95e centiles) pour ne pas ecraser la courbe a cause d'un arret
  const allures = pts.map((p) => p.allureLisse).filter(Boolean).sort((a, b) => a - b);
  let html = "";
  if (allures.length > 5) {
    const aMin = allures[Math.floor(allures.length * 0.05)] - 10;
    const aMax = allures[Math.floor(allures.length * 0.95)] + 10;
    const yA = (a) => 4 + ((Math.min(Math.max(a, aMin), aMax) - aMin) / (aMax - aMin)) * (hA - 8);
    let d = "", suite = false;
    pts.forEach((p) => {
      if (!p.allureLisse) { suite = false; return; }
      d += `${suite ? "L" : "M"}${x(p.km).toFixed(1)} ${yA(p.allureLisse).toFixed(1)}`;
      suite = true;
    });
    [aMin + 10, aMax - 10].forEach((a) => {
      html += `<line x1="${g}" x2="${L}" y1="${yA(a)}" y2="${yA(a)}" stroke="#26262c"/><text x="0" y="${yA(a) + 4}">${chrono(a)}</text>`;
    });
    html += `<path d="${d}" fill="none" stroke="#0a84ff" stroke-width="1.8" stroke-linejoin="round"/>`;
  }

  // FC avec bandes de zones
  const fcs = pts.map((p) => p.fc).filter(Boolean);
  if (fcs.length > 5) {
    const y0 = hA + ecart;
    const fMin = Math.min(...fcs) - 5, fMax = Math.max(...fcs) + 5;
    const yF = (f) => y0 + (1 - (f - fMin) / (fMax - fMin)) * hF;
    if (bornes) {
      const limites = [...bornes, 250];
      bornes.forEach((b, i) => {
        const bas_ = Math.max(b, fMin), haut_ = Math.min(limites[i + 1], fMax);
        if (haut_ > bas_) {
          html += `<rect x="${g}" y="${yF(haut_)}" width="${L - g}" height="${yF(bas_) - yF(haut_)}" fill="${COULEURS_ZONES[i]}" opacity="0.10"/>`;
        }
      });
    }
    let d = "", suite = false;
    pts.forEach((p) => {
      if (!p.fc) { suite = false; return; }
      d += `${suite ? "L" : "M"}${x(p.km).toFixed(1)} ${yF(p.fc).toFixed(1)}`;
      suite = true;
    });
    [Math.round(fMin + 5), Math.round(fMax - 5)].forEach((f) => {
      html += `<text x="0" y="${yF(f) + 4}">${f}</text>`;
    });
    html += `<path d="${d}" fill="none" stroke="#ff453a" stroke-width="1.8" stroke-linejoin="round"/>`;
  }

  const pas = kmMax > 15 ? 5 : kmMax > 6 ? 2 : 1;
  for (let k = pas; k < kmMax; k += pas) {
    html += `<text x="${x(k)}" y="${H - 2}" text-anchor="middle">${k} km</text>`;
  }
  return [
    el("div", { class: "legende" },
      el("span", {}, el("i", { style: "background:#0a84ff" }), "Allure (min/km)"),
      el("span", {}, el("i", { style: "background:#ff453a" }), "FC (bpm), zones en fond")),
    svg(html, { viewBox: `0 0 ${L} ${H}`, class: "graphique", role: "img", "aria-label": "Allure et fréquence cardiaque au fil de la séance" }),
  ];
}

function blocZones(secondes, bornes) {
  const total = secondes.reduce((a, b) => a + b, 0) || 1;
  const noms = ["Récupération", "Endurance", "Tempo", "Seuil", "VO2max"];
  return el("section", { class: "carte" },
    el("div", { class: "barre-zones", role: "img", "aria-label": "Répartition du temps par zone cardiaque" },
      secondes.map((s, i) => s > 0 ? el("span", { style: `flex:${s};background:${COULEURS_ZONES[i]}` }) : null)),
    el("ul", { class: "liste-zones" }, secondes.map((s, i) => el("li", {},
      el("i", { style: `background:${COULEURS_ZONES[i]}`, "aria-hidden": "true" }),
      el("span", {}, `Zone ${i + 1}, ${noms[i]}`),
      el("span", { class: "zone-bpm" }, bornes ? (i < 4 ? `${bornes[i]}-${bornes[i + 1] - 1}` : `${bornes[i]}+`) : ""),
      el("b", {}, `${Math.round(s / 60)} min`),
      el("span", { class: "zone-pct" }, `${Math.round((s / total) * 100)} %`)))));
}

function blocDerive(pct, dPlus, distance) {
  const relief = dPlus && distance && dPlus / (distance / 1000) > 12;
  const niveau = pct < 5 ? { cls: "bien", texte: "Bonne tenue : ta FC est restée stable pour une même allure jusqu'au bout." }
    : pct < 10 ? { cls: "moyen", texte: "Dérive modérée : ton efficacité baisse en fin de sortie." }
      : { cls: "mal", texte: "Dérive forte : ta FC monte nettement à allure égale en seconde moitié." };
  return el("section", { class: "carte" },
    el("div", { class: "carte-tete" },
      el("div", {},
        el("div", { class: `grand-chiffre derive ${niveau.cls}` }, `${pct > 0 ? "+" : ""}${pct} %`),
        el("div", { class: "legende" }, "Dérive cardiaque, seconde moitié contre première"))),
    el("p", { class: "note" }, niveau.texte + (relief ? " Le parcours vallonné en explique une partie." : "")));
}

function tableauKilometres(kms) {
  const allures = kms.map((k) => k.allure_s).filter(Boolean);
  const plusVite = Math.min(...allures), plusLent = Math.max(...allures);
  return el("section", { class: "carte tableau-km" },
    el("table", {},
      el("thead", {}, el("tr", {}, ["Km", "Allure", "FC", "Cad.", "D+"].map((t) => el("th", { scope: "col" }, t)))),
      el("tbody", {}, kms.map((k) => {
        const largeur = plusLent > plusVite ? 30 + 70 * (plusLent - k.allure_s) / (plusLent - plusVite) : 100;
        return el("tr", {},
          el("td", {}, typeof k.km === "number" && !Number.isInteger(k.km) ? k.km.toFixed(2) : k.km),
          el("td", { class: "km-allure" },
            el("span", { class: "km-barre", style: `width:${largeur}%` }),
            el("span", { class: "km-valeur" }, k.allure_s ? chrono(k.allure_s) : "–")),
          el("td", {}, k.fc_moy ?? "–"),
          el("td", {}, k.cadence ?? "–"),
          el("td", {}, k.d_plus ?? "–"));
      }))));
}

function blocSimilaires(r, sims) {
  const actuelle = r.efficacite;
  const moyenne = sims.filter((s) => s.efficacite).reduce((t, s, _, a) => t + s.efficacite / a.length, 0);
  let lecture = "";
  if (actuelle && moyenne) {
    const ecart = ((actuelle - moyenne) / moyenne) * 100;
    lecture = Math.abs(ecart) < 2
      ? "Efficacité dans ta moyenne sur ce type de séance."
      : ecart > 0 ? `Efficacité supérieure de ${Math.round(ecart)} % à ta moyenne sur ce type de séance.`
        : `Efficacité inférieure de ${Math.round(-ecart)} % à ta moyenne sur ce type de séance.`;
  }
  return el("section", { class: "carte" },
    lecture ? el("p", { class: "sans-marge comparaison-lecture" }, lecture) : null,
    el("table", { class: "tableau-similaires" },
      el("thead", {}, el("tr", {}, ["Date", "Dist.", "Allure", "FC", "Effic."].map((t) => el("th", { scope: "col" }, t)))),
      el("tbody", {},
        el("tr", { class: "actuelle" },
          el("td", {}, "Celle-ci"),
          el("td", {}, `${(r.distance_m / 1000).toFixed(1)}`),
          el("td", {}, r.vitesse_ms ? allure(r.vitesse_ms) : "–"),
          el("td", {}, r.fc_moy ? Math.round(r.fc_moy) : "–"),
          el("td", {}, r.efficacite ?? "–")),
        sims.map((s) => el("tr", { onclick: () => aller("seance", s.id) },
          el("td", {}, fmtJourCourt.format(new Date(s.date.replace(" ", "T")))),
          el("td", {}, (s.distance_m / 1000).toFixed(1)),
          el("td", {}, s.allure_s ? chrono(s.allure_s) : "–"),
          el("td", {}, s.fc_moy ? Math.round(s.fc_moy) : "–"),
          el("td", {}, s.efficacite ?? "–"))))));
}

/* ------------------------------------------------------------------ petits graphiques */

/** Courbe simple : points [{date, v}], ligne de normale en pointille, etiquettes de date tous les `pasDates` points. */
function miniCourbe(points, couleur, { normale = null, format = (v) => Math.round(v), pasDates = 7, hauteur = 110 } = {}) {
  const L = 340, H = hauteur, g = 40, bas = 18, haut = 8;
  const valides = points.map((p, i) => ({ i, v: p.v })).filter((p) => p.v != null);
  if (valides.length < 2) return el("p", { class: "note" }, "Pas encore assez de données.");
  const vals = valides.map((p) => p.v).concat(normale != null ? [normale] : []);
  let min = Math.min(...vals), max = Math.max(...vals);
  const marge = (max - min) * 0.12 || 1;
  min -= marge; max += marge;
  const x = (i) => g + (i / (points.length - 1)) * (L - g - 6);
  const y = (v) => haut + (1 - (v - min) / (max - min)) * (H - bas - haut);
  let html = "";
  [min + marge, max - marge].forEach((v) => {
    html += `<line x1="${g}" x2="${L}" y1="${y(v)}" y2="${y(v)}" stroke="#26262c"/><text x="0" y="${y(v) + 4}">${format(v)}</text>`;
  });
  if (normale != null) html += `<line x1="${g}" x2="${L}" y1="${y(normale)}" y2="${y(normale)}" stroke="#9a9aa3" stroke-dasharray="3 4"/>`;
  points.forEach((p, i) => {
    if ((points.length - 1 - i) % pasDates === 0 && i > 0) {
      const d = new Date(p.date);
      html += `<text x="${x(i)}" y="${H - 2}" text-anchor="middle">${d.getDate()}/${d.getMonth() + 1}</text>`;
    }
  });
  let d = "", suite = false;
  points.forEach((p, i) => {
    if (p.v == null) { suite = false; return; }
    d += `${suite ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`;
    suite = true;
  });
  html += `<path d="${d}" fill="none" stroke="${couleur}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const dernier = valides[valides.length - 1];
  html += `<circle cx="${x(dernier.i)}" cy="${y(dernier.v)}" r="4" fill="${couleur}" stroke="#000" stroke-width="2"/>`;
  return svg(html, { viewBox: `0 0 ${L} ${H}`, class: "graphique", "aria-hidden": "true" });
}

/* ------------------------------------------------------------------ corps */

const ZONES_FRAICHEUR = [
  { min: 10, nom: "Frais", couleur: "#64d2ff", lecture: "Fatigue basse : tu as de la marge pour charger, ou tu es prêt pour une course." },
  { min: -10, nom: "Équilibre", couleur: "#9a9aa3", lecture: "Charge et récupération équilibrées : tu entretiens ta condition." },
  { min: -30, nom: "Progression", couleur: "#30d158", lecture: "Fatigue de travail : c'est la zone où la condition progresse." },
  { min: -Infinity, nom: "Surcharge", couleur: "#ff453a", lecture: "Fatigue excessive : risque de blessure, priorité à la récupération." },
];
const zoneFraicheur = (v) => ZONES_FRAICHEUR.find((z) => v >= z.min);

function graphiqueFraicheur(points) {
  const jours = points.slice(-56);
  const L = 340, H = 170, g = 84, bas = 18, haut = 6;
  const vals = jours.map((p) => p.forme);
  const vMax = Math.max(25, ...vals) + 3, vMin = Math.min(-40, ...vals) - 3;
  const x = (i) => g + (i / (jours.length - 1)) * (L - g - 4);
  const y = (v) => haut + ((vMax - v) / (vMax - vMin)) * (H - bas - haut);
  let html = "";
  const bornes = [vMax, 10, -10, -30, vMin];
  ZONES_FRAICHEUR.forEach((z, i) => {
    const y1 = y(bornes[i]), y2 = y(bornes[i + 1]);
    html += `<rect x="${g}" y="${y1}" width="${L - g}" height="${y2 - y1}" fill="${z.couleur}" opacity="0.08"/>`;
    html += `<text x="0" y="${(y1 + y2) / 2 + 4}" style="fill:${z.couleur}">${z.nom}</text>`;
  });
  jours.forEach((p, i) => {
    const d = new Date(p.date);
    if (d.getDay() === 1 && i < jours.length - 3) html += `<text x="${x(i)}" y="${H - 2}" text-anchor="middle">${d.getDate()}/${d.getMonth() + 1}</text>`;
  });
  const chemin = jours.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.forme).toFixed(1)}`).join("");
  html += `<path d="${chemin}" fill="none" stroke="#f5f5f7" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const dernier = jours[jours.length - 1];
  html += `<circle cx="${x(jours.length - 1)}" cy="${y(dernier.forme)}" r="5" fill="${zoneFraicheur(dernier.forme).couleur}" stroke="#000" stroke-width="2"/>`;
  return svg(html, { viewBox: `0 0 ${L} ${H}`, class: "graphique", role: "img", "aria-label": "Fraîcheur sur 8 semaines" });
}

const COULEURS_RECUP = { vfc: "#ff4f6d", fc_repos: "#ff9f1c", sommeil: "#7b6cff", body_battery: "#2ee6a6" };
const COULEURS_INTENSITE = { facile: "#0a84ff", modere: "#ff9f0a", intense: "#ff453a" };

async function sectionCorps() {
  const c = await charger("data/app/corps.json");
  if (!c) return [el("p", { class: "note" }, "Ces analyses apparaîtront après la prochaine synchro.")];
  const frag = [];

  // repartition des intensites
  const r = c.intensites.quatre_semaines_pct;
  frag.push(el("h2", {}, "Répartition des intensités"));
  frag.push(el("section", { class: "carte" },
    el("div", { class: "legende" }, "Temps de course sur 4 semaines"),
    el("div", { class: "barre-intensites", role: "img", "aria-label": `Facile ${r.facile} %, modéré ${r.modere} %, intense ${r.intense} %` },
      ["facile", "modere", "intense"].map((k) => r[k] > 0
        ? el("span", { style: `flex:${r[k]};background:${COULEURS_INTENSITE[k]}` }, r[k] >= 10 ? `${r[k]} %` : "") : null),
      el("i", { class: "cible", style: "left:80%", title: "Cible : 80 % facile" })),
    el("div", { class: "legende" },
      el("span", {}, el("i", { style: `background:${COULEURS_INTENSITE.facile}` }), "Facile, cible 80 %"),
      el("span", {}, el("i", { style: `background:${COULEURS_INTENSITE.modere}` }), "Modéré"),
      el("span", {}, el("i", { style: `background:${COULEURS_INTENSITE.intense}` }), "Intense")),
    c.intensites.lecture.map((t) => el("p", { class: "note" }, t)),
    barresIntensites(c.intensites.semaines)));

  // forme et fatigue
  const jour = donnees && donnees.charge;
  if (jour && jour.points && jour.points.length > 28) {
    const z = zoneFraicheur(jour.forme ?? 0);
    frag.push(el("h2", {}, "Forme et fatigue"));
    frag.push(el("section", { class: "carte" },
      el("div", { class: "carte-tete" },
        el("div", {},
          el("div", { class: "grand-chiffre", style: `color:${z.couleur}` }, z.nom),
          el("div", { class: "legende" }, `Fraîcheur ${jour.forme > 0 ? "+" : ""}${Math.round(jour.forme)}, condition moins fatigue`))),
      graphiqueFraicheur(jour.points),
      el("p", { class: "note" }, z.lecture)));
  }

  // recuperation sur 8 semaines
  frag.push(el("h2", {}, "Récupération sur 8 semaines"));
  for (const cle of ["vfc", "fc_repos", "sommeil", "body_battery"]) {
    const s = c.recuperation[cle];
    const derniere = [...s.points].reverse().find((p) => p.valeur != null);
    const fmt = cle === "sommeil" ? (v) => `${Math.floor(v)}h${String(Math.round((v % 1) * 60)).padStart(2, "0")}` : (v) => Math.round(v);
    frag.push(el("section", { class: "carte carte-courbe" },
      el("div", { class: "carte-tete" },
        el("div", { class: "nom-courbe" }, el("i", { style: `background:${COULEURS_RECUP[cle]}` }), s.nom),
        el("div", { class: "legende" }, `${derniere ? fmt(derniere.valeur) : "–"}${s.unite && cle !== "sommeil" ? " " + s.unite : ""}, normale ${s.normale != null ? fmt(s.normale) : "–"}`)),
      miniCourbe(s.points.map((p) => ({ date: p.date, v: p.valeur })), COULEURS_RECUP[cle], { normale: s.normale, format: fmt, pasDates: 14, hauteur: 100 })));
  }

  // dynamique de course
  frag.push(el("h2", {}, "Dynamique de course sur 6 mois"));
  const dyn = c.dynamique;
  const lignes = [
    ["cadence", "Cadence", "pas/min", "#64d2ff", "Plus elle est haute, plus la foulée est économique."],
    ["contact_sol", "Contact au sol", "ms", "#ff9f0a", "Plus il est court, plus tu restitues d'énergie."],
    ["oscillation", "Oscillation verticale", "cm", "#bf5af2", "Plus elle est faible, moins tu perds d'énergie à rebondir."],
  ];
  for (const [cle, nom, unite, couleur, aide] of lignes) {
    const pts = dyn.map((p) => ({ date: p.debut, v: p[cle] }));
    const der = [...pts].reverse().find((p) => p.v != null);
    frag.push(el("section", { class: "carte carte-courbe" },
      el("div", { class: "carte-tete" },
        el("div", { class: "nom-courbe" }, el("i", { style: `background:${couleur}` }), nom),
        el("div", { class: "legende" }, der ? `${der.v} ${unite}` : "–")),
      miniCourbe(pts, couleur, { format: (v) => (cle === "oscillation" ? v.toFixed(1) : Math.round(v)), pasDates: 8, hauteur: 100 }),
      el("p", { class: "note" }, aide)));
  }
  return frag;
}

function barresIntensites(semaines) {
  const L = 340, H = 120, bas = 18;
  const largeur = L / semaines.length;
  let html = "";
  semaines.forEach((s, i) => {
    const total = s.facile + s.modere + s.intense;
    const x = i * largeur + largeur * 0.2, w = largeur * 0.6;
    let y = H - bas;
    if (!total) {
      html += `<rect x="${x}" y="${H - bas - 2}" width="${w}" height="2" fill="#3a3a42"/>`;
    } else {
      for (const k of ["facile", "modere", "intense"]) {
        const h = (s[k] / total) * (H - bas - 6);
        y -= h;
        if (h > 0) html += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COULEURS_INTENSITE[k]}"/>`;
      }
    }
    const d = new Date(s.debut);
    if (i % 2 === 1 || i === semaines.length - 1) html += `<text x="${x + w / 2}" y="${H - 2}" text-anchor="middle">${d.getDate()}/${d.getMonth() + 1}</text>`;
  });
  const y80 = H - bas - 0.8 * (H - bas - 6);
  html += `<line x1="0" x2="${L}" y1="${y80}" y2="${y80}" stroke="#f5f5f7" stroke-dasharray="3 4" opacity="0.6"/>`;
  return svg(html, { viewBox: `0 0 ${L} ${H}`, class: "graphique", role: "img", "aria-label": "Répartition des intensités semaine par semaine, ligne à 80 %" });
}

/* ------------------------------------------------------------------ competences */

function formatCompetence(c) {
  if (c.valeur == null) return "–";
  if (c.unite === "s") return chrono(c.valeur);
  if (c.unite === "/sem") return `${c.valeur.toFixed(2).replace(".", ",")} par semaine`;
  if (c.unite === "/8") return `${c.valeur} sur 8`;
  if (c.unite === "%") return `${c.valeur} %`;
  if (c.unite === "ms") return `${Math.round(c.valeur)} ms`;
  if (c.unite === "m/min/bpm") return `${c.valeur.toFixed(2).replace(".", ",")} m/min/bpm`;
  return `${c.valeur}`;
}

async function sectionCompetences() {
  const d = await charger("data/app/competences.json");
  if (!d) return [el("p", { class: "note" }, "Tes compétences apparaîtront après la prochaine synchro.")];
  const priorite = d.competences.find((c) => c.cle === d.priorite);
  const frag = [];
  if (priorite) {
    frag.push(el("section", { class: "recommandation repos priorite" },
      el("p", { class: "recommandation-libelle" }, "Priorité du moment"),
      el("p", { class: "suggestion-titre" }, priorite.nom),
      el("p", { class: "consigne" }, `${priorite.mesure} : ${formatCompetence(priorite)}. C'est ta compétence la plus faible : le prochain bloc la travaillera en priorité.`)));
  }
  frag.push(el("ul", { class: "liste-competences" }, d.competences.map((c) => {
    const n = c.niveau ?? 0;
    const couleur = n >= 66 ? "#30d158" : n >= 33 ? "#ff9f0a" : "#ff453a";
    return el("li", { class: "competence" },
      el("div", { class: "competence-tete" },
        el("span", { class: "competence-nom" }, c.nom),
        fleches(c.tendance)),
      el("div", { class: "jauge", role: "img", "aria-label": `Niveau ${c.niveau ?? "inconnu"} sur 100` },
        el("span", { style: `width:${Math.max(n, 3)}%;background:${couleur}` })),
      el("div", { class: "competence-mesure" },
        el("span", {}, c.mesure),
        el("b", {}, formatCompetence(c))));
  })));
  frag.push(el("p", { class: "note" },
    "Le niveau situe chaque compétence dans ta propre fourchette des 6 derniers mois : à droite, ton meilleur niveau de la période. "
    + "Force et discipline se mesurent face à une cible fixe (2 renforcements par semaine, 3 sorties par semaine). Les flèches montrent l'évolution sur 3 mois."));
  return frag;
}

/* ------------------------------------------------------------------ bilans */

const fmtJourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

async function sectionBilans() {
  const b = await charger("data/app/bilans.json");
  if (!b) return [el("p", { class: "note" }, "Les bilans apparaîtront après la prochaine synchro.")];
  const periode = (d, f) => `Du ${fmtJourMois.format(new Date(d))} au ${fmtJourMois.format(new Date(f))}`;
  const frag = [el("h2", {}, "Bilan du dernier bloc"), el("section", { class: "carte bilan" },
    el("p", { class: "legende sans-marge" }, periode(b.bloc.debut, b.bloc.fin)),
    el("div", { class: "stats" },
      stat("Distance", `${Math.round(b.bloc.km)} km`),
      stat("Sorties", `${b.bloc.courses}`),
      stat("Renforcement", `${b.bloc.renfo}`)),
    el("ul", { class: "points-bilan" }, b.bloc.texte.map((t) => el("li", {}, t))))];
  frag.push(el("h2", {}, "Bilans de semaine"));
  for (const s of b.semaines) {
    frag.push(el("section", { class: "carte bilan" },
      el("p", { class: "legende sans-marge" }, periode(s.debut, s.fin)),
      el("div", { class: "stats" },
        stat("Distance", `${s.km} km`),
        stat("Sorties", `${s.courses}`),
        stat("Facile", s.pct_facile != null ? `${s.pct_facile} %` : "–"),
        stat("Intenses", `${s.qualite}`),
        stat("Renfo", `${s.renfo}`),
        stat("Charge", `${s.charge}`)),
      el("ul", { class: "points-bilan" }, s.texte.map((t) => el("li", {}, t)))));
  }
  frag.push(el("p", { class: "note" }, "Ces bilans sont rédigés par des règles automatiques. Le coach les écrira lui-même dès qu'il sera branché."));
  return frag;
}
