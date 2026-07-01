export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido'
    });
  }

  const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
  const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET;

  if (!AUTH_PASSWORD || !AUTH_COOKIE_SECRET) {
    return res.status(500).json({
      erro: 'Autenticação não configurada.'
    });
  }

  const { senha } = req.body || {};

  if (senha !== AUTH_PASSWORD) {
    return res.status(401).json({
      erro: 'Senha inválida.'
    });
  }

  res.setHeader(
    'Set-Cookie',
    [
      `chaves_auth=${encodeURIComponent(AUTH_COOKIE_SECRET)}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=43200'
    ].join('; ')
  );

  return res.status(200).json({
    sucesso: true
  });
}