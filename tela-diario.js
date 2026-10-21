// Centelha · o diário: uma página por dia, salva sozinha enquanto você escreve, com áudio e vídeo. Só você vê (o banco garante).
// "Falar" usa o reconhecimento de voz do navegador: o áudio passa pelo serviço do Google (aceito por Rafael em 21/10).
import { diaPorExtenso, somarDias } from './datas.js';
import { estado, falha } from './estado.js';
import * as dados from './dados.js';
import { $, el, icone, mostrarEstado, avisar } from './ui.js';

const Reconhecer = window.SpeechRecognition || window.webkitSpeechRecognition;
const PODE_GRAVAR = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const LIMITE = { audio: 600, video: 60 };   // segundos: vídeo até 1 min (Rafael, 21/10); áudio até 10 min
const FORMATOS = {
  audio: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'],
  video: ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
};
const MAXIMO_BYTES = 15 * 1024 * 1024;      // o mesmo limite do balde "diario" (migração 0002)

let entrada = null;      // { id, dia, texto } de hoje, como está no banco
let escrito = null;      // o que está na tela, mesmo antes de o banco responder
let anteriores = [];
let carregadoPara = null;
let fila = Promise.resolve();
let espera;
let ouvindo = null;      // o reconhecimento de voz em curso
let midias = [];         // gravações dos últimos 15 dias (as tiradas não vêm)
let pendentes = [];      // gravações que não subiram: ficam na memória para tentar de novo
let gravacao = null;     // a gravação em curso
const enderecos = new Map();   // id da gravação → endereço local do arquivo já baixado

const maiuscula = (s) => s[0].toUpperCase() + s.slice(1);

export function desenharDiario() {
  const tela = $('tela-diario');
  const pronto = carregadoPara === chave();
  const papel = el('textarea', {
    classe: 'diario-papel', id: 'diario-texto', 'aria-label': 'Escrever no diário de hoje',
    placeholder: pronto ? 'Escreva do seu jeito. Salva sozinho.' : 'Abrindo…', disabled: !pronto,
  });
  if (pronto) papel.value = escrito ?? entrada?.texto ?? '';
  papel.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(salvarAgora, 800); });
  papel.addEventListener('blur', salvarAgora);

  const perguntar = (texto) => {
    if (papel.disabled) return;
    papel.value += (papel.value.trim() ? '\n\n' : '') + texto + ' ';
    papel.focus();
    papel.setSelectionRange(papel.value.length, papel.value.length);
    salvarAgora();
  };

  const hoje = maiuscula(diaPorExtenso(estado.hoje));
  tela.replaceChildren(
    el('h1', { id: 'titulo-diario' }, 'Diário'),
    el('p', { classe: 'privado', html: `${icone('faisca', 'faisca')}<span>${hoje} · só você vê</span>` }),
    el('div', { classe: 'fileira', style: 'margin-top:12px' },
      el('button', { type: 'button', classe: 'pilula', onclick: () => perguntar('O que foi bom hoje:') }, 'O que foi bom hoje?'),
      el('button', { type: 'button', classe: 'pilula', onclick: () => perguntar('O que me travou:') }, 'O que me travou?'),
      botaoFalar(papel)),
    papel,
    Reconhecer ? el('p', { classe: 'parcial', id: 'diario-parcial', 'aria-live': 'polite' }) : null,
    PODE_GRAVAR ? el('div', { classe: 'fileira gravar' }, botaoGravar('audio', pronto), botaoGravar('video', pronto)) : null,
    el('div', { classe: 'cartao gravando', id: 'gravando', hidden: true }),
    el('div', { classe: 'midias', id: 'midias-hoje' }, listaMidias(estado.hoje)),
    diasAnteriores(),
  );
  if (gravacao) mostrarPainel(gravacao);
  if (!pronto) carregar();
}

const chave = () => `${estado.usuario?.id}|${estado.hoje}`;

async function carregar() {
  const pedido = chave();
  try {
    const [deHoje, antes] = await Promise.all([
      dados.diarioDoDia(estado.usuario.id, estado.hoje),
      dados.diarioAnteriores(estado.usuario.id, estado.hoje),
    ]);
    if (pedido !== chave()) return;
    entrada = deHoje;
    escrito = null;
    anteriores = antes.filter((a) => a.texto.trim());
    midias = await dados.midiasDesde(estado.usuario.id, somarDias(estado.hoje, -15));
    if (pedido !== chave()) return;
    carregadoPara = pedido;
    if (estado.aba === 'diario') desenharDiario();
  } catch (erro) {
    falha(erro);
    const papel = $('diario-texto');
    if (papel) papel.placeholder = 'Não abriu. Confira a internet e volte a esta aba.';
  }
}

