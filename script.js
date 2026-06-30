const SCRIPT_URL = '/api/controle';

let totalChaves = 0;
let emUso = 0;
let disponiveis = 0;

let todasChavesDisponiveis = [];
let historicoCompleto = [];

const INTERVALO_ATUALIZACAO_MS = 30000;
const LIMITE_HISTORICO = 80;

let atualizacaoEmAndamento = false;

async function fetchAPI(acao, dadosExtras = {}) {
    const body = {
        acao,
        ...dadosExtras
    };

    const resp = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    return await resp.json();
}

function mostrarMensagem(elementoId, texto, erro = false) {
    const elemento = document.getElementById(elementoId);

    if (!elemento) {
        return;
    }

    elemento.textContent = texto;

    if (erro) {
        elemento.classList.add('erro');
    } else {
        elemento.classList.remove('erro');
    }

    setTimeout(() => {
        elemento.textContent = '';
        elemento.classList.remove('erro');
    }, 5000);
}

function atualizarRelogio() {
    const agora = new Date();

    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');

    document.getElementById('relogio').textContent =
        `${horas}:${minutos}:${segundos}`;
}

setInterval(atualizarRelogio, 1000);
atualizarRelogio();

function atualizarEstatisticas() {
    totalChaves = emUso + disponiveis;

    document.getElementById('totalChaves').textContent = totalChaves;
    document.getElementById('emUso').textContent = emUso;
    document.getElementById('disponiveis').textContent = disponiveis;
}

async function verificarOperador() {
    const span = document.getElementById('nomeOperador');
    const statusDiv = document.getElementById('statusOperador');

    try {
        const resp = await fetchAPI('getOperadorAtual');

        if (resp.operador) {
            span.textContent = resp.operador;
            statusDiv.className = 'status-sistema ativo';
        } else {
            span.textContent = 'Nenhum operador de plantão';
            statusDiv.className = 'status-sistema inativo';
        }
    } catch (erro) {
        span.textContent = 'Erro ao verificar';
        statusDiv.className = 'status-sistema inativo';
    }
}

function normalizarTexto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function chaveCombinaComFiltro(chave, filtro) {
    const chaveNormalizada = normalizarTexto(chave);
    const filtroNormalizado = normalizarTexto(filtro).trim();

    if (!filtroNormalizado) {
        return true;
    }

    if (chaveNormalizada.startsWith(filtroNormalizado)) {
        return true;
    }

    const partesDaChave = chaveNormalizada.split(/[\s\-_/]+/);

    return partesDaChave.some((parte) =>
        parte.startsWith(filtroNormalizado)
    );
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

    if (chavesFiltradas.length > 0) {
        chavesFiltradas.forEach((chave) => {
            const opt = document.createElement('option');
            opt.value = chave;
            opt.textContent = chave;
            sel.appendChild(opt);
        });

        if (chaveSelecionadaAntes) {
            const chaveAindaExiste = chavesFiltradas.includes(chaveSelecionadaAntes);

            if (chaveAindaExiste) {
                sel.value = chaveSelecionadaAntes;
            }
        }
    } else {
        sel.innerHTML = '<option value="">Nenhuma chave encontrada</option>';
    }
}

async function carregarChavesDisponiveis(silencioso = false) {
    const sel = document.getElementById('chaveDisponivel');

    if (!sel) {
        return;
    }

    const chaveSelecionadaAntes = sel.value;

    if (!silencioso) {
        sel.innerHTML = '<option>Carregando...</option>';
    }

    try {
        const resp = await fetchAPI('getChavesDisponiveis');

        if (resp.erro) {
            if (!silencioso) {
                sel.innerHTML = '<option value="">Erro ao carregar chaves</option>';
            }

            console.error(resp.erro);
            return;
        }

        if (resp.chaves && resp.chaves.length > 0) {
            todasChavesDisponiveis = resp.chaves;
            disponiveis = resp.chaves.length;
        } else {
            todasChavesDisponiveis = [];
            disponiveis = 0;
        }

        renderizarChavesFiltradas(chaveSelecionadaAntes);
        atualizarEstatisticas();
    } catch (erro) {
        if (!silencioso) {
            sel.innerHTML = '<option value="">Erro ao carregar chaves</option>';
        }

        console.error('Erro ao carregar chaves:', erro);
    }
}

