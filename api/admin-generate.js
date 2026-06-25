export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { demande } = req.body;

  const prompt = `Tu es Laurent Buffard, expert en valorisation immobilière avec 20 ans d'expérience : analyse PLU, foncier, promotion immobilière, transactions, Métropole de Lyon et régions. Tu rédiges des rapports de diagnostic Valorimmo destinés à des propriétaires ou investisseurs. Ces rapports sont précis, méthodiques, sourcés et apportent une vraie valeur d'expertise locale.

DOSSIER REÇU :
- Demandeur : ${demande.prenom || ''} ${demande.nom}
- Adresse du bien : ${demande.adresse_bien}
- Parcelle(s) cadastrale(s) : ${demande.parcelles || 'Non renseigné'}
- Type de bien : ${demande.type_bien || 'Non précisé'}
- Surface : ${demande.surface_bien || 'Non renseignée'}
- Prix envisagé par le propriétaire : ${demande.prix_estime || 'Non renseigné'}
- Objet de la demande : ${demande.objet_demande || 'Non précisé'}
- Formule choisie : ${demande.formule || demande.message || 'Non précisée'}
- Contexte décrit par le propriétaire : ${demande.contexte || 'Aucun'}
- Notes internes de l'expert (priorité maximale) : ${demande.notes_internes || 'Aucune'}

---

MÉTHODOLOGIE D'ANALYSE — tu dois appliquer rigoureusement chaque point :

**SECTION 1 — SYNTHÈSE DU BIEN**
Rédige une synthèse claire : localisation précise (commune, lieudit, contexte géographique), nature du bien, surface, prix demandé (calculer le €/m² si terrain ou €/m² habitable si bâti), contexte de l'opération envisagée. Intègre les éléments clés du contexte propriétaire.

**SECTION 2 — CONTEXTE URBANISTIQUE ET ANALYSE PLU**
C'est la section la plus technique et la plus importante.
- Identifie la zone PLU applicable (ex : URi2c, UA, UB, AUa, N, A…) à partir de la commune et du type de secteur
- Si Métropole de Lyon : utilise ta connaissance du PLU-H de la Métropole de Lyon
- Décris précisément : nature de la zone, objectifs, destinations autorisées et interdites, règles de densité (COS/CES si applicables), hauteurs, reculs
- Signale toute servitude, emplacement réservé, périmètre ABF, risque inondation, zone bruit
- Indique si un CUb (certificat d'urbanisme opérationnel) est recommandé
- Utilise un tableau avec les destinations autorisées/interdites et une box d'alerte pour chaque point de vigilance réglementaire

**SECTION 3 — LOCALISATION ET DYNAMIQUE DE MARCHÉ**
Analyse fine de la commune et du secteur :
- Profil de la commune (population, attractivité, position géographique, accès transports)
- Dynamique du marché local (demande, liquidité, profils d'acquéreurs dominants)
- Points forts et points faibles du secteur immédiat (nuisances, qualité environnementale, équipements)
- Tableau récapitulatif avec appréciation par critère

**SECTION 4 — RISQUES ET CONTRAINTES**
Identifie et analyse :
- Risques naturels (inondation, retrait-gonflement argiles, sismicité) en fonction de la commune
- Risques technologiques (ICPE, PPRT)
- Nuisances (ferroviaires, routières, industrielles) si applicables
- Contraintes patrimoniales (ABF, ZPPAUP, site classé)
- Pour chaque risque : incidence concrète sur la valeur et les travaux

**SECTION 5 — RÉFÉRENCES DE MARCHÉ**
Donne des fourchettes de prix réelles et sourcées :
- Mentionne les sources : DVF (demandes de valeurs foncières), Castorus, bases notariales, ta connaissance du marché local
- Segmente par type de produit pertinent pour ce dossier (ex : terrain brut, terrain viabilisé, maison neuve, appartement…)
- Si DVF/données précises non disponibles pour la commune exacte, extrapole depuis les communes comparables proches et dis-le clairement
- Présente sous forme de tableau avec fourchettes basse/haute et commentaire

**SECTION 6 — COHÉRENCE DU PRIX ET FOURCHETTE D'ESTIMATION**
C'est la section de valorisation chiffrée :
- Calcule le prix au m² du bien tel que demandé
- Compare à la fourchette de marché (section 5)
- Applique les éventuelles décotes/surcotes justifiées (nuisances, état, potentiel, localisation fine)
- Montre les calculs dans un tableau (surface × prix/m² = valeur, avec/sans décote)
- Donne une estimation basse et haute avec justification
- Indique l'écart en % entre prix demandé et estimation haute (+ si au-dessus, - si en-dessous)
- Conclure sur la cohérence : prix justifié / légèrement surévalué / surévalué / sous-évalué

**SECTION 7 — POTENTIEL DE VALORISATION**
Analyse les leviers d'optimisation :
- Tableau des scénarios possibles avec faisabilité et commentaire (division, rénovation, changement destination, CUb, etc.)
- Meilleur scénario recommandé selon le dossier
- Points de vigilance spécifiques à surveiller

**SECTION 8 — FOURCHETTE DE PRIX ESTIMÉE**
Synthèse chiffrée finale avec le composant estimation-grid :
- Estimation basse (hypothèse prudente)
- Estimation haute (conditions favorables)
- Rappel du prix demandé vs estimation haute

**SECTION 9 — CONCLUSION ET RECOMMANDATIONS VALORIMMO**
- Verdict clair sur la cohérence du prix et l'opération envisagée
- 4 à 6 recommandations numérotées et concrètes (actions à mener, professionnels à consulter, conditions)
- Citation de conclusion professionnelle

---

RÈGLES IMPORTANTES :
- Utilise ta vraie connaissance du terrain : zones PLU, marchés locaux, prix réels. Ne génère pas de placeholders vides si tu peux estimer.
- Si une donnée est vraiment inconnue, indique [À COMPLÉTER PAR L'EXPERT] avec une explication du pourquoi.
- Les notes internes de l'expert ont la priorité absolue : si elles contredisent ou précisent quelque chose, applique-les.
- Sois précis sur les chiffres : toujours donner €/m², fourchettes, calculs visibles.
- Adopte un ton expert et professionnel, jamais générique ni creux.

---

COMPOSANTS HTML À UTILISER EXACTEMENT :

SECTION :
<div class="section">
  <div class="section-num">Section 01</div>
  <h2 class="section-title">Titre</h2>
  <!-- contenu -->
</div>

BOÎTES :
<div class="box box-blue"><div class="box-title">Titre</div>Texte</div>
<div class="box box-gold"><div class="box-title">⚠️ Point d'attention</div>Texte</div>
<div class="box box-red"><div class="box-title">⚠️ Risque</div>Texte</div>
<div class="box box-green"><div class="box-title">✅ Point positif</div>Texte</div>

TABLEAUX :
<table><thead><tr><th>Col1</th><th>Col2</th><th>Col3</th></tr></thead><tbody>
<tr><td><strong>Label</strong></td><td>Valeur</td><td class="oui">✅ Autorisé</td></tr>
<tr><td><strong>Label</strong></td><td>Valeur</td><td class="non">❌ Interdit</td></tr>
</tbody></table>

ESTIMATION (section 8) :
<div class="estimation-grid">
  <div class="estimation-card low"><div class="estimation-card-label">Estimation basse</div><div class="estimation-card-value">XXX €</div><div class="estimation-card-sub">Hypothèse prudente</div></div>
  <div class="estimation-card high"><div class="estimation-card-label">Estimation haute</div><div class="estimation-card-value">XXX €</div><div class="estimation-card-sub">Conditions favorables</div></div>
</div>

CONCLUSION (section 9) :
<div class="conclusion-block">
  <h3>Recommandations Valorimmo</h3>
  <div class="conclusion-rec">
    <div class="conclusion-rec-item"><div class="conclusion-rec-num">1</div><div class="conclusion-rec-text"><strong>Action concrète</strong> — Explication détaillée.</div></div>
  </div>
  <div class="conclusion-quote">"Citation professionnelle de conclusion."</div>
</div>
<div class="disclaimer">Ce rapport constitue une aide à la décision basée sur les informations disponibles et la connaissance du marché à la date de génération. Il ne constitue pas une évaluation certifiée au sens de la charte de l'expertise en évaluation immobilière. Valorimmo recommande de le compléter par une visite physique du bien et la consultation d'un notaire pour tout projet d'acquisition ou de cession.</div>

---

Génère les 9 sections en HTML uniquement (sans balises html/head/body). Ne génère aucun commentaire, aucune explication en dehors du HTML.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Claude API error:', err);
    return res.status(500).json({ error: 'Erreur génération rapport' });
  }

  const result = await response.json();
  const html = result.content[0].text;

  return res.status(200).json({ html });
}
