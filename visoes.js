// Centelha · ver uma lista de outros jeitos (28/10, pedido de Rafael, como no Vikunja): Quadro, Tabela e Linha do tempo.
// A Lista continua em tela-lista.js. As contas puras (colunas, barras) estão em calculos.js, com testes.
import { COLUNAS_QUADRO, colunaDe, barraNaLinha, segundaDaSemana, temMarca } from './calculos.js';
import { somarDias, rotuloDia } from './datas.js';
import { estado, alternarFeita } from './estado.js';
import { linha, abrir } from './telas.js';
import { el, lampada } from './ui.js';

// ---------- Quadro (Kanban): A fazer · Em andamento · Aguardando · Feitas. Arrastar entre colunas muda a situação ----------
export function quadro(tarefas, opcoes, ordem) {
  return el('div', { classe: 'quadro-kanban' }, COLUNAS_QUADRO.map(([coluna, nome]) => {
    const daColuna = tarefas.filter((t) => colunaDe(t) === coluna).sort(ordem);
    return el('section', { classe: 'coluna', 'data-coluna-quadro': coluna },
      el('h2', {}, nome, el('span', { classe: 'n' }, String(daColuna.length))),
      el('div', { classe: 'lista', 'data-reordena': true, 'data-coluna': coluna }, daColuna.map((t) => linha(t, opcoes))));
  }));
}

// ---------- Tabela: uma linha por tarefa; tocar no título de uma coluna ordena por ela ----------
const NOMES_SITUACAO = { feitas: 'Feita', andamento: 'Em andamento', aguardando: 'Aguardando', afazer: 'A fazer' };
const COLUNAS_TABELA = [['titulo', 'Tarefa'], ['dia', 'Dia'], ['grupo', 'Grupo'], ['situacao', 'Situação'], ['passos', 'Passos']];
const ordemTabela = { por: 'dia', sobe: true };
const grupoDe = (t) => [t.area, t.subgrupo].filter(Boolean).join(' › ');
const VALOR = {
  titulo: (t) => t.titulo.toLocaleLowerCase('pt-BR'),
  dia: (t) => t.dia ?? '9999',
  grupo: (t) => grupoDe(t).toLocaleLowerCase('pt-BR') || '~',
  situacao: (t) => NOMES_SITUACAO[colunaDe(t)],
  passos: (t) => estado.passos.get(t.id)?.total ?? 0,
};

export function tabela(tarefas, redesenhar) {
  const { por, sobe } = ordemTabela;
  const linhas = [...tarefas].sort((a, b) => {
    const x = VALOR[por](a), y = VALOR[por](b);
    return (x < y ? -1 : x > y ? 1 : 0) * (sobe ? 1 : -1);
  });
  const cabeca = el('tr', {}, el('th', { scope: 'col', 'aria-label': 'Feita' }), COLUNAS_TABELA.map(([chave, nome]) => el('th', {
    scope: 'col', 'aria-sort': por === chave ? (sobe ? 'ascending' : 'descending') : 'none',
  }, el('button', {
    type: 'button', classe: 'ordenar',
    onclick: () => { ordemTabela.sobe = ordemTabela.por === chave ? !ordemTabela.sobe : true; ordemTabela.por = chave; redesenhar(); },
  }, nome, por === chave ? (sobe ? ' ↑' : ' ↓') : ''))));
  const corpo = linhas.map((t) => {
    const feita = t.estado === 'feita';
    const passos = estado.passos.get(t.id);
    const marcas = [t.prioridade_semana ? '★' : '', temMarca(t, 'importante') ? 'Importante' : '', temMarca(t, 'urgente') ? 'Urgente' : ''].filter(Boolean).join(' · ');
    return el('tr', { classe: feita ? 'feita' : '', 'data-id': t.id },
      el('td', {}, el('button', { type: 'button', classe: 'botao-lamp mini', 'aria-pressed': String(feita), 'aria-label': `${feita ? 'Feita' : 'Marcar como feita'}: ${t.titulo}`, html: lampada(feita), onclick: () => alternarFeita(t) })),
      el('td', {}, el('button', { type: 'button', classe: 'link-tarefa', onclick: () => abrir(t) }, t.titulo), marcas ? el('span', { classe: 'marcas-tabela' }, marcas) : null),
      el('td', {}, t.dia ? rotuloDia(t.dia) : '—'),
      el('td', {}, grupoDe(t) || '—'),
      el('td', {}, NOMES_SITUACAO[colunaDe(t)]),
      el('td', {}, passos?.total ? `${passos.feitos} de ${passos.total}` : '—'));
  });
  return el('div', { classe: 'tabela-rolagem' }, el('table', { classe: 'tabela-tarefas' }, el('thead', {}, cabeca), el('tbody', {}, corpo)));
}

// ---------- Linha do tempo (o Gantt): 6 semanas a partir desta segunda; uma barra do início ao dia ----------
const DIAS = 42;
const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export function linhaDoTempo(tarefas) {
  const primeiro = segundaDaSemana(estado.hoje);
  const comBarra = tarefas.map((t) => [t, barraNaLinha(t, primeiro, DIAS)]).filter(([, b]) => b)
    .sort(([a, x], [b, y]) => x.de - y.de || x.ate - y.ate || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const semDia = tarefas.filter((t) => !t.dia).length;
  const depois = tarefas.filter((t) => t.dia && !barraNaLinha(t, primeiro, DIAS)).length;
  const cabeca = [el('div', { classe: 'lt-canto' }), ...Array.from({ length: DIAS }, (_, i) => {
    const iso = somarDias(primeiro, i);
    return el('div', { classe: `lt-dia${iso === estado.hoje ? ' hoje' : ''}${i % 7 === 6 ? ' domingo' : ''}`, style: `grid-column:${i + 2}` },
      el('strong', {}, String(+iso.slice(8))), el('span', {}, SEMANA[i % 7]));
  })];
  const linhas = comBarra.flatMap(([t, b], n) => [
    el('button', { type: 'button', classe: 'lt-nome', style: `grid-row:${n + 2}`, onclick: () => abrir(t), title: t.titulo }, t.titulo),
    el('button', {
      type: 'button', classe: `lt-barra${t.estado === 'feita' ? ' feita' : ''}${b.antes ? ' antes' : ''}`,
      style: `grid-row:${n + 2};grid-column:${b.de + 2} / ${b.ate + 3}`, onclick: () => abrir(t),
      'aria-label': `${t.titulo}: ${b.antes ? 'atrasada, ' : ''}${rotuloDia(t.dia)}`,
    }, b.antes ? '← ' : ''),
  ]);
  return el('div', {},
    el('div', { classe: 'tabela-rolagem' }, el('div', { classe: 'linha-do-tempo', style: `grid-template-columns:minmax(150px, 220px) repeat(${DIAS}, 30px)` }, ...cabeca, ...linhas)),
    el('p', { classe: 'ajuda' }, [
      comBarra.length ? `${comBarra.length} com dia nestas 6 semanas` : 'Nenhuma tarefa com dia nestas 6 semanas',
      semDia ? `${semDia} sem dia` : '', depois ? `${depois} depois disso` : '',
    ].filter(Boolean).join(' · ')));
}
