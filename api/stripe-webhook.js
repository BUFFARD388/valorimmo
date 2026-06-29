import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = sigHeader.split(',');
  const tPart = parts.find(p => p.startsWith('t='));
  const v1Parts = parts.filter(p => p.startsWith('v1='));
  if (!tPart || !v1Parts.length) return false;
  const timestamp = tPart.substring(2);
  const signedPayload = timestamp + '.' + payload;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return v1Parts.some(v1 => {
    const sig = v1.substring(3);
    try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); }
    catch { return false; }
  });
}

const PALIERS = [
  { seuil: 150, valeur: 150 },
  { seuil: 100, valeur: 100 },
  { seuil: 60, valeur: 60 },
  { seuil: 30, valeur: 30 },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sigHeader = req.headers['stripe-signature'];

  if (!verifyStripeSignature(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)) {
    console.error('Stripe webhook: signature invalide');
    return res.status(400).json({ error: 'Signature invalide' });
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'JSON invalide' }); }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const demandeId = session.client_reference_id;

  if (!demandeId) {
    console.error('Webhook: client_reference_id manquant');
    return res.status(200).json({ received: true });
  }

  const supabaseRes = await fetch(
    process.env.SUPABASE_URL + '/rest/v1/demandes?id=eq.' + demandeId + '&select=*',
    { headers: { 'apikey': process.env.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY } }
  );

  if (!supabaseRes.ok) {
    console.error('Webhook: erreur Supabase');
    return res.status(500).json({ error: 'Erreur Supabase' });
  }

  const rows = await supabaseRes.json();
  const d = rows[0];

  if (!d || !d.rapport_html) {
    console.error('Webhook: demande introuvable ou rapport absent', demandeId);
    return res.status(200).json({ received: true });
  }

  const prenom = d.prenom || '';
  const nomComplet = (prenom + ' ' + d.nom).trim();
  const dateFr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const emailHtml = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Votre rapport Valorimmo</title>'
    + '<style>body{font-family:Inter,Arial,sans-serif;background:#F4F7FB;margin:0;padding:0;color:#1F2937;}'
    + '.wrapper{max-width:720px;margin:0 auto;background:#fff;}'
    + '.header{background:#fff;border-bottom:2px solid #E5E7EB;padding:28px 40px;}'
    + '.intro{padding:28px 40px;border-bottom:1.5px solid #E5E7EB;}'
    + '.intro h2{font-size:1.1rem;color:#1B2D5B;font-weight:600;margin-bottom:12px;}'
    + '.intro p{font-size:0.9rem;color:#4B5563;line-height:1.7;margin-bottom:10px;}'
    + '.call-box{background:#FEF3E2;border:1px solid #F6D5A0;border-radius:8px;padding:14px 18px;margin-top:16px;font-size:0.88rem;color:#92400E;}'
    + '.rapport{padding:32px 40px;}'
    + '.footer{background:#F4F7FB;border-top:1.5px solid #E5E7EB;padding:20px 40px;text-align:center;}'
    + '.footer p{font-size:0.75rem;color:#9CA3AF;margin:0;}'
    + '.footer a{color:#C8933A;text-decoration:none;}'
    + '</style></head><body><div class="wrapper">'
    + '<div class="header"><img src="https://valorimmo.app/logo-original.png" alt="Valorimmo" width="160" style="display:block;border:0;height:auto;" /></div>'
    + '<div class="intro"><h2>Merci pour votre paiement - voici votre rapport</h2>'
    + '<p>Bonjour ' + (prenom || nomComplet) + ',</p>'
    + '<p>Votre paiement a bien ete recu. Vous trouverez ci-dessous votre rapport de diagnostic Valorimmo concernant le bien situe au <strong>' + d.adresse_bien + '</strong>, etabli le <strong>' + dateFr + '</strong>.</p>'
    + '<div class="call-box">Laurent Buffard vous contactera tres prochainement pour vous presenter ce rapport.</div>'
    + '</div>'
    + '<div class="rapport">' + d.rapport_html + '</div>'
    + '<div class="footer"><p><strong>Valorimmo</strong> - Laurent Buffard<br>'
    + '<a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> - <a href="https://valorimmo.app">valorimmo.app</a></p></div>'
    + '</div></body></html>';

  // Récupérer le PDF pré-généré par l'admin (stocké dans Supabase)
  const pdfBase64 = d.rapport_pdf_base64 || null;
  console.log('Webhook PDF base64 length:', pdfBase64 ? pdfBase64.length : 0);
  const nomFichierPdf = d.rapport_pdf_nom || ('rapport-valorimmo-' + nomComplet.replace(/\s+/g, '-') + '.pdf');

  const emailPayload = {
    sender: { name: 'Laurent Buffard - Valorimmo', email: 'contact@valorimmo.app' },
    to: [{ email: d.email, name: nomComplet }],
    subject: 'Votre rapport Valorimmo - ' + d.adresse_bien,
    htmlContent: emailHtml,
  };

  if (pdfBase64) {
    emailPayload.attachment = [{
      content: pdfBase64,
      name: nomFichierPdf,
    }];
  } else {
    console.warn('Webhook: rapport_pdf_base64 absent pour la demande', demandeId);
  }

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(emailPayload),
  });

  if (!brevoRes.ok) console.error('Brevo error:', await brevoRes.text());

  await fetch(process.env.SUPABASE_URL + '/rest/v1/demandes?id=eq.' + demandeId, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ statut: 'envoye' }),
  });

  // Programme fidelite : crediter le prescripteur si dossier apporte
  if (d.contexte && d.contexte.startsWith('Apport ')) {
    try {
      const emailMatch = d.contexte.match(/\|\s*([^\s|]+@[^\s|]+)\s*\|/);
      if (emailMatch) {
        const prescEmail = emailMatch[1];
        const formule = (d.formule || '').toLowerCase();
        let pts = 30;
        if (formule.includes('expert')) pts = 60;
        if (formule.includes('strat')) pts = 100;
        await crediterPoints({
          email: prescEmail,
          points: pts,
          note: 'Paiement client - ' + nomComplet + ' - ' + (d.formule || 'nc'),
        });
      }
    } catch(e) { console.error('Fidelite points error:', e); }
  }

  return res.status(200).json({ received: true });
}

