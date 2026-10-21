// Centelha · aba "Grupos", no jeito do Microsoft To Do (escolha de Rafael, 21/10): Área → subgrupo → tarefas.
// Cada área e cada subgrupo é uma dobra. A área aberta mostra os seus subgrupos; "Abrir todos" mostra todas as tarefas dela.
// Entram as tarefas abertas ao carregar (e as anotadas depois): a feita fica no lugar, riscada, até recarregar.
import { agruparPorArea } from './calculos.js';
import { estado, secao, anotar } from './estado.js';
import { dobra, linha } from './telas.js';
import { $, el } from './ui.js';

const abertas = new Set();   // dobras que a pessoa abriu
const chaveArea = (area) => `g|${area ?? ''}`;
const chaveSub = (area, sub) => `g|${area ?? ''}|${sub ?? ''}`;

export function desenharGrupos() {
  const tela = $('tela-grupos');
  const tarefas = estado.tarefas.filter((t) => t.estado !== 'cancelada' && estado.abertasNoInicio.has(t.id));
  const grupos = agruparPorArea(tarefas);
  tela.replaceChildren(
    el('h1', { id: 'titulo-grupos' }, 'Grupos'),
    el('p', { classe: 'data' }, 'Cada área com os seus subgrupos. Toque para abrir.'),
    grupos.length
      ? el('div', { classe: 'grupos' }, grupos.map(cartaoArea))
      : el('p', { classe: 'vazio' }, 'Nenhuma tarefa aberta. O que você anotar aparece aqui, na área dela.'),
  );
}

function cartaoArea(g) {
  const nome = g.nome ?? 'Sem área';
  const todos = el('button', {
    type: 'button', classe: 'pilula', 'data-mantem-aviso': true,
    onclick: () => {
      const fechar = g.subgrupos.every((s) => abertas.has(chaveSub(g.nome, s.nome)));
      for (const s of g.subgrupos) { const c = chaveSub(g.nome, s.nome); if (fechar) abertas.delete(c); else abertas.add(c); }
      desenharGrupos();
    },
  }, g.subgrupos.every((s) => abertas.has(chaveSub(g.nome, s.nome))) ? 'Fechar todos' : 'Abrir todos');
  return dobra(chaveArea(g.nome), nome, g.total, [
    g.subgrupos.length > 1 ? el('div', { classe: 'fileira' }, todos) : null,
    ...g.subgrupos.map((s) => cartaoSubgrupo(g.nome, s)),
  ], abertas);
}

function cartaoSubgrupo(area, s) {
  const nome = s.nome ?? 'Sem subgrupo';
  const hoje = estado.hoje;
  return dobra(chaveSub(area, s.nome), nome, s.total, [
    el('div', { classe: 'lista' }, s.tarefas.map((t) => linha(t, { semGrupo: true, umToque: secao(t) === 'hoje' || t.dia === hoje ? 'Amanhã' : 'Hoje' }))),
    anotarAqui(area, s.nome, nome),
  ], abertas, 'subgrupo');
}

// Anotar dentro do subgrupo: a tarefa já nasce com a área e o subgrupo ("amanhã", "sexta"… continuam valendo).
function anotarAqui(area, subgrupo, nome) {
  const campo = el('input', { type: 'text', enterkeyhint: 'done', autocomplete: 'off', placeholder: `Anotar em ${nome}…`, 'aria-label': `Anotar em ${nome}`, 'data-grupo': chaveSub(area, subgrupo) });
  const form = el('form', { classe: 'novo-passo', 'data-mantem-aviso': true }, campo, el('button', { type: 'submit', classe: 'btn claro' }, 'Anotar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    const nova = await anotar(texto, false, { area, subgrupo });
    if (nova) setTimeout(() => document.querySelector(`#tela-grupos input[data-grupo="${CSS.escape(chaveSub(area, subgrupo))}"]`)?.focus(), 30);
  });
  return form;
}
