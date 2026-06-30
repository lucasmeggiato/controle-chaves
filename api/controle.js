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

    console.log('Enviando para:', APPS_SCRIPT_URL);
    console.log('Payload:', body);

    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString()
      },
      body: body,
      redirect: 'manual'
    });

    console.log('Status da resposta:', resposta.status);

    if (resposta.status >= 300 && resposta.status < 400) {
      console.error('Redirecionamento detectado');
      return res.status(500).json({ erro: 'Redirecionamento detectado, verifique a URL' });
    }

    const texto = await resposta.text();
    console.log('Resposta bruta:', texto.substring(0, 200));

    let data;
    try {
      data = JSON.parse(texto);
    } catch (e) {
      console.error('Resposta não é JSON:', texto.substring(0, 300));
      return res.status(500).json({ erro: 'Resposta inválida do servidor' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro na função:', error.message);
    return res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
}