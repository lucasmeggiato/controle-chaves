export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        erro: 'Variáveis do Supabase não configuradas.'
      });
    }

    const resposta = await fetch(
      `${SUPABASE_URL}/rest/v1/chaves?select=codigo_interno,identificacao,ativa&order=codigo_interno.asc`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const texto = await resposta.text();

    if (!resposta.ok) {
      return res.status(500).json({
        erro: 'Erro ao consultar Supabase.',
        detalhe: texto
      });
    }

    const chaves = JSON.parse(texto);

    return res.status(200).json({
      sucesso: true,
      total: chaves.length,
      primeiras: chaves.slice(0, 10)
    });
  } catch (erro) {
    return res.status(500).json({
      erro: 'Erro interno: ' + erro.message
    });
  }
}