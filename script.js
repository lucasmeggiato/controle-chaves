const SCRIPT_URL = '/api/controle';

let totalChaves = 0;
let emUso = 0;
let disponiveis = 0;

let todasChavesDisponiveis = [];
let pendentesAtuais = [];
let historicoCompleto = [];

const INTERVALO_ATUALIZACAO_MS = 30000;
const LIMITE_HISTORICO = 80;

let atualizacaoEmAndamento = false;
let operacaoEmAndamento = false;
let timeoutBuscaHistorico = null;

async function fetchAPI(acao, dadosExtras = {}) {
    const resp = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            acao,
            ...dadosExtras
        })
    });

    if (resp.status === 401) {
        window.location.href = '/login.html';
        throw new Error('Não autorizado');
    }

    const data = await resp.json();

    if (!resp.ok) {
        throw new Error(data.erro || 'Erro de conexão.');
    }

    return data;
}

function mostrarMensagem(elementoId, texto, erro = false) {
    const elemento = document.getElementById(elementoId);

    if (!elemento) {
        return;
    }

    elemento.textContent = texto;
    elemento.classList.toggle('erro', erro);

    setTimeout(() => {
        elemento.textContent = '';
        elemento.classList.remove('erro');
    }, 5000);
}

function setOperacaoEmAndamento(valor) {
    operacaoEmAndamento = valor;

    const btnRetirar = document.getElementById('btnRetirar');

    if (btnRetirar) {
        btnRetirar.disabled = valor;
        btnRetirar.textContent = valor ? 'Processando...' : 'Retirar';
    }

    document.querySelectorAll('.btn-devolver').forEach((btn) => {
        btn.disabled = valor;
        btn.textContent = valor ? 'Aguarde...' : 'Devolver';
    });
}

function atualizarRelogio() {
    const agora = new Date();

    document.getElementById('relogio').textContent = [
        agora.getHours(),
        agora.getMinutes(),
        agora.getSeconds()
    ].map((n) => String(n).padStart(2, '0')).join(':');
}

setInterval(atualizarRelogio, 1000);
atualizarRelogio();

