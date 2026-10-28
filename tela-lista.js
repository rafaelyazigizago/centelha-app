// Centelha · uma lista no jeito do Microsoft To Do: um subgrupo, uma área inteira, as Prioridades (a "Importante" do To Do)
// ou Todas (a "Todas" do To Do, pedido de Rafael de 28/10): todas as abertas numa página só, por grupo e subgrupo, para classificar.
// Cartões com estrela, "+ Adicionar tarefa" no fim e "Concluídas" recolhida embaixo.
// Meio-termo com a regra "nada se mexe sozinho": a tarefa concluída fica no lugar, riscada, enquanto você está na lista;
// ao abrir a lista de novo, ela já está em "Concluídas".
import { agruparPorArea, QUADRANTES, quadranteDe, naMatriz } from './calculos.js';
import { estado, lugar, anotar } from './estado.js';
import { dobra, linha } from './telas.js';
import { comecarSelecao, limparSelecao } from './acoes.js';
import { $, el, icone } from './ui.js';
import { quadro, tabela, linhaDoTempo, calendario } from './visoes.js';

const abertas = new Set();

export function abrirLista(tipo, area = null, subgrupo = null) {
  const pertence = (t) => (tipo === 'todas' || tipo === 'calendario' ? true : tipo === 'matriz' ? naMatriz(t, estado.hoje) : tipo === 'prioridades'
    ? !!t.prioridade_semana
    : lugar(t).area === area && (tipo === 'area' || lugar(t).subgrupo === subgrupo));
  const daLista = estado.tarefas.filter((t) => t.estado !== 'cancelada' && pertence(t));
  estado.lista = {
    tipo, area, subgrupo,
    ids: new Set(daLista.map((t) => t.id)),
    concluidas: new Set(daLista.filter((t) => t.estado === 'feita').map((t) => t.id)),
  };
}

export const mesmaLista = (tipo, area = null, subgrupo = null) =>
  !!estado.lista && estado.lista.tipo === tipo && estado.lista.area === area && estado.lista.subgrupo === subgrupo;

// A ordem que a pessoa escolheu arrastando vem primeiro; sem ela, pela data e pela criação.
const ordem = (a, b) => ((a.ordem ?? Infinity) - (b.ordem ?? Infinity)) || (a.dia ?? '9999').localeCompare(b.dia ?? '9999')
  || (a.criado_em || '').localeCompare(b.criado_em || '');
// Lista que aceita mudar a ordem arrastando; com área e subgrupo, soltar nela também move a tarefa para lá.
const listaQueOrdena = (tarefas, opcoes, area, subgrupo, extra = {}) => el('div', {
  classe: 'lista', 'data-reordena': true,
  ...(area !== undefined ? { 'data-area': area ?? '', 'data-subgrupo': subgrupo ?? '' } : {}),
  ...extra,
}, tarefas.map((t) => linha(t, opcoes)));

export function desenharLista() {
  const L = estado.lista, tela = $('tela-lista');
  if (!L) { tela.replaceChildren(); return; }
  const todas = estado.tarefas.filter((t) => L.ids.has(t.id) && t.estado !== 'cancelada');
  const ativas = todas.filter((t) => !L.concluidas.has(t.id)).sort(ordem);
  const concluidas = todas.filter((t) => L.concluidas.has(t.id)).sort(ordem);
  const opcoes = { estrela: true, semGrupo: L.tipo !== 'prioridades' };
  if (L.tipo === 'matriz') return desenharMatriz(tela, ativas, opcoes);
  const visao = visaoDe(L);
  if (visao !== 'lista') return desenharVisao(L, tela, visao, todas, ativas, opcoes);
  if (L.tipo === 'todas') return desenharTodas(L, tela, ativas, concluidas, opcoes);

  const titulo = L.tipo === 'prioridades' ? 'Prioridades da semana' : L.tipo === 'area' ? L.area : (L.subgrupo ?? 'Sem subgrupo');
  const acima = L.tipo === 'sub' ? L.area : L.tipo === 'area' ? 'Grupo inteiro' : 'Tarefas com estrela';

  const corpo = [];
  if (!ativas.length) {
    corpo.push(el('p', { classe: 'vazio' }, L.tipo === 'prioridades' ? 'Nenhuma tarefa com estrela. Toque na estrela de uma tarefa para ela vir para cá.' : 'Nenhuma tarefa aberta nesta lista. Anote abaixo.'));
  } else if (L.tipo === 'area') {
    for (const s of agruparPorArea(ativas, lugar)[0]?.subgrupos || []) {
      corpo.push(el('p', { classe: 'rotulo', style: 'text-transform:none' }, `${s.nome ?? 'Sem subgrupo'} · ${s.total}`),
        listaQueOrdena(s.tarefas.sort(ordem), opcoes, L.area, s.nome));
    }
  } else {
    corpo.push(L.tipo === 'sub' ? listaQueOrdena(ativas, opcoes, L.area, L.subgrupo) : listaQueOrdena(ativas, opcoes));
  }

  tela.replaceChildren(...[   // o que não existe (null) fica de fora, senão aparece escrito "null"
    el('p', { classe: 'data', style: 'margin-top:18px' }, acima),
    el('h1', { id: 'titulo-lista', style: 'margin-top:2px', html: L.tipo === 'prioridades' ? `${icone('estrela', 'estrela-titulo')}<span></span>` : '' }),
    trocaDeVisao(L),
    el('div', { classe: 'fileira', style: 'margin:8px 0 14px' },
      el('span', { classe: 'ajuda', style: 'align-self:center;flex:1' }, `${ativas.length} ${ativas.length === 1 ? 'aberta' : 'abertas'}`),
      el('button', { type: 'button', classe: 'pilula', 'aria-pressed': String(estado.selecionando), 'data-mantem-aviso': true,
        onclick: () => (estado.selecionando ? limparSelecao() : comecarSelecao()) }, estado.selecionando ? 'Parar de escolher' : 'Escolher várias')),
    ...corpo,
    adicionar(L),
    concluidas.length ? dobra('lista-concluidas', 'Concluídas', concluidas.length, el('div', { classe: 'lista' }, concluidas.map((t) => linha(t, opcoes))), abertas) : null,
  ].filter(Boolean));
  const h1 = tela.querySelector('#titulo-lista');
  if (L.tipo === 'prioridades') h1.querySelector('span').textContent = titulo; else h1.textContent = titulo;
}

