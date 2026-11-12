/* Coach Perso — onglet Objectif : progression sans plafond, ou une course datee avec sa probabilite de reussite. */
"use strict";

const FICHIER_OBJECTIF_APP = "data/app/objectif.json";
const FICHIER_OBJECTIF = "data/profil/objectif.json";
const DISTANCES = [["5 km", 5000], ["10 km", 10000], ["Semi", 21097], ["Marathon", 42195]];
const fmtDateLongue = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function nomDistance(o) {
  return o.distance_nom || (DISTANCES.find(([, m]) => m === o.distance_m) || [])[0] || fmtKm(o.distance_m / 1000);
}

async function vueObjectif() {
  const [o, defis] = await Promise.all([charger(FICHIER_OBJECTIF_APP, { frais: true }), charger("data/app/defis.json", { frais: true })]);
  const frag = [enTete(), el("h1", {}, "Objectif")];
  if (!o) {
    frag.push(el("p", { class: "note" }, "Ton objectif sera calculé à la prochaine synchro."));
    return frag;
  }
  const parties = o.course ? vueCourse(o) : vueProgression(o);
  // les defis viennent juste apres la carte principale
  frag.push(parties[0], ...blocDefis(defis), ...parties.slice(1));

  if ((o.records || []).length) {
    frag.push(el("h2", {}, "Tes records"));
    frag.push(el("ul", { class: "records carte" }, o.records.map((r) => {
      const ancien = (r.historique || []).length > 1 ? r.historique[r.historique.length - 2] : null;
      return el("li", {}, el("a", { href: `#/seance/${r.id}` },
        el("span", { class: "record-distance" }, r.distance),
        el("span", { class: "record-temps" }, chrono(r.temps_s)),
        el("span", { class: "record-meta" }, `${fmtDateLongue.format(new Date(r.date))}${ancien ? `, ${chrono(ancien.temps_s - r.temps_s)} de mieux` : ""}`)));
    })));
    frag.push(el("p", { class: "note" }, "Meilleures portions mesurées par ta montre, sur toutes tes sorties."));
  }
  for (const p of (o.objectifs_passes || []).slice(0, 3)) {
    frag.push(el("section", { class: "carte passe" },
      el("p", { class: "sans-marge" }, el("b", {}, `${nomDistance(p.objectif || p)} du ${fmtDateLongue.format(new Date((p.objectif || p).date))}`)),
      el("p", { class: "note" }, p.resultat_s ? `Réalisé en ${chrono(p.resultat_s)} pour un objectif de ${chrono((p.objectif || p).temps_s)}.` : "Aucune course enregistrée ce jour-là.")));
  }
  return frag;
}

/* ------------------------------------------------------------------ defis et trophees */

const COULEUR_FAMILLE = { assiduite: "#0a84ff", force: "#bf5af2", endurance: "#30d158", vitesse: "#ff453a",
  economie: "#5ac8fa", parfaite: "#ffd60a" };

