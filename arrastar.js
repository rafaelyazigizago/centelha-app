// Centelha · arrastar no notebook (Fase B do formato Microsoft To Do, docs/pesquisa/ESTUDO-MICROSOFT-TODO-2026-10-21.md):
// segurar e arrastar muda a ordem na lista; soltar num item do menu lateral move, traz para hoje, põe estrela ou manda para a Caixa.
// Sempre há o outro jeito, sem arrastar (WCAG 2.5.7): "Subir/Descer na lista" e "Mover para…" no ⋯.
// No Hoje (lote de 28/10), arrastar também passa a tarefa de uma caixa para outra; no celular, segurando o cartão (Fase C).
import { estado, secao, redesenhar, falha } from './estado.js';
import { caixaDoHoje, mudancaParaCaixa, CAIXAS_DO_HOJE } from './calculos.js';
import * as dados from './dados.js';
import { selecao, abrirAcoes } from './acoes.js';
import { avisar, mostrarEstado, vibrar } from './ui.js';

const largo = matchMedia('(min-width: 1000px)');
const porId = (id) => estado.tarefas.find((t) => t.id === id);

// As tarefas que vão junto: a arrastada, ou todas as escolhidas se ela for uma delas.
export function tarefasArrastadas() {
  const id = estado.arrastando;
  if (!id) return [];
  if (selecao.has(id) && selecao.size > 1) return [...selecao].map(porId).filter(Boolean);
  return [porId(id)].filter(Boolean);
}

function limparIndicadores() {
  document.querySelectorAll('.soltar-antes, .soltar-depois').forEach((n) => n.classList.remove('soltar-antes', 'soltar-depois'));
}

// Pode soltar x nesta lista? Nas caixas do Hoje, Prioridades só muda a ordem: não recebe nem cede tarefa.
function podeSoltar(x, lista) {
  if (!x || !lista || tarefasArrastadas().length > 1) return false;
  const destino = lista.dataset.caixa;
  if (!destino) return true;
  const origem = caixaDoHoje(x, secao(x));
  return origem === destino || (origem !== 'prioridades' && destino !== 'prioridades' && !!origem);
}
const listaDe = (caixaNo) => caixaNo?.querySelector('.lista[data-reordena]');

// Chamado por cada cartão (telas.js). No notebook, arrastar com o mouse; no celular, segurar e arrastar.
export function ligarArrastar(no, t) {
  if (!largo.matches) { ligarSegurar(no, t); return; }
  no.draggable = true;
  no.addEventListener('dragstart', (e) => {
    estado.arrastando = t.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.titulo);
    no.classList.add('arrastando');
    document.body.classList.add('arrastando-tarefa');
  });
  no.addEventListener('dragend', () => {
    estado.arrastando = null;
    no.classList.remove('arrastando');
    document.body.classList.remove('arrastando-tarefa');
    limparIndicadores();
    document.querySelectorAll('.alvo').forEach((n) => n.classList.remove('alvo'));
  });
  // Mudar a ordem: só dentro das listas que aceitam (tela de lista; na área inteira, cada subgrupo é uma).
  no.addEventListener('dragover', (e) => {
    const id = estado.arrastando;
    if (!id || id === t.id || !podeSoltar(porId(id), no.closest('.lista[data-reordena]'))) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = no.getBoundingClientRect();
    const depois = e.clientY > r.top + r.height / 2;
    limparIndicadores();
    no.classList.add(depois ? 'soltar-depois' : 'soltar-antes');
  });
  no.addEventListener('dragleave', () => no.classList.remove('soltar-antes', 'soltar-depois'));
  no.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const x = porId(estado.arrastando);
    const depois = no.classList.contains('soltar-depois');
    limparIndicadores();
    if (x && x.id !== t.id && podeSoltar(x, no.closest('.lista[data-reordena]'))) reordenar(x, no, depois);
  });
}

// Um item do menu lateral que recebe tarefas soltas.
export function ligarSoltar(botao, fazer) {
  botao.dataset.solta = '';
  botao.addEventListener('dragover', (e) => {
    if (!estado.arrastando) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    botao.classList.add('alvo');
  });
  botao.addEventListener('dragleave', () => botao.classList.remove('alvo'));
  botao.addEventListener('drop', (e) => {
    e.preventDefault();
    botao.classList.remove('alvo');
    const tarefas = tarefasArrastadas();
    if (tarefas.length) fazer(tarefas);
  });
}

