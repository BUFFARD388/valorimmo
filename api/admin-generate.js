export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { demande } = req.body;

  const prompt = `Tu es un expert en diagnostic immobilier pour Valorimmo, service fondé par Laurent Buffard (20 ans d'expérience en valorisation immobilière, analyse PLU, foncier, promotion).

Génère le contenu HTML des 7 sections d'un rapport de diagnostic Valorimmo basé sur ces informations :

DOSSIER CLIENT :
- Nom : ${demande.nom}
- Formule : ${demande.message || 'Non précisée'}
- Description du bien : ${demande.adresse_bien}
- Notes internes de l'expert : ${demande.notes_internes || 'Aucune'}

Génère UNIQUEMENT le HTML des 7 sections (sans html/head/body), en utilisant EXACTEMENT ces classes CSS :

SECTION :
<div class="section">
  <div class="section-num">Section 01</div>
  <h2 class="section-title">Titre de la section</h2>
  <!-- contenu ici -->
</div>

BOÎTES COLORÉES :
<div class="box box-blue"><div class="box-title">Titre</div>Texte</div>
<div class="box box-gold"><div class="box-title">⚠️ Titre</div>Texte</div>
<div class="box box-red"><div class="box-title">⚠️ Titre</div>Texte</div>
<div class="box box-green"><div class="box-title">✅ Titre</div>Texte</div>

TABLEAUX :
<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody>
<tr><td><strong>Label</strong></td><td class="oui">✅ Oui</td></tr>
<tr><td><strong>Label</strong></td><td class="non">❌ Non</td></tr>
</tbody></table>

ESTIMATION :
<div class="estimation-grid">
  <div class="estimation-card low"><div class="estimation-card-label">Estimation basse</div><div class="estimation-card-value">[montant]</div><div class="estimation-card-sub">Hypothèse prudente</div></div>
  <div class="estimation-card high"><div class="estimation-card-label">Estimation haute</div><div class="estimation-card-value">[montant]</div><div class="estimation-card-sub">Conditions favorables</div></div>
</div>

CONCLUSION :
<div class="conclusion-block">
  <h3>Ce que ce diagnostic vous permet de faire</h3>
  <div class="conclusion-rec">
    <div class="conclusion-rec-item"><div class="conclusion-rec-num">1</div><div class="conclusion-rec-text"><strong>Action</strong> — Explication.</div></div>
  </div>
  <div class="conclusion-quote">"Citation de conclusion."</div>
</div>
<div class="disclaimer">Texte disclaimer légal.</div>

SECTIONS À GÉNÉRER :
1. Synthèse du bien
2. Contexte urbanistique — Analyse PLU
3. Localisation et dynamique de marché
4. Références de marché
5. Potentiel de valorisation
6. Analyse du prix et fourchette d'estimation
7. Conclusion et recommandations Valorimmo

Pour toute donnée inconnue, utilise [À COMPLÉTER]. Génère une analyse professionnelle, précise et structurée. Ne génère que le HTML, sans commentaires ni explications.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
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
