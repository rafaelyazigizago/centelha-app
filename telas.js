// Centelha · telas Hoje, Semana e Caixa de entrada.
import { diaPorExtenso, rotuloDia, somarDias, interpretar } from './datas.js';
import { lampadasDoDia, varalDaSemana, tarefasDoDia, passaNasLentes, segundaDaSemana, CAIXAS_DO_HOJE, caixaDoHoje } from './calculos.js';
import { estado, secao, alternarFeita, moverPara, recomecar, anotar } from './estado.js';
import { $, el, icone, lampada, lampadaInterna, reiniciar, movimento } from './ui.js';
import { alternarEstrela, abrirAcoes, alternarSelecao, selecao } from './acoes.js';
import { ligarArrastar } from './arrastar.js';

const LENTES = [['dinheiro', 'Dinheiro'], ['tempo', 'Tempo'], ['amor', 'Quem eu amo']];
const dobrasAbertas = new Set();
let abrirTarefa = () => {};
export const aoAbrirTarefa = (f) => { abrirTarefa = f; };
const visiveis = (t) => t.estado !== 'cancelada';

// ---------- Uma tarefa: a lâmpada, o título, o porquê, a linha de detalhes e os botões ----------
// Como no Microsoft To Do: estrela à direita (opcional), ⋯ ou clique direito abre as ações, Shift+clique escolhe várias.
export function linhaTarefa(t, { umToque, semGrupo, estrela } = {}) {
  const feita = t.estado === 'feita';
  const marca = estado.marcas.get(t.id);
  const escolhida = selecao.has(t.id);
  const classes = ['tarefa', feita && 'feita', marca && 'saiu', t.nova && 'entrou', estado.recem === t.id && 'recem',
    escolhida && 'escolhida', estado.painel === t.id && 'no-painel'].filter(Boolean).join(' ');
  t.nova = false;
  const marcas = [];
  if (t.dia && !['hoje', 'prioridade', 'amanha'].includes(secao(t)) && !marca) marcas.push(el('span', { classe: 'marca-t' }, rotuloDia(t.dia)));
  const passos = estado.passos.get(t.id);
  if (passos?.total) marcas.push(el('span', { classe: 'marca-t' }, `${passos.feitos} de ${passos.total} passos`));
  for (const [chave, nome] of LENTES) if ((t.lentes || []).includes(chave)) marcas.push(el('span', { classe: 'marca-t', html: `${icone(chave)} ${nome}` }));
  if ((t.etiquetas || []).some((e) => /^ideias?$/i.test(e))) marcas.push(el('span', { classe: 'marca-t ideia' }, 'ideia'));
  for (const e of (t.etiquetas || []).filter((e) => !/^ideias?$/i.test(e) && e !== t.subgrupo).slice(0, 2)) marcas.push(el('span', { classe: 'marca-t' }, '#' + e));
  if (!semGrupo && (t.area || t.subgrupo)) marcas.push(el('span', { classe: 'marca-t' }, [t.area, t.subgrupo].filter(Boolean).join(' › ')));
  if (marca) marcas.push(el('span', { classe: 'marca-t aviso' }, marca));

  const cartao = el('div', { classe: classes, 'data-id': t.id, oncontextmenu: (e) => { e.preventDefault(); if (!estado.segurando) abrirAcoes(t); } },   // no celular, segurar é arrastar (arrastar.js)
    el('button', {
      type: 'button', classe: 'botao-lamp', 'aria-pressed': String(feita), 'data-mantem-aviso': true,
      'aria-label': `${feita ? 'Feita' : 'Marcar como feita'}: ${t.titulo}`, html: lampada(feita),
      onclick: (e) => alternarFeita(t, e.currentTarget),
    }),
    el('button', {
      type: 'button', classe: 'texto', 'aria-label': `${estado.selecionando ? (escolhida ? 'Desmarcar' : 'Escolher') : 'Abrir'}: ${t.titulo}`,
      'aria-pressed': estado.selecionando ? String(escolhida) : null, 'data-mantem-aviso': estado.selecionando || null,
      onclick: (e) => (e.shiftKey || estado.selecionando ? alternarSelecao(t) : abrirTarefa(t)),
    },
      el('span', { classe: 'titulo-t' }, t.titulo),
      t.porque ? el('span', { classe: 'porque', html: `${icone('faisca')}<span></span>` }) : null,
      marcas.length ? el('span', { classe: 'marcas' }, marcas) : null),
    umToque && !feita && !estado.selecionando ? el('button', {
      type: 'button', classe: 'pilula um-toque', 'data-mantem-aviso': true,
      onclick: () => moverPara(t, umToque === 'Amanhã' ? somarDias(estado.hoje, 1) : estado.hoje),
    }, umToque) : null,
    estrela ? el('button', {
      type: 'button', classe: 'icone-btn leve estrela', 'aria-pressed': String(!!t.prioridade_semana), 'data-mantem-aviso': true,
      'aria-label': `${t.prioridade_semana ? 'Tirar a estrela' : 'Pôr estrela'}: ${t.titulo}`, html: icone('estrela'),
      onclick: () => alternarEstrela(t),
    }) : null,
    el('button', {
      type: 'button', classe: 'icone-btn leve mais', 'aria-label': `Mais ações: ${t.titulo}`, 'aria-haspopup': 'dialog',
      onclick: () => abrirAcoes(t),
    }, '⋯'),
  );
  ligarArrastar(cartao, t);   // no notebook: arrastar para mudar a ordem ou soltar no menu lateral
  return cartao;
}
function comPorque(no, t) {
  const p = no.querySelector('.porque span');
  if (p) p.textContent = t.porque;
  return no;
}
export const linha = (t, o) => comPorque(linhaTarefa(t, o), t);
const lista = (tarefas, o) => el('div', { classe: 'lista' }, tarefas.map((t) => linha(t, o)));

