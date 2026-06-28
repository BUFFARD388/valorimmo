import { randomUUID } from 'crypto';

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
        contexte: `Apport ${presc_nom} (${presc_type || presc_cabinet || 'Prescripteur'}) | ${presc_email} | Code: ${prescCode}`,
      }),
    });
  } catch(e) { console.error('Supabase demande error:', e); }

  // 5. Email notification Laurent (non-bloquant)
  try {
    await sendEmail({
      to: 'laurentbuffard69250@gmail.com',
      subject: `[Valorimmo] ${isNotaire ? 'Recommandation notaire' : 'Nouveau prescripteur'} - ${presc_nom}`,
      html: `<h2>Nouveau dossier prescripteur</h2>
        <h3>Prescripteur</h3>
        <p><strong>Nom :</strong> ${presc_nom}</p>
        <p><strong>Profession :</strong> ${presc_type || 'nc'}</p>
        <p><strong>Cabinet :</strong> ${presc_cabinet || 'nc'}</p>
        <p><strong>Email :</strong> ${presc_email}</p>
        <p><strong>Tel :</strong> ${presc_tel || 'nc'}</p>
        <h3>Client</h3>
        <p><strong>Nom :</strong> ${client_nom}</p>
        <p><strong>Email :</strong> ${client_email || 'nc'}</p>
        <p><strong>Tel :</strong> ${client_tel || 'nc'}</p>
        <p><strong>Formule :</strong> ${formule || 'nc'}</p>
        <p><strong>Bien :</strong> ${bien}</p>`,
    });
  } catch(e) { console.error('Email Laurent error:', e); }

  // 6. Confirmation prescripteur (non-bloquant)
  try {
    const fideliteBlock = !isNotaire
      ? '<div style="background:#F0F7FF;border:1.5px solid #BFDBF7;border-radius:8px;padding:16px 20px;margin:20px 0;"><p style="margin:0 0 8px;font-size:0.82rem;font-weight:700;color:#1B2D5B;">PROGRAMME FIDELITE</p><p style="margin:0 0 6px;font-size:0.88rem;color:#1F2937;">Votre code : <strong style="color:#C8933A;">' + prescCode + '</strong></p><p style="margin:0;font-size:0.82rem;color:#4B5563;">Chaque client diagnostique vous rapporte des points.</p></div>'
      : '';

    await sendEmail({
      to: presc_email,
      subject: 'Votre dossier Valorimmo a bien ete transmis',
      html: '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Valorimmo</title>'
        + '<style>body{font-family:Arial,sans-serif;background:#F4F7FB;margin:0;padding:0;}'
        + '.wrapper{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;}'
        + '.header{background:#fff;border-bottom:2px solid #E5E7EB;padding:24px 40px;}'
        + '.body{padding:36px 40px;}'
        + '.body h2{font-size:1.1rem;color:#1B2D5B;font-weight:600;margin:0 0 16px;}'
        + '.body p{font-size:0.9rem;color:#4B5563;line-height:1.75;margin:0 0 12px;}'
        + '.info-box{background:#F4F7FB;border:1.5px solid #E2E8F0;border-radius:8px;padding:18px 22px;margin:22px 0;}'
        + '.info-box p{margin:0;font-size:0.88rem;color:#1F2937;line-height:1.8;}'
        + '.note{background:#FEF3E2;border:1px solid #F6D5A0;border-radius:8px;padding:14px 18px;margin:20px 0;font-size:0.85rem;color:#92400E;}'
        + '.footer{background:#F4F7FB;border-top:1.5px solid #E5E7EB;padding:20px 40px;text-align:center;}'
        + '.footer p{font-size:0.75rem;color:#9CA3AF;margin:0;}'
        + '.footer a{color:#C8933A;text-decoration:none;}'
        + '</style></head><body><div class="wrapper">'
        + '<div class="header"><img src="https://valorimmo.app/logo-original.png" alt="Valorimmo" width="160" style="display:block;border:0;height:auto;" /></div>'
        + '<div class="body">'
        + '<h2>Votre dossier a bien ete transmis</h2>'
        + '<p>Bonjour <strong>' + presc_nom + '</strong>,</p>'
        + '<p>Nous avons bien recu votre recommandation.</p>'
        + '<div class="info-box">'
        + '<p><strong>Client :</strong> ' + client_nom + '</p>'
        + '<p><strong>Bien :</strong> ' + bien + '</p>'
        + '<p><strong>Formule :</strong> ' + (formule || 'A definir') + '</p>'
        + '</div>'
        + fideliteBlock
        + '<div class="note">Laurent Buffard vous recontactera sous 24h ouvrees.</div>'
        + '<p>Pour toute question : <a href="mailto:contact@valorimmo.app" style="color:#C8933A;">contact@valorimmo.app</a></p>'
        + '</div>'
        + '<div class="footer"><p>Valorimmo - Laurent Buffard<br>'
        + '<a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> - <a href="https://valorimmo.app">valorimmo.app</a></p></div>'
        + '</div></body></html>',
    });
  } catch(e) { console.error('Email prescripteur error:', e); }

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
      updateEnabled: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Brevo createContact error:', err);
  }
}