// Todas: cada grupo com os seus subgrupos, numa página só. Arrastar para outro subgrupo daqui, ou para o menu da
// esquerda, classifica a tarefa (no notebook). As sem grupo ficam por último, para irem sendo classificadas.
function desenharTodas(L, tela, ativas, concluidas, opcoes) {
  const blocos = agruparPorArea(ativas, lugar).map((g) => el('section', { classe: 'grupo todas-grupo' },
    el('h2', {}, g.nome ?? 'Sem grupo', el('span', { classe: 'n' }, String(g.total))),
    ...g.subgrupos.flatMap((s) => [
      el('p', { classe: 'rotulo', style: 'text-transform:none' }, `${s.nome ?? 'Sem subgrupo'} · ${s.total}`),
      listaQueOrdena(s.tarefas.sort(ordem), opcoes, g.nome, s.nome),
    ])));
  tela.replaceChildren(...[
    el('p', { classe: 'data', style: 'margin-top:18px' }, 'Todas as tarefas abertas, por grupo'),
    el('h1', { id: 'titulo-lista', style: 'margin-top:2px' }, 'Todas'),
    trocaDeVisao(L),
    el('div', { classe: 'fileira', style: 'margin:8px 0 14px' },
      el('span', { classe: 'ajuda', style: 'align-self:center;flex:1' }, `${ativas.length} ${ativas.length === 1 ? 'aberta' : 'abertas'} · arraste para outro subgrupo ou para o menu para classificar`),
      el('button', { type: 'button', classe: 'pilula', 'aria-pressed': String(estado.selecionando), 'data-mantem-aviso': true,
        onclick: () => (estado.selecionando ? limparSelecao() : comecarSelecao()) }, estado.selecionando ? 'Parar de escolher' : 'Escolher várias')),
    ...(blocos.length ? blocos : [el('p', { classe: 'vazio' }, 'Nenhuma tarefa aberta. Anote abaixo.')]),
    adicionar(L),
    concluidas.length ? dobra('lista-concluidas', 'Concluídas', concluidas.length, el('div', { classe: 'lista' }, concluidas.map((t) => linha(t, opcoes))), abertas) : null,
  ].filter(Boolean));
}