function blocDefis(d) {
  if (!d || !d.semaine) return [];
  const frag = [];
  const s = d.semaine;
  const reste = s.jours_restants > 1 ? `encore ${s.jours_restants} jours` : s.jours_restants === 1 ? "dernier jour demain" : "dernier jour";
  frag.push(el("section", { class: "carte semaine-defis" },
    el("div", { class: "sd-tete" },
      el("div", {},
        el("h2", { class: "sans-marge" }, "Défis de la semaine"),
        el("p", { class: "sd-dates" }, `${s.texte}, ${reste}`)),
      el("p", { class: "sd-compte" }, el("b", {}, `${d.reussis_semaine}`), `/${(d.actifs || []).length}`)),
    el("ul", { class: "defis" }, (d.actifs || []).map(carteDefi)),
    el("p", { class: "note" }, "Fixés lundi par le coach à partir de ton plan, validés uniquement par ta montre. Trois sur trois : semaine parfaite.")));

  // serie et historique
  const histo = (d.historique || []).slice().reverse();
  if (histo.length || d.serie) {
    frag.push(el("section", { class: "carte serie" },
      el("div", { class: "serie-tete" },
        el("span", { class: "serie-chiffre" }, String(d.serie || 0)),
        el("span", { class: "serie-texte" },
          el("b", {}, d.serie > 1 ? "semaines parfaites d'affilée" : d.serie === 1 ? "semaine parfaite" : "Pas de série en cours"),
          el("span", {}, d.meilleure_serie ? `Record : ${d.meilleure_serie}` : "Boucle tes trois défis pour lancer ta série."))),
      histo.length ? el("ol", { class: "semaines-passees", "aria-label": "Semaines précédentes" }, histo.map((h) =>
        el("li", { class: h.parfaite ? "parfaite" : "", title: `Semaine du ${h.texte} : ${h.reussis} sur ${h.total}` },
          el("span", { class: "points-semaine", "aria-hidden": "true" },
            [...Array(h.total)].map((_, i) => el("i", { class: i < h.reussis ? "plein" : "" }))),
          el("span", { class: "semaine-date" }, `${Number(h.lundi.slice(8))}/${h.lundi.slice(5, 7)}`)))) : null));
  }

  const trophees = d.trophees || [];
  frag.push(el("div", { class: "semaine-tete" }, el("h2", {}, "Trophées"), el("span", {}, trophees.length ? `${trophees.length}` : "")));
  if (!trophees.length) {
    frag.push(el("p", { class: "note sans-marge" }, "Chaque défi réussi devient un trophée, daté et relié à la séance qui l'a validé."));
  } else {
    frag.push(el("ul", { class: "trophees" }, trophees.slice(0, 24).map((t) => {
      const nouveau = (d.nouveaux || []).includes(t.id);
      const contenu = [
        el("span", { class: `medaille${t.type === "parfaite" ? " or" : ""}`, style: `--defi:${COULEUR_FAMILLE[t.famille] || "#ffd60a"}`, "aria-hidden": "true" },
          svg('<path d="M8 2h8l-2 6h-4z" fill="currentColor" opacity=".55"/><circle cx="12" cy="15" r="6.5" fill="currentColor"/><path d="M12 11.6l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#000" opacity=".45"/>', { viewBox: "0 0 24 24" })),
        el("span", { class: "trophee-titre" }, t.titre),
        el("span", { class: "trophee-meta" }, [t.resultat, t.date_texte].filter(Boolean).join(", ")),
        nouveau ? el("span", { class: "etiquette ok" }, "Nouveau") : null,
      ];
      return el("li", { class: nouveau ? "nouveau" : "" }, t.seance_id ? el("a", { href: `#/seance/${t.seance_id}` }, contenu) : el("div", {}, contenu));
    })));
  }
  return frag;
}

function carteDefi(x) {
  const couleur = COULEUR_FAMILLE[x.famille] || "#0a84ff";
  const reussi = x.statut === "reussi";
  return el("li", { class: `defi${reussi ? " reussi" : ""}`, style: `--defi:${couleur}` },
    el("button", { class: "defi-tete", "aria-expanded": "false", onclick: (e) => {
      const ouvert = e.currentTarget.parentElement.classList.toggle("ouvert");
      e.currentTarget.setAttribute("aria-expanded", String(ouvert));
    } },
      el("span", { class: "defi-coche", "aria-hidden": "true" }, reussi ? "✓" : ""),
      el("span", { class: "defi-titre" }, x.titre),
      el("span", { class: "defi-valeur" }, reussi ? "Réussi" : x.valeur_texte || "–")),
    el("div", { class: "jauge defi-jauge", role: "progressbar", "aria-label": x.titre, "aria-valuenow": String(x.progression || 0), "aria-valuemin": "0", "aria-valuemax": "100" },
      el("span", { style: `width:${Math.max(2, x.progression || 0)}%;background:${couleur}` })),
    el("p", { class: "defi-description" }, x.description,
      reussi && x.valeur_texte ? el("span", { class: "defi-echeance" }, ` Ton résultat : ${x.valeur_texte}.`) : null));
}

