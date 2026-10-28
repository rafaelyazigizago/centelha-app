// Centelha · a Chama, o foco com tempo (FZ8 + FZ7; 28/10, Rafael: "O Centelha terá algo estilo pomodoro?"; o nome "Chama",
// no lugar de "Mergulho", é dele: a centelha vira chama quando você se dedica). Um bloco de foco numa tarefa só, com a tela
// inteira para ela. O tempo aparece em minutos, nunca a hora, e o fim não corta nada: avisa com calma e pergunta o que fazer.
// De 25 em 25 min, a pausa "PARE: qual é a meta agora?" (CI1, prova forte). Lembrou de outra coisa? Anota (sem dia), e o
// foco segue (CI4). Sair pergunta como: só sair, amanhã ou outro dia (as saídas do Modo Túnel, FZ7, que entrou aqui).
// Fica guardado neste aparelho: se a página recarregar, o foco volta de onde estava. Nada vai para o banco.
import { PLANOS_CHAMA, PARE_A_CADA, paradasDevidas, faltaTexto, duracaoTexto } from './calculos.js';
import * as dados from './dados.js';
import { estado, anotar, alternarFeita, moverPara } from './estado.js';
import { somarDias } from './datas.js';
import { usavel } from './funcoes.js';
import { $, el, vibrar, abrirFolha, fecharFolha, avisar, movimento } from './ui.js';

const CHAVE = 'centelha-chama', ESCOLHAS = 'centelha-chama-escolhas';
const ANTIGAS = ['centelha-mergulho', 'centelha-mergulho-escolhas'];   // o nome de antes (lote 36h): ficam de fora
const VOLTA = 2 * Math.PI * 54;   // o comprimento do anel do relógio (raio 54)
const VALE_ATE = 12 * 3600000;    // um foco guardado há mais de 12 h não volta sozinho
let m = null;                     // o foco de agora
let relogio = null, trava = null, audio = null, tituloAntes = '';

const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const guardar = () => { try { if (m) localStorage.setItem(CHAVE, JSON.stringify(m)); else localStorage.removeItem(CHAVE); } catch { /* sem guardar: vale só nesta página */ } };
const tarefaDe = (id) => estado.tarefas.find((x) => x.id === id);
const plano = () => PLANOS_CHAMA[m.plano];
const agora = () => m.parado ?? Date.now();
export const chamaAberta = () => !$('chama').hidden;

// ---------- A escolha: quanto tempo, a pausa PARE e o som ----------
export function escolherChama(t) {
  const antes = ler(ESCOLHAS) || {};
  let escolhido = PLANOS_CHAMA[antes.plano] ? antes.plano : 'pomodoro';
  const pare = el('input', { type: 'checkbox', id: 'ch-pare' });
  const som = el('input', { type: 'checkbox', id: 'ch-som' });
  pare.checked = antes.pare !== false;
  som.checked = antes.som !== false;
  const explica = el('p', { classe: 'ajuda centro', id: 'ch-explica' }, PLANOS_CHAMA[escolhido].explica);
  const caixa = el('div', { classe: 'fileira ch-planos', role: 'group', 'aria-label': 'Quanto tempo' }, Object.entries(PLANOS_CHAMA).map(([chave, p]) => el('button', {
    type: 'button', classe: 'pilula', 'data-plano': chave, 'aria-pressed': String(chave === escolhido),
    onclick: () => {
      escolhido = chave;
      caixa.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.plano === chave)));
      explica.textContent = p.explica;
    },
  }, p.nome)));
  $('folha-chama').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('div', { classe: 'centro' }, el('h2', { id: 'titulo-chama', style: 'justify-content:center' }, 'Chama'), el('p', { classe: 'data' }, t.titulo), el('p', { classe: 'ajuda' }, 'Foco numa tarefa só, com tempo.')),
    el('p', { classe: 'rotulo' }, 'quanto tempo'),
    caixa,
    explica,
    el('label', { classe: 'chave', for: 'ch-pare' }, el('span', {}, `Pausa "PARE: qual é a meta agora?" a cada ${PARE_A_CADA} min`), pare),
    el('label', { classe: 'chave', for: 'ch-som' }, el('span', {}, 'Som suave quando o tempo acabar'), som),
    el('button', {
      type: 'button', classe: 'btn grande', id: 'ch-comecar',
      onclick: () => {
        try { localStorage.setItem(ESCOLHAS, JSON.stringify({ plano: escolhido, pare: pare.checked, som: som.checked })); } catch { /* sem guardar: vale só agora */ }
        prepararSom();   // o som só pode nascer de um toque; depois ele toca sozinho no fim
        fecharFolha('folha-chama');
        comecar(t, escolhido, pare.checked, som.checked);
      },
    }, 'Começar o foco'),
  ));
  abrirFolha('folha-chama');
}

function comecar(t, chave, pare, som) {
  const inicio = Date.now(), foco = PLANOS_CHAMA[chave].foco;
  m = { id: t.id, titulo: t.titulo, plano: chave, pare, som, fase: 'foco', desde: inicio, ate: foco ? inicio + foco * 60000 : null, parado: null, pareFeitas: 0, focado: 0, anotadas: [] };
  guardar();
  abrir();
}

