// Centelha · uma lista no jeito do Microsoft To Do: um subgrupo, uma área inteira ou as Prioridades (a "Importante" do To Do).
// Cartões com estrela, "+ Adicionar tarefa" no fim e "Concluídas" recolhida embaixo.
// Meio-termo com a regra "nada se mexe sozinho": a tarefa concluída fica no lugar, riscada, enquanto você está na lista;
// ao abrir a lista de novo, ela já está em "Concluídas".
import { agruparPorArea } from './calculos.js';
import { estado, lugar, anotar } from './estado.js';
import { dobra, linha } from './telas.js';
import { comecarSelecao, limparSelecao } from './acoes.js';
import { $, el, icone } from './ui.js';

const abertas = new Set();

export function abrirLista(tipo, area = null, subgrupo = null) {
  const pertence = (t) => (tipo === 'prioridades'
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

const ordem = (a, b) => (a.dia ?? '9999').localeCompare(b.dia ?? '9999') || (a.criado_em || '').localeCompare(b.criado_em || '');

export function desenharLista() {
  const L = estado.lista, tela = $('tela-lista');
  if (!L) { tela.replaceChildren(); return; }
  const todas = estado.tarefas.filter((t) => L.ids.has(t.id) && t.estado !== 'cancelada');
  const ativas = todas.filter((t) => !L.concluidas.has(t.id)).sort(ordem);
  const concluidas = todas.filter((t) => L.concluidas.has(t.id)).sort(ordem);
  const opcoes = { estrela: true, semGrupo: L.tipo !== 'prioridades' };

  const titulo = L.tipo === 'prioridades' ? 'Prioridades da semana' : L.tipo === 'area' ? L.area : (L.subgrupo ?? 'Sem subgrupo');
  const acima = L.tipo === 'sub' ? L.area : L.tipo === 'area' ? 'Grupo inteiro' : 'Tarefas com estrela';

  const corpo = [];
  if (!ativas.length) {
    corpo.push(el('p', { classe: 'vazio' }, L.tipo === 'prioridades' ? 'Nenhuma tarefa com estrela. Toque na estrela de uma tarefa para ela vir para cá.' : 'Nenhuma tarefa aberta nesta lista. Anote abaixo.'));
  } else if (L.tipo === 'area') {
    for (const s of agruparPorArea(ativas, lugar)[0]?.subgrupos || []) {
      corpo.push(el('p', { classe: 'rotulo', style: 'text-transform:none' }, `${s.nome ?? 'Sem subgrupo'} · ${s.total}`),
        el('div', { classe: 'lista' }, s.tarefas.sort(ordem).map((t) => linha(t, opcoes))));
    }
  } else {
    corpo.push(el('div', { classe: 'lista' }, ativas.map((t) => linha(t, opcoes))));
  }

  tela.replaceChildren(...[   // o que não existe (null) fica de fora, senão aparece escrito "null"
    el('p', { classe: 'data', style: 'margin-top:18px' }, acima),
    el('h1', { id: 'titulo-lista', style: 'margin-top:2px', html: L.tipo === 'prioridades' ? `${icone('estrela', 'estrela-titulo')}<span></span>` : '' }),
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

// "+ Adicionar tarefa": já nasce nesta lista ("amanhã", "sexta"… continuam valendo).
function adicionar(L) {
  const campo = el('input', { id: 'adicionar-tarefa', type: 'text', enterkeyhint: 'done', autocomplete: 'off', placeholder: '+ Adicionar tarefa', 'aria-label': 'Adicionar tarefa nesta lista' });
  const form = el('form', { classe: 'novo-passo adicionar', 'data-mantem-aviso': true, style: 'margin-top:14px' }, campo, el('button', { type: 'submit', classe: 'btn' }, 'Anotar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    const extra = L.tipo === 'prioridades' ? { prioridade_semana: true } : L.tipo === 'area' ? { area: L.area } : { area: L.area, subgrupo: L.subgrupo };
    const nova = await anotar(texto, false, extra, (t) => L.ids.add(t.id));
    if (nova) setTimeout(() => $('adicionar-tarefa')?.focus(), 30);
  });
  return form;
}
