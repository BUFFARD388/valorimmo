export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    prenom, nom, email, telephone,
    adresse_demandeur, adresse_bien, parcelles,
    type_bien, surface_bien, prix_estime,
    objet_demande, contexte, formule,
  } = req.body;

  if (!nom || !email || !adresse_bien) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  // 1. Enregistrer dans Supabase
  const supabaseRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/demandes`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      prenom:            prenom || '',
      nom,
      email,
      telephone:         telephone || '',
      adresse_demandeur: adresse_demandeur || '',
      adresse_bien,
      parcelles:         parcelles || '',
      type_bien:         type_bien || '',
      surface_bien:      surface_bien || '',
      prix_estime:       prix_estime || '',
      objet_demande:     objet_demande || '',
      contexte:          contexte || '',
      message:           formule || '',
      formule:           formule || '',
      statut:            'nouveau',
    }),
  });

  if (!supabaseRes.ok) {
    const err = await supabaseRes.text();
    console.error('Supabase error:', err);
    return res.status(500).json({ error: 'Erreur base de données' });
  }

  // 2. Notification à Laurent
  await sendEmail({
    to: 'laurentbuffard69250@gmail.com',
    subject: `[Valorimmo] Nouvelle demande — ${formule || 'non précisée'} — ${prenom || ''} ${nom}`,
    html: `
      <h2>Nouvelle demande de diagnostic</h2>
      <h3>👤 Demandeur</h3>
      <p><strong>Nom :</strong> ${prenom || ''} ${nom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone || 'non renseigné'}</p>
      <p><strong>Adresse :</strong> ${adresse_demandeur || 'non renseignée'}</p>
      <h3>🏠 Bien immobilier</h3>
      <p><strong>Adresse :</strong> ${adresse_bien}</p>
      <p><strong>Parcelle(s) :</strong> ${parcelles || 'non renseigné'}</p>
      <p><strong>Type :</strong> ${type_bien || 'non précisé'}</p>
      <p><strong>Surface :</strong> ${surface_bien || 'non renseignée'}</p>
      <p><strong>Prix envisagé :</strong> ${prix_estime || 'non renseigné'}</p>
      <h3>📋 Contexte</h3>
      <p><strong>Objet :</strong> ${objet_demande || 'non précisé'}</p>
      <p><strong>Contexte :</strong> ${contexte || 'non renseigné'}</p>
      <p><strong>Formule :</strong> ${formule || 'non précisée'}</p>
    `,
  });

  // 3. Confirmation au client
  await sendEmail({
    to: email,
    subject: 'Votre demande Valorimmo a bien été reçue',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre demande Valorimmo a bien été reçue</title>
<style>
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #F4F7FB; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1B2D5B 0%, #0F1F3D 100%); padding: 28px 40px; }
  .body { padding: 36px 40px; }
  .body h2 { font-family: 'Poppins', Georgia, serif; font-size: 1.1rem; color: #1B2D5B; font-weight: 600; margin: 0 0 16px; }
  .body p { font-size: 0.9rem; color: #4B5563; line-height: 1.75; margin: 0 0 12px; }
  .info-box { background: #F4F7FB; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 18px 22px; margin: 22px 0; }
  .info-box p { margin: 0; font-size: 0.88rem; color: #1F2937; line-height: 1.8; }
  .info-box strong { color: #1B2D5B; }
  .note { background: #FEF3E2; border: 1px solid #F6D5A0; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 0.85rem; color: #92400E; }
  .footer { background: #F4F7FB; border-top: 1.5px solid #E5E7EB; padding: 20px 40px; text-align: center; }
  .footer p { font-size: 0.75rem; color: #9CA3AF; line-height: 1.8; margin: 0; }
  .footer a { color: #C8933A; text-decoration: none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <img src="https://valorimmo.app/logo-email-white.png" alt="Valorimmo" width="200" height="50" style="display:block;border:0;" />
  </div>
  <div class="body">
    <h2>Votre demande a bien été reçue</h2>
    <p>Bonjour <strong>${prenom || nom}</strong>,</p>
    <p>Nous avons bien enregistré votre demande de diagnostic immobilier pour le bien situé au <strong>${adresse_bien}</strong>.</p>
    <div class="info-box">
      <p><strong>Formule choisie :</strong> ${formule || 'À définir'}</p>
      <p><strong>Bien :</strong> ${adresse_bien}</p>
    </div>
    <div class="note">
      📞 <strong>Laurent Buffard vous recontactera sous 24h ouvrées</strong> pour organiser votre dossier et répondre à toutes vos questions.
    </div>
    <p>En attendant, n'hésitez pas à nous écrire directement à <a href="mailto:contact@valorimmo.app" style="color:#C8933A;">contact@valorimmo.app</a>.</p>
  </div>
  <div class="footer">
    <p><strong>Valorimmo</strong> — Laurent Buffard<br>
    <a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> · <a href="https://valorimmo.app">valorimmo.app</a></p>
  </div>
</div>
</body>
</html>`,
  });

  return res.status(200).json({ ok: true });
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Valorimmo', email: 'contact@valorimmo.app' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Brevo error:', err);
  }
}
