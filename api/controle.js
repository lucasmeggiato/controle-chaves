// api/controle.js
export default async function handler(req, res) {
  // Logs para depuração (visíveis no painel da Vercel em Functions > Logs)
  console.log('Requisição recebida:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    // Verifica se as variáveis de ambiente existem
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const TOKEN_SECRETO = process.env.TOKEN_SECRETO;

    if (!APPS_SCRIPT_URL) {
      console.error('APPS_SCRIPT_URL não definida');
      return res.status(500).json({ erro: 'Configuração do servidor incompleta: URL ausente' });
    }
    if (!TOKEN_SECRETO) {
      console.error('TOKEN_SECRETO não definido');
      return res.status(500).json({ erro: 'Configuração do servidor incompleta: Token ausente' });
    }

    const { acao, ...dadosExtras } = req.body;
    console.log('Ação:', acao, 'Dados:', dadosExtras);

    const payload = {
      token: TOKEN_SECRETO,
      acao,
      ...dadosExtras
    };

    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resposta.json();
    console.log('Resposta do Apps Script:', data);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro na função:', error.message);
    return res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
}