// Centelha · a tarefa aberta, o "Travei" e o momento "Acesa!".
// Aqui cada campo salva sozinho ao sair dele (ou depois de um respiro sem digitar), sem redesenhar a tela.
import { rotuloDia, somarDias } from './datas.js';
import { lampadasDoDia, feitasNaSemana } from './calculos.js';
import { estado, mudar, falha } from './estado.js';
import { dobra } from './telas.js';
import * as dados from './dados.js';
import { $, el, icone, lampada, abrirFolha, fecharFolha, mostrarEstado, avisar, contar, movimento, reiniciar, fagulhas, vibrar } from './ui.js';

const LENTES = [['dinheiro', 'Dinheiro'], ['tempo', 'Tempo'], ['amor', 'Quem eu amo']];
const PARTES = [['manha', 'manhã'], ['almoco', 'almoço'], ['tarde', 'tarde'], ['noite', 'noite']];
const MOTIVOS = [['falta_informacao', 'Falta informação'], ['depende_de_alguem', 'Depende de alguém'], ['grande_demais', 'Grande demais'],
  ['chata', 'Chata'], ['medo_de_errar', 'Medo de errar']];
// Saída → [nome, o que fazer, força da prova]. A prova vem da proposta (seções 3.15 e EN2); sem fonte, sem selo.
const SAIDAS = {
  passo_de_2_minutos: ['Passo de 2 minutos', 'Escreva o menor pedaço, que caiba em 2 minutos, como o primeiro passo.', 'nenhuma: é só um jeito de começar'],
  quebrar: ['Quebrar em passos', 'Divida em 3 passos pequenos. Escreva o primeiro agora.', null],
  perguntar: ['Perguntar a alguém', 'Escreva a pergunta e para quem, no "Próximo passo".', null],
  rever_pensamento: ['Rever o pensamento', 'O que você acha que vai dar errado? É fato ou é medo? O que você diria a um amigo agora?', 'moderada'],
  isto_depende_de_mim: ['Isto depende de mim?', 'Separe em dois: o que depende de você vira o próximo passo; o que não depende, anote de quem depende.', 'fraca'],
  pular_subtarefa: ['Pular este passo', 'Deixe este passo para depois e siga no próximo. Ele continua aqui.', null],
};
const SUGESTAO = {
  medo_de_errar: 'Para medo de errar, experimente "Rever o pensamento".',
  grande_demais: 'Para o que é grande demais, experimente "Passo de 2 minutos" ou "Quebrar em passos".',
  falta_informacao: 'Experimente "Perguntar a alguém".',
  depende_de_alguem: 'Experimente "Perguntar a alguém" ou "Isto depende de mim?".',
  chata: 'Experimente o "Passo de 2 minutos": só começar.',
};

let t = null;            // a tarefa aberta
let passos = null;       // os passos dela (null = carregando)
let passoRecem = null;
let rascunhoTravei = null;
let voltar = () => {};
let nomeVolta = 'Hoje';
export const aoVoltar = (f) => { voltar = f; };

// Grava sem redesenhar: a tela da tarefa fica parada enquanto você escreve.
async function gravarEm(alvo, patch, { marca } = {}) {
  const antes = Object.fromEntries(Object.keys(patch).map((k) => [k, alvo[k]]));
  Object.assign(alvo, patch);
  if (marca) estado.marcas.set(alvo.id, marca);
  mostrarEstado('Salvando…');
  try {
    await dados.mudarTarefa(alvo.id, patch);
  } catch (erro) {
    Object.assign(alvo, antes);
    if (marca) estado.marcas.delete(alvo.id);
    falha(erro);
    return false;
  }
  mostrarEstado('Salvo ✓');
  return true;
}

export function abrirTarefa(tarefa, volta) {
  t = tarefa;
  nomeVolta = volta;
  passos = null;
  desenharTarefa();
  const id = t.id;
  dados.passosDe(id)
    .then((lista) => { if (t && t.id === id) { passos = lista; redesenharPassos(); } })
    .catch((erro) => { if (t && t.id === id) { passos = []; redesenharPassos(); } falha(erro); });
}

export function fecharTarefa() { t = null; }

// Chamado quando outra ação muda a tarefa (Feita, Desfazer): só os botões de baixo mudam.
export function atualizarTarefa() {
  if (!t || !$('tarefa-acoes')) return;
  $('tarefa-acoes').replaceWith(acoes());
}

