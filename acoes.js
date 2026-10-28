// Centelha · ações de uma ou de várias tarefas, no jeito do Microsoft To Do (Fase A, docs/pesquisa/ESTUDO-MICROSOFT-TODO-2026-10-21.md):
// menu ⋯ (ou clique direito), "Mover para…" outro grupo ou subgrupo, estrela e a escolha de várias.
// Nada se mexe sozinho: a tarefa movida fica no lugar, com a marca "→ destino", até a tela recarregar.
import { somarDias } from './datas.js';
import { agruparPorArea, situacaoDe, temMarca } from './calculos.js';
import { estado, mudar, moverPara, alternarFeita, redesenhar, falha, mudarSituacao, mudarMarca } from './estado.js';
import * as dados from './dados.js';
import { $, el, abrirFolha, fecharFolha, avisar, mostrarEstado, folhaAtual } from './ui.js';
import { reordenar } from './arrastar.js';
import { escolherChama } from './chama.js';
import { usavel } from './funcoes.js';

let abrirTarefa = () => {};
export const aoAbrirTarefaPelasAcoes = (f) => { abrirTarefa = f; };

const porId = (id) => estado.tarefas.find((t) => t.id === id);
const plural = (n, um, varios) => (n === 1 ? um : varios);

// ---------- Estrela (= prioridade da semana) ----------
export function alternarEstrela(t) {
  const sim = !t.prioridade_semana;
  return mudar(t, { prioridade_semana: sim }, {
    mensagem: `${sim ? 'Estrela' : 'Sem estrela'} · ${t.titulo}`, desfazer: { prioridade_semana: !sim },
  });
}

// ---------- Escolher várias ----------
export const selecao = new Set();

export function alternarSelecao(t) {
  if (selecao.has(t.id)) selecao.delete(t.id); else selecao.add(t.id);
  estado.selecionando = true;
  desenharBarra();
  redesenhar();
}

export function comecarSelecao() {
  estado.selecionando = true;
  desenharBarra();
  redesenhar();
}

export function limparSelecao() {
  if (!estado.selecionando && !selecao.size) return;
  selecao.clear();
  estado.selecionando = false;
  desenharBarra();
  redesenhar();
}

function desenharBarra() {
  const barra = $('barra-selecao');
  if (!barra) return;
  if (!estado.selecionando) { barra.hidden = true; barra.replaceChildren(); return; }
  const escolhidas = () => [...selecao].map(porId).filter(Boolean);
  const n = selecao.size;
  barra.replaceChildren(
    el('span', { classe: 'barra-conta', 'aria-live': 'polite' }, n ? `${n} ${plural(n, 'escolhida', 'escolhidas')}` : 'Toque nas tarefas para escolher'),
    el('button', { type: 'button', classe: 'btn', disabled: !n, 'data-mantem-aviso': true, onclick: () => abrirMover(escolhidas()) }, 'Mover para…'),
    el('button', { type: 'button', classe: 'btn claro', disabled: !n, 'data-mantem-aviso': true, onclick: () => trazerParaHoje(escolhidas()) }, 'Hoje'),
    el('button', { type: 'button', classe: 'btn claro', onclick: limparSelecao }, 'Cancelar'),
  );
  barra.hidden = false;
}

// ---------- Menu ⋯ de uma tarefa ----------
export function abrirAcoes(t) {
  const feita = t.estado === 'feita';
  const item = (rotulo, fazer, extra = {}) => el('button', {
    type: 'button', classe: 'opcao inteira', 'data-mantem-aviso': true, ...extra,
    onclick: () => { fecharFolha('folha-acoes'); fazer(); },
  }, rotulo);
  // Em 4 grupos com título (lote 43): o olho acha pelo grupo em vez de ler 14 linhas (lei de Hick). Grupo vazio não aparece.
  const grupo = (nome, itens) => { const ok = itens.flat().filter(Boolean); return ok.length ? [nome ? el('p', { classe: 'rotulo' }, nome) : null, el('div', { classe: 'opcoes' }, ok)] : []; };
  $('folha-acoes').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('h2', { id: 'titulo-acoes', style: 'font-size:1.3rem' }, t.titulo),
    ...[
      ...grupo('agora', [
        item(feita ? 'Reabrir (apagar a luz)' : 'Concluir (acender a luz)', () => alternarFeita(t)),
        !feita && usavel('chama') ? item('Focar nesta tarefa (Chama)', () => depoisDeFechar(() => escolherChama(t))) : null,
        situacoes(t, item),
      ]),
      ...grupo('quando', [
        t.dia !== estado.hoje && !feita ? item('Trazer para hoje', () => moverPara(t, estado.hoje)) : null,
        !feita ? item('Amanhã', () => moverPara(t, somarDias(estado.hoje, 1))) : null,
        t.dia && !feita ? item('Sem dia', () => moverPara(t, null)) : null,
      ]),
      ...grupo('peso', [
        item(t.prioridade_semana ? 'Tirar a estrela' : 'Pôr estrela (prioridade da semana)', () => alternarEstrela(t)),
        !feita && usavel('matriz') ? item(temMarca(t, 'importante') ? 'Tirar "Importante"' : 'Importante', () => mudarMarca(t, 'importante')) : null,
        !feita && usavel('matriz') ? item(temMarca(t, 'urgente') ? 'Tirar "Urgente"' : 'Urgente', () => mudarMarca(t, 'urgente')) : null,
      ]),
      ...grupo('lugar', [
        item('Mover para outro grupo…', () => depoisDeFechar(() => abrirMover([t]))),
        subirDescer(t, item),
      ]),
      ...grupo(null, [
        item('Escolher várias', () => { selecao.add(t.id); comecarSelecao(); }),
        item('Abrir a tarefa', () => abrirTarefa(t)),
      ]),
    ].filter(Boolean)));
  abrirFolha('folha-acoes');
}