// ---------- Ver por tipos (28/10, como no Vikunja): Lista · Quadro · Tabela · Linha do tempo ----------
// A escolha fica guardada neste aparelho, para cada lista (como o resto de "Do seu jeito").
const VISOES = [['lista', 'Lista'], ['quadro', 'Quadro'], ['tabela', 'Tabela'], ['linha', 'Linha do tempo'], ['calendario', 'Calendário']];
const chaveVisao = (L) => `centelha-visao|${L.tipo}|${L.area ?? ''}|${L.subgrupo ?? ''}`;
function visaoDe(L) {
  if (L.tipo === 'calendario') return 'calendario';   // a lista "Calendário" do menu é sempre o calendário
  try { const v = localStorage.getItem(chaveVisao(L)); return VISOES.some(([k]) => k === v) ? v : 'lista'; } catch { return 'lista'; }
}
function trocaDeVisao(L) {
  const atual = visaoDe(L);
  return el('div', { classe: 'fileira visoes', role: 'group', 'aria-label': 'Ver como' }, VISOES.map(([v, nome]) => el('button', {
    type: 'button', classe: 'pilula', 'aria-pressed': String(v === atual),
    onclick: () => { try { localStorage.setItem(chaveVisao(L), v); } catch { /* sem guardar: vale só agora */ } desenharLista(); },
  }, nome)));
}
const tituloDe = (L) => (L.tipo === 'calendario' ? 'Calendário' : L.tipo === 'todas' ? 'Todas' : L.tipo === 'prioridades' ? 'Prioridades da semana' : L.tipo === 'area' ? L.area : (L.subgrupo ?? 'Sem subgrupo'));
const acimaDe = (L) => (L.tipo === 'calendario' ? 'As tarefas de cada dia' : L.tipo === 'todas' ? 'Todas as tarefas abertas, por grupo' : L.tipo === 'sub' ? L.area : L.tipo === 'area' ? 'Grupo inteiro' : 'Tarefas com estrela');
function desenharVisao(L, tela, visao, todas, ativas, opcoes) {
  const corpo = visao === 'quadro' ? quadro(todas, opcoes, ordem)
    : visao === 'tabela' ? tabela(todas, desenharLista)
    : visao === 'calendario' ? calendario(todas, opcoes, desenharLista)
    : linhaDoTempo(ativas);
  tela.replaceChildren(...[   // o que não existe (null) fica de fora, senão aparece escrito "null"
    el('p', { classe: 'data', style: 'margin-top:18px' }, acimaDe(L)),
    el('h1', { id: 'titulo-lista', style: 'margin-top:2px' }, tituloDe(L)),
    L.tipo === 'calendario' ? null : trocaDeVisao(L),
    el('p', { classe: 'ajuda', style: 'margin:8px 0 14px' }, visao === 'calendario' ? 'Toque num dia para ver a lista dele. Arraste uma tarefa para outro dia para mudar a data.' : visao === 'quadro' ? 'Arraste entre as colunas para mudar a situação. Soltar em "Feitas" acende a tarefa.'
      : visao === 'tabela' ? 'Toque no nome de uma coluna para ordenar por ela.' : 'Cada barra vai do início até o dia da tarefa. Toque para abrir.'),
    corpo,
  ].filter(Boolean));
}

// A Matriz (28/10): importante × urgente, em 4 quadros. Arrastar de um quadro para outro troca as marcas.
// Entram as abertas com alguma marca e, sem marca, as de até o fim da semana (calculos.js, naMatriz).
function desenharMatriz(tela, ativas, opcoes) {
  tela.replaceChildren(
    el('p', { classe: 'data', style: 'margin-top:18px' }, 'Importante × urgente'),
    el('h1', { id: 'titulo-lista', style: 'margin-top:2px' }, 'Matriz'),
    el('p', { classe: 'ajuda', style: 'margin:8px 0 14px' }, 'Arraste uma tarefa para outro quadro, ou use o ⋯, para trocar as marcas. A estrela da semana continua à parte.'),
    el('div', { classe: 'matriz' }, QUADRANTES.map(([q, nome, dica]) => {
      const doQuadro = ativas.filter((t) => quadranteDe(t) === q).sort(ordem);
      return el('section', { classe: `quadro quadro-${q}`, 'data-quadro': q },
        el('h2', {}, nome, el('span', { classe: 'n' }, String(doQuadro.length))),
        el('p', { classe: 'ajuda' }, dica),
        listaQueOrdena(doQuadro, opcoes, undefined, undefined, { 'data-quadrante': q }));
    })),
  );
}

// "+ Adicionar tarefa": já nasce nesta lista ("amanhã", "sexta"… continuam valendo).
function adicionar(L) {
  const campo = el('input', { id: 'adicionar-tarefa', type: 'text', enterkeyhint: 'done', autocomplete: 'off', placeholder: '+ Adicionar tarefa', 'aria-label': 'Adicionar tarefa nesta lista' });
  const form = el('form', { classe: 'novo-passo adicionar', 'data-mantem-aviso': true, style: 'margin-top:14px' }, campo, el('button', { type: 'submit', classe: 'btn' }, 'Anotar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    const extra = L.tipo === 'todas' ? {} : L.tipo === 'prioridades' ? { prioridade_semana: true } : L.tipo === 'area' ? { area: L.area } : { area: L.area, subgrupo: L.subgrupo };
    const nova = await anotar(texto, false, extra, (t) => L.ids.add(t.id));
    if (nova) setTimeout(() => $('adicionar-tarefa')?.focus(), 30);
  });
  return form;
}
