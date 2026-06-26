export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { id, pdfBase64, nomFichier } = req.body;
  if (!id) return res.status(400).json({ error: 'ID manquant' });
  if (!pdfBase64) return res.status(400).json({ error: 'PDF manquant' });

  // 1. Récupérer la demande
  const supabaseRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/demandes?id=eq.${id}&select=*`,
    {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!supabaseRes.ok) return res.status(500).json({ error: 'Erreur Supabase' });
  const rows = await supabaseRes.json();
  const d = rows[0];
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!d.rapport_html) return res.status(400).json({ error: 'Aucun rapport généré' });

  // 2. Stocker le PDF dans Supabase
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/demandes?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      rapport_pdf_base64: pdfBase64,
      rapport_pdf_nom: nomFichier || 'rapport-valorimmo.pdf',
      statut: 'paiement_demande',
    }),
  });

  // 3. Déterminer le lien Stripe selon la formule
  const stripeLinks = {
    'Diagnostic Essentiel — 250€':   'https://buy.stripe.com/eVqeVc7l80ZK5sUci16sw00',
    'Diagnostic Expert — 390€':      'https://buy.stripe.com/7sYbJ05d09wg6wY1Dn6sw02',
    'Diagnostic Stratégique — 950€': 'https://buy.stripe.com/bJe00ibBoaAk7B2ci16sw03',
  };

  const formule = d.formule || d.message || '';
  const lienBase = stripeLinks[formule] || stripeLinks['Diagnostic Expert — 390€'];
  const lienPaiement = `${lienBase}?client_reference_id=${id}`;

  const prenom = d.prenom || '';
  const nomComplet = (prenom + ' ' + d.nom).trim();
  const dateFr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // 4. Email de demande de paiement
  const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre rapport Valorimmo est prêt</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #F4F7FB; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #fff; }
  .header { background: #1B3F6E; padding: 28px 40px; }
  .header-brand { font-size: 1.3rem; font-weight: 800; letter-spacing: 0.06em; color: #fff; }
  .header-brand span { color: #FBBF24; }
  .header-tagline { font-size: 0.68rem; letter-spacing: 0.15em; text-transform: uppercase; color: #93C5FD; margin-top: 3px; }
  .body { padding: 36px 40px; }
  .body h2 { font-family: Georgia, serif; font-size: 1.15rem; color: #1B3F6E; font-weight: 400; margin-bottom: 16px; }
  .body p { font-size: 0.9rem; color: #4B5563; line-height: 1.7; margin-bottom: 12px; }
  .rapport-info { background: #F8FAFF; border: 1.5px solid #BFDBF7; border-radius: 10px; padding: 20px 24px; margin: 24px 0; }
  .rapport-info p { margin: 0; font-size: 0.88rem; color: #1F2937; line-height: 1.8; }
  .rapport-info strong { color: #1B3F6E; }
  .btn-payer { display: block; width: fit-content; margin: 28px auto; background: #1B3F6E; color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.08em; text-align: center; }
  .note { background: #FEF3E2; border: 1px solid #F6D5A0; border-radius: 8px; padding: 14px 18px; margin: 20px 0; }
  .note p { font-size: 0.85rem; color: #92400E; margin: 0; }
  .footer { background: #F4F7FB; border-top: 1.5px solid #E5E7EB; padding: 20px 40px; text-align: center; }
  .footer p { font-size: 0.75rem; color: #9CA3AF; line-height: 1.8; margin: 0; }
  .footer a { color: #2557A0; text-decoration: none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-brand">VALOR<span>IMMO</span></div>
    <div class="header-tagline">Diagnostic expert immobilier</div>
  </div>
  <div class="body">
    <h2>Votre rapport de diagnostic est prêt</h2>
    <p>Bonjour ${prenom || nomComplet},</p>
    <p>
      Votre rapport de diagnostic Valorimmo concernant le bien situé au
      <strong>${d.adresse_bien}</strong> est maintenant finalisé.
    </p>
    <div class="rapport-info">
      <p><strong>Formule :</strong> ${formule}</p>
      <p><strong>Bien :</strong> ${d.adresse_bien}</p>
      <p><strong>Date :</strong> ${dateFr}</p>
    </div>
    <p>
      Pour recevoir votre rapport complet (email HTML + PDF), cliquez sur le bouton
      ci-dessous pour procéder au règlement sécurisé par Stripe :
    </p>
    <a href="${lienPaiement}" class="btn-payer">Payer et recevoir mon rapport</a>
    <div class="note">
      <p>
        📞 <strong>Laurent Buffard vous appellera</strong> après réception de votre rapport
        pour vous en présenter les conclusions et répondre à toutes vos questions.
      </p>
    </div>
    <p>
      En cas de question avant le paiement, n'hésitez pas à nous contacter par email
      ou par téléphone.
    </p>
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

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Laurent Buffard — Valorimmo', email: 'contact@valorimmo.app' },
      to: [{ email: d.email, name: nomComplet }],
      subject: `Votre rapport Valorimmo est prêt — ${d.adresse_bien}`,
      htmlContent: emailHtml,
    }),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.text();
    console.error('Brevo error:', err);
    return res.status(500).json({ error: 'Erreur envoi email' });
  }

  return res.status(200).json({ ok: true });
}
