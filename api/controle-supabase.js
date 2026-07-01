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

const TIMEZONE = 'America/Sao_Paulo';
const VERSAO_SISTEMA = 'supabase-2026-07-01-01';

function textoSeguro(valor) {
  return String(valor || '').trim();
}

function normalizarTexto(valor) {
  return textoSeguro(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function formatarData(valor) {
  if (!valor) {
    return '';
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(data);
}

function getOperadorAtual() {
  const agora = new Date();

  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  }).formatToParts(agora);

  const mapa = {};

  partes.forEach((parte) => {
    mapa[parte.type] = parte.value;
  });

  const ano = Number(mapa.year);
  const mes = Number(mapa.month) - 1;
  const dia = Number(mapa.day);
  const hora = Number(mapa.hour);

  const shiftDate = new Date(ano, mes, dia);
  const refDate = new Date(2026, 5, 29);

  let isDiurno;

  if (hora >= 7 && hora < 19) {
    isDiurno = true;
  } else if (hora >= 19) {
    isDiurno = false;
  } else {
    isDiurno = false;
    shiftDate.setDate(shiftDate.getDate() - 1);
  }

  const diffTime = shiftDate.getTime() - refDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (isDiurno) {
    return diffDays % 2 === 0 ? 'Felipe - Matutino' : 'Lucas - Matutino';
  }

  return diffDays % 2 === 0 ? 'Marcel - Noturno' : 'Evandro - Noturno';
}

function obterConfigSupabase() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Variáveis do Supabase não configuradas.');
  }

  return {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  };
}

async function chamarSupabase(caminho, opcoes = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = obterConfigSupabase();

  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method: opcoes.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });

  const texto = await resposta.text();

  let data = null;

  try {
    data = texto ? JSON.parse(texto) : null;
  } catch (erro) {
    data = texto;
  }

  if (!resposta.ok) {
    const detalhe = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(detalhe);
  }

  return data;
}

async function registrarLog(acao, erro, operador = '', chave = '', detalhes = {}) {
  try {
    await chamarSupabase('logs_sistema', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal'
      },
      body: {
        acao: textoSeguro(acao),
        erro: textoSeguro(erro),
        operador: textoSeguro(operador),
        chave: textoSeguro(chave),
        detalhes
      }
    });
  } catch (e) {}
}

function montarHistorico(movimentacoes, limite) {
  const historico = [];

  movimentacoes.forEach((mov) => {
    const dataSaida = mov.data_saida ? new Date(mov.data_saida) : null;

    if (dataSaida && !Number.isNaN(dataSaida.getTime())) {
      historico.push({
        tipo: 'Retirada',
        chave: mov.chave_identificacao || '',
        solicitante: mov.solicitante || '',
        setor: mov.setor || '',
        operador: mov.operador_retirada || '',
        dataTexto: formatarData(mov.data_saida),
        timestamp: dataSaida.getTime()
      });
    }

    const dataDevolucao = mov.data_devolucao ? new Date(mov.data_devolucao) : null;

    if (dataDevolucao && !Number.isNaN(dataDevolucao.getTime())) {
      historico.push({
        tipo: 'Devolução',
        chave: mov.chave_identificacao || '',
        solicitante: mov.solicitante || '',
        setor: mov.setor || '',
        operador: mov.operador_devolucao || '',
        dataTexto: formatarData(mov.data_devolucao),
        timestamp: dataDevolucao.getTime()
      });
    }
  });

  historico.sort((a, b) => b.timestamp - a.timestamp);

  return historico.slice(0, limite);
}

function historicoCombinaComTermo(item, termoNormalizado) {
  if (!termoNormalizado) {
    return true;
  }

  const texto = [
    item.tipo,
    item.chave,
    item.operador,
    item.solicitante,
    item.setor,
    item.dataTexto
  ].join(' ');

  return normalizarTexto(texto).includes(termoNormalizado);
}

async function getDashboard(dados) {
  let limiteHistorico = Number(dados.limiteHistorico);

  if (Number.isNaN(limiteHistorico)) {
    limiteHistorico = 80;
  }

  const chavesAtivas = await chamarSupabase(
    'chaves?select=id,codigo_interno,identificacao,ativa&ativa=eq.true&order=codigo_interno.asc'
  );

  const pendentesBanco = await chamarSupabase(
    [
      'movimentacoes?',
      'select=id,chave_id,chave_identificacao,operador_retirada,solicitante,setor,data_saida,status',
      '&status=eq.em_uso',
      '&order=data_saida.asc'
    ].join('')
  );

  const idsEmUso = new Set(
    pendentesBanco.map((p) => p.chave_id)
  );

  const chavesDisponiveis = chavesAtivas
    .filter((chave) => !idsEmUso.has(chave.id))
    .map((chave) => chave.identificacao);

  const pendentes = pendentesBanco.map((p) => ({
    operador: p.operador_retirada,
    solicitante: p.solicitante,
    setor: p.setor,
    chave: p.chave_identificacao,
    saida: p.data_saida
  }));

  let historico = [];

  if (limiteHistorico > 0) {
    const movimentosRecentes = await chamarSupabase(
      [
        'movimentacoes?',
        'select=id,chave_identificacao,operador_retirada,solicitante,setor,data_saida,data_devolucao,status,operador_devolucao,atualizado_em',
        '&order=atualizado_em.desc',
        '&limit=300'
      ].join('')
    );

    historico = montarHistorico(movimentosRecentes, limiteHistorico);
  }

  return {
    sucesso: true,
    versao: VERSAO_SISTEMA,
    operador: getOperadorAtual(),
    servidorDataHora: formatarData(new Date()),
    chaves: chavesDisponiveis,
    pendentes,
    historico
  };
}