// Em andamento e Aguardando outros (as caixas do Hoje): pôr ou tirar com 1 toque.
function situacoes(t, item) {
  if (t.estado !== 'aberta') return [];
  const agora = situacaoDe(t);
  return [
    agora === 'andamento' ? item('Tirar de "Em andamento"', () => mudarSituacao(t, null)) : item('Em andamento', () => mudarSituacao(t, 'andamento')),
    agora === 'aguardando' ? item('Tirar de "Aguardando outros"', () => mudarSituacao(t, null)) : item('Aguardando outros', () => mudarSituacao(t, 'aguardando')),
  ];
}

// "Subir/Descer na lista": o mesmo que arrastar, sem arrastar (WCAG 2.5.7). Na tela de lista e nas caixas do Hoje.
function subirDescer(t, item) {
  if (estado.aba !== 'lista' && estado.aba !== 'hoje') return [];   // (na Matriz, "Subir/Descer" vale dentro do quadro)
  const no = document.querySelector(`#tela-${estado.aba} .lista[data-reordena] > .tarefa[data-id="${CSS.escape(t.id)}"]`);
  if (!no) return [];
  const antes = no.previousElementSibling?.classList.contains('tarefa') ? no.previousElementSibling : null;
  const depois = no.nextElementSibling?.classList.contains('tarefa') ? no.nextElementSibling : null;
  return [
    antes ? item('Subir na lista', () => reordenar(t, antes, false)) : null,
    depois ? item('Descer na lista', () => reordenar(t, depois, true)) : null,
  ];
}

// Várias de uma vez, com um desfazer só (soltar no menu lateral: Prioridades, Caixa).
export async function emLote(tarefas, patch, { marca, mensagem }) {
  const chaves = Object.keys(patch);
  const antes = tarefas.map((t) => [t, Object.fromEntries(chaves.map((k) => [k, t[k] ?? null])), t.vezes_adiada]);
  for (const t of tarefas) { Object.assign(t, patch); if (marca) estado.marcas.set(t.id, marca); }
  selecao.clear(); estado.selecionando = false; desenharBarra();
  redesenhar();
  mostrarEstado('Salvando…');
  const voltarNaTela = () => { for (const [t, a] of antes) { Object.assign(t, a); estado.marcas.delete(t.id); } redesenhar(); };
  try {
    for (const t of tarefas) await dados.mudarTarefa(t.id, patch);
  } catch (erro) { voltarNaTela(); falha(erro); return; }
  mostrarEstado('Salvo ✓');
  avisar(mensagem, async () => {
    voltarNaTela();
    try {
      for (const [t, a, vezes] of antes) await dados.mudarTarefa(t.id, 'dia' in patch ? { ...a, vezes_adiada: vezes } : a);
      mostrarEstado('Salvo ✓');
    } catch (erro) { falha(erro); }
  });
}

// Uma folha só abre depois que a outra terminou de descer.
const depoisDeFechar = (f) => setTimeout(f, document.body.dataset.movimento === 'parado' ? 0 : 440);