export function textoParaOuvir() {
  if (!t) return '';
  const abertos = (passos || []).filter((p) => !p.feita).map((p) => p.texto);
  return [t.titulo,
    t.porque && `Por que importa: ${t.porque}`,
    t.parei_aqui && `Parei aqui: ${t.parei_aqui}`,
    t.proximo_passo && `Próximo passo: ${t.proximo_passo}`,
    abertos.length && `Passos: ${abertos.join('. ')}`,
  ].filter(Boolean).join('. ');
}

// ---------- A tela ----------
function desenharTarefa() {
  $('tela-tarefa').replaceChildren(
    el('button', { type: 'button', classe: 'voltar', onclick: () => voltar() }, `‹ ${nomeVolta}`),
    tituloEditavel(),
    linhaQuando(),
    linhaLentes(),
    el('section', { classe: 'cartao importa bloco' }, campoTexto('porque', 'Por que importa', { dica: 'ex.: evita multa de R$ 480, libera 2 horas na sexta' })),
    el('section', { classe: 'cartao bloco' },
      campoTexto('parei_aqui', 'Parei aqui', { dica: 'onde você parou' }),
      campoTexto('proximo_passo', 'Próximo passo', { dica: 'o que fazer primeiro quando voltar' })),
    cartaoPassos(),
    cartaoMeta(),
    dobra('tarefa-mais', 'Mais detalhes', null, [
      linhaParte(),
      linhaPrioridade(),
      campoTexto('pronto_quando', 'Pronto quando', { dica: 'como você vai saber que acabou' }),
      campoTexto('notas', 'Notas', { linhas: 4 }),
    ]),
    acoes(),
  );
}

function tituloEditavel() {
  const alvo = t;
  const area = el('textarea', { classe: 'titulo-edit', rows: 1, 'aria-label': 'Título da tarefa', enterkeyhint: 'done' });
  area.value = alvo.titulo;
  const crescer = () => { area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px'; };
  requestAnimationFrame(crescer);
  document.fonts?.ready.then(crescer);
  area.addEventListener('input', crescer);
  area.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); area.blur(); } });
  area.addEventListener('blur', () => {
    const novo = area.value.replace(/\s+/g, ' ').trim();
    if (!novo) { area.value = alvo.titulo; crescer(); return; }
    if (novo !== alvo.titulo) gravarEm(alvo, { titulo: novo });
  });
  return area;
}

function campoTexto(chave, rotulo, { dica = '', linhas = 2 } = {}) {
  const alvo = t, id = 'campo-' + chave;
  const area = el('textarea', { id, rows: linhas, placeholder: dica });
  area.value = alvo[chave] || '';
  let espera;
  const salvar = () => {
    clearTimeout(espera);
    const valor = area.value.trim();
    if (valor === (alvo[chave] || '').trim()) return;
    gravarEm(alvo, { [chave]: valor || (chave === 'notas' ? '' : null) });
  };
  area.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(salvar, 1200); });
  area.addEventListener('blur', salvar);
  return el('div', { classe: 'campo' }, el('label', { for: id }, el('span', {}, rotulo)), area);
}

function pilula(rotulo, ligada, aoTocar, extra = {}) {
  return el('button', { type: 'button', classe: 'pilula', 'aria-pressed': String(ligada), 'data-mantem-aviso': true, onclick: aoTocar, ...extra }, rotulo);
}

function linhaQuando() {
  const alvo = t, hoje = estado.hoje, amanha = somarDias(hoje, 1), dia = alvo.dia || null;
  const outro = el('input', { type: 'date', 'aria-label': 'Escolher outro dia', style: 'width:auto;flex:1 1 10rem;min-height:44px;padding:6px 10px' });
  if (dia && dia !== hoje && dia !== amanha) outro.value = dia;
  outro.addEventListener('change', () => { if (outro.value) mudarDia(alvo, outro.value); });
  return el('div', { classe: 'campo', id: 'tarefa-quando' },
    el('span', { classe: 'rot' }, el('span', {}, 'Quando'), el('span', {}, dia ? rotuloDia(dia) : 'Caixa de entrada')),
    el('div', { classe: 'fileira' },
      pilula('Hoje', dia === hoje, () => mudarDia(alvo, hoje)),
      pilula('Amanhã', dia === amanha, () => mudarDia(alvo, amanha)),
      pilula('Sem dia', !dia, () => mudarDia(alvo, null)),
      outro));
}

