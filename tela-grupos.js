// Centelha · aba "Grupos", no jeito do Microsoft To Do (escolha de Rafael, 21/10): Área → subgrupo → tarefas.
// Cada área e cada subgrupo é uma dobra. A área aberta mostra os seus subgrupos; "Abrir todos" mostra todas as tarefas dela.
// Entram as tarefas abertas ao carregar (e as anotadas depois): a feita fica no lugar, riscada, até recarregar.
import { agruparPorArea } from './calculos.js';
import { estado, anotar, lugar } from './estado.js';
import { dobra, linha } from './telas.js';
import { $, el } from './ui.js';

const abertas = new Set();   // dobras que a pessoa abriu
let abrirLista = () => {};
export const aoAbrirLista = (f) => { abrirLista = f; };
const chaveArea = (area) => `g|${area ?? ''}`;
const chaveSub = (area, sub) => `g|${area ?? ''}|${sub ?? ''}`;

export function desenharGrupos() {
  const tela = $('tela-grupos');
  const tarefas = estado.tarefas.filter((t) => t.estado !== 'cancelada' && estado.abertasNoInicio.has(t.id));
  const grupos = agruparPorArea(tarefas, lugar);   // a tarefa movida fica no lugar, com a marca, até recarregar
  tela.replaceChildren(...[   // o que não existe (null) fica de fora, senão aparece escrito "null"
    el('h1', { id: 'titulo-grupos' }, 'Grupos'),
    el('p', { classe: 'data' }, 'Cada área com os seus subgrupos. Toque para abrir.'),
    el('div', { classe: 'fileira', style: 'margin-top:10px' },
      el('button', { type: 'button', classe: 'pilula', onclick: () => abrirLista('todas') }, 'Ver todas numa página'),
      el('button', { type: 'button', classe: 'pilula', onclick: () => abrirLista('matriz') }, 'Matriz: importante × urgente'),
      el('button', { type: 'button', classe: 'pilula', onclick: () => abrirLista('calendario') }, 'Calendário do mês')),
    projetos(),
    grupos.length
      ? el('div', { classe: 'grupos' }, grupos.map(cartaoArea))
      : el('p', { classe: 'vazio' }, 'Nenhuma tarefa aberta. O que você anotar aparece aqui, na área dela.'),
  ].filter(Boolean));
}

// Projetos (0007): cada projeto ativo, com quantas abertas tem. Tocar abre a lista dele. Nasce ao escolher o projeto numa tarefa.
function projetos() {
  const ativos = estado.projetos.filter((p) => !p.arquivado);
  if (!ativos.length) return null;
  const abertasDe = (id) => estado.tarefas.filter((t) => t.estado === 'aberta' && t.projeto_id === id).length;
  return el('section', { classe: 'projetos-grupos', 'aria-labelledby': 'titulo-projetos' },
    el('p', { classe: 'rotulo', id: 'titulo-projetos' }, 'projetos'),
    el('div', { classe: 'fileira' }, ativos.map((p) => el('button', {
      type: 'button', classe: 'pilula', 'data-projeto': p.id, onclick: () => abrirLista('projeto', p.id),
    }, `${p.emoji ? p.emoji + ' ' : ''}${p.nome} · ${abertasDe(p.id)}`))));
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
  return dobra(chaveSub(area, s.nome), nome, s.total, [
    el('div', { classe: 'fileira' }, el('button', { type: 'button', classe: 'pilula', onclick: () => abrirLista('sub', area, s.nome) }, 'Abrir como lista')),
    el('div', { classe: 'lista' }, s.tarefas.map((t) => linha(t, { semGrupo: true, estrela: true }))),
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