export function dobra(id, titulo, quantos, conteudo, conjunto = dobrasAbertas, classe = '') {
  const aberta = conjunto.has(id);
  const caixa = el('div', { classe: ['dobra', classe].filter(Boolean).join(' '), 'data-aberto': String(aberta) });
  const botao = el('button', {
    type: 'button', 'aria-expanded': String(aberta),
    onclick: () => {
      const agora = !conjunto.has(id);
      if (agora) conjunto.add(id); else conjunto.delete(id);
      caixa.dataset.aberto = String(agora);
      botao.setAttribute('aria-expanded', String(agora));
      gaveta.inert = !agora;
    },
  }, el('span', { classe: 'seta', 'aria-hidden': 'true' }, '›'), el('span', {}, titulo, quantos == null ? '' : ' ', quantos == null ? '' : el('span', { classe: 'n' }, `· ${quantos}`)));
  const gaveta = el('div', { classe: 'gaveta' }, el('div', {}, el('div', { classe: 'miolo-dobra' }, conteudo)));
  gaveta.inert = !aberta;   // fechada, nada de dentro recebe o foco
  caixa.append(botao, gaveta);
  return caixa;
}

// ---------- Varal pequeno do dia ----------
let ultimasAcesas = null;
function varalMini() {
  const { total, acesas } = lampadasDoDia(estado.tarefas, estado.hoje);
  const n = Math.min(total, 12);
  const largura = 320;
  let html = `<path class="fio" d="M0 4 Q${largura / 2} 30 ${largura} 4"/>`;
  const acendeuAgora = ultimasAcesas !== null && acesas > ultimasAcesas;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? largura / 2 : 20 + i * ((largura - 40) / (n - 1));
    const y = 4 + Math.sin((x / largura) * Math.PI) * 12;
    const acesa = i < Math.min(acesas, n);
    const anima = acendeuAgora && i === Math.min(acesas, n) - 1 ? ' acendendo' : '';
    html += `<g transform="translate(${x - 9} ${y})"><g class="${anima.trim()}" style="transform-box:fill-box;transform-origin:center">${lampadaInterna(acesa, 0, 2, 18, 24)}</g></g>`;
  }
  const subiu = ultimasAcesas !== null && acesas !== ultimasAcesas;
  ultimasAcesas = acesas;
  const numero = el('span', { classe: 'numero' + (subiu ? ' subiu' : '') }, String(acesas));
  return [
    el('div', { classe: 'varal-mini', 'aria-hidden': 'true', html: `<svg viewBox="0 0 ${largura} 56">${html}</svg>` }),
    el('p', { classe: 'contagem' }, total ? numero : '', total ? ` de ${total} acesas` : 'Nenhuma lâmpada para hoje ainda'),
  ];
}

