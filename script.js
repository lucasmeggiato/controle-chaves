// A rota da Vercel Function (mesmo domínio, token oculto)
const SCRIPT_URL = '/api/controle';

async function fetchAPI(acao, dadosExtras = {}) {
    const body = { acao, ...dadosExtras };
    const resp = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return await resp.json();
}

// Relógio dinâmico
function atualizarRelogio() {
    const agora = new Date();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    document.getElementById('relogio').textContent = `${horas}:${minutos}:${segundos}`;
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

// Variáveis globais para estatísticas
let totalChaves = 0;
let emUso = 0;
let disponiveis = 0;

function atualizarEstatisticas() {
    document.getElementById('totalChaves').textContent = totalChaves;
    document.getElementById('emUso').textContent = emUso;
    document.getElementById('disponiveis').textContent = disponiveis;
}

async function verificarOperador() {
    const resp = await fetchAPI('getOperadorAtual');
    const span = document.getElementById('nomeOperador');
    const statusDiv = document.getElementById('statusOperador');
    if (resp.operador) {
        span.textContent = resp.operador;
        statusDiv.className = 'status-sistema ativo';
    } else {
        span.textContent = 'Nenhum operador de plantão';
        statusDiv.className = 'status-sistema inativo';
    }
}

async function carregarChavesDisponiveis() {
    const sel = document.getElementById('chaveDisponivel');
    sel.innerHTML = '<option>Carregando...</option>';
    const resp = await fetchAPI('getChavesDisponiveis');
    sel.innerHTML = '';
    if (resp.chaves && resp.chaves.length > 0) {
        resp.chaves.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = ch;
            opt.textContent = ch;
            sel.appendChild(opt);
        });
        disponiveis = resp.chaves.length;
    } else {
        sel.innerHTML = '<option value="">Nenhuma chave disponível</option>';
        disponiveis = 0;
    }
    totalChaves = emUso + disponiveis;
    atualizarEstatisticas();
}

async function carregarPendentes() {
    const lista = document.getElementById('listaPendentes');
    lista.innerHTML = '<li>Carregando...</li>';
    const resp = await fetchAPI('getPendentes');
    lista.innerHTML = '';
    if (resp.pendentes && resp.pendentes.length > 0) {
        resp.pendentes.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="info-chave">
                    <div class="cabecalho-registro">
                        <span>Operador: ${p.operador}</span>
                    </div>
                    <div class="texto-chave">${p.chave}</div>
                    <div class="cabecalho-registro">Saída: ${new Date(p.saida).toLocaleString()}</div>
                </div>
                <div class="acoes">
                    <button class="btn-devolver" onclick="devolver('${p.chave.replace(/'/g, "\\'")}')">Devolver</button>
                </div>
            `;
            lista.appendChild(li);
        });
        emUso = resp.pendentes.length;
    } else {
        lista.innerHTML = '<li>Nenhuma chave em uso.</li>';
        emUso = 0;
    }
    totalChaves = emUso + disponiveis;
    atualizarEstatisticas();
}

async function retirar() {
    const operador = document.getElementById('nomeOperador').textContent;
    if (!operador || operador === 'Verificando...' || operador.includes('Nenhum')) {
        document.getElementById('msgRetirada').textContent = '❌ Operador de plantão não identificado.';
        return;
    }
    const chave = document.getElementById('chaveDisponivel').value;
    const msg = document.getElementById('msgRetirada');
    if (!chave) {
        msg.textContent = 'Selecione uma chave disponível.';
        return;
    }
    msg.textContent = 'Registrando...';
    const resp = await fetchAPI('retirar', { operador, chave });
    if (resp.sucesso) {
        msg.textContent = '✅ Retirada registrada!';
        await carregarChavesDisponiveis();
        await carregarPendentes();
    } else {
        msg.textContent = '❌ Erro: ' + (resp.erro || 'Falha na operação');
    }
    setTimeout(() => msg.textContent = '', 5000);
}

async function devolver(chave) {
    const operadorDevolucao = document.getElementById('nomeOperador').textContent;
    if (!operadorDevolucao || operadorDevolucao === 'Verificando...' || operadorDevolucao.includes('Nenhum')) {
        document.getElementById('msgDevolucao').textContent = '❌ Operador de plantão não identificado.';
        return;
    }
    if (!confirm(`Confirma a devolução da chave "${chave}" por ${operadorDevolucao}?`)) return;
    const msg = document.getElementById('msgDevolucao');
    msg.textContent = 'Registrando...';
    const resp = await fetchAPI('devolver', { chave, operadorDevolucao });
    if (resp.sucesso) {
        msg.textContent = '✅ Devolução registrada!';
        await carregarChavesDisponiveis();
        await carregarPendentes();
    } else {
        msg.textContent = '❌ Erro: ' + (resp.erro || 'Falha na operação');
    }
    setTimeout(() => msg.textContent = '', 5000);
}

// Inicialização
window.addEventListener('load', async () => {
    await verificarOperador();
    await carregarChavesDisponiveis();
    await carregarPendentes();
});