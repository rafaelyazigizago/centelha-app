// Centelha · o Mergulho (FZ8; 28/10, Rafael: "O Centelha terá algo estilo pomodoro?"). Um bloco de foco numa tarefa só, com a tela
// inteira para ela. O tempo aparece em minutos, nunca a hora, e o fim não corta nada: avisa com calma e pergunta o que fazer.
// De 25 em 25 min, a pausa "PARE: qual é a meta agora?" (CI1, prova forte). Lembrou de outra coisa? Anota, vai para a Caixa, e o
// mergulho segue (CI4). Fica guardado neste aparelho: se a página recarregar, o mergulho volta de onde estava. Nada vai para o banco.
import { PLANOS_MERGULHO, PARE_A_CADA, paradasDevidas, faltaTexto, duracaoTexto } from './calculos.js';
import * as dados from './dados.js';
import { estado, anotar, alternarFeita } from './estado.js';
import { $, el, vibrar, abrirFolha, fecharFolha, avisar, movimento } from './ui.js';

const CHAVE = 'centelha-mergulho', ESCOLHAS = 'centelha-mergulho-escolhas';
const VOLTA = 2 * Math.PI * 54;   // o comprimento do anel do relógio (raio 54)
const VALE_ATE = 12 * 3600000;    // um mergulho guardado há mais de 12 h não volta sozinho
let m = null;                     // o mergulho de agora
let relogio = null, trava = null, audio = null, tituloAntes = '';

const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const guardar = () => { try { if (m) localStorage.setItem(CHAVE, JSON.stringify(m)); else localStorage.removeItem(CHAVE); } catch { /* sem guardar: vale só nesta página */ } };
const tarefaDe = (id) => estado.tarefas.find((x) => x.id === id);
const plano = () => PLANOS_MERGULHO[m.plano];
const agora = () => m.parado ?? Date.now();
export const mergulhoAberto = () => !$('mergulho').hidden;

// ---------- A escolha: quanto tempo, a pausa PARE e o som ----------
export function escolherMergulho(t) {
  const antes = ler(ESCOLHAS) || {};
  let escolhido = PLANOS_MERGULHO[antes.plano] ? antes.plano : 'pomodoro';
  const pare = el('input', { type: 'checkbox', id: 'mg-pare' });
  const som = el('input', { type: 'checkbox', id: 'mg-som' });
  pare.checked = antes.pare !== false;
  som.checked = antes.som !== false;
  const explica = el('p', { classe: 'ajuda centro', id: 'mg-explica' }, PLANOS_MERGULHO[escolhido].explica);
  const caixa = el('div', { classe: 'fileira mg-planos', role: 'group', 'aria-label': 'Quanto tempo' }, Object.entries(PLANOS_MERGULHO).map(([chave, p]) => el('button', {
    type: 'button', classe: 'pilula', 'data-plano': chave, 'aria-pressed': String(chave === escolhido),
    onclick: () => {
      escolhido = chave;
      caixa.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.plano === chave)));
      explica.textContent = p.explica;
    },
  }, p.nome)));
  $('folha-mergulho').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('div', { classe: 'centro' }, el('h2', { id: 'titulo-mergulho', style: 'justify-content:center' }, 'Mergulhar'), el('p', { classe: 'data' }, t.titulo)),
    el('p', { classe: 'rotulo' }, 'quanto tempo'),
    caixa,
    explica,
    el('label', { classe: 'chave', for: 'mg-pare' }, el('span', {}, `Pausa "PARE: qual é a meta agora?" a cada ${PARE_A_CADA} min`), pare),
    el('label', { classe: 'chave', for: 'mg-som' }, el('span', {}, 'Som suave quando o tempo acabar'), som),
    el('button', {
      type: 'button', classe: 'btn grande', id: 'mg-comecar',
      onclick: () => {
        try { localStorage.setItem(ESCOLHAS, JSON.stringify({ plano: escolhido, pare: pare.checked, som: som.checked })); } catch { /* sem guardar: vale só agora */ }
        prepararSom();   // o som só pode nascer de um toque; depois ele toca sozinho no fim
        fecharFolha('folha-mergulho');
        comecar(t, escolhido, pare.checked, som.checked);
      },
    }, 'Mergulhar'),
  ));
  abrirFolha('folha-mergulho');
}

