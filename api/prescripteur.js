export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    presc_nom, presc_type, presc_cabinet, presc_email, presc_tel,
    client_nom, client_email, client_tel, formule, bien, commission,
  } = req.body;

  if (!presc_nom || !presc_email || !client_nom || !bien) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  // 1. Enregistrer le prescripteur dans Supabase
  const prescRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/prescripteurs`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      nom: presc_nom,
      email: presc_email,
      telephone: presc_tel || '',
      societe: presc_cabinet || '',
      type_prescripteur: presc_type || '',
      statut: 'actif',
    }),
  });

  let prescripteurId = null;
  if (prescRes.ok) {
    const prescData = await prescRes.json();
    prescripteurId = prescData[0]?.id || null;
  } else {
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
  await sendEmail({
    to: 'laurentbuffard69250@gmail.com',
    subject: `[Valorimmo] Nouveau dossier prescripteur — ${presc_nom}`,
    html: `
      <h2>Nouveau dossier prescripteur</h2>
      <h3>Prescripteur</h3>
      <p><strong>Nom :</strong> ${presc_nom}</p>
      <p><strong>Profession :</strong> ${presc_type || 'nc'}</p>
      <p><strong>Cabinet :</strong> ${presc_cabinet || 'nc'}</p>
      <p><strong>Email :</strong> ${presc_email}</p>
      <p><strong>Téléphone :</strong> ${presc_tel || 'nc'}</p>
      <p><strong>Commission souhaitée :</strong> ${commission ? 'Oui' : 'Non'}</p>
      <h3>Client</h3>
      <p><strong>Nom :</strong> ${client_nom}</p>
      <p><strong>Email :</strong> ${client_email || 'nc'}</p>
      <p><strong>Téléphone :</strong> ${client_tel || 'nc'}</p>
      <p><strong>Formule :</strong> ${formule || 'À définir'}</p>
      <p><strong>Bien :</strong><br>${bien}</p>
    `,
  });

  // 4. Confirmation au prescripteur
  await sendEmail({
    to: presc_email,
    subject: 'Votre dossier Valorimmo a bien été transmis',
    html: `
      <p>Bonjour ${presc_nom},</p>
      <p>Nous avons bien reçu votre recommandation pour <strong>${client_nom}</strong>.</p>
      <p>Nous vous recontactons sous <strong>24h ouvrées</strong> pour confirmer la prise en charge du dossier.</p>
      ${commission ? '<p>Nous reviendrons également vers vous concernant les modalités de commission d\'apporteur d\'affaires.</p>' : ''}
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
