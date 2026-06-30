export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido'
    });
  }

  try {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const TOKEN_SECRETO = process.env.TOKEN_SECRETO;

    if (!APPS_SCRIPT_URL || !TOKEN_SECRETO) {
      return res.status(500).json({
        erro: 'Configuração do servidor incompleta.'
      });
    }

    const { acao, ...dadosExtras } = req.body;

    if (!acao) {
      return res.status(400).json({
        erro: 'Ação não informada.'
      });
    }

    const payload = {
      token: TOKEN_SECRETO,
      acao,
      ...dadosExtras
    };

    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const texto = await resposta.text();

    let data;

    try {
      data = JSON.parse(texto);
    } catch (erro) {
      return res.status(500).json({
        erro: 'Resposta inválida do Apps Script.'
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      erro: 'Erro interno: ' + error.message
    });
  }
}