function comecar(t, chave, pare, som) {
  const inicio = Date.now(), foco = PLANOS_MERGULHO[chave].foco;
  m = { id: t.id, titulo: t.titulo, plano: chave, pare, som, fase: 'foco', desde: inicio, ate: foco ? inicio + foco * 60000 : null, parado: null, pareFeitas: 0, mergulhado: 0, anotadas: [] };
  guardar();
  abrir();
}

// Depois de carregar as tarefas: se havia um mergulho neste aparelho, ele volta.
export function retomarMergulho() {
  const salvo = ler(CHAVE);
  if (!salvo) return;
  const t = tarefaDe(salvo.id);
  if (!t || t.estado !== 'aberta' || Date.now() - salvo.desde > VALE_ATE) { try { localStorage.removeItem(CHAVE); } catch { /* nada */ } return; }
  m = { ...salvo, titulo: t.titulo };
  abrir();
}

// ---------- A tela do mergulho ----------
function abrir() {
  const tela = $('mergulho');
  tela.replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'mg-topo' },
      el('span', { classe: 'mg-fase', id: 'mg-fase' }),
      el('button', { type: 'button', classe: 'desfazer', id: 'mg-sair', onclick: sair }, 'Sair')),
    el('div', { classe: 'mg-relogio', role: 'timer', 'aria-labelledby': 'mg-tempo' },
      el('span', { html: `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trilho" cx="60" cy="60" r="54"/><circle class="anel" id="mg-anel" cx="60" cy="60" r="54" stroke-dasharray="${VOLTA.toFixed(2)}"/></svg>` }),
      el('div', { classe: 'mg-numero' }, el('b', { id: 'mg-tempo' }), el('span', { id: 'mg-rotulo' }))),
    el('h2', { classe: 'mg-titulo', id: 'mg-titulo' }, m.titulo),
    el('p', { classe: 'mg-passo', id: 'mg-passo', hidden: true }),
    el('div', { classe: 'mg-cartao', id: 'mg-cartao', role: 'status', hidden: true }),
    caixaDepois(),
    el('div', { classe: 'mg-acoes' },
      el('button', { type: 'button', classe: 'btn claro grande', id: 'mg-pausar', onclick: pausarOuSeguir }, 'Pausar'),
      el('button', { type: 'button', classe: 'btn grande', id: 'mg-feita', onclick: feita }, 'Feita'))));
  tituloAntes = document.title;
  tela.hidden = false;
  void tela.offsetWidth;
  tela.classList.add('aberto');
  document.body.classList.add('mergulhando');
  mostrarPasso();
  desenharAnotadas();
  if (m.fase === 'fimFoco' || m.fase === 'fimPausa') mostrarFim();
  else if (m.fase === 'pausa') mostrarPausa();
  tique();
  clearInterval(relogio);
  relogio = setInterval(tique, 1000);
  segurarTela();
  setTimeout(() => $('mg-pausar')?.focus({ preventScroll: true }), 50);
}

function fechar() {
  clearInterval(relogio);
  relogio = null;
  trava?.release?.().catch(() => {});
  trava = null;
  m = null;
  guardar();
  document.title = tituloAntes || 'Centelha';
  document.body.classList.remove('mergulhando');
  const tela = $('mergulho');
  tela.classList.remove('aberto');
  setTimeout(() => { tela.hidden = true; tela.replaceChildren(); }, movimento() === 'parado' ? 0 : 320);
}

// A tela não apaga enquanto você mergulha (quando o aparelho deixa). Volta a pedir quando o app volta para a frente.
async function segurarTela() {
  try { if (m && !trava && 'wakeLock' in navigator && document.visibilityState === 'visible') { trava = await navigator.wakeLock.request('screen'); trava.addEventListener?.('release', () => { trava = null; }); } } catch { trava = null; }
}
document.addEventListener('visibilitychange', () => { if (m && document.visibilityState === 'visible') { tique(); segurarTela(); } });

// O próximo passo da tarefa: o campo "Próximo passo" ou o 1º passo aberto.
async function mostrarPasso() {
  const t = tarefaDe(m.id), alvo = m.id;
  let texto = t?.proximo_passo || '';
  if (!texto && estado.passos.get(alvo)?.total) {
    try { texto = (await dados.passosDe(alvo)).find((p) => !p.feita)?.texto || ''; } catch { texto = ''; }
  }
  const p = $('mg-passo');
  if (!p || m?.id !== alvo) return;
  p.textContent = texto ? `Próximo passo: ${texto}` : '';
  p.hidden = !texto;
}