// Depois de carregar as tarefas: se havia um foco neste aparelho, ele volta.
export function retomarChama() {
  try { ANTIGAS.forEach((k) => localStorage.removeItem(k)); } catch { /* nada */ }
  const salvo = ler(CHAVE);
  if (!salvo || !usavel('chama')) return;   // desligada: o foco guardado espera (até 12 h) você ligar de novo
  const t = tarefaDe(salvo.id);
  if (!t || t.estado !== 'aberta' || Date.now() - salvo.desde > VALE_ATE) { try { localStorage.removeItem(CHAVE); } catch { /* nada */ } return; }
  m = { ...salvo, titulo: t.titulo };
  abrir();
}

// ---------- A tela da Chama ----------
function abrir() {
  const tela = $('chama');
  tela.replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'ch-topo' },
      el('span', { classe: 'ch-fase', id: 'ch-fase' }),
      el('button', { type: 'button', classe: 'desfazer', id: 'ch-sair', onclick: sair }, 'Sair')),
    el('div', { classe: 'ch-relogio', role: 'timer', 'aria-labelledby': 'ch-tempo' },
      el('span', { html: `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trilho" cx="60" cy="60" r="54"/><circle class="anel" id="ch-anel" cx="60" cy="60" r="54" stroke-dasharray="${VOLTA.toFixed(2)}"/></svg>` }),
      el('div', { classe: 'ch-numero' }, el('b', { id: 'ch-tempo' }), el('span', { id: 'ch-rotulo' }))),
    el('h2', { classe: 'ch-titulo', id: 'ch-titulo' }, m.titulo),
    el('p', { classe: 'ch-passo', id: 'ch-passo', hidden: true }),
    el('div', { classe: 'ch-cartao', id: 'ch-cartao', role: 'status', hidden: true }),
    caixaDepois(),
    el('div', { classe: 'ch-acoes' },
      el('button', { type: 'button', classe: 'btn claro grande', id: 'ch-pausar', onclick: pausarOuSeguir }, 'Pausar'),
      el('button', { type: 'button', classe: 'btn grande', id: 'ch-feita', onclick: feita }, 'Feita'))));
  tituloAntes = document.title;
  tela.hidden = false;
  void tela.offsetWidth;
  tela.classList.add('aberto');
  document.body.classList.add('focando');
  mostrarPasso();
  desenharAnotadas();
  if (m.fase === 'fimFoco' || m.fase === 'fimPausa') mostrarFim();
  else if (m.fase === 'pausa') mostrarPausa();
  tique();
  clearInterval(relogio);
  relogio = setInterval(tique, 1000);
  segurarTela();
  setTimeout(() => $('ch-pausar')?.focus({ preventScroll: true }), 50);
}

function fechar() {
  clearInterval(relogio);
  relogio = null;
  trava?.release?.().catch(() => {});
  trava = null;
  m = null;
  guardar();
  document.title = tituloAntes || 'Centelha';
  document.body.classList.remove('focando');
  const tela = $('chama');
  tela.classList.remove('aberto');
  setTimeout(() => { tela.hidden = true; tela.replaceChildren(); }, movimento() === 'parado' ? 0 : 320);
}

// A tela não apaga enquanto você está no foco (quando o aparelho deixa). Volta a pedir quando o app volta para a frente.
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
  const p = $('ch-passo');
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
  $('ch-fase').textContent = naPausa ? 'Pausa' : `Chama · ${plano().nome}`;
  $('chama').classList.toggle('na-pausa', naPausa);
  $('ch-tempo').textContent = acabou ? '0 min' : falta === null ? duracaoTexto(t - m.desde) : faltaTexto(falta);
  $('ch-rotulo').textContent = acabou ? 'acabou' : m.parado ? 'pausado' : falta === null ? 'de foco' : naPausa ? 'para voltar' : 'para acabar';
  const anel = $('ch-anel');
  anel.style.strokeDashoffset = acabou ? VOLTA.toFixed(2) : total ? (VOLTA * Math.min(1, Math.max(0, 1 - falta / total))).toFixed(2) : '0';
  anel.classList.toggle('sem-fim', !total);
  const botao = $('ch-pausar');
  botao.textContent = m.fase === 'pausa' ? 'Voltar agora' : m.parado ? 'Continuar' : 'Pausar';
  botao.hidden = acabou;
  $('ch-feita').hidden = naPausa || acabou;   // no fim, o cartão já tem o "Feita"
  document.title = `${$('ch-tempo').textContent} · Centelha`;
}

const focadoAgora = () => m.focado + (m.fase === 'foco' ? Math.min(agora(), m.ate ?? Infinity) - m.desde : 0);