// Põe x antes (ou depois) do cartão "alvoNo", na lista dele. Se todos já têm ordem, só x muda (o meio dos vizinhos);
// senão, a lista inteira ganha ordem de 1000 em 1000. Na área inteira, soltar noutro subgrupo também muda o subgrupo.
export async function reordenar(x, alvoNo, depois) {
  const lista = alvoNo.closest('.lista[data-reordena]');
  if (!lista) return;
  const ids = [...lista.querySelectorAll(':scope > .tarefa')].map((n) => n.dataset.id).filter((id) => id !== x.id);
  ids.splice(alvoNo === lista ? ids.length : ids.indexOf(alvoNo.dataset.id) + (depois ? 1 : 0), 0, x.id);   // na lista vazia, vai para o fim
  const tarefas = ids.map(porId).filter(Boolean);
  const k = tarefas.indexOf(x);
  const patches = new Map();
  const outras = tarefas.filter((t) => t !== x);
  if (outras.length && outras.every((t) => t.ordem != null)) {
    const a = tarefas[k - 1]?.ordem, b = tarefas[k + 1]?.ordem;
    const nova = a == null ? b - 1000 : b == null ? a + 1000 : (a + b) / 2;
    if (nova !== x.ordem) patches.set(x.id, { ordem: nova });
  } else {
    tarefas.forEach((t, i) => { const nova = (i + 1) * 1000; if (t.ordem !== nova) patches.set(t.id, { ordem: nova }); });
  }
  const caixa = lista.dataset.caixa;
  let destino = null, mudouLista = false;
  if (caixa) {   // caixas do Hoje: muda o dia e a parte do dia, ou a situação
    mudouLista = caixaDoHoje(x, secao(x)) !== caixa;
    destino = mudouLista ? mudancaParaCaixa(x, caixa, estado.hoje) : null;
    if (mudouLista && !destino) return;
  } else if (lista.hasAttribute('data-subgrupo')) {
    destino = { area: lista.dataset.area || null, subgrupo: lista.dataset.subgrupo || null };
    mudouLista = (x.area || null) !== destino.area || (x.subgrupo || null) !== destino.subgrupo;
  }
  if (mudouLista) patches.set(x.id, { ...(patches.get(x.id) || {}), ...destino });
  if (!patches.size) return;

  const antes = new Map([...patches].map(([id, p]) => { const t = porId(id); return [id, Object.fromEntries(Object.keys(p).map((c) => [c, t[c] ?? null]))]; }));
  const lugarAntes = estado.lugares.get(x.id), secaoAntes = estado.secoes.get(x.id);
  const aplicar = (valores) => { for (const [id, p] of valores) Object.assign(porId(id), p); };
  aplicar(patches);
  if (mudouLista && !caixa) estado.lugares.set(x.id, { ...destino });   // você mesmo pôs ali: aparece onde soltou
  if (mudouLista && 'dia' in destino) estado.secoes.set(x.id, 'hoje');   // trouxe para uma parte do dia: fica no Hoje
  redesenhar();
  mostrarEstado('Salvando…');
  const desfazerNaTela = () => {
    aplicar(antes);
    if (mudouLista && !caixa) estado.lugares.set(x.id, lugarAntes);
    if (mudouLista && caixa) estado.secoes.set(x.id, secaoAntes);
    redesenhar();
  };
  try {
    for (const [id, p] of patches) await dados.mudarTarefa(id, p);
  } catch (erro) {
    desfazerNaTela();
    falha(erro);
    return;
  }
  mostrarEstado('Salvo ✓');
  const rotulo = !mudouLista ? `Nova ordem · ${x.titulo}`
    : caixa ? `${x.titulo} → ${Object.fromEntries(CAIXAS_DO_HOJE)[caixa]}`
    : `${x.titulo} → ${[destino.area, destino.subgrupo].filter(Boolean).join(' › ')}`;
  avisar(rotulo, async () => {
    desfazerNaTela();
    try {
      for (const [id, p] of antes) await dados.mudarTarefa(id, p);
      mostrarEstado('Salvo ✓');
    } catch (erro) { falha(erro); }
  });
}

// ---------- Soltar numa caixa do Hoje fora de um cartão (caixa vazia, título, espaço livre) ----------
document.addEventListener('dragover', (e) => {
  const caixaNo = e.target.closest?.('[data-caixa-hoje]');
  const x = porId(estado.arrastando);
  if (!caixaNo || !podeSoltar(x, listaDe(caixaNo))) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.caixa-alvo').forEach((n) => n !== caixaNo && n.classList.remove('caixa-alvo'));
  caixaNo.classList.add('caixa-alvo');
});
document.addEventListener('drop', (e) => {
  const caixaNo = e.target.closest?.('[data-caixa-hoje]');
  document.querySelectorAll('.caixa-alvo').forEach((n) => n.classList.remove('caixa-alvo'));
  const x = porId(estado.arrastando), lista = listaDe(caixaNo);
  if (!caixaNo || !podeSoltar(x, lista)) return;
  e.preventDefault();
  reordenar(x, lista, true);
});
document.addEventListener('dragend', () => document.querySelectorAll('.caixa-alvo').forEach((n) => n.classList.remove('caixa-alvo')));

