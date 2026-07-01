function lerCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, item) => {
    const partes = item.trim().split('=');
    const chave = partes.shift();

    if (!chave) {
      return cookies;
    }

    cookies[chave] = decodeURIComponent(partes.join('=') || '');
    return cookies;
  }, {});
}

function usuarioAutenticado(req) {
  const cookies = lerCookies(req.headers.cookie || '');
  return (
    process.env.AUTH_COOKIE_SECRET &&
    cookies.chaves_auth === process.env.AUTH_COOKIE_SECRET
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido'
    });
  }

  if (!usuarioAutenticado(req)) {
    return res.status(401).json({
      erro: 'Não autorizado'
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

    const { acao, ...dadosExtras } = req.body || {};

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