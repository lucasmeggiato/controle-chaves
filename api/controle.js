// api/controle.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const TOKEN_SECRETO = process.env.TOKEN_SECRETO;

    if (!APPS_SCRIPT_URL || !TOKEN_SECRETO) {
      return res.status(500).json({ erro: 'Configuração do servidor incompleta' });
    }

    const { acao, ...dadosExtras } = req.body;
    const payload = { token: TOKEN_SECRETO, acao, ...dadosExtras };
    const body = JSON.stringify(payload);

    // Envia manualmente com Content-Length e sem seguir redirecionamentos
    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString()
      },
      body: body,
      redirect: 'manual' // Importante: não seguir redirecionamentos
    });

    if (resposta.status >= 300 && resposta.status < 400) {
      // Redirecionamento detectado – algo errado com a URL
      return res.status(500).json({ erro: 'Redirecionamento detectado, verifique a URL' });
    }

    const data = await resposta.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
}