function escaparTexto(texto) {
    return String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function carregarPendentes(silencioso = false) {
    const lista = document.getElementById('listaPendentes');

    if (!lista) {
        return;
    }

    if (!silencioso) {
        lista.innerHTML = '<li>Carregando...</li>';
    }

    try {
        const resp = await fetchAPI('getPendentes');

        if (resp.erro) {
            if (!silencioso) {
                lista.innerHTML =
                    `<li>Erro ao carregar registros: ${escaparTexto(resp.erro)}</li>`;
            }

            console.error(resp.erro);
            return;
        }

        lista.innerHTML = '';

        if (resp.pendentes && resp.pendentes.length > 0) {
            resp.pendentes.forEach((p) => {
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
                        <div class="cabecalho-registro">
                            <span>Chave entregue por: ${operadorSeguro}</span>
                        </div>

                        <div class="texto-chave">
                            Chave: ${chaveSegura}
                        </div>

                        <div class="cabecalho-registro">
                            <span>Solicitante: ${solicitanteSeguro}</span>
                            <span>Setor: ${setorSeguro}</span>
                        </div>

                        <div class="cabecalho-registro">
                            <span>Saída: ${escaparTexto(saidaFormatada)}</span>
                        </div>
                    </div>

                    <div class="acoes">
                        <button class="btn-devolver">Devolver</button>
                    </div>
                `;

                const botaoDevolver = li.querySelector('.btn-devolver');

                botaoDevolver.addEventListener('click', () => {
                    devolver(p.chave);
                });

                lista.appendChild(li);
            });

            emUso = resp.pendentes.length;
        } else {
            lista.innerHTML = '<li>Nenhuma chave em uso.</li>';
            emUso = 0;
        }

        atualizarEstatisticas();
    } catch (erro) {
        if (!silencioso) {
            lista.innerHTML = '<li>Erro ao carregar chaves em uso.</li>';
        }

        console.error('Erro ao carregar pendentes:', erro);
    }
}

function historicoCombinaComFiltro(item, filtro) {
    const filtroNormalizado = normalizarTexto(filtro).trim();

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
        return;
    }

    if (totalExibido === totalGeral) {
        contador.textContent =
            totalGeral === 1 ? '1 registro' : `${totalGeral} registros`;
        return;
    }

    contador.textContent = `${totalExibido} de ${totalGeral}`;
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

    atualizarContadorHistorico(
        historicoFiltrado.length,
        historicoCompleto.length
    );

    if (historicoCompleto.length === 0) {
        lista.innerHTML =
            '<li class="item-vazio">Nenhuma movimentação registrada.</li>';
        return;
    }

    if (historicoFiltrado.length === 0) {
        lista.innerHTML =
            '<li class="item-vazio">Nenhum resultado encontrado para a pesquisa.</li>';
        return;
    }

    historicoFiltrado.forEach((item) => {
        const li = document.createElement('li');

        const tipoSeguro = escaparTexto(item.tipo);
        const chaveSegura = escaparTexto(item.chave);
        const operadorSeguro = escaparTexto(item.operador);
        const solicitanteSeguro = escaparTexto(item.solicitante);
        const setorSeguro = escaparTexto(item.setor);
        const dataTextoSeguro = escaparTexto(item.dataTexto);

        const isDevolucao = item.tipo === 'Devolução';
        const classeBadge = isDevolucao ? 'badge-devolucao' : 'badge-retirada';
        const textoOperador = isDevolucao ? 'Recebida por' : 'Entregue por';

        li.innerHTML = `
            <span class="badge-evento ${classeBadge}">
                ${tipoSeguro}
            </span>

            <div class="historico-info">
                <strong>Chave: ${chaveSegura}</strong>
                <span>${textoOperador}: ${operadorSeguro}</span>
                <span>Solicitante: ${solicitanteSeguro} | Setor: ${setorSeguro}</span>
            </div>

            <div class="historico-data">
                ${dataTextoSeguro}
            </div>
        `;

        lista.appendChild(li);
    });
}

async function carregarHistorico(silencioso = false) {
    const lista = document.getElementById('listaHistorico');

    if (!lista) {
        return;
    }

    if (!silencioso) {
        lista.innerHTML = '<li class="item-vazio">Carregando histórico...</li>';
    }

    try {
        const resp = await fetchAPI('getHistoricoRecentes', {
            limite: LIMITE_HISTORICO
        });

        if (resp.erro) {
            if (!silencioso) {
                lista.innerHTML =
                    `<li class="item-vazio">Erro ao carregar histórico: ${escaparTexto(resp.erro)}</li>`;
            }

            console.error(resp.erro);
            return;
        }

        historicoCompleto = resp.historico || [];
        renderizarHistorico();
    } catch (erro) {
        if (!silencioso) {
            lista.innerHTML =
                '<li class="item-vazio">Erro ao carregar histórico.</li>';
        }

        console.error('Erro ao carregar histórico:', erro);
    }
}

async function retirar() {
    const operador = document.getElementById('nomeOperador').textContent;
    const solicitante = document.getElementById('solicitante').value.trim();
    const setor = document.getElementById('setor').value.trim();
    const chave = document.getElementById('chaveDisponivel').value;

    if (
        !operador ||
        operador === 'Verificando...' ||
        operador.includes('Nenhum') ||
        operador.includes('Erro')
    ) {
        mostrarMensagem(
            'msgRetirada',
            '❌ Operador de plantão não identificado.',
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

    try {
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

            await atualizarDadosDaTela(true);
        } else {
            mostrarMensagem(
                'msgRetirada',
                '❌ Erro: ' + resp.erro,
                true
            );
        }
    } catch (erro) {
        mostrarMensagem(
            'msgRetirada',
            '❌ Erro ao registrar retirada.',
            true
        );
    }
}

async function devolver(chave) {
    const operadorDevolucao =
        document.getElementById('nomeOperador').textContent;

    if (
        !operadorDevolucao ||
        operadorDevolucao === 'Verificando...' ||
        operadorDevolucao.includes('Nenhum') ||
        operadorDevolucao.includes('Erro')
    ) {
        mostrarMensagem(
            'msgDevolucao',
            '❌ Operador de plantão não identificado.',
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

    try {
        const resp = await fetchAPI('devolver', {
            chave,
            operadorDevolucao
        });

        if (resp.sucesso) {
            mostrarMensagem('msgDevolucao', '✅ Devolução registrada!');

            await atualizarDadosDaTela(true);
        } else {
            mostrarMensagem(
                'msgDevolucao',
                '❌ Erro: ' + resp.erro,
                true
            );
        }
    } catch (erro) {
        mostrarMensagem(
            'msgDevolucao',
            '❌ Erro ao registrar devolução.',
            true
        );
    }
}

async function atualizarDadosDaTela(silencioso = true) {
    if (atualizacaoEmAndamento) {
        return;
    }

    atualizacaoEmAndamento = true;

    try {
        await carregarChavesDisponiveis(silencioso);
        await carregarPendentes(silencioso);
        await carregarHistorico(silencioso);
    } catch (erro) {
        console.error('Erro na atualização automática:', erro);
    } finally {
        atualizacaoEmAndamento = false;
    }
}

window.addEventListener('load', async () => {
    await verificarOperador();
    await atualizarDadosDaTela(false);

    const campoFiltroChave = document.getElementById('filtroChave');

    if (campoFiltroChave) {
        campoFiltroChave.addEventListener('input', () => {
            renderizarChavesFiltradas();
        });
    }

    const campoFiltroHistorico = document.getElementById('filtroHistorico');

    if (campoFiltroHistorico) {
        campoFiltroHistorico.addEventListener('input', () => {
            renderizarHistorico();
        });
    }

    const botaoLimparHistorico = document.getElementById('limparFiltroHistorico');

    if (botaoLimparHistorico) {
        botaoLimparHistorico.addEventListener('click', () => {
            if (campoFiltroHistorico) {
                campoFiltroHistorico.value = '';
                campoFiltroHistorico.focus();
                renderizarHistorico();
            }
        });
    }

    setInterval(async () => {
        await atualizarDadosDaTela(true);
    }, INTERVALO_ATUALIZACAO_MS);
});