// ---------- Mover para… outro grupo ou subgrupo ----------
export function abrirMover(tarefas) {
  if (!tarefas.length) return;
  const grupos = agruparPorArea(estado.tarefas.filter((t) => t.estado === 'aberta' && t.area));
  const mesma = (chave, v) => tarefas.every((t) => (t[chave] || null) === v);
  const destino = (area, sub, rotulo) => el('button', {
    type: 'button', classe: 'pilula', 'data-mantem-aviso': true,
    'aria-pressed': String(mesma('area', area) && mesma('subgrupo', sub)),
    onclick: () => { fecharFolha('folha-acoes'); moverGrupo(tarefas, area, sub); },
  }, rotulo);

  const area = el('input', { id: 'nova-area', type: 'text', list: 'mover-areas', autocomplete: 'off', placeholder: 'Grupo (ex.: Soluções)' });
  const sub = el('input', { id: 'nova-lista', type: 'text', autocomplete: 'off', placeholder: 'Nome da lista (ex.: CONSERTOS)' });
  const nova = el('form', { classe: 'bloco', 'data-mantem-aviso': true },
    el('h3', { style: 'margin:0' }, 'Ou uma lista nova'),
    el('div', { classe: 'campo' }, el('label', { for: 'nova-area' }, el('span', {}, 'Grupo')), area),
    el('div', { classe: 'campo' }, el('label', { for: 'nova-lista' }, el('span', {}, 'Lista (subgrupo)')), sub),
    el('datalist', { id: 'mover-areas' }, grupos.map((g) => el('option', { value: g.nome }))),
    el('button', { type: 'submit', classe: 'btn' }, 'Mover para a lista nova'));
  nova.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = area.value.trim() || null, s = sub.value.trim() || null;
    if (!a) { area.focus(); return; }
    fecharFolha('folha-acoes');
    moverGrupo(tarefas, a, s);
  });

  $('folha-acoes').replaceChildren(el('div', { classe: 'miolo ajuste' },
    el('div', { classe: 'alca' }),
    el('h2', { id: 'titulo-acoes', style: 'font-size:1.5rem' }, 'Mover para…'),
    el('p', { classe: 'ajuda' }, tarefas.length === 1 ? tarefas[0].titulo : `${tarefas.length} tarefas`),
    ...grupos.map((g) => el('div', { classe: 'bloco', style: 'margin-top:4px;gap:8px' },
      el('h3', { style: 'margin:0' }, g.nome),
      el('div', { classe: 'fileira' },
        g.subgrupos.filter((s) => s.nome).map((s) => destino(g.nome, s.nome, s.nome)),
        destino(g.nome, null, 'Sem subgrupo')))),
    nova,
    el('button', { type: 'button', classe: 'btn claro grande', onclick: () => fecharFolha('folha-acoes') }, 'Cancelar'),
  ));
  if (folhaAtual() !== 'folha-acoes') abrirFolha('folha-acoes');
}

export async function moverGrupo(tarefas, area, subgrupo) {
  const antes = tarefas.map((t) => [t, t.area || null, t.subgrupo || null]);
  const rotulo = [area, subgrupo].filter(Boolean).join(' › ');
  for (const t of tarefas) { t.area = area; t.subgrupo = subgrupo; estado.marcas.set(t.id, `→ ${rotulo}`); }
  selecao.clear(); estado.selecionando = false; desenharBarra();
  redesenhar();
  mostrarEstado('Salvando…');
  try {
    for (const t of tarefas) await dados.mudarTarefa(t.id, { area, subgrupo });
  } catch (erro) {
    for (const [t, a, s] of antes) { t.area = a; t.subgrupo = s; estado.marcas.delete(t.id); }
    redesenhar();
    falha(erro);
    return;
  }
  mostrarEstado('Salvo ✓');
  avisar(`${tarefas.length === 1 ? tarefas[0].titulo : `${tarefas.length} tarefas`} → ${rotulo}`, async () => {
    for (const [t, a, s] of antes) { t.area = a; t.subgrupo = s; estado.marcas.delete(t.id); }
    redesenhar();
    try {
      for (const [t, a, s] of antes) await dados.mudarTarefa(t.id, { area: a, subgrupo: s });
      mostrarEstado('Salvo ✓');
    } catch (erro) { falha(erro); }
  });
}

export async function trazerParaHoje(tarefas) {
  const antes = tarefas.map((t) => [t, t.dia, t.vezes_adiada]);
  for (const t of tarefas) { t.dia = estado.hoje; estado.marcas.set(t.id, '→ Hoje'); }
  selecao.clear(); estado.selecionando = false; desenharBarra();
  redesenhar();
  mostrarEstado('Salvando…');
  try {
    for (const t of tarefas) await dados.mudarTarefa(t.id, { dia: estado.hoje });
  } catch (erro) {
    for (const [t, dia] of antes) { t.dia = dia; estado.marcas.delete(t.id); }
    redesenhar();
    falha(erro);
    return;
  }
  mostrarEstado('Salvo ✓');
  avisar(`${tarefas.length} ${plural(tarefas.length, 'tarefa vai', 'tarefas vão')} para hoje`, async () => {
    for (const [t, dia] of antes) { t.dia = dia; estado.marcas.delete(t.id); }
    redesenhar();
    try { for (const [t, dia, vezes] of antes) await dados.mudarTarefa(t.id, { dia, vezes_adiada: vezes }); mostrarEstado('Salvo ✓'); }
    catch (erro) { falha(erro); }
  });
}
