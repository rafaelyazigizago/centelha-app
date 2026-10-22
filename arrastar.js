// Centelha · arrastar no notebook (Fase B do formato Microsoft To Do, docs/pesquisa/ESTUDO-MICROSOFT-TODO-2026-10-21.md):
// segurar e arrastar muda a ordem na lista; soltar num item do menu lateral move, traz para hoje, põe estrela ou manda para a Caixa.
// Sempre há o outro jeito, sem arrastar (WCAG 2.5.7): "Subir/Descer na lista" e "Mover para…" no ⋯.
import { estado, redesenhar, falha } from './estado.js';
import * as dados from './dados.js';
import { selecao } from './acoes.js';
import { avisar, mostrarEstado } from './ui.js';

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

// Chamado por cada cartão (telas.js). No celular não arrasta (lá é a Fase C: pressionar e segurar).
export function ligarArrastar(no, t) {
  if (!largo.matches) return;
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
    if (!id || id === t.id || !no.closest('.lista[data-reordena]') || tarefasArrastadas().length > 1) return;
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
    const x = porId(estado.arrastando);
    const depois = no.classList.contains('soltar-depois');
    limparIndicadores();
    if (x && x.id !== t.id) reordenar(x, no, depois);
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
  ids.splice(ids.indexOf(alvoNo.dataset.id) + (depois ? 1 : 0), 0, x.id);
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
  const destino = lista.hasAttribute('data-subgrupo') ? { area: lista.dataset.area || null, subgrupo: lista.dataset.subgrupo || null } : null;
  const mudouLista = destino && ((x.area || null) !== destino.area || (x.subgrupo || null) !== destino.subgrupo);
  if (mudouLista) patches.set(x.id, { ...(patches.get(x.id) || {}), ...destino });
  if (!patches.size) return;

  const antes = new Map([...patches].map(([id, p]) => { const t = porId(id); return [id, Object.fromEntries(Object.keys(p).map((c) => [c, t[c] ?? null]))]; }));
  const lugarAntes = estado.lugares.get(x.id);
  const aplicar = (valores) => { for (const [id, p] of valores) Object.assign(porId(id), p); };
  aplicar(patches);
  if (mudouLista) estado.lugares.set(x.id, { ...destino });   // você mesmo pôs ali: aparece onde soltou
  redesenhar();
  mostrarEstado('Salvando…');
  const desfazerNaTela = () => { aplicar(antes); if (mudouLista) estado.lugares.set(x.id, lugarAntes); redesenhar(); };
  try {
    for (const [id, p] of patches) await dados.mudarTarefa(id, p);
  } catch (erro) {
    desfazerNaTela();
    falha(erro);
    return;
  }
  mostrarEstado('Salvo ✓');
  const rotulo = mudouLista ? `${x.titulo} → ${[destino.area, destino.subgrupo].filter(Boolean).join(' › ')}` : `Nova ordem · ${x.titulo}`;
  avisar(rotulo, async () => {
    desfazerNaTela();
    try {
      for (const [id, p] of antes) await dados.mudarTarefa(id, p);
      mostrarEstado('Salvo ✓');
    } catch (erro) { falha(erro); }
  });
}
