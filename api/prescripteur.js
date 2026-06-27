import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    presc_nom, presc_type, presc_cabinet, presc_email, presc_tel,
    client_nom, client_email, client_tel, formule, bien, commission,
    partenariat_notaire,
  } = req.body;

  if (!presc_nom || !presc_email || !client_nom || !bien) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  // Générer l'UUID côté serveur pour éviter le besoin de SELECT policy
  const prescripteurId = randomUUID();

  // 1. Enregistrer le prescripteur dans Supabase
  const prescRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/prescripteurs`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      id: prescripteurId,
      nom: presc_nom,
      email: presc_email,
      telephone: presc_tel || '',
      societe: presc_cabinet || '',
      type_prescripteur: presc_type || '',
      statut: 'actif',
    }),
  });

  if (!prescRes.ok) {
    const err = await prescRes.text();
    console.error('Supabase prescripteur error:', err);
    return res.status(500).json({ error: 'Erreur base de données (prescripteur)' });
  }

  // 2. Enregistrer l'apport dans Supabase
  const apportRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/apports`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      prescripteur_id: prescripteurId,
      nom_client: client_nom,
      adresse_bien: client_tel || '',
      statut: 'en_attente',
      notes: `Email client: ${client_email || 'nc'} | Tél: ${client_tel || 'nc'} | Formule: ${formule || 'nc'} | Commission souhaitée: ${commission ? 'oui' : 'non'} | Bien: ${bien}`,
    }),
  });

  if (!apportRes.ok) {
    const err = await apportRes.text();
    console.error('Supabase apport error:', err);
    // On continue quand même pour envoyer les emails
  }

  // 3. Notification à Laurent
  const isNotaire = partenariat_notaire === true || partenariat_notaire === 'true';
  await sendEmail({
    to: 'laurentbuffard69250@gmail.com',
    subject: `[Valorimmo] ${isNotaire ? '⚖️ PARTENARIAT NOTAIRE' : 'Nouveau dossier prescripteur'} — ${presc_nom}`,
    html: `
      <h2>${isNotaire ? '⚖️ Nouveau partenaire notaire' : 'Nouveau dossier prescripteur'}</h2>
      ${isNotaire ? '<p style="background:#FEF3E2;border:1px solid #F6D5A0;border-radius:6px;padding:10px 14px;color:#92400E;"><strong>Action requise :</strong> Envoyer la convention de partenariat + code partenaire sous 48h.</p>' : ''}
      <h3>Prescripteur</h3>
      <p><strong>Nom :</strong> ${presc_nom}</p>
      <p><strong>Profession :</strong> ${presc_type || 'nc'}</p>
      <p><strong>Cabinet :</strong> ${presc_cabinet || 'nc'}</p>
      <p><strong>Email :</strong> ${presc_email}</p>
      <p><strong>Téléphone :</strong> ${presc_tel || 'nc'}</p>
      ${isNotaire
        ? '<p><strong>Type de partenariat :</strong> Tarif préférentiel −50% (partenariat institutionnel notaire)</p>'
        : `<p><strong>Programme fidélité :</strong> ${commission ? 'Oui' : 'Non'}</p>`
      }
      <h3>Client</h3>
      <p><strong>Nom :</strong> ${client_nom}</p>
      <p><strong>Email :</strong> ${client_email || 'nc'}</p>
      <p><strong>Téléphone :</strong> ${client_tel || 'nc'}</p>
      <p><strong>Formule :</strong> ${formule || 'À définir'}${isNotaire ? ' <em>(tarif −50% applicable)</em>' : ''}</p>
      <p><strong>Bien :</strong><br>${bien}</p>
    `,
  });

  // 4. Confirmation au prescripteur
  await sendEmail({
    to: presc_email,
    subject: 'Votre dossier Valorimmo a bien été transmis',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre dossier Valorimmo a bien été transmis</title>
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 65" width="168" height="52">
      <g transform="translate(2, 6) scale(0.48)">
        <path d="M50,5 L93,42 L83,42 L83,80 L17,80 L17,42 L7,42 Z" fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M30,72 C50,68 66,44 74,27" fill="none" stroke="#C8933A" stroke-width="5" stroke-linecap="round"/>
        <polyline points="63,22 74,27 68,39" fill="none" stroke="#C8933A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text font-family="'Poppins','Inter','Segoe UI',Arial,sans-serif" font-size="21" font-weight="700" font-style="italic" letter-spacing="-0.3">
        <tspan x="50" y="41" fill="#ffffff">valor</tspan><tspan fill="#C8933A">immo</tspan>
      </text>
    </svg>
  </div>
  <div class="body">
    <h2>Votre dossier a bien été transmis</h2>
    <p>Bonjour <strong>${presc_nom}</strong>,</p>
    <p>Nous avons bien reçu votre recommandation et enregistré le dossier suivant :</p>
    <div class="info-box">
      <p><strong>Client :</strong> ${client_nom}</p>
      <p><strong>Bien :</strong> ${bien}</p>
      <p><strong>Formule :</strong> ${formule || 'À définir'}</p>
      ${commission ? '<p><strong>Commission apporteur :</strong> Souhaitée — nous reviendrons vers vous pour les modalités.</p>' : ''}
    </div>
    <div class="note">
      📞 <strong>Laurent Buffard vous recontactera sous 24h ouvrées</strong> pour confirmer la prise en charge du dossier.
    </div>
    <p>Merci pour votre confiance. Pour toute question, écrivez-nous à <a href="mailto:contact@valorimmo.app" style="color:#C8933A;">contact@valorimmo.app</a>.</p>
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
