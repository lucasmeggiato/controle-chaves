export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const TOKEN_SECRETO = process.env.TOKEN_SECRETO;

    console.log('URL:', APPS_SCRIPT_URL);
    console.log('Token:', TOKEN_SECRETO ? 'presente' : 'ausente');

    if (!APPS_SCRIPT_URL || !TOKEN_SECRETO) {
      console.error('Variáveis de ambiente ausentes');
      return res.status(500).json({ erro: 'Configuração do servidor incompleta' });
    }

    const { acao, ...dadosExtras } = req.body;
    const payload = { token: TOKEN_SECRETO, acao, ...dadosExtras };
    const body = JSON.stringify(payload);

    console.log('Payload:', body);

    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    });

    console.log('Status:', resposta.status);

    const texto = await resposta.text();
    console.log('Resposta bruta (primeiros 200 caracteres):', texto.substring(0, 200));

    let data;
    try {
      data = JSON.parse(texto);
    } catch (e) {
      console.error('Resposta não é JSON:', texto);
      return res.status(500).json({ erro: 'Resposta inválida do servidor: ' + texto.substring(0, 100) });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro na função:', error.message);
    return res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
}