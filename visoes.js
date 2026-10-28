// Centelha · ver uma lista de outros jeitos (28/10, pedido de Rafael, como no Vikunja): Quadro, Tabela e Linha do tempo.
// A Lista continua em tela-lista.js. As contas puras (colunas, barras) estão em calculos.js, com testes.
import { COLUNAS_QUADRO, colunaDe, barraNaLinha, segundaDaSemana, temMarca, semanasDoMes, noDiaDoCalendario, duracaoTexto } from './calculos.js';
import { somarDias, rotuloDia, paraISO } from './datas.js';
import { usavel } from './funcoes.js';
import { estado, alternarFeita, moverPara } from './estado.js';
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
// Desde a 0007, com a função ligada em "Do seu jeito": projeto, tempo e energia
const COLUNAS_EXTRAS = [['projeto', 'Projeto', 'projetos'], ['minutos', 'Tempo', 'tempo'], ['energia', 'Energia', 'tempo']];
const NOMES_ENERGIA = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const nomeProjeto = (t) => estado.projetos.find((p) => p.id === t.projeto_id)?.nome || '';
const ordemTabela = { por: 'dia', sobe: true };
const grupoDe = (t) => [t.area, t.subgrupo].filter(Boolean).join(' › ');
const VALOR = {
  titulo: (t) => t.titulo.toLocaleLowerCase('pt-BR'),
  dia: (t) => t.dia ?? '9999',
  grupo: (t) => grupoDe(t).toLocaleLowerCase('pt-BR') || '~',
  situacao: (t) => NOMES_SITUACAO[colunaDe(t)],
  passos: (t) => estado.passos.get(t.id)?.total ?? 0,
  projeto: (t) => nomeProjeto(t).toLocaleLowerCase('pt-BR') || '~',
  minutos: (t) => t.minutos ?? Infinity,
  energia: (t) => ({ baixa: 1, media: 2, alta: 3 })[t.energia] ?? 9,
};

export function tabela(tarefas, redesenhar) {
  const { por, sobe } = ordemTabela;
  const linhas = [...tarefas].sort((a, b) => {
    const x = VALOR[por](a), y = VALOR[por](b);
    return (x < y ? -1 : x > y ? 1 : 0) * (sobe ? 1 : -1);
  });
  const extras = COLUNAS_EXTRAS.filter(([, , funcao]) => usavel(funcao)).map(([c]) => c);
  const colunas = [...COLUNAS_TABELA, ...COLUNAS_EXTRAS.filter(([c]) => extras.includes(c))];
  const cabeca = el('tr', {}, el('th', { scope: 'col', 'aria-label': 'Feita' }), colunas.map(([chave, nome]) => el('th', {
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
      el('td', {}, passos?.total ? `${passos.feitos} de ${passos.total}` : '—'),
      extras.includes('projeto') ? el('td', {}, nomeProjeto(t) || '—') : null,
      extras.includes('minutos') ? el('td', {}, t.minutos ? duracaoTexto(t.minutos * 60000) : '—') : null,
      extras.includes('energia') ? el('td', {}, NOMES_ENERGIA[t.energia] || '—') : null);
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

// ---------- Calendário do mês (28/10): as tarefas em cada dia. Tocar no dia abre a lista dele embaixo;
// arrastar uma tarefa para outro dia muda a data (no notebook com o mouse, no celular segurando o cartão da lista) ----------
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const NO_DIA = 3;   // tarefas à vista em cada dia; o resto vira "+N"
let mesCal = null, diaCal = null;
export function calendario(tarefas, opcoes, redesenhar) {
  const hoje = estado.hoje;
  mesCal ??= hoje.slice(0, 7);
  diaCal ??= hoje;
  const [ano, mes] = mesCal.split('-').map(Number);
  const irPara = (k) => { mesCal = paraISO(new Date(ano, mes - 1 + k, 1)).slice(0, 7); redesenhar(); };
  const topo = el('div', { classe: 'cal-topo' },
    el('button', { type: 'button', classe: 'icone-btn', 'aria-label': 'Mês anterior', onclick: () => irPara(-1) }, '‹'),
    el('h2', { id: 'cal-mes' }, `${MESES[mes - 1]} de ${ano}`),
    el('button', { type: 'button', classe: 'icone-btn', 'aria-label': 'Próximo mês', onclick: () => irPara(1) }, '›'),
    el('button', { type: 'button', classe: 'pilula', onclick: () => { mesCal = hoje.slice(0, 7); diaCal = hoje; redesenhar(); } }, 'Hoje'));
  const dias = semanasDoMes(ano, mes).flat().map((iso) => {
    const doDia = tarefas.filter((t) => noDiaDoCalendario(t, iso));
    const classes = ['cal-dia', iso.slice(0, 7) !== mesCal && 'fora', iso === hoje && 'hoje', iso === diaCal && 'escolhido'].filter(Boolean).join(' ');
    return el('div', {
      classe: classes, 'data-dia-cal': iso, role: 'button', tabindex: '0', 'aria-pressed': String(iso === diaCal),
      'aria-label': `${rotuloDia(iso)}: ${doDia.length ? `${doDia.length} ${doDia.length === 1 ? 'tarefa' : 'tarefas'}` : 'nada marcado'}`,
      onclick: () => { diaCal = iso; redesenhar(); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); diaCal = iso; redesenhar(); } },
    },
    el('span', { classe: 'cal-n' }, String(+iso.slice(8))),
    ...doDia.slice(0, NO_DIA).map((t) => el('span', {
      classe: 'cal-tarefa' + (t.estado === 'feita' ? ' feita' : ''), draggable: 'true', 'data-id': t.id,
      ondragstart: (e) => { estado.arrastando = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.titulo); },
      ondragend: () => { estado.arrastando = null; },
    }, t.titulo)),
    doDia.length > NO_DIA ? el('span', { classe: 'cal-mais' }, `+${doDia.length - NO_DIA}`) : null);
  });
  const doEscolhido = tarefas.filter((t) => noDiaDoCalendario(t, diaCal));
  const semDia = tarefas.filter((t) => t.estado === 'aberta' && !t.dia).length;
  return el('div', {},
    topo,
    el('div', { classe: 'cal-grade', role: 'grid', 'aria-labelledby': 'cal-mes' },
      SEMANA.map((d, i) => el('div', { classe: 'cal-semana' + (i === 6 ? ' domingo' : '') }, d)), ...dias),
    el('section', { classe: 'grupo' },
      el('h2', {}, rotuloDia(diaCal), el('span', { classe: 'n' }, String(doEscolhido.length))),
      doEscolhido.length
        ? el('div', { classe: 'lista', 'data-reordena': true, 'data-dia-lista': diaCal }, doEscolhido.map((t) => linha(t, opcoes)))
        : el('p', { classe: 'vazio' }, 'Nada marcado para este dia. Arraste uma tarefa para cá, ou escolha este dia na tarefa aberta.')),
    semDia ? el('p', { classe: 'ajuda' }, `${semDia} sem dia, na Caixa de entrada`) : null);
}

// Soltar uma tarefa arrastada num dia do calendário muda a data dela (com aviso e Desfazer, como sempre).
export function soltarNoDia(id, iso) {
  const t = estado.tarefas.find((x) => x.id === id);
  if (t && t.dia !== iso) moverPara(t, iso);
}