/* ------------------------------------------------------------------ mode progression */

function vueProgression(o) {
  const frag = [];
  frag.push(el("section", { class: "carte heros-progression" },
    el("p", { class: "recommandation-libelle vert" }, "Progression sans plafond"),
    el("p", { class: "heros-chiffre" }, `${o.gain_hebdo_pct > 0 ? "+" : ""}${String(o.gain_hebdo_pct).replace(".", ",")} %`),
    el("p", { class: "sans-marge" }, "de vitesse gagnée par semaine en moyenne, sur tes 8 dernières semaines."),
    el("p", { class: "note" }, "Sans course en vue, le plan vise des paliers : chaque fois que tu en franchis un, le suivant se fixe tout seul.")));
  if ((o.paliers || []).length) {
    frag.push(el("h2", {}, "Prochains paliers"));
    frag.push(el("ul", { class: "paliers carte" }, o.paliers.map((p) =>
      el("li", {},
        el("span", { class: "palier-distance" }, p.distance),
        el("span", { class: "palier-chiffres" },
          el("span", { class: "palier-actuel" }, chrono(p.estime_s)),
          el("span", { class: "fleche", "aria-hidden": "true" }, " ▸ "),
          el("b", {}, chrono(p.palier_s))),
        el("span", { class: "palier-delai" }, `dans ${p.semaines} semaine${p.semaines > 1 ? "s" : ""}`)))));
    frag.push(el("p", { class: "note" }, "À gauche, ton niveau estimé aujourd'hui. À droite, le palier visé et le temps qu'il faut à ton rythme de progression."));
  }
  frag.push(el("button", { class: "bouton", onclick: () => formulaireObjectif(null) }, "Fixer un objectif de course"));
  return frag;
}

/* ------------------------------------------------------------------ mode course */

function couleurProba(p) {
  return p >= 70 ? "var(--vert)" : p >= 40 ? "var(--orange)" : "var(--rouge)";
}

function anneau(p) {
  const r = 52, c = 2 * Math.PI * r;
  const n = svg(`<circle cx="60" cy="60" r="${r}" fill="none" stroke="#2a2a30" stroke-width="10"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 60 60)"/>`,
  { viewBox: "0 0 120 120", class: "anneau", "aria-hidden": "true" });
  return n;
}