// ---------- Celular (Fase C): segurar ~0,4 s e arrastar ----------
// Antes disso o dedo rola a tela como sempre. Segurou e soltou sem mexer: abre as ações (o ⋯), como antes.
const SEGURAR_MS = 400, FOLGA_PX = 10, BORDA_PX = 80;
function ligarSegurar(no, t) {
  let espera = null, inicio = null, arrastando = false, alvo = null, rolar = 0, ultimo = null;
  const fim = () => {
    clearTimeout(espera); espera = null; arrastando = false; estado.segurando = false;
    cancelAnimationFrame(rolar);
    estado.arrastando = null;
    no.classList.remove('arrastando'); no.style.transform = '';
    document.body.classList.remove('arrastando-tarefa');
    limparIndicadores();
    document.querySelectorAll('.caixa-alvo').forEach((n) => n.classList.remove('caixa-alvo'));
  };
  const procurar = (x, y) => {   // o que está sob o dedo: um cartão (antes ou depois dele) ou uma caixa
    limparIndicadores();
    document.querySelectorAll('.caixa-alvo').forEach((n) => n.classList.remove('caixa-alvo'));
    const sob = document.elementFromPoint(x, y);
    const cartao = sob?.closest('.lista[data-reordena] > .tarefa');
    if (cartao && cartao !== no && podeSoltar(t, cartao.parentElement)) {
      const r = cartao.getBoundingClientRect(), depois = y > r.top + r.height / 2;
      cartao.classList.add(depois ? 'soltar-depois' : 'soltar-antes');
      return { no: cartao, depois };
    }
    const caixaNo = sob?.closest('[data-caixa-hoje]');
    if (!cartao && caixaNo && podeSoltar(t, listaDe(caixaNo))) { caixaNo.classList.add('caixa-alvo'); return { no: listaDe(caixaNo), depois: true }; }
    return null;
  };
  const passo = () => {   // perto da borda de cima ou de baixo, a tela rola sozinha
    if (!arrastando || !ultimo) return;
    const v = ultimo.y < BORDA_PX ? -12 : ultimo.y > innerHeight - BORDA_PX ? 12 : 0;
    if (v) { scrollBy(0, v); mover(ultimo.x, ultimo.y); }
    rolar = requestAnimationFrame(passo);
  };
  const mover = (x, y) => {
    no.style.transform = `translateY(${y + scrollY - inicio.paginaY}px)`;
    alvo = procurar(x, y);
  };

  no.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || estado.selecionando || !no.closest('.lista[data-reordena]')
      || e.target.closest('.botao-lamp, .estrela, .mais, .um-toque')) return;
    const p = e.touches[0];
    inicio = { x: p.clientX, y: p.clientY, paginaY: p.clientY + scrollY };
    estado.segurando = true;   // o clique longo do sistema (menu de contexto) não abre por cima
    espera = setTimeout(() => {
      espera = null; arrastando = true; alvo = null; ultimo = { x: inicio.x, y: inicio.y };
      estado.arrastando = t.id;
      no.classList.add('arrastando');
      document.body.classList.add('arrastando-tarefa');
      vibrar();
      rolar = requestAnimationFrame(passo);
    }, SEGURAR_MS);
  }, { passive: true });
  no.addEventListener('touchmove', (e) => {
    const p = e.touches[0];
    if (!arrastando) {
      if (espera && Math.hypot(p.clientX - inicio.x, p.clientY - inicio.y) > FOLGA_PX) { clearTimeout(espera); espera = null; estado.segurando = false; }
      return;
    }
    e.preventDefault();   // durante o arrasto, o dedo não rola a tela
    ultimo = { x: p.clientX, y: p.clientY };
    mover(p.clientX, p.clientY);
  }, { passive: false });
  no.addEventListener('touchend', (e) => {
    if (!arrastando) { fim(); return; }
    e.preventDefault();   // não vira toque na tarefa
    const andou = ultimo && Math.hypot(ultimo.x - inicio.x, ultimo.y - inicio.y) > FOLGA_PX;
    const soltar = alvo;
    fim();
    if (soltar) reordenar(t, soltar.no, soltar.depois);
    else if (!andou) abrirAcoes(t);
  });
  no.addEventListener('touchcancel', fim);
}