// ---------- Anotar, com a prévia de para onde vai ----------
let ignorarData = false;
function formAnotar() {
  const campo = el('input', { id: 'texto-anotar', type: 'text', enterkeyhint: 'done', autocomplete: 'off', placeholder: 'Anotar…' });
  const previa = el('p', { classe: 'dica', id: 'previa', 'aria-live': 'polite' }, 'ex.: ligar para o contador amanhã');
  const mostrar = () => {
    const texto = campo.value.trim();
    if (!texto) { ignorarData = false; previa.replaceChildren('ex.: ligar para o contador amanhã'); return; }
    const lido = interpretar(texto);
    const partes = [];
    if (lido.dia && !ignorarData) {
      partes.push(`Vai para: ${rotuloDia(lido.dia)}`);
      partes.push(el('button', { type: 'button', classe: 'pilula', 'data-mantem-aviso': true, onclick: () => { ignorarData = true; mostrar(); } }, `"${lido.palavraData}" não é data`));
    } else {
      partes.push('Vai para: Caixa de entrada');
      if (lido.dia) partes.push(el('button', { type: 'button', classe: 'pilula', 'data-mantem-aviso': true, onclick: () => { ignorarData = false; mostrar(); } }, `Usar "${lido.palavraData}"`));
    }
    if (lido.etiquetas.length) partes.splice(1, 0, ` · ${lido.etiquetas.map((e) => '#' + e).join(' ')}`);
    previa.replaceChildren(...partes);
  };
  campo.addEventListener('input', () => { ignorarData = false; mostrar(); });
  const form = el('form', { classe: 'anotar', autocomplete: 'off', 'data-mantem-aviso': true },
    el('label', { for: 'texto-anotar' }, 'Anotar uma tarefa'),
    el('div', { classe: 'linha-anotar' }, campo, el('button', { type: 'submit', classe: 'btn' }, 'Anotar')),
    previa);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    const nova = await anotar(texto, ignorarData);
    if (nova) { campo.value = ''; ignorarData = false; mostrar(); setTimeout(() => $('texto-anotar')?.focus(), 30); }
  });
  return form;
}

