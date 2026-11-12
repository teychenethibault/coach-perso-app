/* Coach Perso — onglet Plan : la semaine en cours, la suivante, les ajustements et tes contraintes. */
"use strict";

const FICHIER_PLAN = "data/plan/plan.json";
const FICHIER_CONTRAINTES = "data/profil/contraintes.json";

const COULEUR_TYPE = {
  repos: "#48484f", recuperation: "#5ac8fa", endurance: "#0a84ff", longue: "#0a84ff",
  tempo: "#ff9f0a", seuil: "#ff9f0a", specifique: "#ff9f0a", cotes: "#ff453a", vma: "#ff453a",
  renfo: "#bf5af2", course: "#ffd60a",
};
const NOM_TYPE = {
  repos: "Repos", recuperation: "Récupération", endurance: "Endurance", longue: "Sortie longue", tempo: "Tempo",
  seuil: "Seuil", specifique: "Allure objectif", cotes: "Côtes", vma: "VMA", renfo: "Renforcement", course: "Course",
};
const STATUT = {
  realisee: ["Fait", "ok"], differente: ["Différent", "ecart"], manquee: ["Manqué", "manque"],
};
const PHASES = { developpement: "Développement", specifique: "Spécifique", affutage: "Affûtage", course: "Semaine de course" };
const THEMES = { endurance: "endurance", vitesse: "vitesse", seuil: "seuil", force: "force", resistance: "résistance" };
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const dateIso = (iso) => new Date(`${iso}T12:00:00`);
const lundiDe = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const plusJours = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

async function vuePlan() {
  const [plan, seances] = await Promise.all([charger(FICHIER_PLAN, { frais: true }), charger("data/app/seances.json")]);
  const frag = [enTete(), el("h1", {}, "Plan")];
  if (!plan || !plan.jours) {
    frag.push(el("section", { class: "carte" },
      el("p", { class: "sans-marge" }, "Ton plan sera calculé à la prochaine synchro."),
      el("button", { class: "bouton", onclick: () => lancerSynchro("Calcul du plan") }, "Calculer mon plan maintenant")));
    return frag;
  }
  const aujourdhui = dateLocale(new Date());
  const lundi = lundiDe(dateIso(aujourdhui));
  const parJour = new Map(plan.jours.map((j) => [j.date, j]));
  const faites = new Map();
  for (const s of seances || []) {
    const d = s.date.slice(0, 10);
    if (!faites.has(d)) faites.set(d, []);
    faites.get(d).push(s);
  }

  // contexte du bloc
  const sem = (plan.semaines || {})[dateLocale(lundi)] || {};
  const contexte = [];
  if (sem.phase) contexte.push(`Phase ${PHASES[sem.phase] || sem.phase}`);
  if (sem.semaine_bloc) contexte.push(`semaine ${sem.semaine_bloc} sur 4 du bloc${plan.bloc && THEMES[plan.bloc.theme] ? ` ${THEMES[plan.bloc.theme]}` : ""}`);
  if (sem.tournage) contexte.push("semaine de tournage");
  if (contexte.length) frag.push(el("p", { class: "plan-contexte" }, majuscule(contexte.join(", ")) + "."));

  if (plan.message_coach && plan.message_coach.texte) {
    frag.push(el("section", { class: "mot-coach" },
      el("p", { class: "mot-coach-qui" }, "Le coach"),
      el("p", { class: "sans-marge" }, plan.message_coach.texte)));
  }

  for (const [k, titre] of [[0, "Cette semaine"], [1, "Semaine prochaine"]]) {
    const debut = plusJours(lundi, 7 * k);
    const jours = [...Array(7)].map((_, i) => dateLocale(plusJours(debut, i)));
    const prevus = jours.map((d) => parJour.get(d)).filter(Boolean);
    const kmPrevus = prevus.filter((j) => j.date >= aujourdhui).reduce((t, j) => t + (j.distance_km || 0), 0);
    const kmFaits = jours.filter((d) => d <= aujourdhui)
      .flatMap((d) => faites.get(d) || []).filter((s) => EST_COURSE(s.type)).reduce((t, s) => t + (s.distance_m || 0) / 1000, 0);
    const bilan = k === 0
      ? `${fmtKm(kmFaits)} faits${kmPrevus ? `, ${fmtKm(kmPrevus)} à venir` : ""}`
      : `${fmtKm(kmPrevus)} prévus`;
    frag.push(el("div", { class: "semaine-tete" }, el("h2", {}, titre), el("span", {}, bilan)));
    frag.push(el("ol", { class: "semaine" }, jours.map((d) => ligneJour(d, parJour.get(d), faites.get(d) || [], aujourdhui))));
  }

  frag.push(el("button", { class: "bouton discret", onclick: () => ouvrirContraintes() }, "Mes disponibilités et contraintes"));

  const changements = (plan.changements || []).slice(0, 8);
  if (changements.length) {
    frag.push(el("h2", {}, "Ajustements récents"));
    frag.push(el("ul", { class: "changements carte" }, changements.map((c) =>
      el("li", {}, el("span", { class: "changement-date" }, fmtJourMoisCourt(c.date)), el("span", {}, c.texte)))));
  }
  const r = plan.reperes || {};
  if (r.allures) {
    frag.push(el("h2", {}, "Tes allures de travail"));
    const noms = [["endurance", "Endurance"], ["marathon", "Marathon"], ["semi", "Semi"], ["seuil", "Seuil"], ["10 km", "10 km"], ["5 km", "5 km"], ["vma", "VMA"]];
    frag.push(el("section", { class: "carte allures" }, noms.filter(([c]) => r.allures[c]).map(([c, n]) =>
      el("div", { class: "allure-ligne" }, el("span", {}, n), el("b", {}, `${enMinutes(r.allures[c])}/km`))),
    el("p", { class: "note" }, "Calculées depuis tes meilleures performances récentes, elles se mettent à jour à chaque synchro.")));
  }
  return frag;
}

