/* Coach Perso — le chat avec le coach.
   Chaque message part dans son propre fichier du depot (data/chat/entrants), puis la tache
   GitHub "coach-chat" reveille Claude, qui lit toutes tes donnees, repond et peut modifier le plan. */
"use strict";

const FICHIER_CONVERSATION = "data/chat/conversation.json";
const WORKFLOW_CHAT = "coach-chat.yml";
const CLE_ATTENTE = "coach-perso-message-en-attente";
const SUGGESTIONS = [
  "Que penses-tu de ma dernière sortie ?",
  "Je ne peux pas courir demain, adapte ma semaine.",
  "J'ai une gêne au mollet depuis hier.",
  "Remplace la séance du jour par quelque chose de plus court.",
];
const ECRANS = { aujourdhui: "Aujourd'hui", diagnostic: "Diagnostic", seance: "une séance", plan: "Plan", objectif: "Objectif" };

let chatOuvert = null;

function enAttente() {
  try { return JSON.parse(localStorage.getItem(CLE_ATTENTE) || "null"); } catch { return null; }
}
function noterAttente(m) {
  try { m ? localStorage.setItem(CLE_ATTENTE, JSON.stringify(m)) : localStorage.removeItem(CLE_ATTENTE); } catch { /* stockage indisponible */ }
}

