export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { id, rapport_html, notes_internes, statut } = req.body;

  if (!id) return res.status(400).json({ error: 'ID manquant' });

  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/demandes?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ rapport_html, notes_internes, statut }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('Supabase save error:', err);
    return res.status(500).json({ error: 'Erreur sauvegarde' });
  }

  return res.status(200).json({ ok: true });
}