async function mudarDia(alvo, dia) {
  const antes = alvo.dia || null, vezes = alvo.vezes_adiada;
  if (antes === dia) return;
  const rotulo = dia ? rotuloDia(dia) : 'Caixa de entrada';
  const ok = await gravarEm(alvo, { dia }, { marca: `→ ${rotulo}` });
  if (t === alvo) $('tarefa-quando')?.replaceWith(linhaQuando());
  if (ok) {
    avisar(`Vai para ${dia ? rotulo.toLowerCase() : 'a Caixa de entrada'}`, async () => {
      estado.marcas.delete(alvo.id);
      await gravarEm(alvo, { dia: antes, vezes_adiada: vezes });
      if (t === alvo) $('tarefa-quando')?.replaceWith(linhaQuando());
    });
  }
}

function linhaLentes() {
  const alvo = t;
  return el('div', { classe: 'lentes', id: 'tarefa-lentes', role: 'group', 'aria-label': 'Lentes desta tarefa' },
    LENTES.map(([chave, nome]) => el('button', {
      type: 'button', classe: 'pilula', 'aria-pressed': String((alvo.lentes || []).includes(chave)), html: `${icone(chave)}${nome}`,
      onclick: async (e) => {
        const tem = (alvo.lentes || []).includes(chave);
        const lentes = tem ? alvo.lentes.filter((l) => l !== chave) : [...(alvo.lentes || []), chave];
        e.currentTarget.setAttribute('aria-pressed', String(!tem));
        if (!tem) reiniciar(e.currentTarget, 'pop');
        if (!(await gravarEm(alvo, { lentes })) && t === alvo) $('tarefa-lentes')?.replaceWith(linhaLentes());
      },
    })));
}

function linhaParte() {
  const alvo = t;
  return el('div', { classe: 'campo', id: 'tarefa-parte' },
    el('span', { classe: 'rot' }, 'Parte do dia'),
    el('div', { classe: 'fileira' }, PARTES.map(([v, nome]) => pilula(nome, alvo.parte_do_dia === v, async () => {
      await gravarEm(alvo, { parte_do_dia: alvo.parte_do_dia === v ? null : v });
      if (t === alvo) $('tarefa-parte')?.replaceWith(linhaParte());
    }))));
}

function linhaPrioridade() {
  const alvo = t;
  return el('div', { classe: 'fileira', id: 'tarefa-prioridade' },
    pilula('Prioridade da semana', !!alvo.prioridade_semana, async () => {
      await gravarEm(alvo, { prioridade_semana: !alvo.prioridade_semana });
      if (t === alvo) $('tarefa-prioridade')?.replaceWith(linhaPrioridade());
    }));
}

// ---------- Passos ----------
function cartaoPassos() {
  const alvo = t;
  const campo = el('input', { id: 'novo-passo', type: 'text', placeholder: 'Novo passo', enterkeyhint: 'done', autocomplete: 'off', 'aria-label': 'Novo passo' });
  const form = el('form', { classe: 'novo-passo', 'data-mantem-aviso': true }, campo, el('button', { type: 'submit', classe: 'btn claro' }, 'Anotar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto || passos === null) return;
    const ordem = passos.reduce((m, p) => Math.max(m, p.ordem), 0) + 1;
    mostrarEstado('Salvando…');
    try {
      const novo = await dados.criarPasso(alvo.id, texto, ordem);
      if (t !== alvo) return;
      passos.push(novo);
      campo.value = '';
      campo.placeholder = 'Novo passo';
      redesenharPassos(novo.id);
      mostrarEstado('Salvo ✓');
    } catch (erro) { falha(erro); }
  });
  return el('section', { classe: 'cartao bloco' }, el('h2', {}, 'Passos', el('span', { classe: 'n', id: 'passos-n' })), el('div', { classe: 'lista passos', id: 'lista-passos' }), form);
}

function redesenharPassos(entrou) {
  const lista = $('lista-passos');
  if (!lista) return;
  if (passos === null) { lista.replaceChildren(el('p', { classe: 'vazio' }, 'Abrindo os passos…')); return; }
  const feitos = passos.filter((p) => p.feita).length;
  $('passos-n').textContent = passos.length ? `${feitos} de ${passos.length}` : '';
  if (!passos.length) { lista.replaceChildren(el('p', { classe: 'vazio' }, 'Sem passos. Quebre em pedaços pequenos, se ajudar.')); return; }
  lista.replaceChildren(...passos.map((p) => el('div', {
    classe: ['tarefa', p.feita && 'feita', p.id === passoRecem && 'recem', p.id === entrou && 'entrou'].filter(Boolean).join(' '),
  },
  el('button', { type: 'button', classe: 'botao-lamp', 'aria-pressed': String(p.feita), 'aria-label': `${p.feita ? 'Feito' : 'Marcar como feito'}: ${p.texto}`,
    html: lampada(p.feita), onclick: (e) => alternarPasso(p, e.currentTarget) }),
  el('span', { classe: 'texto' }, el('span', { classe: 'titulo-t' }, p.texto)),
  el('button', { type: 'button', classe: 'icone-btn', 'aria-label': `Tirar o passo: ${p.texto}`, 'data-mantem-aviso': true, onclick: () => tirarPasso(p) }, '×'))));
  passoRecem = null;
}

