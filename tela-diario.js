// Centelha · o diário: uma página por dia, salva sozinha enquanto você escreve. Só você vê (o banco garante).
// Sem "falar" de propósito: o reconhecimento de voz do navegador manda o áudio para fora; o microfone do teclado é escolha sua.
import { diaPorExtenso } from './datas.js';
import { estado, falha } from './estado.js';
import * as dados from './dados.js';
import { $, el, icone, mostrarEstado } from './ui.js';

let entrada = null;      // { id, dia, texto } de hoje, como está no banco
let escrito = null;      // o que está na tela, mesmo antes de o banco responder
let anteriores = [];
let carregadoPara = null;
let fila = Promise.resolve();
let espera;

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
      el('button', { type: 'button', classe: 'pilula', onclick: () => perguntar('O que me travou:') }, 'O que me travou?')),
    papel,
    anteriores.length ? el('div', { classe: 'anteriores' },
      el('h2', {}, 'Dias anteriores'),
      anteriores.map((a) => el('details', {}, el('summary', {}, maiuscula(diaPorExtenso(a.dia))), el('p', {}, a.texto)))) : null,
  );
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

export function esquecerDiario() {
  entrada = null; escrito = null; anteriores = []; carregadoPara = null;
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });
