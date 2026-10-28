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

// ---------- O resumo no topo do Hoje (lote 36, ideia do Krivo) ----------
// Quantas abertas há hoje, no resto da semana e mais para frente, e quantas foram feitas desde segunda.
// A barra começa pelo feito: feitas ÷ (feitas + o que ainda está marcado para hoje e para o resto da semana).
export function resumoDoTopo(tarefas, hoje) {
  const domingo = somarDias(segundaDaSemana(hoje), 6);
  const abertas = tarefas.filter((t) => t.estado === 'aberta' && t.dia);
  const r = {
    hoje: abertas.filter((t) => t.dia === hoje).length,
    semana: abertas.filter((t) => t.dia > hoje && t.dia <= domingo).length,
    depois: abertas.filter((t) => t.dia > domingo).length,
    feitas: feitasNaSemana(tarefas, hoje),
  };
  const total = r.feitas + r.hoje + r.semana;
  return { ...r, fracao: total ? r.feitas / total : 0 };
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

// ---------- Os varais: cada lâmpada pendura no ponto do fio que fica na x dela (pedido da Lara, 28/10: "Lâmpadas fora da linha") ----------
// O fio é feito de arcos de Bézier quadráticos [início, controle, fim]. A altura antiga vinha de um seno parecido com o fio,
// e na quinta-feira a lâmpada ficava 22 pontos acima dele.
export const FIO_SEMANA = [[[2, 18], [90, 74], [180, 40]], [[180, 40], [270, 6], [358, 18]]];   // "M2 18 Q90 74 180 40 T358 18"
export const FIO_DIA = [[[0, 4], [160, 30], [320, 4]]];                                          // "M0 4 Q160 30 320 4"
export function yNoFio(arcos, x) {
  const [p0, p1, p2] = arcos.find(([, , fim]) => x <= fim[0]) ?? arcos.at(-1);
  // x(t) = (1-t)²·x0 + 2(1-t)t·x1 + t²·x2  →  a·t² + b·t + c = 0
  const a = p0[0] - 2 * p1[0] + p2[0], b = 2 * (p1[0] - p0[0]), c = p0[0] - x;
  const t = Math.abs(a) < 1e-9 ? -c / b : (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1];
}

// ---------- Importância, urgência e a Matriz (28/10, Rafael: "Prioridade, importância, urgência" são três coisas) ----------
// A prioridade é a estrela da semana. Importância e urgência são etiquetas, como no Quadro, e montam a Matriz.
const MARCAS = { importante: /^importante$/i, urgente: /^urgente$/i };
export const temMarca = (t, marca) => (t.etiquetas || []).some((e) => MARCAS[marca].test(e));
export function comMarca(etiquetas, marca, ligar) {
  const resto = (etiquetas || []).filter((e) => !MARCAS[marca].test(e));
  return ligar ? [...resto, marca] : resto;
}
export const QUADRANTES = [
  ['fazer', 'Importante e urgente', 'Fazer agora'],
  ['agendar', 'Importante, sem pressa', 'Marcar um dia para fazer'],
  ['ajuda', 'Urgente, não importante', 'Pedir ajuda ou fazer rápido'],
  ['depois', 'Nem importante nem urgente', 'Deixar para depois'],
];
export function quadranteDe(t) {
  const i = temMarca(t, 'importante'), u = temMarca(t, 'urgente');
  return i && u ? 'fazer' : i ? 'agendar' : u ? 'ajuda' : 'depois';
}
export function mudancaParaQuadrante(t, quadrante) {
  let etiquetas = comMarca(t.etiquetas, 'importante', quadrante === 'fazer' || quadrante === 'agendar');
  etiquetas = comMarca(etiquetas, 'urgente', quadrante === 'fazer' || quadrante === 'ajuda');
  return { etiquetas };
}
// Entram na Matriz as abertas com alguma marca e, sem marca, as de até o fim desta semana: para ir classificando.
export function naMatriz(t, hoje) {
  if (t.estado !== 'aberta') return false;
  if (temMarca(t, 'importante') || temMarca(t, 'urgente')) return true;
  return !!t.dia && t.dia <= somarDias(segundaDaSemana(hoje), 6);
}

// ---------- Ver por tipos (28/10, como no Vikunja): Quadro, Tabela e Linha do tempo ----------
// Quadro: as colunas vêm do estado e da situação que já existem (A fazer, Em andamento, Aguardando, Feitas).
export const COLUNAS_QUADRO = [['afazer', 'A fazer'], ['andamento', 'Em andamento'], ['aguardando', 'Aguardando'], ['feitas', 'Feitas']];
export function colunaDe(t) {
  if (t.estado === 'feita') return 'feitas';
  return situacaoDe(t) ?? 'afazer';
}
// O que muda numa tarefa solta noutra coluna. "agora" vem de fora para a conta poder ser testada.
export function mudancaParaColuna(t, coluna, agora) {
  if (coluna === 'feitas') return { estado: 'feita', feita_em: agora };
  const patch = { etiquetas: comSituacao(t.etiquetas, coluna === 'afazer' ? null : coluna) };
  if (t.estado === 'feita') Object.assign(patch, { estado: 'aberta', feita_em: null, feita_por: null });
  return patch;
}

// Linha do tempo: uma barra por tarefa com dia, do início (se houver) até o dia, numa janela de "dias" a partir de "primeiro".
// O que começa antes da janela fica preso na borda, marcado como "antes"; o que é todo depois dela não entra (null).
export function barraNaLinha(t, primeiro, dias) {
  if (!t.dia) return null;
  const indice = (iso) => Math.round((deISO(iso) - deISO(primeiro)) / 864e5);
  const fim = indice(t.dia), comeco = t.inicio ? Math.min(indice(t.inicio), fim) : fim;
  if (comeco >= dias) return null;
  return { de: Math.max(0, comeco), ate: Math.max(0, Math.min(dias - 1, fim)), antes: comeco < 0 };
}

// ---------- Repetir (28/10) ----------
// repetir_dias (já existia no banco): 0 não repete · 1 todo dia · 7 toda semana · 15 a cada 15 dias · 30 todo mês, no mesmo dia.
export const REPETICOES = [[0, 'Não repete'], [1, 'Todo dia'], [7, 'Toda semana'], [15, 'A cada 15 dias'], [30, 'Todo mês']];
// Mês seguinte no mesmo dia; o dia 31 vira o último dia do mês que não tem 31.
export function somarMeses(iso, meses, diaDoMes = +iso.slice(8)) {
  const [a, m] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return paraISO(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(diaDoMes, ultimo)));
}
// A próxima vez: a partir do dia da tarefa (ou de hoje, se não tiver), pulando até depois de hoje. Atraso não vira fila.
export function proximaVez(t, hoje) {
  const n = t.repetir_dias || 0;
  if (!n) return null;
  const base = t.dia || hoje;
  let d = base;
  for (let k = 1; d <= hoje || k === 1; k++) {
    d = n === 30 ? somarMeses(base, k) : somarDias(base, n * k);
    if (k > 400) break;
  }
  return d;
}

