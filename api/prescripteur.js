import { randomUUID } from 'crypto';

// Génère un code prescripteur lisible ex: PRESC-2026-A3F7
function genPrescrCode() {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PRESC-${year}-${suffix}`;
}

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

  const prescripteurId = randomUUID();
  const prescCode = genPrescrCode();
  const isNotaire = partenariat_notaire === true || partenariat_notaire === 'true';

  // 1. Supabase prescripteur (non-bloquant)
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/prescripteurs`, {
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
  } catch(e) { console.error('Supabase prescripteur error:', e); }

  // 2. Brevo contact (non-bloquant, uniquement non-notaire)
  if (!isNotaire) {
    try {
      await createBrevoContact({
        email: presc_email,
        nom: presc_nom,
        presc_code: prescCode,
        presc_type: presc_type || '',
        societe: presc_cabinet || '',
      });
    } catch(e) { console.error('Brevo contact error:', e); }
  }

  // 3. Supabase apport (non-bloquant)
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/apports`, {
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
        adresse_bien: bien,
        statut: 'en_attente',
        notes: `Email: ${client_email || 'nc'} | Tel: ${client_tel || 'nc'} | Formule: ${formule || 'nc'}`,
      }),
    });
  } catch(e) { console.error('Supabase apport error:', e); }

  // 4. Supabase demande (non-bloquant)
  try {
    const nomParts = client_nom.trim().split(' ');
    const clientPrenom = nomParts.slice(0, -1).join(' ') || client_nom;
    const clientNom = nomParts.slice(-1)[0] || '';
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/demandes`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        prenom: clientPrenom,
        nom: clientNom,
        email: client_email || '',
        telephone: client_tel || '',
        adresse_bien: bien,
        formule: formule || '',
        message: formule || '',
        statut: 'nouveau',
        contexte: `Apport prescripteur — ${presc_nom} (${presc_type || presc_cabinet || 'Prescripteur'}) | ${presc_email} | Code: ${prescCode}`,
      }),
    });
  } catch(e) { console.error('Supabase demande error:', e); }

  // 5. Email notification à Laurent (non-bloquant)
  try {
    await sendEmail({
      to: 'laurentbuffard69250@gmail.com',
      subject: `[Valorimmo] ${isNotaire ? 'Recommandation notaire' : 'Nouveau dossier prescripteur'} — ${presc_nom}`,
      html: `
        <h2>${isNotaire ? 'Recommandation client — Notaire' : 'Nouveau dossier prescripteur'}</h2>
        <h3>Prescripteur</h3>
        <p><strong>Nom :</strong> ${presc_nom}</p>
        <p><strong>Profession :</strong> ${presc_type || 'nc'}</p>
        <p><strong>Cabinet :</strong> ${presc_cabinet || 'nc'}</p>
        <p><strong>Email :</strong> ${presc_email}</p>
        <p><strong>Téléphone :</strong> ${presc_tel || 'nc'}</p>
        <p><strong>Programme fidélité :</strong> ${commission ? 'Oui' : 'Non'}</p>
        <h3>Client</h3>
        <p><strong>Nom :</strong> ${client_nom}</p>
        <p><strong>Email :</strong> ${client_email || 'nc'}</p>
        <p><strong>Téléphone :</strong> ${client_tel || 'nc'}</p>
        <p><strong>Formule :</strong> ${formule || 'À définir'}</p>
        <p><strong>Bien :</strong><br>${bien}</p>
      `,
    });
  } catch(e) { console.error('Email Laurent error:', e); }

  // 6. Confirmation au prescripteur (non-bloquant)
  try {
    const fideliteBlock = !isNotaire ? `
    <div style="background:#F0F7FF;border:1.5px solid #BFDBF7;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 8px;font-size:0.82rem;font-weight:700;color:#1B2D5B;text-transform:uppercase;letter-spacing:0.1em;">Votre programme fidélité</p>
      <p style="margin:0 0 6px;font-size:0.88rem;color:#1F2937;">Votre code prescripteur : <strong style="color:#C8933A;font-size:1rem;letter-spacing:0.05em;">${prescCode}</strong></p>
      <p style="margin:0;font-size:0.82rem;color:#4B5563;">Chaque client diagnostiqué vous rapporte des points échangeables en bons cadeaux.</p>
    </div>` : '';

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
  .header { background: #ffffff; border-bottom: 2px solid #E5E7EB; padding: 28px 40px; }
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
    <img src="https://valorimmo.app/logo-original.png" alt="Valorimmo" width="200" height="50" style="display:block;border:0;" />
  </div>
  <div class="body">
    <h2>Votre dossier a bien été transmis</h2>
    <p>Bonjour <strong>${presc_nom}</strong>,</p>
    <p>Nous avons bien reçu votre recommandation et enregistré le dossier suivant :</p>
    <div class="info-box">
      <p><strong>Client :</strong> ${client_nom}</p>
      <p><strong>Bien :</strong> ${bien}</p>
      <p><strong>Formule :</strong> ${formule || 'À définir'}</p>
    </div>
    ${fideliteBlock}
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
  } catch(e) { console.error('Email prescripteur error:', e); }

  return res.status(200).json({ ok: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    console.error('Brevo sendEmail error:', err);
  }
}

async function createBrevoContact({ email, nom, presc_code, presc_type, societe }) {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes: {
        PRENOM: nom,
        SOCIETE: societe,
        PRESC_CODE: presc_code,
        PRESC_TYPE: presc_type,
        POINTS: 0,
      },
      listIds: [parseInt(process.env.BREVO_PRESCRIPTEUR_LIST_ID || '0')].filter(Boolean),
      updateEnabled: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Brevo createContact error:', err);
  }
}