async function alternarPasso(p, botao) {
  const feita = !p.feita;
  p.feita = feita;
  if (feita) { passoRecem = p.id; fagulhas(botao); vibrar(); }
  redesenharPassos();
  try {
    await dados.mudarPasso(p.id, { feita, feita_em: feita ? new Date().toISOString() : null });
    mostrarEstado('Salvo ✓');
  } catch (erro) { p.feita = !feita; redesenharPassos(); falha(erro); }
}

async function tirarPasso(p) {
  const alvo = t;
  passos = passos.filter((x) => x !== p);
  redesenharPassos();
  try {
    await dados.mudarPasso(p.id, { removida: true });
    mostrarEstado('Salvo ✓');
    avisar(`Passo tirado · ${p.texto}`, async () => {
      try {
        await dados.mudarPasso(p.id, { removida: false });
        if (t === alvo) { passos.push(p); passos.sort((a, b) => a.ordem - b.ordem); redesenharPassos(); }
        mostrarEstado('Salvo ✓');
      } catch (erro) { falha(erro); }
    });
  } catch (erro) { if (t === alvo) { passos.push(p); passos.sort((a, b) => a.ordem - b.ordem); redesenharPassos(); } falha(erro); }
}

// ---------- A meta que ela acende ----------
function cartaoMeta() {
  const alvo = t;
  const metas = [...new Set(estado.tarefas.map((x) => x.resultado_meta).filter(Boolean))].sort();
  const lista = el('datalist', { id: 'metas' }, metas.map((m) => el('option', { value: m })));
  const campo = el('input', { id: 'campo-meta', type: 'text', list: 'metas', autocomplete: 'off', placeholder: 'ex.: organizar as finanças da casa' });
  campo.value = alvo.resultado_meta || '';
  campo.addEventListener('change', () => {
    const v = campo.value.trim() || null;
    if (v !== (alvo.resultado_meta || null)) gravarEm(alvo, { resultado_meta: v });
  });
  return el('section', { classe: 'cartao bloco' },
    el('div', { classe: 'campo' },
      el('label', { for: 'campo-meta' }, el('span', {}, 'Acende a meta'), el('span', {}, 'opcional')),
      campo, lista),
    el('p', { classe: 'ajuda' }, 'Quando ficar feita, a luz desta tarefa sobe até a meta.'));
}

// ---------- Travei / Feita ----------
function acoes() {
  const feita = t.estado === 'feita';
  if (feita) {
    return el('div', { classe: 'acoes-fixas', id: 'tarefa-acoes' },
      el('button', { type: 'button', classe: 'btn claro grande', style: 'grid-column:1/-1', 'data-mantem-aviso': true, onclick: apagar }, 'Apagar a luz (reabrir)'));
  }
  return el('div', { classe: 'acoes-fixas', id: 'tarefa-acoes' },
    el('button', { type: 'button', classe: 'btn claro grande', onclick: abrirTravei }, 'Travei'),
    el('button', { type: 'button', classe: 'btn grande', onclick: acender }, 'Feita'));
}

function acender(e) {
  const alvo = t;
  estado.recem = alvo.id;
  fagulhas(e.currentTarget);
  vibrar();
  const gravou = mudar(alvo, { estado: 'feita', feita_em: new Date().toISOString() });
  abrirMomento(alvo);
  gravou.then((ok) => { if (!ok) fecharMomento(false); });
}

function apagar() {
  mudar(t, { estado: 'aberta', feita_em: null, feita_por: null }, { mensagem: `Apagada · ${t.titulo}` });
}

