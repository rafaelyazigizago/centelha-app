// Centelha · contas puras das telas: em que seção cada tarefa fica, as lâmpadas do dia e o varal da semana.
// Recebem "hoje" (AAAA-MM-DD) para poderem ser testadas (testes/calculos.test.mjs).
import { somarDias, deISO, paraISO } from './datas.js';

// Dia local (AAAA-MM-DD) de um instante ISO do banco, como "2026-10-21T22:30:00Z".
export function diaLocal(instante) {
  return instante ? paraISO(new Date(instante)) : null;
}

// A seção é fixada ao carregar: nada muda de lugar sozinho enquanto a tela está aberta.
export function secaoDe(t, hoje) {
  if (t.estado === 'feita') return diaLocal(t.feita_em) === hoje ? 'hoje' : 'fora';
  if (t.prioridade_semana) return 'prioridade';
  if (!t.dia) return 'caixa';
  if (t.dia === hoje) return 'hoje';
  if (t.dia < hoje) return 'para-tras';
  if (t.dia === somarDias(hoje, 1)) return 'amanha';
  return 'depois';
}

// As lâmpadas do dia: o que estava marcado para hoje (aberto) e o que foi feito hoje.
export function lampadasDoDia(tarefas, hoje) {
  const doDia = tarefas.filter((t) =>
    (t.estado === 'aberta' && t.dia === hoje) || (t.estado === 'feita' && diaLocal(t.feita_em) === hoje));
  return { total: doDia.length, acesas: doDia.filter((t) => t.estado === 'feita').length };
}

export function segundaDaSemana(hoje) {
  const d = deISO(hoje);
  return somarDias(hoje, -((d.getDay() + 6) % 7));
}

const NOMES = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

// O varal da semana: 7 lâmpadas de segunda a domingo.
// Total do dia = o que ainda está marcado para ele + o que foi feito nele. Domingo é descanso.
export function varalDaSemana(tarefas, hoje) {
  const segunda = segundaDaSemana(hoje);
  return NOMES.map((nome, i) => {
    const iso = somarDias(segunda, i);
    const marcadas = tarefas.filter((t) => t.estado === 'aberta' && t.dia === iso).length;
    const feitas = tarefas.filter((t) => t.estado === 'feita' && diaLocal(t.feita_em) === iso).length;
    return {
      iso, nome, total: marcadas + feitas, acesas: feitas,
      hoje: iso === hoje, passado: iso < hoje, domingo: i === 6,
    };
  });
}

// Tarefas de um dia da semana: as marcadas para ele e as feitas nele.
export function tarefasDoDia(tarefas, iso) {
  return tarefas.filter((t) =>
    (t.estado === 'aberta' && t.dia === iso) || (t.estado === 'feita' && diaLocal(t.feita_em) === iso));
}

// Lentes: com alguma ligada, aparece a tarefa que tem ao menos uma delas.
export function passaNasLentes(t, ligadas) {
  if (!ligadas.size) return true;
  return (t.lentes || []).some((l) => ligadas.has(l));
}

// Quantas foram feitas desde segunda (para o "Acesa!").
export function feitasNaSemana(tarefas, hoje) {
  const segunda = segundaDaSemana(hoje);
  return tarefas.filter((t) => t.estado === 'feita' && (diaLocal(t.feita_em) || '') >= segunda).length;
}

// Grupos (aba "Grupos", no jeito do Microsoft To Do): Área → subgrupo → tarefas.
// Áreas e subgrupos com mais tarefas primeiro; "sem área" e "sem subgrupo" por último; tarefas por dia, depois por criação.
// "onde" diz a área e o subgrupo de cada tarefa (padrão: os da própria tarefa).
export function agruparPorArea(tarefas, onde = (t) => t) {
  const porArea = new Map();
  for (const t of tarefas) {
    const area = onde(t).area || null, sub = onde(t).subgrupo || null;
    if (!porArea.has(area)) porArea.set(area, new Map());
    const subs = porArea.get(area);
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push(t);
  }
  const ordemTarefa = (a, b) => (a.dia ?? '9999').localeCompare(b.dia ?? '9999') || (a.criado_em || '').localeCompare(b.criado_em || '');
  const ordemGrupo = (a, b) => (a.nome === null) - (b.nome === null) || b.total - a.total || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  return [...porArea].map(([area, subs]) => {
    const subgrupos = [...subs].map(([nome, lista]) => ({ nome, total: lista.length, tarefas: lista.sort(ordemTarefa) })).sort(ordemGrupo);
    return { nome: area, total: subgrupos.reduce((s, g) => s + g.total, 0), subgrupos };
  }).sort(ordemGrupo);
}

// ---------- O Hoje em caixas (pedido de Rafael, 28/10) ----------
// Cada tarefa aparece numa caixa só. Em andamento e Aguardando outros valem para qualquer dia (são etiquetas,
// como no Quadro: "em andamento" e qualquer uma que comece com "aguardando"); Prioridades, para a semana;
// as partes do dia, para hoje. O que não cai em caixa fica nas seções de sempre (Amanhã, Próximos dias, Ficou para trás).
export const CAIXAS_DO_HOJE = [
  ['prioridades', 'Prioridades da semana'], ['manha', 'Manhã'], ['almoco', 'Horário do almoço'], ['tarde', 'Tarde'],
  ['noite', 'Noite'], ['qualquer', 'A qualquer hora'], ['andamento', 'Em andamento'], ['aguardando', 'Aguardando outros'],
];
const EM_ANDAMENTO = /^em andamento$/i, AGUARDANDO = /^aguardando/i;
export const PARTES_DO_DIA = ['manha', 'almoco', 'tarde', 'noite'];

export function situacaoDe(t) {
  const etiquetas = t.etiquetas || [];
  if (etiquetas.some((e) => EM_ANDAMENTO.test(e))) return 'andamento';
  if (etiquetas.some((e) => AGUARDANDO.test(e))) return 'aguardando';
  return null;
}

// As etiquetas com a situação nova (ou sem nenhuma, com null). As outras etiquetas ficam como estão.
export function comSituacao(etiquetas, situacao) {
  const resto = (etiquetas || []).filter((e) => !EM_ANDAMENTO.test(e) && !AGUARDANDO.test(e));
  if (situacao === 'andamento') return [...resto, 'em andamento'];
  if (situacao === 'aguardando') return [...resto, 'aguardando'];
  return resto;
}

// "secao" é a seção fixada ao carregar (secaoDe), para nada mudar de lugar sozinho.
export function caixaDoHoje(t, secao) {
  if (t.estado === 'aberta') {
    const s = situacaoDe(t);
    if (s) return s;
  }
  if (secao === 'prioridade') return 'prioridades';
  if (secao === 'hoje') return PARTES_DO_DIA.includes(t.parte_do_dia) ? t.parte_do_dia : 'qualquer';
  return null;
}

// O que muda numa tarefa solta noutra caixa. Prioridades só muda a ordem: não recebe nem cede tarefa.
export function mudancaParaCaixa(t, caixa, hoje) {
  if (caixa === 'prioridades') return null;
  if (caixa === 'andamento' || caixa === 'aguardando') return { etiquetas: comSituacao(t.etiquetas, caixa) };
  const patch = { dia: hoje, parte_do_dia: caixa === 'qualquer' ? null : caixa };
  if (situacaoDe(t)) patch.etiquetas = comSituacao(t.etiquetas, null);
  return patch;
}