async function crediterPoints({ email, points, note }) {
  const getRes = await fetch('https://api.brevo.com/v3/contacts/' + encodeURIComponent(email), {
    headers: { 'api-key': process.env.BREVO_API_KEY },
  });
  if (!getRes.ok) { console.error('Fidelite: contact Brevo introuvable', email); return; }

  const contact = await getRes.json();
  const attrs = contact.attributes || {};
  const oldPoints = parseInt(attrs.POINTS || '0', 10);
  const newPoints = oldPoints + points;
  const prescCode = attrs.PRESC_CODE || '';
  const nom = attrs.PRENOM || email;

  await fetch('https://api.brevo.com/v3/contacts/' + encodeURIComponent(email), {
    method: 'PUT',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes: { POINTS: newPoints } }),
  });

  const palier = PALIERS.find(p => oldPoints < p.seuil && newPoints >= p.seuil);

  if (palier) {
    const bonHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
      + '<img src="https://valorimmo.app/logo-original.png" alt="Valorimmo" width="160" style="display:block;height:auto;margin-bottom:24px;" />'
      + '<h2 style="color:#1B2D5B;">Felicitations ' + nom + ' !</h2>'
      + '<p style="color:#4B5563;">Vous avez atteint un palier de votre programme fidelite Valorimmo.</p>'
      + '<div style="background:linear-gradient(135deg,#1B2D5B,#0F1F3D);border-radius:12px;padding:30px;text-align:center;margin:24px 0;">'
      + '<div style="font-size:3rem;font-weight:700;color:#C8933A;">' + palier.valeur + 'EUR</div>'
      + '<div style="font-size:0.85rem;color:#E2E8F0;text-transform:uppercase;letter-spacing:0.1em;margin-top:6px;">Bon cadeau</div>'
      + '<div style="margin-top:18px;background:rgba(255,255,255,0.1);border-radius:6px;padding:10px 16px;color:#fff;">Code : ' + prescCode + '</div>'
      + '</div>'
      + '<p style="color:#4B5563;">Total : <strong>' + newPoints + ' pts</strong></p>'
      + '<p style="color:#4B5563;">Pour utiliser votre bon, contactez-nous a <a href="mailto:contact@valorimmo.app" style="color:#C8933A;">contact@valorimmo.app</a>.</p>'
      + '</div>';
    await envoyerEmail({ to: email, subject: 'Votre bon cadeau ' + palier.valeur + 'EUR - Valorimmo', html: bonHtml });
    await envoyerEmail({
      to: 'laurentbuffard69250@gmail.com',
      subject: '[Valorimmo] Bon cadeau ' + palier.valeur + 'EUR envoye - ' + nom,
      html: '<p><strong>Prescripteur :</strong> ' + nom + ' (' + email + ')</p>'
          + '<p><strong>Palier :</strong> ' + palier.seuil + ' pts - bon ' + palier.valeur + 'EUR</p>'
          + '<p><strong>Total :</strong> ' + newPoints + ' pts</p>'
          + '<p><strong>Note :</strong> ' + note + '</p>',
    });
  } else {
    const prochainPalier = PALIERS.slice().reverse().find(p => p.seuil > newPoints);
    const notifHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
      + '<img src="https://valorimmo.app/logo-original.png" alt="Valorimmo" width="160" style="display:block;height:auto;margin-bottom:24px;" />'
      + '<h2 style="color:#1B2D5B;">+' + points + ' points credits</h2>'
      + '<p style="color:#4B5563;">Bonjour ' + nom + ', votre compte fidelite vient d etre mis a jour.</p>'
      + '<p style="color:#4B5563;">Total cumule : <strong>' + newPoints + ' pts</strong></p>'
      + (prochainPalier ? '<p style="color:#4B5563;">Plus que <strong>' + (prochainPalier.seuil - newPoints) + ' points</strong> avant votre bon cadeau de ' + prochainPalier.valeur + 'EUR.</p>' : '')
      + '<p style="color:#6B7280;font-size:0.82rem;">Note : ' + note + '</p>'
      + '</div>';
    await envoyerEmail({ to: email, subject: '+' + points + ' points - Programme Fidelite Valorimmo', html: notifHtml });
  }
}

async function envoyerEmail({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Valorimmo', email: 'contact@valorimmo.app' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) console.error('Brevo email error:', await res.text());
}
