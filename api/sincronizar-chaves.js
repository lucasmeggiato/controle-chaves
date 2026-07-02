var SYNC_ABA_CHAVES_SUPABASE = 'Chaves';

var SYNC_URL_SUPABASE = 'https://controle-chaves-umber.vercel.app/api/sincronizar-chaves';

var SYNC_TOKEN_SUPABASE = 'sync_chaves_2026_X9pQ72LmA45vR8zK';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Supabase')
    .addItem('Sincronizar chaves', 'sincronizarChavesComSupabase')
    .addToUi();
}

function syncTextoSeguro(valor) {
  return String(valor || '').trim();
}

function syncNormalizarTexto(valor) {
  return syncTextoSeguro(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function syncIdentificacaoEhVaga(identificacao) {
  var texto = syncNormalizarTexto(identificacao);

  if (!texto) {
    return true;
  }

  if (texto === 'vago') {
    return true;
  }

  return /(^|[\s\-_/])vago($|[\s\-_/])/.test(texto);
}

function syncConverterAtiva(valor) {
  var texto = syncNormalizarTexto(valor);

  if (valor === true) {
    return true;
  }

  if (
    texto === 'true' ||
    texto === 'verdadeiro' ||
    texto === 'sim' ||
    texto === 's' ||
    texto === '1'
  ) {
    return true;
  }

  return false;
}

function sincronizarChavesComSupabase() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(SYNC_ABA_CHAVES_SUPABASE);

  if (!aba) {
    SpreadsheetApp.getUi().alert(
      'A aba "' + SYNC_ABA_CHAVES_SUPABASE + '" não foi encontrada.'
    );
    return;
  }

  var ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    SpreadsheetApp.getUi().alert('Não há chaves para sincronizar.');
    return;
  }

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 3).getValues();

  var chaves = [];
  var codigosDesativar = [];

  for (var i = 0; i < dados.length; i++) {
    var linha = i + 2;

    var codigoInterno = syncTextoSeguro(dados[i][0]);
    var identificacao = syncTextoSeguro(dados[i][1]);
    var ativa = syncConverterAtiva(dados[i][2]);

    if (!codigoInterno && !identificacao) {
      continue;
    }

    if (!codigoInterno && identificacao) {
      SpreadsheetApp.getUi().alert(
        'Linha ' + linha + ' tem identificação, mas está sem codigo_interno.'
      );
      return;
    }

    if (codigoInterno && !/^CH-\d{3}$/.test(codigoInterno)) {
      SpreadsheetApp.getUi().alert(
        'Código interno inválido na linha ' + linha + ': ' + codigoInterno
      );
      return;
    }

    if (codigoInterno && syncIdentificacaoEhVaga(identificacao)) {
      codigosDesativar.push(codigoInterno);
      continue;
    }

    chaves.push({
      codigo_interno: codigoInterno,
      identificacao: identificacao,
      ativa: ativa
    });
  }

  if (chaves.length === 0 && codigosDesativar.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhuma chave válida encontrada.');
    return;
  }

  var confirmar = SpreadsheetApp.getUi().alert(
    'Sincronizar com Supabase?',
    'Chaves cadastradas: ' + chaves.length +
      '\nPosições vagas/desativadas: ' + codigosDesativar.length +
      '\n\nDeseja continuar?',
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );

  if (confirmar !== SpreadsheetApp.getUi().Button.YES) {
    return;
  }

  var payload = {
    token: SYNC_TOKEN_SUPABASE,
    chaves: chaves,
    codigos_desativar: codigosDesativar
  };

  try {
    planilha.toast(
      'Enviando chaves para o Supabase...',
      'Supabase',
      6
    );

    var resposta = UrlFetchApp.fetch(SYNC_URL_SUPABASE, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var codigo = resposta.getResponseCode();
    var texto = resposta.getContentText();
    var json = {};

    try {
      json = JSON.parse(texto);
    } catch (erro) {}

    if (codigo < 200 || codigo >= 300 || !json.sucesso) {
      var mensagemErro = json.erro || texto;

      if (json.detalhe) {
        mensagemErro += '\n\nDetalhe:\n' + json.detalhe;
      }

      SpreadsheetApp.getUi().alert(
        'Erro ao sincronizar:\n\n' + mensagemErro
      );
      return;
    }

    planilha.toast(
      'Sincronização concluída.',
      'Supabase',
      6
    );

    SpreadsheetApp.getUi().alert(
      'Sincronização concluída!' +
      '\n\nChaves cadastradas sincronizadas: ' + json.sincronizadas +
      '\nPosições vagas/desativadas: ' + json.desativadas
    );
  } catch (erro) {
    SpreadsheetApp.getUi().alert(
      'Erro de conexão ao sincronizar:\n\n' + erro.message
    );
  }
}