// api/controle.js
export default async function handler(req, res) {
  // Configurações via variáveis de ambiente (definidas no painel da Vercel)
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const TOKEN_SECRETO = process.env.TOKEN_SECRETO;

  // Apenas POST é aceito
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const { acao, ...dadosExtras } = req.body;

    // Monta o payload que o Apps Script espera, incluindo o token
    const payload = {
      token: TOKEN_SECRETO,
      acao,
      ...dadosExtras
    };

    // Encaminha a requisição para o Google Apps Script
    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resposta.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro interno no servidor' });
  }
}