function vueCourse(o) {
  const c = o.course;
  const obj = c.objectif;
  const frag = [];
  const p = c.probabilite;
  frag.push(el("section", { class: "carte heros-course", style: `--proba:${couleurProba(p)}` },
    el("div", { class: "heros-course-texte" },
      el("p", { class: "course-nom" }, obj.nom || nomDistance(obj)),
      el("p", { class: "course-cible" }, `${nomDistance(obj)} en ${chrono(obj.temps_s)}`),
      el("p", { class: "course-date" }, `${fmtDateLongue.format(new Date(obj.date))}, dans ${c.jours_restants} jours`)),
    el("div", { class: "proba" }, anneau(p),
      el("div", { class: "proba-texte" }, el("b", {}, `${p} %`), el("span", {}, "de chances")))));

  const ecart = c.ecart_s;
  frag.push(el("section", { class: "carte" },
    el("div", { class: "stats" },
      stat("Niveau actuel", chrono(c.estime_s)),
      stat("Projeté le jour J", chrono(c.projete_s)),
      stat("Écart", ecart > 0 ? `+${chrono(ecart)}` : `−${chrono(-ecart)}`)),
    el("p", { class: "note" }, ecart > 0
      ? `À ton rythme de progression actuel, il te manquerait ${enMinutesTexte(ecart)} le jour J. Le plan est construit pour combler cet écart.`
      : `À ton rythme actuel, tu passerais sous l'objectif avec ${enMinutesTexte(-ecart)} de marge.`)));

  if (c.proposition) {
    frag.push(el("section", { class: "mot-coach" }, el("p", { class: "mot-coach-qui" }, "Le coach"), el("p", { class: "sans-marge" }, c.proposition)));
  }

  if ((c.historique || []).length > 1) {
    frag.push(el("h2", {}, "Évolution de tes chances"));
    frag.push(el("section", { class: "carte" }, miniCourbe(c.historique.map((h) => ({ date: h.date, v: h.probabilite })), couleurProba(p),
      { format: (v) => `${Math.round(v)} %`, pasDates: 2 })));
  }

  if ((c.phases || []).length) {
    frag.push(el("h2", {}, "Les étapes jusqu'à la course"));
    frag.push(el("ol", { class: "phases carte" }, c.phases.map((ph) => {
      const cle = ph.nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const actuelle = cle === c.phase_actuelle || (cle === "course" && c.phase_actuelle === "course");
      return el("li", { class: actuelle ? "actuelle" : "" },
        el("span", { class: "phase-nom" }, ph.nom, actuelle ? el("span", { class: "etiquette ok" }, "En cours") : null),
        el("span", { class: "phase-dates" }, ph.debut ? `Du ${fmtJourMois.format(new Date(ph.debut))} au ${fmtJourMois.format(new Date(ph.fin))}` : `Jusqu'au ${fmtJourMois.format(new Date(ph.fin))}`),
        el("span", { class: "phase-texte" }, ph.texte));
    })));
  }

  if ((c.allures_cibles || []).length) {
    frag.push(el("h2", {}, "Allures de l'objectif"));
    frag.push(el("section", { class: "carte allures" }, c.allures_cibles.filter((a) => a.allure_s).map((a) =>
      el("div", { class: "allure-ligne" }, el("span", {}, a.nom), el("b", {}, `${enMinutes(a.allure_s)}/km`)))));
  }

  frag.push(el("button", { class: "bouton discret", onclick: () => formulaireObjectif(obj) }, "Modifier l'objectif"));
  frag.push(el("button", { class: "bouton discret danger", onclick: async (e) => {
    if (!confirmerDansBouton(e.currentTarget, "Appuie encore pour supprimer l'objectif")) return;
    try {
      await supprimerFichier(FICHIER_OBJECTIF, "Appli : objectif supprime");
      lancerSynchro("Retour à la progression libre");
    } catch (err) { toast(messageErreur(err)); }
  } }, "Supprimer l'objectif"));
  return frag;
}

/** Double appui pour les actions destructrices, sans boite de dialogue du navigateur. */
function confirmerDansBouton(bouton, texte) {
  if (bouton.dataset.arme) return true;
  bouton.dataset.arme = "1";
  const ancien = bouton.textContent;
  bouton.textContent = texte;
  setTimeout(() => { delete bouton.dataset.arme; bouton.textContent = ancien; }, 4000);
  return false;
}