async function ouvrirChat() {
  if (chatOuvert) return;
  const ecranActuel = location.hash || "#/aujourdhui";
  feuille("Coach", (corps, fermer) => {
    const fil = el("div", { class: "fil", "aria-live": "polite" });
    const attente = el("div", { class: "attente-coach", hidden: true },
      el("span", { class: "points-attente", "aria-hidden": "true" }, el("i"), el("i"), el("i")),
      el("span", { class: "attente-texte" }, "Le coach lit tes données…"));
    const zone = el("textarea", { class: "saisie", rows: "1", placeholder: "Écris au coach…", "aria-label": "Message au coach", maxlength: "2000" });
    const fichier = el("input", { type: "file", accept: "image/*", hidden: true });
    const apercu = el("div", { class: "apercu-image", hidden: true });
    const envoyer = el("button", { class: "envoyer", "aria-label": "Envoyer" },
      svg('<path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', { viewBox: "0 0 24 24" }));
    const photo = el("button", { class: "joindre", "aria-label": "Joindre une capture d'écran", onclick: () => fichier.click() },
      svg('<rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6l1.5-2h5L16 6" fill="none" stroke="currentColor" stroke-width="1.8"/>', { viewBox: "0 0 24 24" }));
    const contexte = el("p", { class: "chat-contexte" }, `Le coach voit toutes tes données et l'écran ${ECRANS[ecranActuel.split("/")[1]] || "Aujourd'hui"}.`);
    let image = null;
    let messages = [];

    fichier.addEventListener("change", async () => {
      const f = fichier.files && fichier.files[0];
      fichier.value = "";
      if (!f) return;
      try {
        image = await reduireImage(f);
        apercu.replaceChildren(el("img", { src: image.url, alt: "Capture jointe" }),
          el("button", { class: "retirer-image", "aria-label": "Retirer l'image", onclick: () => { image = null; apercu.hidden = true; } }, "×"));
        apercu.hidden = false;
      } catch { toast("Cette image n'a pas pu être lue."); }
    });
    zone.addEventListener("input", () => { zone.style.height = "auto"; zone.style.height = `${Math.min(zone.scrollHeight, 140)}px`; });

    const rendre = () => {
      const enCours = enAttente();
      const liste = [...messages];
      if (enCours && !liste.some((m) => m.id === enCours.id)) liste.push({ ...enCours, role: "athlete" });
      fil.replaceChildren(...(liste.length ? liste.map(bulle) : [accueil()]));
      requestAnimationFrame(() => { fil.scrollTop = fil.scrollHeight; });
    };
    const accueil = () => el("div", { class: "chat-vide" },
      el("p", {}, "Raconte-moi ce que les données ne voient pas : une douleur, un imprévu, une semaine chargée, une course qui te tente. Je peux aussi changer la séance du jour."),
      el("div", { class: "suggestions" }, SUGGESTIONS.map((t) => el("button", { onclick: () => { zone.value = t; zone.focus(); } }, t))));

    const recharger = async () => {
      const conv = await charger(FICHIER_CONVERSATION, { frais: true });
      const locaux = messages.filter((m) => m.local);
      messages = (conv && conv.messages) || [];
      for (const l of locaux) {
        const m = messages.find((x) => x.id === l.id);
        if (m) m.apercu = l.apercu; else messages.push(l);
      }
      const enCours = enAttente();
      if (enCours && messages.some((m) => m.role === "coach" && m.en_reponse_a === enCours.id)) noterAttente(null);
      rendre();
    };

    const suivreReponse = async (id, lancer) => {
      attente.hidden = false;
      envoyer.disabled = true;
      const texte = attente.querySelector(".attente-texte");
      try {
        if (lancer) {
          await executerTache(WORKFLOW_CHAT, { message_id: id }, (etape) => { texte.textContent = etape; }, {
            pas: 2000,
            termine: async () => {
              const conv = await charger(FICHIER_CONVERSATION, { frais: true });
              return ((conv && conv.messages) || []).some((m) => m.role === "coach" && m.en_reponse_a === id);
            },
          });
        } else {
          // message envoye lors d'une ouverture precedente : on guette la reponse
          texte.textContent = "Le coach est en train de te répondre…";
          for (let i = 0; i < 120; i++) {
            await recharger();
            if (!enAttente()) break;
            await new Promise((ok) => setTimeout(ok, 5000));
          }
        }
        await recharger();
        // le coach a pu modifier le plan, l'objectif ou la seance du jour
        cache.clear();
        donnees = await chargerDonnees();
        afficher(routeActuelle());
      } catch (e) {
        noterAttente(null);
        messages.push({ id: `err-${id}`, role: "coach", erreur: true, texte: messageErreur(e) });
        rendre();
      } finally {
        attente.hidden = true;
        envoyer.disabled = false;
      }
    };

    envoyer.addEventListener("click", async () => {
      const texte = zone.value.trim();
      if (!texte && !image) return;
      if (enAttente()) return toast("Attends la réponse du coach avant d'écrire à nouveau.");
      const maintenant = new Date();
      const id = `${dateLocale(maintenant).replace(/-/g, "")}-${String(maintenant.getHours()).padStart(2, "0")}${String(maintenant.getMinutes()).padStart(2, "0")}${String(maintenant.getSeconds()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6)}`;
      const message = {
        id, texte: texte || "(capture d'écran)", date: maintenant.toISOString(),
        ecran: ecranActuel, images: [],
      };
      envoyer.disabled = true;
      try {
        if (image) {
          const chemin = `data/chat/images/${id}.jpg`;
          await ecrireFichier(chemin, { base64: image.base64 }, "Appli : capture pour le coach");
          message.images.push(chemin);
          message.apercu = image.url;
        }
        const { apercu: _, ...aEcrire } = message;
        await ecrireFichier(`data/chat/entrants/${id}.json`, aEcrire, "Appli : message au coach");
      } catch (e) {
        envoyer.disabled = false;
        return toast(messageErreur(e));
      }
      noterAttente({ id, texte: message.texte, date: message.date, images: message.images });
      if (message.apercu) messages.push({ id, role: "athlete", texte: message.texte, date: message.date, apercu: message.apercu, local: true });
      zone.value = ""; zone.style.height = "auto";
      image = null; apercu.hidden = true;
      rendre();
      suivreReponse(id, true);
    });

    corps.classList.add("corps-chat");
    corps.append(contexte, fil, attente,
      el("div", { class: "composer" }, apercu, el("div", { class: "composer-ligne" }, photo, zone, envoyer), fichier));
    chatOuvert = { fermer };
    rendre();
    recharger().then(() => { const m = enAttente(); if (m) suivreReponse(m.id, false); })
      .catch((e) => toast(messageErreur(e)));
  }, { classe: "feuille-chat" });
  // la feuille se ferme par son bouton ou un appui sur le fond : on oublie l'etat
  const obs = new MutationObserver(() => {
    if (!document.querySelector(".feuille-chat")) { chatOuvert = null; obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true });
}

function bulle(m) {
  const coach = m.role === "coach";
  const date = m.date ? new Date(m.date) : null;
  const paragraphes = String(m.texte || "").split(/\n{2,}|\n(?=[-•])/).filter(Boolean);
  return el("div", { class: `message ${coach ? "du-coach" : "de-moi"}${m.erreur ? " erreur-coach" : ""}` },
    m.apercu ? el("img", { class: "image-message", src: m.apercu, alt: "Capture envoyée" }) : null,
    !m.apercu && (m.images || []).length ? el("p", { class: "piece-jointe" }, "Capture d'écran jointe") : null,
    paragraphes.map((p) => el("p", {}, p)),
    coach && (m.actions || []).length ? el("ul", { class: "actions-coach" },
      m.actions.map((a) => el("li", {}, typeof a === "string" ? a : a.texte || ""))) : null,
    coach && (m.actions || []).length ? el("a", { class: "voir-detail", href: "#/plan" }, "Voir le plan") : null,
    date && !isNaN(date) ? el("span", { class: "heure" }, `${fmtJourMoisCourt(dateLocale(date))} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`) : null);
}

/** Reduit une capture (1600 px, JPEG) avant envoi : moins de 500 Ko au lieu de plusieurs Mo. */
async function reduireImage(f) {
  const url = URL.createObjectURL(f);
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const dataUrl = c.toDataURL("image/jpeg", 0.82);
  return { url: dataUrl, base64: dataUrl.split(",")[1] };
}
