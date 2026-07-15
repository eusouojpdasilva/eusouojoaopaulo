// Vercel Cron Job — mantém o projeto Supabase ativo
// Executa a cada 4 dias via vercel.json
export default async function handler(req, res) {
  const SUPABASE_URL = 'https://swiszowpfurkegrnbwfj.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3aXN6b3dwZnVya2Vncm5id2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI4MjksImV4cCI6MjA5NTczODgyOX0.gRroKE-86kI5O_8cMwtg8-l2qqWWQisxwk6GYlvz0es';

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    const ok = r.ok;
    res.status(200).json({ ok, status: r.status, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