// ---------- HOJE ----------
export function desenharHoje() {
  const tela = $('tela-hoje');
  const doTipo = (s) => estado.tarefas.filter((t) => visiveis(t) && secao(t) === s && passaNasLentes(t, estado.lentes));
  const hoje = diaPorExtenso(estado.hoje);
  const blocos = [
    el('h1', { id: 'titulo-hoje' }, 'Hoje'),
    el('p', { classe: 'data' }, hoje[0].toUpperCase() + hoje.slice(1)),
    ...varalMini(),
    formAnotar(),
  ];

  // As caixas do Hoje (pedido de Rafael, 28/10): cartões separados, como na tela Prioridades, e cada tarefa numa caixa só.
  const daCaixa = new Map(CAIXAS_DO_HOJE.map(([c]) => [c, []]));
  for (const t of estado.tarefas) {
    if (!visiveis(t) || !passaNasLentes(t, estado.lentes)) continue;
    const c = caixaDoHoje(t, secao(t));
    if (c) daCaixa.get(c).push(t);
  }
  const caixa = (c, nome, opcoes = {}) => {
    const tarefas = daCaixa.get(c).sort(ordemNaCaixa);
    return el('section', { classe: 'grupo caixa-hoje' + (tarefas.length ? '' : ' vazia'), 'data-caixa-hoje': c },
      el('h2', {}, c === 'prioridades' ? el('span', { html: icone('estrela', 'estrela-titulo') }) : null, nome, el('span', { classe: 'n' }, String(tarefas.length))),
      listaDaCaixa(c, tarefas, opcoes));
  };
  const nomes = Object.fromEntries(CAIXAS_DO_HOJE);

  blocos.push(caixa('prioridades', nomes.prioridades));
  blocos.push(el('div', { classe: 'lentes', role: 'group', 'aria-label': 'Lentes' }, LENTES.map(([chave, nome]) => el('button', {
    type: 'button', classe: 'pilula', 'aria-pressed': String(estado.lentes.has(chave)), html: `${icone(chave)}${nome}`,
    onclick: () => {
      if (estado.lentes.has(chave)) estado.lentes.delete(chave); else estado.lentes.add(chave);
      desenharHoje();
      reiniciar(document.querySelector(`.lentes .pilula:nth-child(${LENTES.findIndex(([c]) => c === chave) + 1})`), 'pop');
    },
  }))));

  const partes = ['manha', 'almoco', 'tarde', 'noite', 'qualquer'];
  if (partes.every((c) => !daCaixa.get(c).length)) {
    blocos.push(el('p', { classe: 'vazio' }, estado.lentes.size
      ? 'Nenhuma tarefa de hoje com essa lente. Abra uma tarefa para marcar as lentes dela.'
      : 'Nada marcado para hoje. Anote acima, traga algo da Caixa de entrada ou arraste para uma das caixas.'));
  }
  for (const c of partes) blocos.push(caixa(c, nomes[c], { umToque: 'Amanhã' }));
  for (const c of ['andamento', 'aguardando']) {
    const tarefas = daCaixa.get(c).sort(ordemNaCaixa);
    const d = dobra(c, nomes[c], tarefas.length, listaDaCaixa(c, tarefas));
    d.classList.add('caixa-hoje');
    if (!tarefas.length) d.classList.add('vazia');
    d.dataset.caixaHoje = c;
    blocos.push(d);
  }

  const semCaixa = (t) => !caixaDoHoje(t, secao(t));
  const amanha = doTipo('amanha').filter(semCaixa).sort(ordenar);
  if (amanha.length) blocos.push(el('section', { classe: 'grupo' }, el('h2', {}, 'Amanhã', el('span', { classe: 'n' }, String(amanha.length))), lista(amanha, { umToque: 'Hoje' })));

  const depois = doTipo('depois').filter(semCaixa).sort((a, b) => a.dia.localeCompare(b.dia) || ordenar(a, b));
  if (depois.length) blocos.push(dobra('depois', 'Próximos dias', depois.length, lista(depois, { umToque: 'Hoje' })));

  const atras = doTipo('para-tras').filter(semCaixa).sort((a, b) => b.dia.localeCompare(a.dia) || ordenar(a, b));
  if (atras.length) {
    const abertas = atras.filter((t) => t.estado === 'aberta' && !estado.marcas.has(t.id));
    const recomeco = el('div', { classe: 'fileira' });
    const pedir = () => recomeco.replaceChildren(el('button', {
      type: 'button', classe: 'btn claro', 'data-mantem-aviso': true,
      onclick: () => recomeco.replaceChildren(
        el('span', { classe: 'ajuda' }, `Isso traz ${abertas.length} tarefas para hoje.`),
        el('button', { type: 'button', classe: 'btn', 'data-mantem-aviso': true, onclick: () => recomecar(abertas) }, `Sim, trazer ${abertas.length}`),
        el('button', { type: 'button', classe: 'btn claro', onclick: pedir }, 'Não'),
      ),
    }, 'Recomeçar: trazer todas para hoje'));
    if (abertas.length > 1) pedir();
    blocos.push(dobra('atras', 'Ficou para trás', atras.length, [
      el('p', { classe: 'ajuda' }, 'Sem pressa. Traga o que cabe hoje e deixe o resto aqui.'),
      abertas.length > 1 ? recomeco : null,
      lista(atras, { umToque: 'Hoje' }),
    ]));
  }
  tela.replaceChildren(...blocos.filter(Boolean));
}