export function salvarAgora() {
  clearTimeout(espera);
  const papel = $('diario-texto');
  if (!papel || papel.disabled || carregadoPara !== chave()) return;
  const texto = papel.value, dia = estado.hoje;
  escrito = texto;
  if (entrada ? entrada.texto === texto : !texto.trim()) return;
  // Em fila: a segunda gravação espera a primeira, para nunca criar duas páginas no mesmo dia.
  fila = fila.then(async () => {
    if (entrada && entrada.texto === texto) return;
    mostrarEstado('Salvando…');
    try {
      const id = await dados.salvarDiario(entrada && entrada.dia === dia ? entrada.id : null, dia, texto);
      entrada = { id, dia, texto };
      mostrarEstado('Salvo ✓');
    } catch (erro) { falha(erro); }
  });
}

// Ao sair do diário: para de ouvir e guarda a gravação em curso (nada se perde).
export function pararDeOuvir() {
  if (ouvindo) ouvindo.stop();
  pararGravacao(false);
}

export function esquecerDiario() {
  entrada = null; escrito = null; anteriores = []; carregadoPara = null; midias = [];
  for (const url of enderecos.values()) URL.revokeObjectURL(url);
  enderecos.clear();
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });

// ---------- Falar: o que você diz vira texto no diário ----------
// Uma fala por toque: mais previsível. Toque de novo para continuar.
function botaoFalar(papel) {
  if (!Reconhecer) return null;
  const botao = el('button', { type: 'button', classe: 'pilula', id: 'diario-falar', 'aria-pressed': 'false', html: `${icone('microfone')}<span>Falar</span>` });
  botao.addEventListener('click', () => (ouvindo ? ouvindo.stop() : ouvir(papel, botao)));
  return botao;
}

function juntar(antes, novo) {
  if (!novo) return antes;
  const fimDeFrase = !antes.trim() || /[.!?:]\s*$|\n\s*$/.test(antes);
  const texto = fimDeFrase ? novo[0].toUpperCase() + novo.slice(1) : novo;
  return !antes ? texto : /\s$/.test(antes) ? antes + texto : antes + ' ' + texto;
}

function ouvir(papel, botao) {
  if (papel.disabled) return;
  const r = new Reconhecer();
  r.lang = 'pt-BR';
  r.continuous = false;
  r.interimResults = true;
  let fixo = papel.value;
  const parcial = $('diario-parcial');
  const marcar = (sim) => {
    botao.classList.toggle('ouvindo', sim);
    botao.setAttribute('aria-pressed', String(sim));
    botao.querySelector('span').textContent = sim ? 'Ouvindo… toque para parar' : 'Falar';
    papel.readOnly = sim;
    if (parcial) parcial.textContent = sim ? 'Pode falar.' : '';
  };
  r.onresult = (e) => {
    let final = '', meio = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript; else meio += e.results[i][0].transcript;
    }
    if (final.trim()) { fixo = juntar(fixo, final.trim()); papel.value = fixo; salvarAgora(); }
    if (parcial) parcial.textContent = meio.trim() ? `… ${meio.trim()}` : '';
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') avisar('O microfone está bloqueado para o Centelha. Libere em: cadeado ao lado do endereço → Microfone.');
    else if (e.error === 'network') avisar('Falar precisa de internet.');
    else if (e.error === 'no-speech') mostrarEstado('Não ouvi nada');
  };
  r.onend = () => { if (ouvindo === r) ouvindo = null; marcar(false); };
  ouvindo = r;
  marcar(true);
  try { r.start(); } catch { ouvindo = null; marcar(false); }
}

// ---------- Áudio e vídeo ----------
const duracao = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const nomeTipo = (tipo) => (tipo === 'video' ? 'Vídeo' : 'Áudio');

function botaoGravar(tipo, pronto) {
  return el('button', {
    type: 'button', classe: 'pilula', 'data-gravar': tipo, disabled: !pronto || !!gravacao,
    html: `${icone(tipo === 'video' ? 'camera' : 'onda')}<span>Gravar ${tipo === 'video' ? 'vídeo' : 'áudio'}</span>`,
    onclick: () => gravar(tipo),
  });
}