// ---------- Calendário do mês (28/10) ----------
// As semanas do mês, de segunda a domingo, da segunda que abre o dia 1 até o domingo que fecha o último dia.
export function semanasDoMes(ano, mes) {   // mes: 1 a 12
  const primeiro = paraISO(new Date(ano, mes - 1, 1)), ultimo = paraISO(new Date(ano, mes, 0));
  const semanas = [];
  for (let d = segundaDaSemana(primeiro); d <= ultimo; d = somarDias(d, 7)) semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(d, i)));
  return semanas;
}
// Num dia do calendário: as abertas marcadas para ele e as feitas nele (como no varal da semana).
export const noDiaDoCalendario = (t, iso) => (t.estado === 'aberta' && t.dia === iso) || (t.estado === 'feita' && diaLocal(t.feita_em) === iso);

// ---------- Mergulho (FZ8, 28/10) ----------
// Os blocos que dá para escolher. O Pomodoro é 25 + 5, como recomenda o NHS (CATALOGO-FUNCIONALIDADES-TODO, linha do Pomodoro).
// "Sem tempo" não tem fim: o hiperfoco não é cortado (ALTAS-HABILIDADES-TDAH-FUNCIONALIDADES, armadilha 4).
export const PLANOS_MERGULHO = {
  pomodoro: { nome: '25 + 5', foco: 25, pausa: 5, explica: 'Pomodoro: 25 min de foco e 5 de pausa' },
  m50: { nome: '50 min', foco: 50, pausa: 5, explica: 'Um bloco de 50 min' },
  m90: { nome: '90 min', foco: 90, pausa: 5, explica: 'Um bloco longo, de 90 min' },
  livre: { nome: 'Sem tempo', foco: null, pausa: 5, explica: 'Sem fim marcado: conta só os minutos' },
};
export const PARE_A_CADA = 25;   // minutos entre uma pausa "PARE" e outra (CI1)
// Quantas pausas "PARE" já deviam ter aparecido. A última seria no próprio fim do bloco, e o fim já pergunta.
export function paradasDevidas(decorridoMin, focoMin, cada = PARE_A_CADA) {
  const passaram = Math.floor(decorridoMin / cada);
  return focoMin ? Math.min(passaram, Math.ceil(focoMin / cada) - 1) : passaram;
}
// O tempo em minutos, nunca a hora. "Falta" arredonda para cima (19 min e meio = 20 min); "mergulhado" para baixo.
export const faltaTexto = (ms) => (ms <= 0 ? '0 min' : ms < 60000 ? 'menos de 1 min' : `${Math.ceil(ms / 60000)} min`);
export const duracaoTexto = (ms) => {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return 'menos de 1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
};
