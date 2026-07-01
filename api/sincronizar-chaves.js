export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido.'
    });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SYNC_TOKEN = process.env.SYNC_TOKEN;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SYNC_TOKEN) {
      return res.status(500).json({
        erro: 'Configuração do servidor incompleta.'
      });
    }

    const { token, chaves, codigos_desativar } = req.body || {};

    if (token !== SYNC_TOKEN) {
      return res.status(401).json({
        erro: 'Acesso negado.'
      });
    }

    if (!Array.isArray(chaves)) {
      return res.status(400).json({
        erro: 'Lista de chaves inválida.'
      });
    }

    const mapa = new Map();

    for (const item of chaves) {
      const codigoInterno = String(item.codigo_interno || '').trim();
      const identificacao = String(item.identificacao || '').trim();

      if (!codigoInterno || !identificacao) {
        continue;
      }

      if (!/^CH-\d{3}$/.test(codigoInterno)) {
        return res.status(400).json({
          erro: `Código interno inválido: ${codigoInterno}`
        });
      }

      mapa.set(codigoInterno, {
        codigo_interno: codigoInterno,
        identificacao,
        ativa: item.ativa === true
      });
    }

    const chavesLimpas = Array.from(mapa.values());

    let sincronizadas = 0;
    let desativadas = 0;

    if (chavesLimpas.length > 0) {
      const respostaUpsert = await fetch(
        `${SUPABASE_URL}/rest/v1/chaves?on_conflict=codigo_interno`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(chavesLimpas)
        }
      );

      const textoUpsert = await respostaUpsert.text();

      if (!respostaUpsert.ok) {
        return res.status(500).json({
          erro: 'Erro ao sincronizar chaves com Supabase.',
          detalhe: textoUpsert
        });
      }

      try {
        const dados = JSON.parse(textoUpsert);
        sincronizadas = Array.isArray(dados) ? dados.length : chavesLimpas.length;
      } catch (erro) {
        sincronizadas = chavesLimpas.length;
      }
    }

    const codigosDesativarLimpos = Array.isArray(codigos_desativar)
      ? Array.from(
          new Set(
            codigos_desativar
              .map((codigo) => String(codigo || '').trim())
              .filter((codigo) => /^CH-\d{3}$/.test(codigo))
          )
        )
      : [];

    if (codigosDesativarLimpos.length > 0) {
      const filtro = codigosDesativarLimpos.join(',');

      const respostaDesativar = await fetch(
        `${SUPABASE_URL}/rest/v1/chaves?codigo_interno=in.(${filtro})`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            ativa: false
          })
        }
      );

      const textoDesativar = await respostaDesativar.text();

      if (!respostaDesativar.ok) {
        return res.status(500).json({
          erro: 'Erro ao desativar chaves vazias no Supabase.',
          detalhe: textoDesativar
        });
      }

      try {
        const dados = JSON.parse(textoDesativar);
        desativadas = Array.isArray(dados) ? dados.length : 0;
      } catch (erro) {
        desativadas = 0;
      }
    }

    return res.status(200).json({
      sucesso: true,
      sincronizadas,
      desativadas
    });
  } catch (erro) {
    return res.status(500).json({
      erro: 'Erro interno: ' + erro.message
    });
  }
}