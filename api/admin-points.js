/**
 * POST /api/admin-points
 * Ajoute des points à un prescripteur et envoie un bon cadeau si un palier est atteint.
 *
 * Body attendu :
 * {
 *   secret: string,       // ADMIN_SECRET (variable d'environnement)
 *   email: string,        // email du prescripteur
 *   points: number,       // points à ajouter (ex: 30)
 *   note: string          // optionnel — ex: "Diagnostic Expert - M. Dupont"
 * }
 */

// Paliers du programme fidélité (points cumulés → valeur bon cadeau en €)
const PALIERS = [
  { seuil: 150, valeur: 150 },
  { seuil: 100, valeur: 100 },
  { seuil: 60,  valeur: 60  },
  { seuil: 30,  valeur: 30  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Parsing du body (string ou objet selon l'environnement)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { secret, email, points, note } = body;

  // Debug temporaire — à retirer après validation
  console.log('ADMIN_PASSWORD set:', !!process.env.ADMIN_PASSWORD);
  console.log('secret reçu:', secret);
  console.log('match:', secret === process.env.ADMIN_PASSWORD);

  // Vérification du mot de passe admin (même variable que admin-auth.js)
  if (!secret || secret !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé', debug: { hasEnv: !!process.env.ADMIN_PASSWORD } });
  }

  if (!email || !points || Number(points) <= 0) {
    return res.status(400).json({ error: 'email et points requis' });
  }

  const pointsNum = Number(points);

  // 1. Récupérer le contact Brevo
  const getRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    headers: { 'api-key': process.env.BREVO_API_KEY },
  });

  if (!getRes.ok) {
    const err = await getRes.text();
    console.error('Brevo GET contact error:', err);
    return res.status(404).json({ error: 'Contact introuvable dans Brevo' });
  }

  const contact = await getRes.json();
  const attrs = contact.attributes || {};
  const oldPoints = parseInt(attrs.POINTS || '0', 10);
  const newPoints = oldPoints + pointsNum;
  const prescCode = attrs.PRESC_CODE || '';
  const nom = attrs.PRENOM || email;

  // 2. Mettre à jour les points dans Brevo
  const updateRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attributes: { POINTS: newPoints } }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    console.error('Brevo PUT contact error:', err);
    return res.status(500).json({ error: 'Erreur mise à jour Brevo' });
  }

  // 3. Vérifier si un palier est franchi
  const palierAtteint = PALIERS.find(
    p => oldPoints < p.seuil && newPoints >= p.seuil
  );

  if (palierAtteint) {
    await sendBonCadeau({
      email,
      nom,
      prescCode,
      valeur: palierAtteint.valeur,
      points: newPoints,
    });


    // Notifier Laurent
    await sendEmail({
      to: 'laurentbuffard69250@gmail.com',
      subject: `[Valorimmo] 🎁 Bon cadeau ${palierAtteint.valeur}€ envoyé — ${nom}`,
      html: `
        <h2>Bon cadeau envoyé automatiquement</h2>
        <p><strong>Prescripteur :</strong> ${nom} (${email})</p>
        <p><strong>Code :</strong> ${prescCode}</p>
        <p><strong>Palier atteint :</strong> ${palierAtteint.seuil} points → bon cadeau ${palierAtteint.valeur}€</p>
        <p><strong>Total points :</strong> ${newPoints}</p>
        ${note ? `<p><strong>Note :</strong> ${note}</p>` : ''}
      `,
    });
  } else {
    await sendNotifPoints({ email, nom, prescCode, pointsAjoutes: pointsNum, totalPoints: newPoints, note });
  }

  return res.status(200).json({
    ok: true,
    email,
    oldPoints,
    newPoints,
    palierAtteint: palierAtteint ? palierAtteint.valeur : null,
  });
}

// ─── Emails ──────────────────────────────────────────────────────────────────

