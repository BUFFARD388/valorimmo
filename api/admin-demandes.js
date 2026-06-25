export default async function handler(req, res) {
  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  if (req.method === 'GET') {
    // Liste toutes les demandes
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/demandes?select=*&order=created_at.desc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
      }
    );
    const data = await response.json();
    return res.status(200).json(data);
  }

  return res.status(405).end();
}
