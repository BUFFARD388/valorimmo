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
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  return v1Parts.some(v1 => {
    const sig = v1.substring(3);
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch { return false; }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sigHeader = req.headers['stripe-signature'];

  if (!verifyStripeSignature(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)) {
    console.error('Stripe webhook: signature invalide');
    return res.status(400).json({ error: 'Signature invalide' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const demandeId = session.client_reference_id;

  if (!demandeId) {
    console.error('Webhook: client_reference_id manquant');
    return res.status(200).json({ received: true });
  }

  // Récupérer la demande depuis Supabase
  const supabaseRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/demandes?id=eq.${demandeId}&select=*`,
    {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    }
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

  // Construire l'email HTML avec le rapport complet
  const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre rapport Valorimmo</title>
<style>
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #F4F7FB; margin: 0; padding: 0; color: #1F2937; }
  .wrapper { max-width: 720px; margin: 0 auto; background: #fff; }
  .header { background: #ffffff; border-bottom: 2px solid #E5E7EB; padding: 28px 40px; }
  .intro { padding: 28px 40px; border-bottom: 1.5px solid #E5E7EB; }
  .intro h2 { font-family: 'Poppins', Georgia, serif; font-size: 1.1rem; color: #1B2D5B; font-weight: 600; margin-bottom: 12px; }
  .intro p { font-size: 0.9rem; color: #4B5563; line-height: 1.7; margin-bottom: 10px; }
  .call-box { background: #FEF3E2; border: 1px solid #F6D5A0; border-radius: 8px; padding: 14px 18px; margin-top: 16px; font-size: 0.88rem; color: #92400E; }
  .rapport { padding: 32px 40px; }
  .rapport-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #C8933A; margin-bottom: 20px; border-bottom: 2px solid #BFDBF7; padding-bottom: 8px; }
  .section { margin-bottom: 36px; }
  .section-num { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #C8933A; margin-bottom: 4px; }
  .section-title { font-family: 'Poppins', Georgia, serif; font-size: 1rem; color: #1B2D5B; font-weight: 600; border-bottom: 1.5px solid #BFDBF7; padding-bottom: 8px; margin-bottom: 12px; }
  p { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 12px 0; }
  thead th { background: #EBF2FB; color: #1B2D5B; font-weight: 700; padding: 8px 12px; text-align: left; border-bottom: 2px solid #BFDBF7; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; color: #374151; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) td { background: #F9FAFB; }
  td.oui { color: #15803D; font-weight: 600; }
  td.non { color: #DC2626; font-weight: 600; }
  .box { border-radius: 7px; padding: 14px 18px; margin: 12px 0; font-size: 0.84rem; line-height: 1.7; }
  .box-blue { background: #EBF2FB; border: 1px solid #BFDBF7; color: #1F2937; }
  .box-gold { background: #FEF3E2; border: 1px solid #F6D5A0; color: #92400E; }
  .box-red { background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; }
  .box-green { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; }
  .box-title { font-weight: 700; margin-bottom: 5px; font-size: 0.78rem; }
  .estimation-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; }
  .estimation-card { border-radius: 8px; padding: 18px 20px; text-align: center; }
  .estimation-card.low { background: #F8FAFF; border: 1.5px solid #BFDBF7; }
  .estimation-card.high { background: #1B2D5B; border: 1.5px solid #1B2D5B; }
  .estimation-card-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; }
  .estimation-card.high .estimation-card-label { color: #93C5FD; }
  .estimation-card-value { font-family: Georgia, serif; font-size: 1.6rem; color: #1B2D5B; line-height: 1; }
  .estimation-card.high .estimation-card-value { color: #fff; }
  .estimation-card-sub { font-size: 0.7rem; color: #6B7280; margin-top: 4px; }
  .estimation-card.high .estimation-card-sub { color: #94A3B8; }
  .conclusion-block { background: #1B2D5B; border-radius: 10px; padding: 22px 26px; color: #fff; margin-top: 8px; }
  .conclusion-block h3 { font-family: Georgia, serif; font-size: 0.95rem; color: #fff; font-weight: 400; margin-bottom: 12px; }
  .conclusion-rec { display: flex; flex-direction: column; gap: 8px; }
  .conclusion-rec-item { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 10px 14px; display: flex; gap: 12px; align-items: flex-start; }
  .conclusion-rec-num { background: #C8933A; color: #1A2535; font-size: 0.68rem; font-weight: 800; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .conclusion-rec-text { font-size: 0.82rem; color: #E2E8F0; line-height: 1.6; }
  .conclusion-rec-text strong { color: #fff; }
  .conclusion-quote { border-left: 3px solid #C8933A; padding: 10px 16px; margin-top: 16px; background: rgba(255,255,255,0.06); border-radius: 0 6px 6px 0; font-family: Georgia, serif; font-style: italic; font-size: 0.86rem; color: #CBD5E1; line-height: 1.7; }
  .disclaimer { margin-top: 22px; padding: 12px 16px; background: #F9FAFB; border-radius: 6px; font-size: 0.72rem; color: #6B7280; line-height: 1.6; border: 1px solid #E5E7EB; font-style: italic; }
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
  <div class="intro">
    <h2>Merci pour votre paiement — voici votre rapport</h2>
    <p>Bonjour ${prenom || nomComplet},</p>
    <p>
      Votre paiement a bien été reçu. Vous trouverez ci-dessous votre rapport de diagnostic
      Valorimmo concernant le bien situé au <strong>${d.adresse_bien}</strong>,
      établi le <strong>${dateFr}</strong>. Le rapport PDF est également joint à cet email.
    </p>
    <div class="call-box">
      📞 <strong>Laurent Buffard vous contactera très prochainement</strong> pour vous présenter
      ce rapport et répondre à toutes vos questions.
    </div>
  </div>
  <div class="rapport">
    <div class="rapport-label">Rapport de diagnostic — ${d.adresse_bien}</div>
    ${d.rapport_html}
  </div>
  <div class="footer">
    <p>
      <strong>Valorimmo</strong> — Laurent Buffard<br>
      <a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> · <a href="https://valorimmo.app">valorimmo.app</a>
    </p>
  </div>
</div>
</body>
</html>`;

  // Construire l'email avec PDF en pièce jointe
  const emailPayload = {
    sender: { name: 'Laurent Buffard — Valorimmo', email: 'contact@valorimmo.app' },
    to: [{ email: d.email, name: nomComplet }],
    subject: `Votre rapport Valorimmo — ${d.adresse_bien}`,
    htmlContent: emailHtml,
  };

  if (d.rapport_pdf_base64) {
    emailPayload.attachment = [{
      content: d.rapport_pdf_base64,
      name: d.rapport_pdf_nom || 'rapport-valorimmo.pdf',
    }];
  }

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.text();
    console.error('Brevo error:', err);
  }

  // Mettre à jour le statut
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/demandes?id=eq.${demandeId}`, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ statut: 'envoye' }),
  });

  return res.status(200).json({ received: true });
}