// ---------- O relógio ----------
function tique() {
  if (!m) return;
  const t = agora();
  if (!m.parado && m.ate && t >= m.ate && (m.fase === 'foco' || m.fase === 'pausa')) { acabouFase(); return; }
  if (!m.parado && m.fase === 'foco' && m.pare) {
    const devidas = paradasDevidas((t - m.desde) / 60000, plano().foco);
    if (devidas > m.pareFeitas) { m.pareFeitas = devidas; guardar(); mostrarPare(); }
  }
  desenharTempo(t);
}

function desenharTempo(t) {
  const naPausa = m.fase === 'pausa' || m.fase === 'fimPausa';
  const acabou = m.fase === 'fimFoco' || m.fase === 'fimPausa';
  const total = m.ate ? m.ate - m.desde : null, falta = m.ate ? m.ate - t : null;
  $('mg-fase').textContent = naPausa ? 'Pausa' : `Mergulho · ${plano().nome}`;
  $('mergulho').classList.toggle('na-pausa', naPausa);
  $('mg-tempo').textContent = acabou ? '0 min' : falta === null ? duracaoTexto(t - m.desde) : faltaTexto(falta);
  $('mg-rotulo').textContent = acabou ? 'acabou' : m.parado ? 'pausado' : falta === null ? 'mergulhado' : naPausa ? 'para voltar' : 'para acabar';
  const anel = $('mg-anel');
  anel.style.strokeDashoffset = acabou ? VOLTA.toFixed(2) : total ? (VOLTA * Math.min(1, Math.max(0, 1 - falta / total))).toFixed(2) : '0';
  anel.classList.toggle('sem-fim', !total);
  const botao = $('mg-pausar');
  botao.textContent = m.fase === 'pausa' ? 'Voltar agora' : m.parado ? 'Continuar' : 'Pausar';
  botao.hidden = acabou;
  $('mg-feita').hidden = naPausa || acabou;   // no fim, o cartão já tem o "Feita"
  document.title = `${$('mg-tempo').textContent} · Centelha`;
}

const mergulhadoAgora = () => m.mergulhado + (m.fase === 'foco' ? Math.min(agora(), m.ate ?? Infinity) - m.desde : 0);

function acabouFase() {
  if (m.fase === 'foco') { m.mergulhado += m.ate - m.desde; m.fase = 'fimFoco'; } else m.fase = 'fimPausa';
  guardar();
  sinal(false);
  desenharTempo(Date.now());
  mostrarFim();
}

function pausarOuSeguir() {
  if (!m) return;
  if (m.fase === 'pausa') { novoFoco(plano().foco ?? PARE_A_CADA); return; }
  if (m.fase !== 'foco') return;
  if (m.parado) {
    const parou = Date.now() - m.parado;   // o tempo parado não conta: o bloco anda para a frente
    m.desde += parou;
    if (m.ate) m.ate += parou;
    m.parado = null;
  } else m.parado = Date.now();
  guardar();
  tique();
}

function novoFoco(min) {
  const inicio = Date.now();
  Object.assign(m, { fase: 'foco', desde: inicio, ate: inicio + min * 60000, parado: null, pareFeitas: 0 });
  guardar();
  esconderCartao();
  tique();
  $('mg-pausar')?.focus({ preventScroll: true });
}

function comecarPausa() {
  const inicio = Date.now();
  Object.assign(m, { fase: 'pausa', desde: inicio, ate: inicio + plano().pausa * 60000, parado: null });
  guardar();
  mostrarPausa();
  tique();
}

// ---------- Os cartões: PARE, fim do bloco, pausa ----------
function cartao(...filhos) {
  const c = $('mg-cartao');
  c.replaceChildren(...filhos.filter(Boolean));
  c.hidden = false;
  setTimeout(() => c.querySelector('button')?.focus({ preventScroll: true }), 30);
}
function esconderCartao() { const c = $('mg-cartao'); if (c) { c.hidden = true; c.replaceChildren(); } }
export const fecharCartaoMergulho = () => { if (m?.fase === 'foco') esconderCartao(); };
const botao = (texto, fazer, claro = false) => el('button', { type: 'button', classe: `btn${claro ? ' claro' : ''}`, onclick: fazer }, texto);