const fmtJourMoisCourt = (iso) => {
  if (!iso) return "";
  const d = dateIso(iso.slice(0, 10));
  return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function ligneJour(date, j, faites, aujourdhui) {
  const d = dateIso(date);
  const estAujourdhui = date === aujourdhui;
  const passe = date < aujourdhui;
  const courses = faites.filter((s) => EST_COURSE(s.type));
  const statut = j && j.suivi && j.suivi.statut !== "hors_plan" && STATUT[j.suivi.statut];
  const type = j ? j.type : (courses.length ? "hors" : null);
  const couleur = j ? COULEUR_TYPE[j.type] || "#636369" : "#2a2a30";

  const libre = (!j || j.type === "repos") && courses.length; // couru un jour sans seance prevue
  const titre = libre ? "Sortie libre"
    : j ? j.titre.replace(/\s*\(revu\)\s*$/, "") : (faites.length ? NOMS_TYPES[faites[0].type] || "Activité" : "Aucune activité");
  const chiffres = !j || j.type === "repos" ? ""
    : j.type === "renfo" ? majuscule(String((j.structure || [])[0] || "").replace(/^Matériel : /, ""))
    : [j.distance_km ? fmtKm(j.distance_km) : null, j.fc ? `FC ${j.fc}` : j.allure ? `${j.allure}` : null].filter(Boolean).join(", ");
  const fait = faites.length
    ? faites.map((s) => EST_COURSE(s.type) ? `${fmtKm((s.distance_m || 0) / 1000)} en ${Math.round((s.duree_s || 0) / 60)} min` : (NOMS_TYPES[s.type] || "Activité")).join(", ")
    : "";

  const details = el("div", { class: "jour-details" });
  if (j) {
    if (j.objectif && !libre) details.append(el("p", { class: "jour-objectif" }, j.objectif));
    if (j.structure && j.structure.length) details.append(el("ol", { class: "structure" }, j.structure.map((x) => el("li", {}, x))));
    const cibles = [j.fc ? `FC ${j.fc}` : null, j.allure ? `allure ${j.allure}` : null].filter(Boolean);
    if (cibles.length) details.append(el("p", { class: "jour-cibles" }, majuscule(cibles.join(", "))));
    if (j.complement) details.append(el("p", { class: "complement" }, el("b", {}, "En plus : "), j.complement.titre,
      j.complement.structure ? el("ol", { class: "structure" }, j.complement.structure.map((x) => el("li", {}, x))) : null));
    if (j.suivi && j.suivi.ecart) details.append(el("p", { class: "jour-ecart" }, j.suivi.ecart));
    if (j.modifie && j.modifie.par && j.modifie.par !== "revue" && j.modifie.raison)
      details.append(el("p", { class: "jour-modifie" }, `${j.modifie.par === "athlete" ? "Changé à ta demande" : "Changé par le coach"} : ${j.modifie.raison}`));
    if (j.ajuste_recup) details.append(el("p", { class: "jour-modifie" }, `Allégé selon ta récupération : ${j.ajuste_recup}`));
  }
  for (const s of faites) {
    details.append(el("a", { class: "jour-fait", href: `#/seance/${s.id}` },
      el("i", { class: `pastille ${s.tonalite || ""}`, "aria-hidden": "true" }),
      el("span", {}, s.verdict || s.nom || "Voir la séance"), el("span", { class: "chevron" }, "›")));
  }
  const ouvrable = details.childNodes.length > 0;

  const ligne = el("li", { class: `jour${estAujourdhui ? " aujourdhui" : ""}${passe ? " passe" : ""}${!j ? " vide" : ""}` },
    el("button", { class: "jour-tete", "aria-expanded": estAujourdhui && ouvrable ? "true" : "false", disabled: !ouvrable,
      onclick: (e) => {
        const li = e.currentTarget.parentElement;
        const ouvert = li.classList.toggle("ouvert");
        e.currentTarget.setAttribute("aria-expanded", String(ouvert));
      } },
      el("span", { class: "jour-date" },
        el("span", { class: "jour-nom" }, estAujourdhui ? "auj." : JOURS_COURTS[d.getDay()]),
        el("span", { class: "jour-num" }, String(d.getDate()))),
      el("span", { class: "jour-repere", style: `background:${couleur}`, "aria-hidden": "true" }),
      el("span", { class: "jour-texte" },
        el("span", { class: "jour-titre" }, titre),
        el("span", { class: "jour-meta" }, passe || (estAujourdhui && faites.length) ? (fait || (j && j.type !== "repos" ? "Rien d'enregistré" : "")) : chiffres)),
      statut ? el("span", { class: `etiquette ${statut[1]}` }, statut[0]) : null),
    details);
  if (estAujourdhui && ouvrable) ligne.classList.add("ouvert");
  void type;
  return ligne;
}

/* ------------------------------------------------------------------ contraintes */

async function ouvrirContraintes() {
  let c;
  try { c = (await charger(FICHIER_CONTRAINTES, { frais: true })) || {}; } catch { c = {}; }
  const v = {
    seances_semaine: c.seances_semaine ?? 4, seances_tournage: c.seances_tournage ?? 3, renfo_semaine: c.renfo_semaine ?? 2,
    materiel_renfo: c.materiel_renfo || "poids du corps", jours_preferes_longue: c.jours_preferes_longue || "dimanche",
    indisponibilites: [...(c.indisponibilites || [])], tournages: [...(c.tournages || [])],
    douleurs: (c.douleurs || []).map((x) => ({ ...x })),
  };
  const aujourdhui = dateLocale(new Date());

  feuille("Disponibilités et contraintes", (corps, fermer) => {
    const rendre = () => {
      corps.replaceChildren(
        el("p", { class: "note sans-marge" }, "Le plan se recalcule dès que tu enregistres. Tu peux aussi tout dire au coach dans le chat."),
        el("h3", { class: "form-titre" }, "Semaine type"),
        el("div", { class: "carte form" },
          compteur("Sorties de course", v.seances_semaine, 2, 7, (n) => { v.seances_semaine = n; }),
          compteur("Sorties en semaine de tournage", v.seances_tournage, 1, 6, (n) => { v.seances_tournage = n; }),
          compteur("Renforcements", v.renfo_semaine, 0, 4, (n) => { v.renfo_semaine = n; }),
          choix("Matériel de renfo", v.materiel_renfo, [["poids du corps", "Poids du corps"], ["salle", "Salle"]], (x) => { v.materiel_renfo = x; }),
          choix("Sortie longue le", v.jours_preferes_longue, [["samedi", "Samedi"], ["dimanche", "Dimanche"]], (x) => { v.jours_preferes_longue = x; })),

        el("h3", { class: "form-titre" }, "Jours sans course"),
        el("div", { class: "carte form" },
          v.indisponibilites.filter((d) => d >= aujourdhui).sort().map((d) => elementListe(fmtJourLong(d), () => {
            v.indisponibilites = v.indisponibilites.filter((x) => x !== d); rendre();
          })),
          ajoutDate("Ajouter un jour", (d) => { if (!v.indisponibilites.includes(d)) v.indisponibilites.push(d); rendre(); })),

        el("h3", { class: "form-titre" }, "Semaines de tournage"),
        el("div", { class: "carte form" },
          v.tournages.filter((t) => t.fin >= aujourdhui).map((t) => elementListe(`Du ${fmtJourLong(t.debut)} au ${fmtJourLong(t.fin)}`, () => {
            v.tournages = v.tournages.filter((x) => x !== t); rendre();
          })),
          ajoutPeriode((debut, fin) => { v.tournages.push({ debut, fin }); rendre(); })),

        el("h3", { class: "form-titre" }, "Douleurs"),
        el("div", { class: "carte form" },
          v.douleurs.filter((d) => d.active !== false).map((d) => elementListe(
            `${majuscule(d.zone)}${d.intensite ? `, ${d.intensite}/10` : ""}, depuis le ${fmtJourLong(d.depuis)}`,
            () => { d.active = false; d.levee = aujourdhui; rendre(); }, "Guérie")),
          ajoutDouleur((zone, intensite) => { v.douleurs.push({ zone, intensite, depuis: aujourdhui, active: true }); rendre(); }),
          el("p", { class: "note" }, "Tant qu'une douleur est active, le plan ne prévoit aucune séance intense.")),

        el("button", { class: "bouton", onclick: async (e) => {
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = "Enregistrement…";
          try {
            await ecrireFichier(FICHIER_CONTRAINTES, { ...c, ...v }, "Appli : contraintes modifiees");
            fermer();
            lancerSynchro("Recalcul du plan");
          } catch (err) {
            toast(messageErreur(err));
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = "Enregistrer et recalculer le plan";
          }
        } }, "Enregistrer et recalculer le plan"));
    };
    rendre();
  });
}

const fmtJourLong = (iso) => {
  const d = dateIso(iso);
  return `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(d)}`;
};

function compteur(libelle, valeur, min, max, changer) {
  const chiffre = el("b", { class: "compteur-valeur" }, String(valeur));
  const maj = (delta) => {
    valeur = Math.min(max, Math.max(min, valeur + delta));
    chiffre.textContent = String(valeur);
    changer(valeur);
  };
  return el("div", { class: "form-ligne" }, el("span", {}, libelle),
    el("span", { class: "compteur" },
      el("button", { "aria-label": `Moins de ${libelle.toLowerCase()}`, onclick: () => maj(-1) }, "−"), chiffre,
      el("button", { "aria-label": `Plus de ${libelle.toLowerCase()}`, onclick: () => maj(1) }, "+")));
}

function choix(libelle, valeur, options, changer) {
  const groupe = el("span", { class: "segments", role: "radiogroup", "aria-label": libelle });
  for (const [v, nom] of options) {
    groupe.append(el("button", { role: "radio", "aria-checked": String(v === valeur), class: v === valeur ? "actif" : "",
      onclick: (e) => {
        groupe.querySelectorAll("button").forEach((b) => { b.classList.remove("actif"); b.setAttribute("aria-checked", "false"); });
        e.currentTarget.classList.add("actif"); e.currentTarget.setAttribute("aria-checked", "true");
        changer(v);
      } }, nom));
  }
  return el("div", { class: "form-ligne" }, el("span", {}, libelle), groupe);
}

function elementListe(texte, retirer, libelleRetirer = "Retirer") {
  return el("div", { class: "form-ligne" }, el("span", {}, majuscule(texte)),
    el("button", { class: "lien-action", onclick: retirer }, libelleRetirer));
}

function ajoutDate(libelle, ajouter) {
  const champ = el("input", { type: "date", class: "champ-court", min: dateLocale(new Date()), "aria-label": libelle });
  return el("div", { class: "form-ligne" }, champ,
    el("button", { class: "lien-action", onclick: () => champ.value && ajouter(champ.value) }, "Ajouter"));
}

function ajoutPeriode(ajouter) {
  const debut = el("input", { type: "date", class: "champ-court", min: dateLocale(new Date()), "aria-label": "Début du tournage" });
  const fin = el("input", { type: "date", class: "champ-court", min: dateLocale(new Date()), "aria-label": "Fin du tournage" });
  return el("div", { class: "form-ligne periode" }, debut, el("span", { class: "note sans-marge" }, "au"), fin,
    el("button", { class: "lien-action", onclick: () => {
      if (!debut.value || !fin.value) return toast("Choisis le premier et le dernier jour.");
      if (fin.value < debut.value) return toast("La fin est avant le début.");
      ajouter(debut.value, fin.value);
    } }, "Ajouter"));
}

function ajoutDouleur(ajouter) {
  const zone = el("input", { type: "text", class: "champ-court large", placeholder: "Zone (ex. mollet gauche)", maxlength: "60" });
  const intensite = el("input", { type: "number", class: "champ-court etroit", min: "1", max: "10", placeholder: "/10", "aria-label": "Intensité sur 10" });
  return el("div", { class: "form-ligne" }, zone, intensite,
    el("button", { class: "lien-action", onclick: () => {
      if (!zone.value.trim()) return toast("Indique où tu as mal.");
      ajouter(zone.value.trim(), intensite.value ? Math.min(10, Math.max(1, Number(intensite.value))) : null);
    } }, "Ajouter"));
}