// ---------- Travei ----------
function abrirTravei() {
  const alvo = t;
  const r = rascunhoTravei && rascunhoTravei.id === alvo.id ? rascunhoTravei : null;
  const escolha = { motivo: r?.motivo || null, saida: r?.saida || null };
  const sinto = el('textarea', { id: 'travei-sinto', rows: 2, placeholder: 'em poucas palavras' });
  sinto.value = r?.sinto || '';
  const dica = el('p', { classe: 'ajuda', 'aria-live': 'polite' });

  const grupo = (tipo, itens, classe) => {
    const caixa = el('div', { classe, role: 'group', 'aria-label': tipo === 'motivo' ? 'O que pegou' : 'Saídas' });
    caixa.append(...itens.map(([v, rotulo], i) => el('button', {
      type: 'button', 'data-v': v, 'aria-pressed': String(escolha[tipo] === v),
      classe: tipo === 'motivo' ? 'opcao' + (i === itens.length - 1 ? ' inteira' : '') : 'pilula',
      onclick: (e) => {
        const ja = escolha[tipo] === v;
        escolha[tipo] = ja ? null : v;
        caixa.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!ja && b.dataset.v === v)));
        if (!ja) reiniciar(e.currentTarget, 'pop');
        mostrarDica();
      },
    }, rotulo)));
    return caixa;
  };
  const mostrarDica = () => {
    if (escolha.saida) {
      const [, texto, prova] = SAIDAS[escolha.saida];
      dica.replaceChildren(texto, prova ? el('span', { style: 'display:block;margin-top:4px' }, `Força da prova: ${prova}.`) : '');
    } else dica.textContent = SUGESTAO[escolha.motivo] || '';
  };
  mostrarDica();

  $('folha-travei').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('div', { classe: 'respira', 'aria-hidden': 'true', html: `<span class="anel"></span><span class="anel"></span>${icone('faisca', 'faisca')}` }),
    el('div', { classe: 'centro' }, el('h2', { id: 'titulo-travei', style: 'font-size:1.7rem;justify-content:center' }, 'Tudo bem travar.'), el('p', { classe: 'data' }, 'O que pegou?')),
    grupo('motivo', MOTIVOS, 'opcoes'),
    el('div', { classe: 'campo' },
      el('label', { for: 'travei-sinto' }, el('span', {}, 'O que aconteceu / o que estou sentindo'), el('span', { html: `${icone('cadeado')} só você vê`, classe: 'so-voce' })),
      sinto),
    el('p', { classe: 'rotulo' }, 'saídas'),
    grupo('saida', Object.entries(SAIDAS).map(([v, [rotulo]]) => [v, rotulo]), 'fileira'),
    dica,
    el('button', { type: 'button', classe: 'btn grande', onclick: () => fecharFolha('folha-travei') }, 'Seguir'),
  ));
  abrirFolha('folha-travei', () => guardarTravada(alvo, escolha, sinto.value.trim()));
}

async function guardarTravada(alvo, escolha, sinto) {
  if (t === alvo) {
    const foco = escolha.saida === 'passo_de_2_minutos' || escolha.saida === 'quebrar' ? $('novo-passo')
      : escolha.saida === 'perguntar' || escolha.saida === 'isto_depende_de_mim' ? $('campo-proximo_passo') : null;
    if (foco && escolha.saida === 'passo_de_2_minutos') foco.placeholder = 'O passo de 2 minutos';
    if (foco && escolha.saida === 'quebrar') foco.placeholder = 'O primeiro dos 3 passos';
    if (foco) setTimeout(() => { foco.scrollIntoView({ block: 'center', behavior: movimento() === 'vivo' ? 'smooth' : 'auto' }); foco.focus({ preventScroll: true }); }, 440);
  }
  if (!escolha.motivo && !escolha.saida && !sinto) return;
  mostrarEstado('Salvando…');
  try {
    await dados.registrarTravada({ tarefa_id: alvo.id, motivo: escolha.motivo, saida: escolha.saida, o_que_sinto: sinto || null });
    rascunhoTravei = null;
    mostrarEstado('Salvo ✓');
    avisar('Travada guardada · só você vê');
  } catch (erro) {
    rascunhoTravei = { id: alvo.id, ...escolha, sinto };   // abre de novo já preenchido
    falha(erro);
  }
}

// ---------- "Acesa!" ----------
let momentoDe = null;
export const momentoAberto = () => !$('momento').hidden;

