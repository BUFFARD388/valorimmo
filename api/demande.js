export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nom, email, telephone, formule, bien } = req.body;

  if (!nom || !email || !bien) {
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
      nom,
      email,
      telephone: telephone || '',
      adresse_bien: bien,
      message: formule || '',
      statut: 'nouveau',
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
    subject: `[Valorimmo] Nouvelle demande — ${formule || 'non précisée'}`,
    html: `
      <h2>Nouvelle demande de diagnostic</h2>
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone || 'non renseigné'}</p>
      <p><strong>Formule :</strong> ${formule || 'non précisée'}</p>
      <p><strong>Bien :</strong><br>${bien}</p>
    `,
  });

  // 3. Confirmation au client
  await sendEmail({
    to: email,
    subject: 'Votre demande Valorimmo a bien été reçue',
    html: `
      <p>Bonjour ${nom},</p>
      <p>Nous avons bien reçu votre demande de diagnostic immobilier.</p>
      <p>Nous vous recontactons sous <strong>24h ouvrées</strong> pour organiser votre dossier.</p>
      <br>
      <p>Cordialement,<br><strong>Laurent Buffard</strong><br>Valorimmo — Diagnostic expert immobilier</p>
      <p style="font-size:12px;color:#999;">contact@valorimmo.app · valorimmo.app</p>
    `,
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