const ORDEM_PARTE = { manha: 1, almoco: 2, tarde: 3, noite: 4 };
function ordenar(a, b) {
  if (a.estado !== b.estado) return a.estado === 'feita' ? 1 : -1;
  const pa = ORDEM_PARTE[a.parte_do_dia] ?? 9, pb = ORDEM_PARTE[b.parte_do_dia] ?? 9;
  if (pa !== pb) return pa - pb;
  return (a.hora ?? '99').localeCompare(b.hora ?? '99') || (a.criado_em || '').localeCompare(b.criado_em || '');
}

// Dentro de uma caixa do Hoje: as feitas por último; depois a ordem que você escolheu arrastando; sem ela, a de sempre.
function ordemNaCaixa(a, b) {
  if (a.estado !== b.estado) return a.estado === 'feita' ? 1 : -1;
  return ((a.ordem ?? Infinity) - (b.ordem ?? Infinity)) || ordenar(a, b);
}
// A lista de uma caixa aceita arrastar: muda a ordem e, vinda de outra caixa, muda o dia, a parte do dia ou a situação.
const listaDaCaixa = (c, tarefas, opcoes = {}) => el('div', { classe: 'lista', 'data-reordena': true, 'data-caixa': c },
  tarefas.map((t) => linha(t, { estrela: true, ...opcoes })));

// ---------- CAIXA DE ENTRADA ----------
export function desenharCaixa() {
  const tela = $('tela-caixa');
  const daCaixa = estado.tarefas.filter((t) => visiveis(t) && t.estado === 'aberta' && secao(t) === 'caixa');
  const linhas = daCaixa.map((t) => {
    const no = linha(t);
    if (estado.marcas.has(t.id)) return no;
    const escolher = el('input', { type: 'date', 'aria-label': `Outro dia para ${t.titulo}`, hidden: true,
      onchange: (e) => { if (e.target.value) moverPara(t, e.target.value); } });
    no.append(el('div', { classe: 'fileira', style: 'width:100%;padding-left:58px' },
      el('button', { type: 'button', classe: 'pilula', 'data-mantem-aviso': true, onclick: () => moverPara(t, estado.hoje) }, 'Hoje'),
      el('button', { type: 'button', classe: 'pilula', 'data-mantem-aviso': true, onclick: () => moverPara(t, somarDias(estado.hoje, 1)) }, 'Amanhã'),
      el('button', { type: 'button', classe: 'pilula', onclick: () => { escolher.hidden = false; try { escolher.showPicker?.(); } catch { /* sem seletor: o campo fica à vista */ } escolher.focus(); } }, 'Outro dia'),
      escolher));
    no.style.flexWrap = 'wrap';
    return no;
  });
  tela.replaceChildren(
    el('h1', { id: 'titulo-caixa' }, 'Caixa de entrada'),
    el('p', { classe: 'data' }, 'Esperando um dia. Escolha com um toque ou deixe aqui.'),
    daCaixa.length ? el('div', { classe: 'lista', style: 'margin-top:16px' }, linhas)
      : el('p', { classe: 'vazio', style: 'margin-top:16px' }, 'Vazia. O que você anotar sem dia aparece aqui.'),
  );
}

