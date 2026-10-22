// Centelha · o pet: a faísca no canto da tela que conversa (lote 15; opção A de Rafael, com o DeepSeek).
// Clica nela (ou aperta C no notebook) e conversa por texto ou pelo "Falar". Nesta versão ela só responde:
// criar, mover e concluir tarefas com "posso?" chega no lote 16; a voz dela, no 17.
// A conversa fica só na memória desta aba (some ao recarregar). O cérebro é a função "agente" do Supabase.
import { estado } from './estado.js';
import * as dados from './dados.js';
import { $, el, icone, abrirFolha, fecharFolha, folhaAtual, ouvir, reiniciar } from './ui.js';

const Reconhecer = window.SpeechRecognition || window.webkitSpeechRecognition;
const SUGESTOES = ['O que faço agora?', 'O que está atrasado?', 'Me ajuda a destravar uma tarefa'];
const conversa = [];
let esperando = false;
let ouvindo = null;

export function ligarPet() {
  $('pet').addEventListener('click', abrirConversa);
  // Quando uma tarefa acende, a faísca acende junto.
  document.addEventListener('centelha:acendeu', () => { const p = $('pet'); if (p && !p.hidden) reiniciar(p, 'acende'); });
}

export function mostrarPet(sim) { $('pet').hidden = !sim; }

export function abrirConversa() {
  desenhar();
  if (folhaAtual() !== 'folha-conversa') abrirFolha('folha-conversa', () => ouvindo?.stop());
  setTimeout(() => $('pet-texto')?.focus({ preventScroll: true }), 60);
}

// Tira o negrito e os títulos do Markdown: a resposta aparece como texto simples.
const simples = (texto) => texto.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '');

function balao(m) {
  const dela = m.role === 'assistant';
  return el('div', { classe: `balao ${dela ? 'dela' : 'meu'}${m.erro ? ' erro' : ''}` },
    el('p', {}, dela ? simples(m.content) : m.content),
    dela && !m.erro && 'speechSynthesis' in window
      ? el('button', { type: 'button', classe: 'icone-btn leve', 'aria-label': 'Ouvir a resposta', html: icone('ouvir'), onclick: () => ouvir(simples(m.content)) })
      : null);
}

function desenhar() {
  const lista = el('div', { classe: 'conversa', id: 'pet-lista', role: 'log', 'aria-live': 'polite' },
    conversa.length ? conversa.map(balao)
      : el('p', { classe: 'ajuda' }, 'Pergunte sobre as suas tarefas. Eu leio as abertas que não são privadas; o diário e o "Travei" ficam só com você.'),
    esperando ? el('p', { classe: 'balao dela pensando' }, 'Pensando…') : null);
  const texto = el('textarea', { id: 'pet-texto', rows: 2, placeholder: 'Escreva ou toque em Falar', 'aria-label': 'Mensagem para a Centelha' });
  texto.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto.value); } });
  const form = el('form', { classe: 'pet-escrever' }, texto,
    Reconhecer ? el('button', { type: 'button', classe: 'pilula', id: 'pet-falar', html: `${icone('microfone')}<span>Falar</span>`, onclick: () => falar(texto) }) : null,
    el('button', { type: 'submit', classe: 'btn', disabled: esperando }, 'Enviar'));
  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(texto.value); });

  $('folha-conversa').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('div', { classe: 'pet-topo' },
      el('span', { classe: 'pet-mini', html: icone('faisca', 'faisca') }),
      el('h2', { id: 'titulo-conversa' }, 'Centelha'),
      el('button', { type: 'button', classe: 'icone-btn leve', 'aria-label': 'Fechar a conversa', onclick: () => fecharFolha('folha-conversa') }, '✕')),
    lista,
    conversa.length ? null : el('div', { classe: 'fileira' }, SUGESTOES.map((s) => el('button', { type: 'button', classe: 'pilula', onclick: () => enviar(s) }, s))),
    form));
  lista.scrollTop = lista.scrollHeight;
}

async function enviar(texto) {
  texto = (texto || '').trim();
  if (!texto || esperando) return;
  conversa.push({ role: 'user', content: texto });
  esperando = true;
  $('pet').classList.add('pensando');
  desenhar();
  try {
    const r = await dados.conversar(conversa, estado.hoje);
    conversa.push({ role: 'assistant', content: r.resposta });
  } catch (erro) {
    console.error(erro);
    conversa.push({ role: 'assistant', erro: true, content: erro.semChave
      ? 'Ainda não estou ligada: falta a chave do DeepSeek no Supabase.'
      : 'Não consegui responder agora: sem internet ou o servidor não respondeu. Tente de novo.' });
  }
  esperando = false;
  $('pet').classList.remove('pensando');
  if (folhaAtual() === 'folha-conversa') { desenhar(); setTimeout(() => $('pet-texto')?.focus({ preventScroll: true }), 30); }
}

// "Falar": uma fala por toque vira texto no campo (o áudio passa pelo serviço de voz do Google, como no Diário).
function falar(campo) {
  if (!Reconhecer || ouvindo) { ouvindo?.stop(); return; }
  const r = new Reconhecer();
  r.lang = 'pt-BR';
  r.interimResults = false;
  const botao = $('pet-falar');
  botao?.classList.add('ouvindo');
  r.onresult = (e) => { const dito = [...e.results].map((x) => x[0].transcript).join(' ').trim(); if (dito) campo.value = (campo.value ? campo.value + ' ' : '') + dito; };
  r.onend = () => { ouvindo = null; botao?.classList.remove('ouvindo'); campo.focus({ preventScroll: true }); };
  ouvindo = r;
  try { r.start(); } catch { ouvindo = null; botao?.classList.remove('ouvindo'); }
}