function diasAnteriores() {
  const dias = new Map(anteriores.map((a) => [a.dia, a.texto]));
  for (const m of midias) if (m.dia < estado.hoje && !dias.has(m.dia)) dias.set(m.dia, '');
  if (!dias.size) return null;
  return el('div', { classe: 'anteriores', id: 'diario-anteriores' },
    el('h2', {}, 'Dias anteriores'),
    [...dias.keys()].sort().reverse().slice(0, 14).map((dia) => el('details', {},
      el('summary', {}, maiuscula(diaPorExtenso(dia))),
      dias.get(dia) ? el('p', {}, dias.get(dia)) : null,
      midias.some((m) => m.dia === dia) ? el('div', { classe: 'midias' }, listaMidias(dia)) : null)));
}

function listaMidias(dia) {
  return [
    ...midias.filter((m) => m.dia === dia).map(itemMidia),
    ...(dia === estado.hoje ? pendentes.map(itemPendente) : []),
  ];
}

function redesenharMidias() {
  $('midias-hoje')?.replaceChildren(...listaMidias(estado.hoje));
  $('diario-anteriores')?.replaceWith(diasAnteriores() || '');
}

function itemMidia(m) {
  const rotulo = `${nomeTipo(m.tipo)} · ${duracao(m.segundos || 0)}`;
  const lugar = el('div', { style: 'width:100%' });
  const tocar = el('button', {
    type: 'button', classe: 'pilula', html: `${icone(m.tipo === 'video' ? 'camera' : 'onda')}<span>${m.tipo === 'video' ? 'Ver' : 'Ouvir'}</span>`,
    onclick: async () => {
      tocar.disabled = true;
      try {
        if (!enderecos.has(m.id)) { mostrarEstado('Abrindo…'); enderecos.set(m.id, URL.createObjectURL(await dados.baixarMidia(m.caminho))); mostrarEstado(''); }
        const midia = el(m.tipo === 'video' ? 'video' : 'audio', { controls: true, autoplay: true, playsinline: true, src: enderecos.get(m.id) });
        lugar.replaceChildren(midia);
        tocar.hidden = true;
      } catch (erro) { tocar.disabled = false; falha(erro); }
    },
  });
  return el('div', { classe: 'midia', 'data-id': m.id },
    el('span', { classe: 'midia-rot' }, rotulo), tocar,
    el('button', { type: 'button', classe: 'icone-btn', 'aria-label': `Tirar: ${rotulo}`, 'data-mantem-aviso': true, onclick: () => tirarMidia(m) }, '×'),
    lugar);
}

async function tirarMidia(m) {
  midias = midias.filter((x) => x !== m);
  redesenharMidias();
  try {
    await dados.marcarMidia(m.id, true);
    mostrarEstado('Salvo ✓');
    avisar(`${nomeTipo(m.tipo)} tirado do diário`, async () => {
      try {
        await dados.marcarMidia(m.id, false);
        midias.push(m);
        midias.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
        redesenharMidias();
        mostrarEstado('Salvo ✓');
      } catch (erro) { falha(erro); }
    });
  } catch (erro) { midias.push(m); redesenharMidias(); falha(erro); }
}

function itemPendente(p) {
  return el('div', { classe: 'midia pendente' },
    el('span', { classe: 'midia-rot' }, `${nomeTipo(p.tipo)} · ${duracao(p.segundos)} · não subiu`),
    el('button', { type: 'button', classe: 'pilula', 'data-mantem-aviso': true, onclick: () => subir(p) }, 'Tentar de novo'));
}

