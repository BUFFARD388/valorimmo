import { generatePdfBase64 } from '../lib/pdf-generator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { html } = body;
  if (!html) return res.status(400).json({ error: 'HTML manquant' });

  const base64 = await generatePdfBase64(html);
  if (!base64) return res.status(500).json({ error: 'Échec génération PDF' });

  return res.status(200).json({ base64 });
}
