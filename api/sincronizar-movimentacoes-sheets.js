const LIMITE_POR_EXECUCAO = 100;

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

function obterConfiguracao() {
  const APPS_SCRIPT_SYNC_URL = process.env.APPS_SCRIPT_SYNC_URL;
  const SYNC_TOKEN = process.env.SYNC_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !APPS_SCRIPT_SYNC_URL ||
    !SYNC_TOKEN ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error('Variáveis de ambiente da sincronização não configuradas.');
  }

  return {
    APPS_SCRIPT_SYNC_URL,
    SYNC_TOKEN,
    SUPABASE_URL: SUPABASE_URL.replace(/\/$/, ''),
    SUPABASE_SERVICE_ROLE_KEY
  };
}

function obterTokenRecebido(req) {
  const autorizacao = String(req.headers.authorization || '');

  if (autorizacao.startsWith('Bearer ')) {
    return autorizacao.slice(7).trim();
  }

  return String(
    req.headers['x-sync-token'] ||
    (req.body && req.body.token) ||
    ''
  );
}

function requisicaoAutorizada(req, config) {
  const tokenRecebido = obterTokenRecebido(req);

  if (tokenRecebido && tokenRecebido === config.SYNC_TOKEN) {
    return true;
  }

  return usuarioAutenticado(req);
}

async function chamarSupabase(config, caminho, opcoes = {}) {
  const resposta = await fetch(`${config.SUPABASE_URL}/rest/v1/${caminho}`, {
    method: opcoes.method || 'GET',
    headers: {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });

  const texto = await resposta.text();

  let dados = null;

  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch (erro) {
      dados = texto;
    }
  }

  if (!resposta.ok) {
    throw new Error(
      `Supabase respondeu HTTP ${resposta.status}: ${texto}`
    );
  }

  return dados;
}

async function buscarMovimentacoesPendentes(config) {
  const campos = [
    'id',
    'chave_id',
    'chave_identificacao',
    'operador_retirada',
    'solicitante',
    'setor',
    'data_saida',
    'data_devolucao',
    'status',
    'operador_devolucao',
    'atualizado_em',
    'sheet_sync_status'
  ].join(',');

  const caminho = [
    'movimentacoes?',
    `select=${campos}`,
    '&sheet_sync_status=eq.pendente',
    '&order=atualizado_em.asc',
    `&limit=${LIMITE_POR_EXECUCAO}`
  ].join('');

  const movimentacoes = await chamarSupabase(config, caminho);

  return Array.isArray(movimentacoes) ? movimentacoes : [];
}

async function reservarMovimentacoes(config, movimentacoes) {
  const ids = movimentacoes.map((movimentacao) => movimentacao.id);

  if (ids.length === 0) {
    return [];
  }

  const filtroIds = ids
    .map((id) => encodeURIComponent(String(id)))
    .join(',');

  const campos = [
    'id',
    'chave_id',
    'chave_identificacao',
    'operador_retirada',
    'solicitante',
    'setor',
    'data_saida',
    'data_devolucao',
    'status',
    'operador_devolucao',
    'atualizado_em',
    'sheet_sync_status'
  ].join(',');

  const reservadas = await chamarSupabase(
    config,
    `movimentacoes?id=in.(${filtroIds})&sheet_sync_status=eq.pendente&select=${campos}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: {
        sheet_sync_status: 'sincronizando'
      }
    }
  );

  return Array.isArray(reservadas) ? reservadas : [];
}

async function enviarParaAppsScript(config, movimentacoes) {
  const resposta = await fetch(config.APPS_SCRIPT_SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: config.SYNC_TOKEN,
      acao: 'sincronizarMovimentacoes',
      movimentacoes
    })
  });

  const texto = await resposta.text();

  if (!resposta.ok) {
    throw new Error(
      `Apps Script respondeu HTTP ${resposta.status}: ${texto}`
    );
  }

  let dados;

  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch (erro) {
    throw new Error(
      'Apps Script retornou uma resposta inválida: ' + texto
    );
  }

  if (!dados || dados.sucesso !== true) {
    throw new Error(
      'Apps Script não confirmou a sincronização: ' + texto
    );
  }

  return dados;
}

async function alterarStatusSincronizacao(config, movimentacoes, status) {
  const ids = movimentacoes.map((movimentacao) => movimentacao.id);

  if (ids.length === 0) {
    return;
  }

  const filtroIds = ids
    .map((id) => encodeURIComponent(String(id)))
    .join(',');

  await chamarSupabase(
    config,
    `movimentacoes?id=in.(${filtroIds})`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal'
      },
      body: {
        sheet_sync_status: status
      }
    }
  );
}

async function registrarErro(config, erro, movimentacoes = []) {
  try {
    const ids = movimentacoes
      .map((movimentacao) => movimentacao.id)
      .filter((id) => id !== null && id !== undefined);

    await chamarSupabase(config, 'logs_sistema', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal'
      },
      body: {
        acao: 'sincronizar_movimentacoes_sheets',
        erro: String(erro && erro.message ? erro.message : erro).slice(0, 1000),
        operador: '',
        chave: '',
        detalhes: {
          quantidade: ids.length,
          movimentacoes_ids: ids
        }
      }
    });
  } catch (erroLog) {}
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido.'
    });
  }

  let config;
  let movimentacoesPendentes = [];
  let movimentacoesReservadas = [];

  try {
    config = obterConfiguracao();

    if (!requisicaoAutorizada(req, config)) {
      return res.status(401).json({
        erro: 'Acesso negado.'
      });
    }

    movimentacoesPendentes = await buscarMovimentacoesPendentes(config);

    if (movimentacoesPendentes.length === 0) {
      return res.status(200).json({
        sucesso: true,
        sincronizadas: 0,
        mensagem: 'Nenhuma movimentação pendente.'
      });
    }

    movimentacoesReservadas = await reservarMovimentacoes(
      config,
      movimentacoesPendentes
    );

    if (movimentacoesReservadas.length === 0) {
      return res.status(200).json({
        sucesso: true,
        sincronizadas: 0,
        mensagem: 'As movimentações pendentes já foram reservadas por outra sincronização.'
      });
    }

    const respostaAppsScript = await enviarParaAppsScript(
      config,
      movimentacoesReservadas
    );

    await alterarStatusSincronizacao(
      config,
      movimentacoesReservadas,
      'sincronizado'
    );

    return res.status(200).json({
      sucesso: true,
      sincronizadas: movimentacoesReservadas.length,
      respostaAppsScript,
      haMaisPendentes: movimentacoesReservadas.length === LIMITE_POR_EXECUCAO
    });
  } catch (erro) {
    if (config && movimentacoesReservadas.length > 0) {
      await alterarStatusSincronizacao(
        config,
        movimentacoesReservadas,
        'pendente'
      );
    }

    if (config) {
      await registrarErro(config, erro, movimentacoesReservadas);
    }

    return res.status(500).json({
      erro: 'Erro ao sincronizar movimentações com o Google Sheets.',
      detalhe: String(erro && erro.message ? erro.message : erro),
      mantidasComoPendentes: movimentacoesReservadas.length
    });
  }
}