const CENA = `<svg class="cena" viewBox="0 0 320 300" aria-hidden="true">
  <circle class="luz-meta" cx="160" cy="70" r="46" fill="url(#g-brilho)" style="color:var(--luz)"/>
  <path d="M118 64h84l-14-40h-56z" fill="#2B3A5C"/>
  <rect x="158" y="0" width="4" height="24" fill="#2B3A5C"/>
  <circle class="luz-meta" cx="160" cy="72" r="16" fill="var(--luz)"/>
  <path class="rastro" d="M160 262 C 110 220, 210 170, 150 130 S 170 100, 160 92"/>
  <g transform="translate(146 246)">
    <circle cx="14" cy="14" r="22" fill="url(#g-brilho)" style="color:var(--luz)" opacity=".8"/>
    <path d="M14 0a10 10 0 0 0-5.6 18.3c1.1.9 1.7 2 1.7 3.3V24h7.8v-2.4c0-1.3.6-2.4 1.7-3.3A10 10 0 0 0 14 0z" fill="var(--luz)"/>
  </g></svg>`;

function campoMomento(id, rotulo, valor, extra = {}) {
  const campo = el('input', { id, type: 'text', autocomplete: 'off', ...extra });
  campo.value = valor || '';
  return el('div', { classe: 'campo' }, el('label', { for: id }, el('span', {}, rotulo), el('span', {}, 'opcional')), campo);
}

function abrirMomento(alvo) {
  momentoDe = alvo;
  const nHoje = lampadasDoDia(estado.tarefas, estado.hoje).acesas;
  const nSemana = feitasNaSemana(estado.tarefas, estado.hoje);
  const m = $('momento');
  const bHoje = el('b', {}, String(Math.max(0, nHoje - 1)));
  const bSemana = el('b', {}, String(Math.max(0, nSemana - 1)));
  m.replaceChildren(el('div', { classe: 'miolo' },
    el('span', { classe: 'meta-rotulo' }, alvo.resultado_meta ? `Meta: ${alvo.resultado_meta}` : 'Mais uma luz acesa'),
    el('div', { html: CENA, style: 'width:100%;display:flex;justify-content:center' }),
    el('p', { classe: 'acesa-palavra', id: 'momento-palavra' }, 'Acesa!'),
    el('p', { style: 'margin:0;text-align:center' }, alvo.titulo),
    el('div', { classe: 'numeros' }, el('div', {}, bHoje, 'hoje'), el('div', {}, bSemana, 'nesta semana')),
    campoMomento('m-efeito', 'Qual foi o efeito?', alvo.resultado_efeito, { placeholder: 'em 1 linha' }),
    campoMomento('m-prova', 'Prova (link de foto, print ou arquivo)', alvo.prova_url, { inputmode: 'url', placeholder: 'https://…' }),
    alvo.resultado_meta ? null : campoMomento('m-meta', 'Que meta ela acende?', '', { list: 'metas', placeholder: 'ex.: organizar as finanças da casa' }),
    el('button', { type: 'button', classe: 'btn grande', id: 'm-pronto', onclick: () => fecharMomento(true) }, 'Pronto'),
    el('button', { type: 'button', classe: 'desfazer', onclick: desfazerMomento }, 'Desfazer'),
  ));
  m.hidden = false;
  void m.offsetWidth;
  m.classList.add('aberto');
  const espera = movimento() === 'parado' ? 0 : 1100 * (movimento() === 'calmo' ? 0.6 : 1);
  setTimeout(() => { contar(bHoje, Math.max(0, nHoje - 1), nHoje, 500); contar(bSemana, Math.max(0, nSemana - 1), nSemana, 500); }, espera);
  setTimeout(() => $('m-pronto')?.focus({ preventScroll: true }), 60);
}

export function fecharMomento(salvar = true) {
  const m = $('momento');
  if (m.hidden) return;
  const alvo = momentoDe;
  if (salvar && alvo && alvo.estado === 'feita') {
    const patch = {};
    for (const [id, chave] of [['m-efeito', 'resultado_efeito'], ['m-prova', 'prova_url'], ['m-meta', 'resultado_meta']]) {
      const c = $(id);
      if (!c) continue;
      const v = c.value.trim() || null;
      if (v !== (alvo[chave] || null)) patch[chave] = v;
    }
    if (Object.keys(patch).length) gravarEm(alvo, patch);
  }
  momentoDe = null;
  m.classList.remove('aberto');
  setTimeout(() => { m.hidden = true; m.replaceChildren(); }, movimento() === 'parado' ? 0 : 320);
  if (salvar) voltar();
}

function desfazerMomento() {
  const alvo = momentoDe;
  fecharMomento(false);
  if (alvo) mudar(alvo, { estado: 'aberta', feita_em: null, feita_por: null }, { mensagem: 'Desfeito: a tarefa voltou a ficar aberta' });
}
