const SCRIPT_URL = '/api/controle';

let totalChaves = 0;
let emUso = 0;
let disponiveis = 0;

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

async function carregarChavesDisponiveis() {
    const sel = document.getElementById('chaveDisponivel');

    sel.innerHTML = '<option>Carregando...</option>';

    try {
        const resp = await fetchAPI('getChavesDisponiveis');

        sel.innerHTML = '';

        if (resp.erro) {
            sel.innerHTML = '<option value="">Erro ao carregar chaves</option>';
            disponiveis = 0;
            atualizarEstatisticas();
            return;
        }

        if (resp.chaves && resp.chaves.length > 0) {
            resp.chaves.forEach((chave) => {
                const opt = document.createElement('option');
                opt.value = chave;
                opt.textContent = chave;
                sel.appendChild(opt);
            });

            disponiveis = resp.chaves.length;
        } else {
            sel.innerHTML = '<option value="">Nenhuma chave disponível</option>';
            disponiveis = 0;
        }

        atualizarEstatisticas();
    } catch (erro) {
        sel.innerHTML = '<option value="">Erro ao carregar chaves</option>';
        disponiveis = 0;
        atualizarEstatisticas();
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

async function carregarPendentes() {
    const lista = document.getElementById('listaPendentes');

    lista.innerHTML = '<li>Carregando...</li>';

    try {
        const resp = await fetchAPI('getPendentes');

        lista.innerHTML = '';

        if (resp.erro) {
            lista.innerHTML = `<li>Erro ao carregar registros: ${escaparTexto(resp.erro)}</li>`;
            emUso = 0;
            atualizarEstatisticas();
            return;
        }

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
                            <span>Operador retirada: ${operadorSeguro}</span>
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
        lista.innerHTML = '<li>Erro ao carregar chaves em uso.</li>';
        emUso = 0;
        atualizarEstatisticas();
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

            await carregarChavesDisponiveis();
            await carregarPendentes();
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
    const operadorDevolucao = document.getElementById('nomeOperador').textContent;

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

            await carregarChavesDisponiveis();
            await carregarPendentes();
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

window.addEventListener('load', async () => {
    await verificarOperador();
    await carregarChavesDisponiveis();
    await carregarPendentes();
});