export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  res.setHeader(
    'Set-Cookie',
    [
      'chaves_auth=',
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=0'
    ].join('; ')
  );

  return res.status(200).json({
    sucesso: true
  });
}