async function buscarHistorico(dados) {
  const termoNormalizado = normalizarTexto(dados.termo || '');
  const limite = Number(dados.limite) || 80;

  const movimentos = await chamarSupabase(
    [
      'movimentacoes?',
      'select=id,chave_identificacao,operador_retirada,solicitante,setor,data_saida,data_devolucao,status,operador_devolucao,atualizado_em',
      '&order=atualizado_em.desc',
      '&limit=5000'
    ].join('')
  );

  const historicoCompleto = montarHistorico(movimentos, 10000);

  const historicoFiltrado = historicoCompleto
    .filter((item) => historicoCombinaComTermo(item, termoNormalizado))
    .slice(0, limite);

  return {
    sucesso: true,
    historico: historicoFiltrado
  };
}

async function retirarChave(dados) {
  const operador = textoSeguro(dados.operador);
  const solicitante = textoSeguro(dados.solicitante);
  const setor = textoSeguro(dados.setor);
  const chaveInformada = textoSeguro(dados.chave);

  if (!operador || !solicitante || !setor || !chaveInformada) {
    return {
      erro: 'Todos os campos são obrigatórios.'
    };
  }

  const chaves = await chamarSupabase(
    [
      'chaves?',
      'select=id,codigo_interno,identificacao,ativa',
      '&ativa=eq.true',
      '&identificacao=eq.',
      encodeURIComponent(chaveInformada),
      '&limit=1'
    ].join('')
  );

  if (!chaves.length) {
    await registrarLog(
      'retirar',
      'Chave não cadastrada ou inativa.',
      operador,
      chaveInformada
    );

    return {
      erro: 'Chave não cadastrada ou inativa.'
    };
  }

  const chave = chaves[0];

  const pendente = await chamarSupabase(
    [
      'movimentacoes?',
      'select=id',
      '&chave_id=eq.',
      chave.id,
      '&status=eq.em_uso',
      '&limit=1'
    ].join('')
  );

  if (pendente.length) {
    return {
      erro: 'Esta chave já está em uso.'
    };
  }

  try {
    await chamarSupabase('movimentacoes', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation'
      },
      body: {
        chave_id: chave.id,
        chave_identificacao: chave.identificacao,
        operador_retirada: operador,
        solicitante,
        setor,
        data_saida: new Date().toISOString(),
        status: 'em_uso',
        sheet_sync_status: 'pendente'
      }
    });
  } catch (erro) {
    if (String(erro.message).includes('movimentacoes_chave_em_uso_unica')) {
      return {
        erro: 'Esta chave já está em uso.'
      };
    }

    await registrarLog('retirar', erro.message, operador, chaveInformada);

    return {
      erro: 'Erro ao registrar retirada: ' + erro.message
    };
  }

  return {
    sucesso: true
  };
}

async function devolverChave(dados) {
  const chaveInformada = textoSeguro(dados.chave);
  const operadorDevolucao = textoSeguro(dados.operadorDevolucao);

  if (!chaveInformada || !operadorDevolucao) {
    return {
      erro: 'Chave e operador que está devolvendo são obrigatórios.'
    };
  }

  const pendentes = await chamarSupabase(
    [
      'movimentacoes?',
      'select=id,chave_identificacao,status',
      '&status=eq.em_uso',
      '&chave_identificacao=eq.',
      encodeURIComponent(chaveInformada),
      '&limit=1'
    ].join('')
  );

  if (!pendentes.length) {
    await registrarLog(
      'devolver',
      'Chave não encontrada em uso.',
      operadorDevolucao,
      chaveInformada
    );

    return {
      erro: 'Chave não encontrada em uso.'
    };
  }

  const movimento = pendentes[0];

  try {
    await chamarSupabase(`movimentacoes?id=eq.${movimento.id}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: {
        data_devolucao: new Date().toISOString(),
        status: 'devolvida',
        operador_devolucao: operadorDevolucao,
        sheet_sync_status: 'pendente'
      }
    });
  } catch (erro) {
    await registrarLog('devolver', erro.message, operadorDevolucao, chaveInformada);

    return {
      erro: 'Erro ao registrar devolução: ' + erro.message
    };
  }

  return {
    sucesso: true
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido.'
    });
  }

  if (!usuarioAutenticado(req)) {
    return res.status(401).json({
      erro: 'Não autorizado.'
    });
  }

  try {
    const dados = req.body || {};
    const acao = dados.acao;

    if (!acao) {
      return res.status(400).json({
        erro: 'Ação não informada.'
      });
    }

    if (acao === 'getDashboard') {
      const resposta = await getDashboard(dados);
      return res.status(200).json(resposta);
    }

    if (acao === 'buscarHistorico') {
      const resposta = await buscarHistorico(dados);
      return res.status(200).json(resposta);
    }

    if (acao === 'retirar') {
      const resposta = await retirarChave(dados);
      return res.status(200).json(resposta);
    }

    if (acao === 'devolver') {
      const resposta = await devolverChave(dados);
      return res.status(200).json(resposta);
    }

    if (acao === 'getVersaoSistema') {
      return res.status(200).json({
        sucesso: true,
        versao: VERSAO_SISTEMA
      });
    }

    return res.status(400).json({
      erro: 'Ação desconhecida.'
    });
  } catch (erro) {
    await registrarLog(
      'erro_geral',
      erro.message,
      req.body && req.body.operador,
      req.body && req.body.chave
    );

    return res.status(500).json({
      erro: 'Erro interno: ' + erro.message
    });
  }
}