function acabouFase() {
  if (m.fase === 'foco') { m.focado += m.ate - m.desde; m.fase = 'fimFoco'; } else m.fase = 'fimPausa';
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
  $('ch-pausar')?.focus({ preventScroll: true });
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
  const c = $('ch-cartao');
  c.replaceChildren(...filhos.filter(Boolean));
  c.hidden = false;
  setTimeout(() => c.querySelector('button')?.focus({ preventScroll: true }), 30);
}
function esconderCartao() { const c = $('ch-cartao'); if (c) { c.hidden = true; c.replaceChildren(); } }
export const fecharCartaoChama = () => { if (m?.fase === 'foco') esconderCartao(); };
const botao = (texto, fazer, claro = false) => el('button', { type: 'button', classe: `btn${claro ? ' claro' : ''}`, onclick: fazer }, texto);

function mostrarPare() {
  sinal(true);
  const passo = $('ch-passo')?.hidden ? '' : $('ch-passo').textContent;
  cartao(
    el('h3', {}, 'PARE. Qual é a meta agora?'),
    el('p', { classe: 'ch-meta' }, m.titulo),
    passo ? el('p', { classe: 'ch-meta-passo' }, passo) : null,
    el('div', { classe: 'ch-botoes' }, botao('Sigo nisto', esconderCartao), botao('Mudei de rumo', sair, true)));
}

function mostrarFim() {
  if (m.fase === 'fimPausa') {
    const min = plano().foco ?? PARE_A_CADA;
    cartao(el('h3', {}, 'A pausa acabou.'), el('p', {}, 'Quando quiser, volte.'),
      el('div', { classe: 'ch-botoes' }, botao(`Voltar (${min} min)`, () => novoFoco(min)), botao('Sair', sair, true)));
    return;
  }
  const foco = plano().foco;
  cartao(
    el('h3', {}, `Deu ${foco} min.`),
    el('p', {}, m.focado > foco * 60000 ? `No total, ${duracaoTexto(m.focado)} de foco.` : 'Bloco feito. O que você quer agora?'),
    m.anotadas.length ? el('p', { classe: 'ch-meta-passo' }, `Ficou para depois: ${m.anotadas.join(' · ')}`) : null,
    el('div', { classe: 'ch-botoes' },
      botao(`Pausa de ${plano().pausa} min`, comecarPausa),
      botao(`Mais ${PARE_A_CADA} min`, () => novoFoco(PARE_A_CADA), true),
      botao('Feita', feita, true),
      botao('Sair', sair, true)));
}

function mostrarPausa() {
  cartao(el('h3', {}, `Pausa de ${plano().pausa} min.`), el('p', {}, 'Saia da tela, se der. O relógio avisa quando acabar.'));
}

// ---------- Para depois: a distração vira anotação, e o foco segue ----------
function caixaDepois() {
  const campo = el('input', { id: 'ch-depois', type: 'text', placeholder: 'Lembrou de outra coisa? Anote e siga', enterkeyhint: 'done', autocomplete: 'off' });
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
  return el('div', { classe: 'campo ch-depois' },
    el('label', { for: 'ch-depois' }, el('span', {}, 'Para depois'), el('span', {}, 'anota sem dia, e você segue')),
    campo,
    el('p', { classe: 'ch-anotadas', id: 'ch-anotadas', 'aria-live': 'polite' }));
}
function desenharAnotadas() {
  const p = $('ch-anotadas');
  if (p) p.textContent = m.anotadas.length ? `Anotado: ${m.anotadas.join(' · ')}` : '';
}

// ---------- Sair e Feita ----------
// Sair pergunta como (as saídas do Modo Túnel, FZ7): só sair, deixar para amanhã ou para outro dia. "Voltar ao foco" desiste.
function sair() {
  const dia = el('input', { type: 'date', id: 'ch-outro-dia', 'aria-label': 'Outro dia para a tarefa', min: somarDias(estado.hoje, 1), hidden: true,
    onchange: (e) => { if (e.target.value) sairPara(e.target.value); } });
  cartao(
    el('h3', {}, 'Sair do foco'),
    el('p', {}, `Foram ${duracaoTexto(focadoAgora())} nesta tarefa. E agora?`),
    el('div', { classe: 'ch-botoes' },
      botao('Voltar ao foco', voltarAoQueEstava),
      botao('Só sair', () => sairDeVez(), true),
      botao('Amanhã', () => sairPara(somarDias(estado.hoje, 1)), true),
      botao('Outro dia', () => { dia.hidden = false; try { dia.showPicker?.(); } catch { /* sem seletor: o campo fica à vista */ } dia.focus(); }, true)),
    dia);
}
function voltarAoQueEstava() {
  if (m.fase === 'fimFoco' || m.fase === 'fimPausa') mostrarFim();
  else if (m.fase === 'pausa') mostrarPausa();
  else esconderCartao();
}
function sairDeVez() {
  const total = focadoAgora(), titulo = m.titulo;
  fechar();
  avisar(`Foco de ${duracaoTexto(total)} · ${titulo}`);
}
// Deixar para amanhã ou outro dia: muda o dia da tarefa, com o aviso e o Desfazer de sempre
function sairPara(dia) {
  const t = tarefaDe(m.id);
  fechar();
  if (t) moverPara(t, dia);
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