function enMinutesTexte(s) {
  s = Math.round(Math.abs(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ` ${String(r).padStart(2, "0")} s` : ""}` : `${r} s`;
}

/* ------------------------------------------------------------------ formulaire */

function formulaireObjectif(actuel) {
  const v = actuel ? { ...actuel } : { distance_m: 21097, distance_nom: "Semi", temps_s: null, date: "", nom: "" };
  feuille(actuel ? "Modifier l'objectif" : "Nouvel objectif", (corps, fermer) => {
    const autre = el("input", { type: "number", class: "champ-court etroit", min: "1", max: "200", step: "0.1", placeholder: "km",
      "aria-label": "Distance en kilomètres", value: DISTANCES.some(([, m]) => m === v.distance_m) ? "" : String(v.distance_m / 1000) });
    const segments = el("div", { class: "segments larges", role: "radiogroup", "aria-label": "Distance" });
    const options = [...DISTANCES, ["Autre", 0]];
    const choisir = (nom, m) => {
      segments.querySelectorAll("button").forEach((b) => b.classList.toggle("actif", b.dataset.nom === nom));
      autre.hidden = nom !== "Autre";
      if (nom !== "Autre") { v.distance_m = m; v.distance_nom = nom; } else { v.distance_nom = null; }
    };
    for (const [nom, m] of options) segments.append(el("button", { "data-nom": nom, onclick: () => choisir(nom, m) }, nom));

    const h = el("input", { type: "number", class: "champ-court etroit", min: "0", max: "9", inputmode: "numeric", "aria-label": "Heures" });
    const mi = el("input", { type: "number", class: "champ-court etroit", min: "0", max: "59", inputmode: "numeric", "aria-label": "Minutes" });
    const se = el("input", { type: "number", class: "champ-court etroit", min: "0", max: "59", inputmode: "numeric", "aria-label": "Secondes" });
    if (v.temps_s) { h.value = Math.floor(v.temps_s / 3600); mi.value = Math.floor((v.temps_s % 3600) / 60); se.value = v.temps_s % 60; }
    const date = el("input", { type: "date", class: "champ", min: dateLocale(plusJours(new Date(), 7)), value: v.date || "" });
    const nom = el("input", { type: "text", class: "champ", maxlength: "60", placeholder: "Nom de la course (facultatif)", value: v.nom || "" });
    const erreur = el("p", { class: "erreur", role: "alert" });

    corps.append(
      el("h3", { class: "form-titre" }, "Distance"), segments, el("div", { class: "form-ligne seule" }, autre),
      el("h3", { class: "form-titre" }, "Temps visé"),
      el("div", { class: "temps-saisie" }, h, el("span", {}, "h"), mi, el("span", {}, "min"), se, el("span", {}, "s")),
      el("h3", { class: "form-titre" }, "Date de la course"), date,
      el("h3", { class: "form-titre" }, "Nom"), nom,
      erreur,
      el("button", { class: "bouton", onclick: async (e) => {
        if (v.distance_nom === null) {
          const k = Number(String(autre.value).replace(",", "."));
          if (!k) return (erreur.textContent = "Indique la distance en kilomètres.");
          v.distance_m = Math.round(k * 1000);
          v.distance_nom = `${String(k).replace(".", ",")} km`;
        }
        const t = (Number(h.value) || 0) * 3600 + (Number(mi.value) || 0) * 60 + (Number(se.value) || 0);
        if (!t) return (erreur.textContent = "Indique le temps que tu vises.");
        const allureS = t / (v.distance_m / 1000);
        if (allureS < 150 || allureS > 600) return (erreur.textContent = `Cela ferait ${enMinutes(allureS)}/km : vérifie le temps.`);
        if (!date.value) return (erreur.textContent = "Indique la date de la course.");
        const objectif = { distance_m: v.distance_m, distance_nom: v.distance_nom, temps_s: t, date: date.value,
          nom: nom.value.trim() || null, cree_le: (actuel && actuel.cree_le) || dateLocale(new Date()) };
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = "Enregistrement…";
        try {
          await ecrireFichier(FICHIER_OBJECTIF, objectif, "Appli : objectif de course");
          fermer();
          lancerSynchro("Calcul de ton objectif");
        } catch (err) {
          erreur.textContent = messageErreur(err);
          e.currentTarget.disabled = false;
          e.currentTarget.textContent = "Enregistrer et recalculer le plan";
        }
      } }, "Enregistrer et recalculer le plan"),
      el("p", { class: "note" }, "Le coach calcule tes chances de réussite et réorganise tout le plan autour de cette course."));
    const initial = DISTANCES.find(([, m]) => m === v.distance_m);
    choisir(initial ? initial[0] : "Autre", v.distance_m);
  });
}