async function sendBonCadeau({ email, nom, prescCode, valeur, points }) {
  await sendEmail({
    to: email,
    subject: `🎁 Votre bon cadeau ${valeur}€ — Programme Fidélité Valorimmo`,
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre bon cadeau Valorimmo</title>
<style>
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #F4F7FB; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
  .header { background: #ffffff; border-bottom: 2px solid #E5E7EB; padding: 28px 40px; }
  .body { padding: 36px 40px; }
  .body h2 { font-family: 'Poppins', Georgia, serif; font-size: 1.1rem; color: #1B2D5B; font-weight: 600; margin: 0 0 16px; }
  .body p { font-size: 0.9rem; color: #4B5563; line-height: 1.75; margin: 0 0 12px; }
  .bon-cadeau { background: linear-gradient(135deg, #1B2D5B 0%, #0F1F3D 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 24px 0; }
  .bon-cadeau .valeur { font-family: 'Poppins', Georgia, serif; font-size: 3rem; font-weight: 700; color: #C8933A; line-height: 1; }
  .bon-cadeau .label { font-size: 0.85rem; color: #E2E8F0; margin-top: 6px; letter-spacing: 0.1em; text-transform: uppercase; }
  .bon-cadeau .code { margin-top: 18px; background: rgba(255,255,255,0.1); border-radius: 6px; padding: 10px 16px; display: inline-block; font-size: 0.9rem; color: #fff; letter-spacing: 0.08em; }
  .info-box { background: #F4F7FB; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 18px 22px; margin: 22px 0; }
  .info-box p { margin: 0; font-size: 0.88rem; color: #1F2937; line-height: 1.8; }
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
    <h2>🎁 Félicitations ${nom} !</h2>
    <p>Vous avez atteint un palier de votre programme fidélité Valorimmo. Voici votre bon cadeau :</p>
    <div class="bon-cadeau">
      <div class="valeur">${valeur}€</div>
      <div class="label">Bon cadeau</div>
      <div class="code">Code prescripteur : ${prescCode}</div>
    </div>
    <div class="info-box">
      <p><strong>Total de vos points :</strong> ${points} pts</p>
      <p><strong>Comment utiliser votre bon ?</strong> Contactez-nous à <a href="mailto:contact@valorimmo.app" style="color:#C8933A;">contact@valorimmo.app</a> en précisant votre code prescripteur pour organiser l'utilisation de votre bon cadeau.</p>
    </div>
    <p>Merci pour votre confiance et pour les clients que vous nous avez recommandés. Continuez à transmettre des dossiers pour cumuler davantage de points !</p>
    <p style="margin-top:24px;">— Laurent Buffard, Valorimmo</p>
  </div>
  <div class="footer">
    <p><strong>Valorimmo</strong> — Laurent Buffard<br>
    <a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> · <a href="https://valorimmo.app">valorimmo.app</a></p>
  </div>
</div>
</body>
</html>`,
  });
}

async function sendNotifPoints({ email, nom, prescCode, pointsAjoutes, totalPoints, note }) {
  // Trouver le prochain palier
  const prochainPalier = [...PALIERS].reverse().find(p => p.seuil > totalPoints);

  await sendEmail({
    to: email,
    subject: `+${pointsAjoutes} points sur votre compte fidélité Valorimmo`,
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Points fidélité Valorimmo</title>
<style>
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #F4F7FB; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
  .header { background: #ffffff; border-bottom: 2px solid #E5E7EB; padding: 28px 40px; }
  .body { padding: 36px 40px; }
  .body h2 { font-family: 'Poppins', Georgia, serif; font-size: 1.1rem; color: #1B2D5B; font-weight: 600; margin: 0 0 16px; }
  .body p { font-size: 0.9rem; color: #4B5563; line-height: 1.75; margin: 0 0 12px; }
  .points-box { background: #ffffff; border-bottom: 2px solid #E5E7EB; border-radius: 10px; padding: 24px; display: flex; align-items: center; justify-content: space-between; margin: 22px 0; gap: 16px; }
  .pts-item { text-align: center; }
  .pts-value { font-family: 'Poppins', Georgia, serif; font-size: 1.8rem; font-weight: 700; color: #C8933A; }
  .pts-label { font-size: 0.72rem; color: #CBD5E1; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px; }
  .pts-divider { width: 1px; background: rgba(255,255,255,0.2); align-self: stretch; }
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
    <h2>Votre compte fidélité a été crédité</h2>
    <p>Bonjour <strong>${nom}</strong>,</p>
    <p>${note ? `Suite à : <em>${note}</em>, votre` : 'Votre'} compte fidélité vient d'être mis à jour.</p>
    <div class="points-box">
      <div class="pts-item">
        <div class="pts-value">+${pointsAjoutes}</div>
        <div class="pts-label">Points ajoutés</div>
      </div>
      <div class="pts-divider"></div>
      <div class="pts-item">
        <div class="pts-value">${totalPoints}</div>
        <div class="pts-label">Total cumulé</div>
      </div>
      ${prochainPalier ? `
      <div class="pts-divider"></div>
      <div class="pts-item">
        <div class="pts-value">${prochainPalier.seuil - totalPoints}</div>
        <div class="pts-label">Points avant ${prochainPalier.valeur}€</div>
      </div>` : '<div class="pts-item"><div class="pts-value" style="color:#4ADE80;">✓</div><div class="pts-label">Palier max atteint</div></div>'}
    </div>
    <p style="font-size:0.82rem;color:#6B7280;">Code prescripteur : <strong style="color:#1B2D5B;">${prescCode}</strong></p>
    <p>Continuez à nous recommander vos clients propriétaires pour cumuler vos points et atteindre le prochain bon cadeau.</p>
    <p style="margin-top:24px;">— Laurent Buffard, Valorimmo</p>
  </div>
  <div class="footer">
    <p><strong>Valorimmo</strong> — Laurent Buffard<br>
    <a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> · <a href="https://valorimmo.app">valorimmo.app</a></p>
  </div>
</div>
</body>
</html>`,
  });
}

async function sendEmail({ to, subject, html }) {
  const 