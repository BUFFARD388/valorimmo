export default async function handler(req, res) {
  return res.status(410).json({ error: 'Génération PDF côté serveur désactivée — utiliser la génération côté client.' });
}