// ---------- SEMANA: o varal ----------
let diaEscolhido = null;
export function desenharSemana(entrando = false) {
  const tela = $('tela-semana');
  const dias = varalDaSemana(estado.tarefas, estado.hoje);
  if (!diaEscolhido || !dias.some((d) => d.iso === diaEscolhido)) diaEscolhido = estado.hoje;
  const segunda = segundaDaSemana(estado.hoje), domingo = somarDias(segunda, 6);
  const [, mesS, diaS] = segunda.split('-'), [, mesD, diaD] = domingo.split('-');
  const intervalo = mesS === mesD ? `${+diaS} a ${+diaD}` : `${+diaS}/${mesS} a ${+diaD}/${mesD}`;

  let html = '<path class="fio" d="M2 18 Q90 74 180 40 T358 18"/>';
  dias.forEach((d, i) => {
    const x = 22 + i * 52.6;
    const y = x <= 180 ? 18 + Math.sin(((x - 2) / 178) * Math.PI) * 30 : 40 - Math.sin(((x - 180) / 178) * Math.PI) * 14;
    const acesa = d.acesas > 0;
    const forca = d.total ? d.acesas / d.total : 0;
    const atraso = entrando && movimento() !== 'parado' ? i * (movimento() === 'calmo' ? 60 : 110) : 0;
    const legenda = d.domingo && !d.total ? 'descanso' : d.total ? `${d.acesas} de ${d.total}` : '';
    html += `<g transform="translate(${x - 15} ${y})"><g class="pendente${entrando ? ' balanca' : ''}${d.iso === diaEscolhido ? ' escolhido' : ''}" data-iso="${d.iso}" role="button" tabindex="0" aria-label="${d.nome}${d.hoje ? ', hoje' : ''}: ${legenda || 'nada marcado'}" style="transform-box:fill-box;transform-origin:15px 0;animation-delay:${atraso}ms">` +
      `<line x1="15" y1="0" x2="15" y2="10" stroke="currentColor" stroke-width="1.4" style="color:var(--suave)"/>` +
      `<g style="opacity:${acesa ? (.55 + .45 * forca).toFixed(2) : 1}">${lampadaInterna(acesa, 0, 8, 30, 40)}</g>` +
      (d.domingo ? '<text x="27" y="18" style="font-size:12px">☾</text>' : '') +
      `<text x="15" y="66" class="${d.hoje ? 'hoje-rot' : ''}">${d.nome}</text>` +
      `<text x="15" y="80">${d.hoje ? 'hoje' : legenda}</text></g></g>`;
  });
  const varal = el('div', { classe: 'varal', html: `<svg viewBox="0 0 360 140" role="group" aria-label="Varal da semana">${html}</svg>` });
  varal.querySelectorAll('.pendente').forEach((g) => {
    const escolher = () => { diaEscolhido = g.dataset.iso; desenharSemana(false); const n = $('tela-semana').querySelector(`.pendente[data-iso="${diaEscolhido}"]`); if (n) reiniciar(n, 'balanca'); };
    g.addEventListener('click', escolher);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(); } });
  });

  const doDia = tarefasDoDia(estado.tarefas, diaEscolhido).filter(visiveis).sort(ordenar);
  const nomeDia = diaEscolhido === estado.hoje ? 'Hoje' : diaPorExtenso(diaEscolhido);
  tela.replaceChildren(
    el('h1', { id: 'titulo-semana' }, 'Esta semana'),
    el('p', { classe: 'data' }, intervalo),
    varal,
    el('section', { classe: 'grupo cartao' },
      el('h2', {}, nomeDia[0].toUpperCase() + nomeDia.slice(1), el('span', { classe: 'n' }, String(doDia.length))),
      doDia.length ? el('div', { classe: 'lista', style: 'margin-top:10px' }, doDia.map((t) => linha(t)))
        : el('p', { classe: 'vazio' }, diaEscolhido === domingo ? 'Domingo é descanso.' : 'Nada marcado para este dia. Na tarefa aberta, escolha este dia para ela vir para cá.')),
  );
}