function mostrarPare() {
  sinal(true);
  const passo = $('mg-passo')?.hidden ? '' : $('mg-passo').textContent;
  cartao(
    el('h3', {}, 'PARE. Qual é a meta agora?'),
    el('p', { classe: 'mg-meta' }, m.titulo),
    passo ? el('p', { classe: 'mg-meta-passo' }, passo) : null,
    el('div', { classe: 'mg-botoes' }, botao('Sigo nisto', esconderCartao), botao('Mudei de rumo', sair, true)));
}

function mostrarFim() {
  if (m.fase === 'fimPausa') {
    const min = plano().foco ?? PARE_A_CADA;
    cartao(el('h3', {}, 'A pausa acabou.'), el('p', {}, 'Quando quiser, volte.'),
      el('div', { classe: 'mg-botoes' }, botao(`Voltar (${min} min)`, () => novoFoco(min)), botao('Sair', sair, true)));
    return;
  }
  const foco = plano().foco;
  cartao(
    el('h3', {}, `Deu ${foco} min.`),
    el('p', {}, m.mergulhado > foco * 60000 ? `No total, ${duracaoTexto(m.mergulhado)} de mergulho.` : 'Bloco feito. O que você quer agora?'),
    m.anotadas.length ? el('p', { classe: 'mg-meta-passo' }, `Ficou para depois: ${m.anotadas.join(' · ')}`) : null,
    el('div', { classe: 'mg-botoes' },
      botao(`Pausa de ${plano().pausa} min`, comecarPausa),
      botao(`Mais ${PARE_A_CADA} min`, () => novoFoco(PARE_A_CADA), true),
      botao('Feita', feita, true),
      botao('Sair', sair, true)));
}

function mostrarPausa() {
  cartao(el('h3', {}, `Pausa de ${plano().pausa} min.`), el('p', {}, 'Saia da tela, se der. O relógio avisa quando acabar.'));
}

// ---------- Para depois: a distração vira anotação, e o mergulho segue ----------
function caixaDepois() {
  const campo = el('input', { id: 'mg-depois', type: 'text', placeholder: 'Lembrou de outra coisa? Anote e siga', enterkeyhint: 'done', autocomplete: 'off' });
  campo.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    campo.value = '';
    const nova = await anotar(texto, false);
    if (!nova) { campo.value = texto; return; }   // não salvou: o texto volta para o campo
    if (!m) return;
    m.anotadas.push(nova.titulo);
    guardar();
    desenharAnotadas();
  });
  return el('div', { classe: 'campo mg-depois' },
    el('label', { for: 'mg-depois' }, el('span', {}, 'Para depois'), el('span', {}, 'vai para a Caixa')),
    campo,
    el('p', { classe: 'mg-anotadas', id: 'mg-anotadas', 'aria-live': 'polite' }));
}
function desenharAnotadas() {
  const p = $('mg-anotadas');
  if (p) p.textContent = m.anotadas.length ? `Anotado: ${m.anotadas.join(' · ')}` : '';
}

// ---------- Sair e Feita ----------
function sair() {
  const total = mergulhadoAgora(), titulo = m.titulo;
  fechar();
  avisar(`Mergulho de ${duracaoTexto(total)} · ${titulo}`);
}

function feita() {
  const t = tarefaDe(m.id);
  fechar();
  if (t && t.estado !== 'feita') alternarFeita(t);
}

// ---------- Som e vibração: suaves, e só se você quis ----------
function prepararSom() {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { audio = null; }
}
function sinal(suave) {
  vibrar(suave ? 30 : [80, 120, 80]);
  if (!m?.som || !audio) return;
  try {
    const inicio = audio.currentTime;
    for (const [freq, atraso] of suave ? [[660, 0]] : [[660, 0], [880, 0.22]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, inicio + atraso);
      g.gain.exponentialRampToValueAtTime(suave ? 0.05 : 0.1, inicio + atraso + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, inicio + atraso + 1.1);
      o.connect(g).connect(audio.destination);
      o.start(inicio + atraso);
      o.stop(inicio + atraso + 1.2);
    }
  } catch { /* sem som: o aviso na tela basta */ }
}