function normalizarTexto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escaparTexto(texto) {
    return String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function atualizarEstatisticas() {
    totalChaves = emUso + disponiveis;

    document.getElementById('totalChaves').textContent = totalChaves;
    document.getElementById('emUso').textContent = emUso;
    document.getElementById('disponiveis').textContent = disponiveis;
}

function atualizarOperador(operador) {
    const span = document.getElementById('nomeOperador');
    const statusDiv = document.getElementById('statusOperador');

    if (!span || !statusDiv) {
        return;
    }

    if (operador) {
        span.textContent = operador;
        statusDiv.className = 'status-sistema ativo';
    } else {
        span.textContent = 'Nenhum operador de plantão';
        statusDiv.className = 'status-sistema inativo';
    }
}

function chaveCombinaComFiltro(chave, filtro) {
    const chaveNormalizada = normalizarTexto(chave);
    const filtroNormalizado = normalizarTexto(filtro);

    if (!filtroNormalizado) {
        return true;
    }

    if (chaveNormalizada.startsWith(filtroNormalizado)) {
        return true;
    }

    return chaveNormalizada
        .split(/[\s\-_/]+/)
        .some((parte) => parte.startsWith(filtroNormalizado));
}

function renderizarChavesFiltradas(chaveSelecionadaAntes = '') {
    const sel = document.getElementById('chaveDisponivel');
    const campoFiltro = document.getElementById('filtroChave');

    if (!sel) {
        return;
    }

    const filtro = campoFiltro ? campoFiltro.value : '';

    const chavesFiltradas = todasChavesDisponiveis.filter((chave) =>
        chaveCombinaComFiltro(chave, filtro)
    );

    sel.innerHTML = '';

    if (todasChavesDisponiveis.length === 0) {
        sel.innerHTML = '<option value="">Nenhuma chave disponível</option>';
        return;
    }

    if (chavesFiltradas.length === 0) {
        sel.innerHTML = '<option value="">Nenhuma chave encontrada</option>';
        return;
    }

    chavesFiltradas.forEach((chave) => {
        const opt = document.createElement('option');
        opt.value = chave;
        opt.textContent = chave;
        sel.appendChild(opt);
    });

    if (chaveSelecionadaAntes && chavesFiltradas.includes(chaveSelecionadaAntes)) {
        sel.value = chaveSelecionadaAntes;
    }
}

function renderizarPendentes() {
    const lista = document.getElementById('listaPendentes');

    if (!lista) {
        return;
    }

    lista.innerHTML = '';

    if (!pendentesAtuais.length) {
        lista.innerHTML = '<li>Nenhuma chave em uso.</li>';
        return;
    }

    pendentesAtuais.forEach((p) => {
        const li = document.createElement('li');

        const chaveSegura = escaparTexto(p.chave);
        const operadorSeguro = escaparTexto(p.operador);
        const solicitanteSeguro = escaparTexto(p.solicitante);
        const setorSeguro = escaparTexto(p.setor);

        let saidaFormatada = '';

        try {
            saidaFormatada = new Date(p.saida).toLocaleString('pt-BR');
        } catch (erro) {
            saidaFormatada = p.saida;
        }

        li.innerHTML = `
            <div class="info-chave">
                <div class="texto-chave">
                    Chave: ${chaveSegura}
                </div>

                <div class="detalhes-registro">
                    <span>
                        <b>Entregue por:</b>
                        ${operadorSeguro}
                    </span>

                    <span>
                        <b>Solicitante:</b>
                        ${solicitanteSeguro}
                    </span>

                    <span>
                        <b>Setor:</b>
                        ${setorSeguro}
                    </span>

                    <span>
                        <b>Saída:</b>
                        ${escaparTexto(saidaFormatada)}
                    </span>
                </div>
            </div>

            <div class="acoes">
                <button class="btn-devolver">Devolver</button>
            </div>
        `;

        li.querySelector('.btn-devolver').addEventListener('click', () => {
            devolver(p.chave);
        });

        lista.appendChild(li);
    });
}

function historicoCombinaComFiltro(item, filtro) {
    const filtroNormalizado = normalizarTexto(filtro);

    if (!filtroNormalizado) {
        return true;
    }

    const textoBusca = [
        item.tipo,
        item.chave,
        item.operador,
        item.solicitante,
        item.setor,
        item.dataTexto
    ].join(' ');

    return normalizarTexto(textoBusca).includes(filtroNormalizado);
}

function atualizarContadorHistorico(totalExibido, totalGeral) {
    const contador = document.getElementById('contadorHistorico');

    if (!contador) {
        return;
    }

    if (totalGeral === 0) {
        contador.textContent = '0 registros';
    } else if (totalExibido === totalGeral) {
        contador.textContent = totalGeral === 1 ? '1 registro' : `${totalGeral} registros`;
    } else {
        contador.textContent = `${totalExibido} de ${totalGeral}`;
    }
}

function renderizarHistorico() {
    const lista = document.getElementById('listaHistorico');
    const campoFiltro = document.getElementById('filtroHistorico');

    if (!lista) {
        return;
    }

    const filtro = campoFiltro ? campoFiltro.value : '';

    const historicoFiltrado = historicoCompleto.filter((item) =>
        historicoCombinaComFiltro(item, filtro)
    );

    lista.innerHTML = '';

    atualizarContadorHistorico(historicoFiltrado.length, historicoCompleto.length);

    if (!historicoCompleto.length) {
        lista.innerHTML = '<li class="item-vazio">Nenhuma movimentação registrada.</li>';
        return;
    }

    if (!historicoFiltrado.length) {
        lista.innerHTML = '<li class="item-vazio">Nenhum resultado encontrado.</li>';
        return;
    }

    historicoFiltrado.forEach((item) => {
        const li = document.createElement('li');

        const isDevolucao = item.tipo === 'Devolução';
        const classeBadge = isDevolucao ? 'badge-devolucao' : 'badge-retirada';
        const textoOperador = isDevolucao ? 'Recebida por' : 'Entregue por';

        li.innerHTML = `
            <span class="badge-evento ${classeBadge}">
                ${escaparTexto(item.tipo)}
            </span>

            <div class="historico-info">
                <strong>Chave: ${escaparTexto(item.chave)}</strong>

                <div class="historico-detalhes">
                    <span>
                        <b>${textoOperador}:</b>
                        ${escaparTexto(item.operador)}
                    </span>

                    <span>
                        <b>Solicitante:</b>
                        ${escaparTexto(item.solicitante)}
                    </span>

                    <span>
                        <b>Setor:</b>
                        ${escaparTexto(item.setor)}
                    </span>
                </div>
            </div>

            <div class="historico-data">
                ${escaparTexto(item.dataTexto)}
            </div>
        `;

        lista.appendChild(li);
    });
}

async function carregarDashboard(silencioso = true) {
    if (atualizacaoEmAndamento) {
        return;
    }

    atualizacaoEmAndamento = true;

    const selectChave = document.getElementById('chaveDisponivel');
    const chaveSelecionadaAntes = selectChave ? selectChave.value : '';
    const filtroHistorico = document.getElementById('filtroHistorico')?.value || '';

    try {
        if (!silencioso) {
            if (selectChave) {
                selectChave.innerHTML = '<option>Carregando...</option>';
            }

            const listaPendentes = document.getElementById('listaPendentes');
            const listaHistorico = document.getElementById('listaHistorico');

            if (listaPendentes) {
                listaPendentes.innerHTML = '<li>Carregando...</li>';
            }

            if (listaHistorico) {
                listaHistorico.innerHTML = '<li class="item-vazio">Carregando histórico...</li>';
            }
        }

        const resp = await fetchAPI('getDashboard', {
            limiteHistorico: LIMITE_HISTORICO
        });

        atualizarOperador(resp.operador);

        const versao = document.getElementById('versaoBackend');

        if (versao) {
            versao.textContent = `Backend: ${resp.versao || 'sem versão'}`;
        }

        todasChavesDisponiveis = resp.chaves || [];
        pendentesAtuais = resp.pendentes || [];

        disponiveis = todasChavesDisponiveis.length;
        emUso = pendentesAtuais.length;

        renderizarChavesFiltradas(chaveSelecionadaAntes);
        renderizarPendentes();
        atualizarEstatisticas();

        if (!filtroHistorico) {
            historicoCompleto = resp.historico || [];
            renderizarHistorico();
        }
    } catch (erro) {
        console.error('Erro ao carregar dashboard:', erro);

        if (!silencioso) {
            mostrarMensagem(
                'msgRetirada',
                '❌ Erro de conexão. Verifique a internet e tente novamente.',
                true
            );
        }
    } finally {
        atualizacaoEmAndamento = false;
    }
}

async function buscarHistoricoBackend() {
    const campo = document.getElementById('filtroHistorico');
    const termo = campo ? campo.value.trim() : '';

    if (!termo) {
        await carregarDashboard(true);
        return;
    }

    const lista = document.getElementById('listaHistorico');

    if (lista) {
        lista.innerHTML = '<li class="item-vazio">Pesquisando histórico completo...</li>';
    }

    try {
        const resp = await fetchAPI('buscarHistorico', {
            termo,
            limite: LIMITE_HISTORICO
        });

        historicoCompleto = resp.historico || [];
        renderizarHistorico();
    } catch (erro) {
        console.error('Erro ao buscar histórico:', erro);

        if (lista) {
            lista.innerHTML = '<li class="item-vazio">Erro de conexão ao pesquisar histórico.</li>';
        }
    }
}

function agendarBuscaHistorico() {
    clearTimeout(timeoutBuscaHistorico);

    timeoutBuscaHistorico = setTimeout(() => {
        buscarHistoricoBackend();
    }, 650);
}

async function obterOperadorAtualRapido() {
    const resp = await fetchAPI('getDashboard', {
        limiteHistorico: 0
    });

    atualizarOperador(resp.operador);
    return resp.operador;
}

async function retirar() {
    if (operacaoEmAndamento) {
        return;
    }

    setOperacaoEmAndamento(true);

    try {
        const operador = await obterOperadorAtualRapido();
        const solicitante = document.getElementById('solicitante').value.trim();
        const setor = document.getElementById('setor').value.trim();
        const chave = document.getElementById('chaveDisponivel').value;

        if (!operador) {
            mostrarMensagem(
                'msgRetirada',
                '❌ Operador de plantão não identificado. Aguarde alguns segundos e tente novamente.',
                true
            );
            return;
        }

        if (!solicitante) {
            mostrarMensagem(
                'msgRetirada',
                '❌ Preencha o nome de quem está retirando a chave.',
                true
            );
            return;
        }

        if (!setor) {
            mostrarMensagem(
                'msgRetirada',
                '❌ Preencha o setor do solicitante.',
                true
            );
            return;
        }

        if (!chave) {
            mostrarMensagem(
                'msgRetirada',
                '❌ Selecione uma chave disponível.',
                true
            );
            return;
        }

        const resp = await fetchAPI('retirar', {
            operador,
            solicitante,
            setor,
            chave
        });

        if (resp.sucesso) {
            mostrarMensagem('msgRetirada', '✅ Retirada registrada!');

            document.getElementById('solicitante').value = '';
            document.getElementById('setor').value = '';

            const campoFiltro = document.getElementById('filtroChave');

            if (campoFiltro) {
                campoFiltro.value = '';
            }

            await carregarDashboard(true);
        } else {
            mostrarMensagem('msgRetirada', '❌ Erro: ' + resp.erro, true);
        }
    } catch (erro) {
        mostrarMensagem(
            'msgRetirada',
            '❌ Erro de conexão. Verifique a internet e tente novamente.',
            true
        );
    } finally {
        setOperacaoEmAndamento(false);
    }
}

async function devolver(chave) {
    if (operacaoEmAndamento) {
        return;
    }

    setOperacaoEmAndamento(true);

    try {
        const operadorDevolucao = await obterOperadorAtualRapido();

        if (!operadorDevolucao) {
            mostrarMensagem(
                'msgDevolucao',
                '❌ Operador de plantão não identificado. Aguarde alguns segundos e tente novamente.',
                true
            );
            return;
        }

        const confirmar = confirm(
            `Confirma a devolução da chave "${chave}" por ${operadorDevolucao}?`
        );

        if (!confirmar) {
            return;
        }

        const resp = await fetchAPI('devolver', {
            chave,
            operadorDevolucao
        });

        if (resp.sucesso) {
            mostrarMensagem('msgDevolucao', '✅ Devolução registrada!');
            await carregarDashboard(true);
        } else {
            mostrarMensagem('msgDevolucao', '❌ Erro: ' + resp.erro, true);
        }
    } catch (erro) {
        mostrarMensagem(
            'msgDevolucao',
            '❌ Erro de conexão. Verifique a internet e tente novamente.',
            true
        );
    } finally {
        setOperacaoEmAndamento(false);
    }
}

async function sair() {
    try {
        await fetch('/api/logout', {
            method: 'POST'
        });
    } finally {
        window.location.href = '/login.html';
    }
}

window.addEventListener('load', async () => {
    await carregarDashboard(false);

    const campoFiltroChave = document.getElementById('filtroChave');

    if (campoFiltroChave) {
        campoFiltroChave.addEventListener('input', () => {
            renderizarChavesFiltradas();
        });
    }

    const campoFiltroHistorico = document.getElementById('filtroHistorico');

    if (campoFiltroHistorico) {
        campoFiltroHistorico.addEventListener('input', agendarBuscaHistorico);
    }

    const botaoLimparHistorico = document.getElementById('limparFiltroHistorico');

    if (botaoLimparHistorico) {
        botaoLimparHistorico.addEventListener('click', async () => {
            if (campoFiltroHistorico) {
                campoFiltroHistorico.value = '';
                campoFiltroHistorico.focus();
            }

            await carregarDashboard(true);
        });
    }

    const btnSair = document.getElementById('btnSair');

    if (btnSair) {
        btnSair.addEventListener('click', sair);
    }

    setInterval(async () => {
        await carregarDashboard(true);
    }, INTERVALO_ATUALIZACAO_MS);
});