async function gravar(tipo) {
  if (gravacao || ouvindo) return;
  let fluxo;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia(tipo === 'video'
      ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
      : { audio: true });
  } catch (erro) {
    avisar(erro.name === 'NotAllowedError' ? 'A câmera ou o microfone está bloqueado para o Centelha. Libere em: cadeado ao lado do endereço.'
      : erro.name === 'NotFoundError' ? `Não achei ${tipo === 'video' ? 'câmera' : 'microfone'} neste aparelho.`
        : 'Não deu para começar a gravar. Tente de novo.');
    return;
  }
  const formato = FORMATOS[tipo].find((f) => MediaRecorder.isTypeSupported(f));
  const gravador = new MediaRecorder(fluxo, {
    ...(formato ? { mimeType: formato } : {}),
    audioBitsPerSecond: tipo === 'audio' ? 32000 : 64000,
    ...(tipo === 'video' ? { videoBitsPerSecond: 1000000 } : {}),
  });
  const pedacos = [];
  const g = { tipo, gravador, fluxo, inicio: Date.now(), descartar: false, dia: estado.hoje, usuarioId: estado.usuario.id };
  gravador.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  gravador.onstop = () => terminar(g, pedacos);
  gravacao = g;
  gravador.start(1000);
  mostrarPainel(g);
  document.querySelectorAll('[data-gravar]').forEach((b) => { b.disabled = true; });
  g.relogio = setInterval(() => {
    const s = Math.floor((Date.now() - g.inicio) / 1000);
    const tempo = $('gravando-tempo');
    if (tempo) tempo.textContent = duracao(Math.min(s, LIMITE[g.tipo]));
    if (s >= LIMITE[g.tipo]) pararGravacao(false);
  }, 250);
}

function mostrarPainel(g) {
  const painel = $('gravando');
  if (!painel) return;
  const previa = g.tipo === 'video'
    ? el('video', { classe: 'previa-video', muted: true, autoplay: true, playsinline: true, 'aria-label': 'O que a câmera está vendo' })
    : el('div', { classe: 'respira pequena', 'aria-hidden': 'true', html: `<span class="anel"></span><span class="anel"></span>${icone('onda', 'faisca')}` });
  if (g.tipo === 'video') previa.srcObject = g.fluxo;
  const s = Math.floor((Date.now() - g.inicio) / 1000);
  const parar = el('button', { type: 'button', classe: 'btn', onclick: () => pararGravacao(false) }, 'Parar e guardar');
  painel.replaceChildren(previa,
    el('p', {}, `Gravando ${g.tipo === 'video' ? 'vídeo' : 'áudio'} · `, el('span', { classe: 'tempo', id: 'gravando-tempo' }, duracao(s)), ` de ${duracao(LIMITE[g.tipo])}`),
    el('div', { classe: 'fileira', style: 'justify-content:center' },
      parar,
      el('button', { type: 'button', classe: 'btn claro', onclick: () => pararGravacao(true) }, 'Descartar')));
  painel.hidden = false;
  parar.focus({ preventScroll: true });
}

export function pararGravacao(descartar) {
  if (!gravacao || gravacao.gravador.state === 'inactive') return;
  gravacao.descartar = descartar;
  gravacao.gravador.stop();
}

function terminar(g, pedacos) {
  clearInterval(g.relogio);
  g.fluxo.getTracks().forEach((t) => t.stop());
  if (gravacao === g) gravacao = null;
  const painel = $('gravando');
  if (painel) { painel.hidden = true; painel.replaceChildren(); }
  document.querySelectorAll('[data-gravar]').forEach((b) => { b.disabled = carregadoPara !== chave(); });
  if (g.descartar) { mostrarEstado('Descartado'); return; }
  const arquivo = new Blob(pedacos, { type: g.gravador.mimeType || (g.tipo === 'video' ? 'video/webm' : 'audio/webm') });
  if (!arquivo.size) { avisar('A gravação saiu vazia. Tente de novo.'); return; }
  if (arquivo.size > MAXIMO_BYTES) { avisar('A gravação passou de 15 MB e não cabe. Grave mais curto.'); return; }
  subir({ tipo: g.tipo, arquivo, dia: g.dia, usuarioId: g.usuarioId, segundos: Math.min(LIMITE[g.tipo], Math.round((Date.now() - g.inicio) / 1000)) });
}

async function subir(p) {
  pendentes = pendentes.filter((x) => x !== p);
  mostrarEstado('Salvando…');
  try {
    const m = await dados.guardarMidia(p.usuarioId, p.dia, p.tipo, p.arquivo, p.segundos);
    enderecos.set(m.id, URL.createObjectURL(p.arquivo));   // já está no aparelho: não precisa baixar de novo
    midias.push(m);
    mostrarEstado('Salvo ✓');
    avisar(`${nomeTipo(p.tipo)} guardado · só você vê`);
  } catch (erro) {
    pendentes.push(p);
    falha(erro);
  }
  if (estado.aba === 'diario') redesenharMidias();
}
