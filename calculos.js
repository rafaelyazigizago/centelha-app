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
