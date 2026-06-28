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
    { headers: { 'apikey': process.env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}` } }
  );
  if (!supabaseRes.ok) return res.status(500).json({ error: 'Erreur Supabase' });
  const rows = await supabaseRes.json();
  const d = rows[0];
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!d.rapport_html) return res.status(400).json({ error: 'Aucun rapport généré' });

  // 2. Stocker le PDF
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

  // 3. Lien Stripe selon formule
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

  // 4. Extraction du rapport pour l'aperçu
  const rh = d.rapport_html;
  const sectionCount = (rh.match(/class="section-num"/g) || []).length || 9;

  // Section 1 : du premier <div class="section"> au <div class="section"> de Section 02
  const firstSectionIdx = rh.indexOf('<div class="section">');
  const sec2TextIdx = rh.indexOf('Section 02');
  const sec2DivStart = sec2TextIdx > 0 ? rh.lastIndexOf('<div class="section">', sec2TextIdx) : -1;

  let section1Html = '';
  if (firstSectionIdx >= 0 && sec2DivStart > firstSectionIdx) {
    section1Html = rh.substring(firstSectionIdx, sec2DivStart).trimEnd();
  } else if (firstSectionIdx >= 0) {
    section1Html = rh.substring(firstSectionIdx, Math.min(firstSectionIdx + 4000, rh.length));
  }

  // Section 2 : teaser texte brut
  let section2Teaser = '';
  if (sec2TextIdx >= 0) {
    const sec3TextIdx = rh.indexOf('Section 03');
    const s2Raw = rh.substring(sec2TextIdx, sec3TextIdx > sec2TextIdx ? sec3TextIdx : sec2TextIdx + 5000);
    const s2Text = s2Raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^Section\s+0?2\s*/i, '')
      .replace(/^Contexte urbanistique[^.]*\.\s*/i, '')
      .trim();
    section2Teaser = s2Text.length > 320 ? s2Text.substring(0, 320) + '…' : s2Text;
  }

  // Sections verrouillées 3-7 (HTML pré-construit pour éviter backticks imbriqués)
  const lockedItems = [
    'Section 03 — Localisation et dynamique de marché',
    'Section 04 — Risques et contraintes',
    'Section 05 — Références de marché',
    'Section 06 — Cohérence du prix et fourchette d\'estimation',
    'Section 07 — Potentiel de valorisation',
  ];
  const lockedHtml = lockedItems.map(s =>
    '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;">'
    + '<span style="margin-right:10px;font-size:0.9rem;">🔒</span>'
    + '<span style="font-size:0.87rem;font-weight:600;color:transparent;text-shadow:0 0 8px rgba(27,45,91,0.5);">' + s + '</span>'
    + '</div>'
  ).join('');

  // 5. Email HTML
  const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Votre rapport Valorimmo est prêt</title>
<style>
body{font-family:Arial,'Helvetica Neue',sans-serif;background:#F4F7FB;margin:0;padding:0;color:#1F2937;}
.wrapper{max-width:640px;margin:0 auto;background:#fff;}
.header{padding:28px 40px;border-bottom:2px solid #E5E7EB;}
.footer{background:#F4F7FB;border-top:1.5px solid #E5E7EB;padding:20px 40px;text-align:center;}
.footer p{font-size:0.75rem;color:#9CA3AF;margin:0;line-height:1.8;}
.footer a{color:#C8933A;text-decoration:none;}
/* Styles rapport (Section 1 inline) */
.section-num{font-size:0.68rem;font-weight:700;color:#C8933A;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:4px;}
.section-title{font-size:1rem;color:#1B2D5B;font-weight:700;margin:0 0 14px;border-bottom:2px solid #E5E7EB;padding-bottom:8px;}
.box{border-radius:6px;padding:12px 16px;margin:10px 0;font-size:0.85rem;line-height:1.65;}
.box-title{font-weight:700;margin-bottom:5px;font-size:0.73rem;text-transform:uppercase;letter-spacing:0.05em;}
.box-blue{background:#EFF6FF;border:1.5px solid #BFDBF7;color:#1E3A5F;}
.box-gold{background:#FFFBEB;border:1.5px solid #FDE68A;color:#78350F;}
.box-red{background:#FEF2F2;border:1.5px solid #FECACA;color:#7F1D1D;}
.box-green{background:#F0FDF4;border:1.5px solid #BBF7D0;color:#14532D;}
table{width:100%;border-collapse:collapse;font-size:0.82rem;margin:10px 0;}
th{background:#1B2D5B;color:#fff;padding:8px 10px;text-align:left;font-size:0.73rem;font-weight:700;}
td{padding:8px 10px;border-bottom:1px solid #E5E7EB;color:#374151;vertical-align:top;}
td.oui{color:#16A34A;font-weight:600;}
td.non{color:#DC2626;font-weight:600;}
tr:nth-child(even) td{background:#F9FAFB;}
p{font-size:0.88rem;color:#374151;line-height:1.7;margin:0 0 10px;}
h3{font-size:0.92rem;color:#1B2D5B;margin:12px 0 8px;}
strong{color:#1B2D5B;}
</style>
</head>
<body>
<div class="wrapper">

  <!-- Header -->
  <div class="header">
    <img src="https://valorimmo.app/logo-original.png" alt="Valorimmo" width="160" style="display:block;border:0;height:auto;">
  </div>

  <!-- Intro -->
  <div style="padding:32px 40px 20px;">
    <h2 style="font-size:1.15rem;color:#1B2D5B;font-weight:700;margin:0 0 12px;">Votre rapport de diagnostic est prêt</h2>
    <p style="font-size:0.9rem;color:#4B5563;margin:0 0 8px;">Bonjour <strong>${prenom || nomComplet}</strong>,</p>
    <p style="font-size:0.9rem;color:#4B5563;line-height:1.7;margin:0 0 20px;">
      Votre rapport concernant le bien situé au <strong style="color:#1B2D5B;">${d.adresse_bien}</strong> est finalisé.
      Voici un aperçu de son contenu.
    </p>
    <div style="display:inline-block;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#3730A3;">
      📄 ${sectionCount} sections d'analyse complètes · ${dateFr}
    </div>
  </div>

  <!-- Section 1 visible -->
  <div style="margin:0 24px 20px;border:1.5px solid #BBF7D0;border-radius:10px;overflow:hidden;">
    <div style="background:#F0FDF4;border-bottom:1px solid #BBF7D0;padding:9px 16px;font-size:0.72rem;color:#14532D;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
      ✅ Section 1 visible — Synthèse du bien
    </div>
    <div style="padding:20px 22px;">
      ${section1Html}
    </div>
  </div>

  <!-- Section 2 teaser -->
  <div style="margin:0 24px 20px;border:1.5px solid #FDE68A;border-radius:10px;overflow:hidden;">
    <div style="background:#FFF7ED;border-bottom:1px solid #FDE68A;padding:9px 16px;font-size:0.72rem;color:#92400E;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
      🔍 Aperçu partiel — Section 2 · Analyse urbanistique (PLU)
    </div>
    <div style="padding:20px 22px;">
      <div class="section-num">Section 02</div>
      <h2 class="section-title">Contexte urbanistique et analyse PLU</h2>
      <p>${section2Teaser}</p>
      <p style="color:#9CA3AF;font-size:0.8rem;font-style:italic;margin-top:4px;">[ Analyse complète verrouillée — accessible après paiement ]</p>
    </div>
  </div>

  <!-- Sections verrouillées -->
  <div style="margin:0 24px 24px;background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:20px 22px;">
    <div style="font-size:0.72rem;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">
      🔒 ${sectionCount - 2} sections verrouillées · accessibles après paiement
    </div>

    ${lockedHtml}

    <!-- Estimation flouttée -->
    <div style="background:linear-gradient(135deg,#1B2D5B 0%,#0F1F3D 100%);border-radius:10px;padding:22px 20px;margin:14px 0;text-align:center;">
      <div style="font-size:0.68rem;color:#94A3B8;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:16px;font-weight:700;">
        Section 08 — Fourchette de prix estimée
      </div>
      <table style="width:100%;border-collapse:collapse;background:transparent;">
        <tr>
          <td style="text-align:center;padding:10px;border:none;background:transparent;width:50%;">
            <div style="font-size:1.6rem;font-weight:700;color:transparent;text-shadow:0 0 14px rgba(200,147,58,0.9);letter-spacing:0.06em;">███ 000 €</div>
            <div style="font-size:0.65rem;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;margin-top:6px;">Estimation basse</div>
          </td>
          <td style="text-align:center;padding:10px;border:none;background:transparent;width:50%;">
            <div style="font-size:1.6rem;font-weight:700;color:transparent;text-shadow:0 0 14px rgba(200,147,58,0.9);letter-spacing:0.06em;">███ 000 €</div>
            <div style="font-size:0.65rem;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;margin-top:6px;">Estimation haute</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 9 conclusion masquée -->
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:14px 16px;margin-top:6px;">
      <div style="display:flex;align-items:center;margin-bottom:10px;">
        <span style="margin-right:10px;">🔒</span>
        <span style="font-size:0.87rem;font-weight:600;color:transparent;text-shadow:0 0 8px rgba(27,45,91,0.5);">Section 09 — Conclusion et recommandations Valorimmo</span>
      </div>
      <div style="padding-left:24px;">
        <div style="background:#E2E8F0;border-radius:4px;height:9px;width:88%;margin:7px 0;"></div>
        <div style="background:#E2E8F0;border-radius:4px;height:9px;width:74%;margin:7px 0;"></div>
        <div style="background:#E2E8F0;border-radius:4px;height:9px;width:82%;margin:7px 0;"></div>
        <div style="background:#E2E8F0;border-radius:4px;height:9px;width:65%;margin:7px 0;"></div>
      </div>
    </div>
  </div>

  <!-- CTA paiement -->
  <div style="padding:0 24px 32px;text-align:center;">
    <p style="font-size:0.9rem;color:#4B5563;line-height:1.7;margin:0 0 24px;">
      Débloquez l'intégralité de votre rapport : fourchette d'estimation chiffrée, analyse des risques, références de marché et recommandations personnalisées.
    </p>
    <a href="${lienPaiement}" style="display:inline-block;background:#C8933A;color:#1A2535;text-decoration:none;padding:18px 44px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
      Payer et recevoir mon rapport complet
    </a>
    <div style="margin-top:20px;background:#FEF3E2;border:1px solid #F6D5A0;border-radius:8px;padding:14px 18px;text-align:left;">
      <p style="font-size:0.85rem;color:#92400E;margin:0;">
        📞 <strong>Laurent Buffard vous appellera</strong> après réception de votre rapport pour vous présenter les conclusions et répondre à vos questions.
      </p>
    </div>
  </div>

  <div class="footer">
    <p><strong>Valorimmo</strong> — Laurent Buffard<br>
    <a href="mailto:contact@valorimmo.app">contact@valorimmo.app</a> · <a href="https://valorimmo.app">valorimmo.app</a></p>
  </div>
</div>
</body>
</html>`;

  // 6. Envoi Brevo
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
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
