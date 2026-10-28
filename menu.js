// Centelha · menu lateral do notebook, no jeito do Microsoft To Do: em cima as listas fixas (Hoje, Prioridades, Semana,
// Caixa, Diário); embaixo os Grupos (áreas) com as listas (subgrupos), que abrem e fecham; no fim, "+ Nova lista".
// No celular ele não aparece (as abas de baixo continuam); vira gaveta na Fase C.
// Fase B: soltar uma tarefa arrastada em Hoje (traz para hoje), Prioridades (estrela), Caixa (sem dia), num grupo ou numa lista (move).
import { agruparPorArea } from './calculos.js';
import { estado } from './estado.js';
import { $, el, icone, abrirFolha, fecharFolha } from './ui.js';
import { ligarSoltar } from './arrastar.js';
import { trazerParaHoje, emLote, moverGrupo } from './acoes.js';

let ir = () => {};
let abrirLista = () => {};
export const ligarMenu = (irPara, abrir) => { ir = irPara; abrirLista = abrir; };

const areasAbertas = new Set();

export function desenharMenu() {
  const menu = $('menu-lateral');
  if (!menu) return;
  const abertas = estado.tarefas.filter((t) => t.estado === 'aberta');
  const contar = (f) => abertas.filter(f).length;
  const L = estado.lista;
  const atual = (aba, tipo, area = null, sub = null) =>
    (aba !== 'lista' ? estado.aba === aba : estado.aba === 'lista' && L?.tipo === tipo && L.area === area && L.subgrupo === sub);

  const item = (rotulo, nomeIcone, n, ativo, fazer, classe = '') => el('button', {
    type: 'button', classe: `menu-item ${classe}`.trim(), 'aria-current': ativo ? 'page' : null, onclick: fazer,
    html: `${nomeIcone ? icone(nomeIcone) : ''}<span class="menu-nome"></span>${n ? `<span class="n">${n}</span>` : ''}`,
  });
  const comNome = (botao, nome) => { botao.querySelector('.menu-nome').textContent = nome; return botao; };
  const solta = (botao, fazer) => { ligarSoltar(botao, fazer); return botao; };
  const quantas = (ts) => (ts.length === 1 ? ts[0].titulo : `${ts.length} tarefas`);

  const fixas = [
    solta(comNome(item('Hoje', 'hoje', contar((t) => t.dia === estado.hoje), atual('hoje'), () => ir('hoje')), 'Hoje'), (ts) => trazerParaHoje(ts)),
    solta(comNome(item('Prioridades', 'estrela', contar((t) => t.prioridade_semana), atual('lista', 'prioridades'), () => abrirLista('prioridades')), 'Prioridades'),
      (ts) => emLote(ts, { prioridade_semana: true }, { marca: '★ Prioridade', mensagem: `Estrela · ${quantas(ts)}` })),
    comNome(item('Semana', 'semana', 0, atual('semana'), () => ir('semana')), 'Semana'),
    solta(comNome(item('Caixa', 'caixa', contar((t) => !t.dia), atual('caixa'), () => ir('caixa')), 'Caixa de entrada'),
      (ts) => emLote(ts, { dia: null }, { marca: '→ Caixa de entrada', mensagem: `${quantas(ts)} → Caixa de entrada` })),
    comNome(item('Todas', 'grupos', abertas.length, atual('lista', 'todas'), () => abrirLista('todas')), 'Todas'),   // a "Todas" do To Do (28/10)
    comNome(item('Matriz', 'matriz', contar((t) => (t.etiquetas || []).some((e) => /^(importante|urgente)$/i.test(e))), atual('lista', 'matriz'), () => abrirLista('matriz')), 'Matriz'),
    comNome(item('Diário', 'diario', 0, atual('diario'), () => ir('diario')), 'Diário'),
  ];

  const grupos = agruparPorArea(abertas.filter((t) => t.area));
  const doGrupo = grupos.map((g) => {
    const aberto = areasAbertas.has(g.nome);
    const seta = el('button', {
      type: 'button', classe: 'menu-seta', 'aria-expanded': String(aberto), 'aria-label': `${aberto ? 'Fechar' : 'Abrir'} as listas de ${g.nome}`,
      onclick: () => { if (aberto) areasAbertas.delete(g.nome); else areasAbertas.add(g.nome); desenharMenu(); },
    }, '›');
    return el('div', { classe: 'menu-grupo' + (aberto ? ' aberto' : '') },
      el('div', { classe: 'menu-linha' }, seta,
        solta(comNome(item(g.nome, 'grupos', g.total, atual('lista', 'area', g.nome), () => { areasAbertas.add(g.nome); abrirLista('area', g.nome); }), g.nome),
          (ts) => moverGrupo(ts, g.nome, null))),
      aberto ? g.subgrupos.map((s) => solta(comNome(item(s.nome ?? 'Sem subgrupo', null, s.total, atual('lista', 'sub', g.nome, s.nome),
        () => abrirLista('sub', g.nome, s.nome), 'menu-sub'), s.nome ?? 'Sem subgrupo'), (ts) => moverGrupo(ts, g.nome, s.nome))) : null);
  });

  menu.replaceChildren(
    el('p', { classe: 'marca menu-marca', html: `${icone('faisca', 'faisca')}<span>Centelha</span>` }),
    ...fixas,
    el('p', { classe: 'menu-titulo' }, 'Grupos'),
    ...doGrupo,
    el('button', { type: 'button', classe: 'menu-item menu-nova', onclick: novaLista }, '+ Nova lista'),
  );
}

// "+ Nova lista": escolhe o grupo e o nome; a lista aparece vazia, pronta para anotar.
function novaLista() {
  const grupos = [...new Set(estado.tarefas.map((t) => t.area).filter(Boolean))].sort();
  const area = el('input', { id: 'lista-area', type: 'text', list: 'lista-areas', autocomplete: 'off', placeholder: 'ex.: Soluções' });
  const nome = el('input', { id: 'lista-nome', type: 'text', autocomplete: 'off', placeholder: 'ex.: CONSERTOS' });
  const form = el('form', { classe: 'miolo ajuste', 'data-mantem-aviso': true },
    el('div', { classe: 'alca' }),
    el('h2', { id: 'titulo-acoes', style: 'font-size:1.5rem' }, 'Nova lista'),
    el('div', { classe: 'campo' }, el('label', { for: 'lista-area' }, el('span', {}, 'Grupo (área)')), area),
    el('div', { classe: 'campo' }, el('label', { for: 'lista-nome' }, el('span', {}, 'Nome da lista')), nome),
    el('datalist', { id: 'lista-areas' }, grupos.map((g) => el('option', { value: g }))),
    el('p', { classe: 'ajuda' }, 'A lista passa a existir quando você anotar a primeira tarefa nela.'),
    el('button', { type: 'submit', classe: 'btn grande' }, 'Criar e abrir'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = area.value.trim(), n = nome.value.trim();
    if (!a) { area.focus(); return; }
    fecharFolha('folha-acoes');
    areasAbertas.add(a);
    abrirLista(n ? 'sub' : 'area', a, n || null);
    setTimeout(() => $('adicionar-tarefa')?.focus(), 450);
  });
  $('folha-acoes').replaceChildren(form);
  abrirFolha('folha-acoes');
}
