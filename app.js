// Centelha · o começo: entrar com Google, carregar, as abas, "Do seu jeito" e os atalhos.
// Regras de tela: docs/operacao/07-APP.md. Visual e movimento: docs/PROPOSTA-VISUAL-2026-10-21.md.
import { hojeISO, deISO } from './datas.js';
import { segundaDaSemana } from './calculos.js';
import * as dados from './dados.js';
import { estado, aoMudar, fixarSecoes, falha } from './estado.js';
import { desenharHoje, desenharSemana, desenharCaixa, aoAbrirTarefa } from './telas.js';
import { abrirTarefa, fecharTarefa, atualizarTarefa, aoVoltar, textoParaOuvir, fecharMomento, momentoAberto, tarefaAberta } from './tela-tarefa.js';
import { desenharDiario, salvarAgora, esquecerDiario, pararDeOuvir } from './tela-diario.js';
import { desenharGrupos, aoAbrirLista } from './tela-grupos.js';
import { abrirLista as prepararLista, desenharLista, tituloDaLista } from './tela-lista.js';
import { desenharMenu, ligarMenu } from './menu.js';
import { aoAbrirTarefaPelasAcoes, abrirMover, alternarEstrela, limparSelecao, selecao } from './acoes.js';
import { alternarFeita, moverPara } from './estado.js';
import * as preferencias from './preferencias.js';
import { ligarPet, mostrarPet, abrirConversa } from './pet.js';
import { mergulhoAberto, retomarMergulho, fecharCartaoMergulho } from './mergulho.js';
import { $, el, mostrarEstado, avisar, fecharAviso, ligarAviso, abrirFolha, fecharFolha, folhaAtual, ouvir, reiniciar, movimento } from './ui.js';

const ABAS = ['hoje', 'semana', 'grupos', 'caixa', 'diario'];
const TELAS = [...ABAS, 'lista', 'tarefa'];
const NOMES = { hoje: 'Hoje', semana: 'Semana', grupos: 'Grupos', caixa: 'Caixa', diario: 'Diário', lista: 'Lista' };
// No notebook (tela larga), o formato do Microsoft To Do: menu lateral, lista e a tarefa no painel da direita.
const largo = matchMedia('(min-width: 1000px)');
const RECARREGAR_DEPOIS_MS = 30 * 60 * 1000;
let abaDeVolta = 'hoje';

// ---------- Desenhar a tela atual ----------
function desenharAtual(entrando = false) {
  desenharMenu();
  if (estado.painel) atualizarTarefa();
  if (estado.aba === 'tarefa') { atualizarTarefa(); return; }
  if (estado.aba === 'hoje') desenharHoje();
  else if (estado.aba === 'lista') desenharLista();
  else if (estado.aba === 'semana') desenharSemana(entrando);
  else if (estado.aba === 'grupos') desenharGrupos();
  else if (estado.aba === 'caixa') desenharCaixa();
  else if (estado.aba === 'diario') desenharDiario();
  estado.recem = null;   // a lâmpada nova já acendeu na lista
}
aoMudar(() => desenharAtual(false));

function irPara(aba, { deLado = false } = {}) {
  if (estado.aba === 'diario' && aba !== 'diario') { pararDeOuvir(); salvarAgora(); }
  if (estado.aba === 'tarefa' && aba !== 'tarefa') fecharTarefa();
  if (aba !== estado.aba) { limparSelecao(); fecharPainel(); }
  estado.aba = aba;
  for (const nome of TELAS) if (!(nome === 'tarefa' && estado.painel)) $(`tela-${nome}`).hidden = nome !== aba;
  const tela = $(`tela-${aba}`);
  tela.classList.remove('ativa', 'de-lado');
  void tela.offsetWidth;
  tela.classList.add('ativa');
  if (deLado) tela.classList.add('de-lado');

  const i = ABAS.indexOf(aba);
  document.querySelectorAll('#abas .aba').forEach((b) => {
    if (b.dataset.aba === aba) { b.setAttribute('aria-current', 'page'); reiniciar(b, 'pulou'); } else b.removeAttribute('aria-current');
  });
  if (i >= 0) $('luzinha').style.transform = `translateX(${i * 100}%)`;
  $('ouvir-tela').hidden = !('speechSynthesis' in window) || aba === 'diario';
  if (aba !== 'tarefa') desenharAtual(aba === 'semana');
  window.scrollTo({ top: 0, behavior: movimento() === 'vivo' ? 'smooth' : 'auto' });
}

function abrirNaTela(t) {
  fecharAviso();
  if (largo.matches) {   // notebook: a lista fica, a tarefa abre à direita
    estado.painel = t.id;
    document.body.classList.add('com-painel');
    abrirTarefa(t, NOMES[estado.aba] || 'Hoje', { painel: true });
    const painel = $('tela-tarefa');
    painel.hidden = false;
    reiniciar(painel, 'ativa');
    desenharAtual(false);
    return;
  }
  if (estado.aba !== 'tarefa') abaDeVolta = estado.aba;
  abrirTarefa(t, NOMES[abaDeVolta]);
  irPara('tarefa', { deLado: true });
}
function fecharPainel() {
  if (!estado.painel) return;
  estado.painel = null;
  document.body.classList.remove('com-painel');
  $('tela-tarefa').hidden = true;
  fecharTarefa();
  desenharAtual(false);
}
aoAbrirTarefa(abrirNaTela);
aoAbrirTarefaPelasAcoes(abrirNaTela);
aoVoltar(() => (estado.painel ? fecharPainel() : irPara(abaDeVolta)));

// Abrir uma lista (subgrupo, área ou Prioridades) a partir do menu lateral ou da aba Grupos.
function abrirLista(tipo, area = null, subgrupo = null) {
  fecharPainel();
  limparSelecao();
  prepararLista(tipo, area, subgrupo);
  NOMES.lista = tipo === 'prioridades' ? 'Prioridades' : tituloDaLista(estado.lista);   // o voltar da tarefa diz de onde ela veio
  irPara('lista');
}
ligarMenu((aba) => irPara(aba), abrirLista);
aoAbrirLista(abrirLista);

// Tela larga ↔ estreita no meio do uso: a tarefa aberta muda de lugar sem se perder.
function ajustarAoTamanho() {
  if (!estado.usuario) return;
  const t = tarefaAberta();
  if (!largo.matches && estado.painel && t) { fecharPainel(); abrirNaTela(t); }
  else if (largo.matches && estado.aba === 'tarefa' && t) { irPara(abaDeVolta); abrirNaTela(t); }
}
largo.addEventListener('change', ajustarAoTamanho);
window.addEventListener('resize', ajustarAoTamanho);   // reserva: nem todo navegador avisa a troca pelo "change"

// ---------- Tempo máximo (28/10, o Android que ficava só no topo) ----------
// Nenhuma espera do banco é para sempre: em 10 s vira a tela "Não consegui falar com o banco", com "Tentar de novo".
const TEMPO_MAXIMO_MS = window.__CENTELHA_TEMPO_MAXIMO_MS ?? 10000;
const comTempo = (promessa) => Promise.race([promessa,
  new Promise((_, falhar) => setTimeout(() => falhar(Object.assign(new Error('o banco não respondeu em 10 s'), { tempo: true })), TEMPO_MAXIMO_MS))]);

// Erro no começo do app: em vez de ficar só o topo, diz o que houve e oferece recarregar.
function mostrarErroAoAbrir(erro) {
  console.error(erro);
  window.__centelhaIniciou = true;
  mostrarSoHoje([
    el('h1', { id: 'titulo-hoje' }, 'O Centelha não abriu direito'),
    el('p', { classe: 'data' }, 'Nada se perdeu: suas tarefas estão guardadas no banco.'),
    el('button', { type: 'button', classe: 'btn grande', onclick: () => location.reload() }, 'Recarregar'),
    el('p', { classe: 'vazio' }, 'Se continuar, feche o navegador de vez e abra de novo.'),
    el('p', { classe: 'vazio detalhe' }, `Detalhe para o suporte: ${String(erro?.message || erro).slice(0, 160)} · versão ${self.VERSAO_APP || 'dev'}`),
  ]);
}

// ---------- Carregando e sem banco (lote 52) ----------
// Enquanto carrega, o desenho da tela em cartões cinza, sem pular. Sem banco, uma tela que explica e tenta de novo.
function mostrarSoHoje(conteudo) {
  window.__centelhaIniciou = true;   // a rede de segurança do index.html não precisa entrar
  $('tela-entrar').hidden = true;
  for (const nome of TELAS) $(`tela-${nome}`).hidden = nome !== 'hoje';
  $('tela-hoje').replaceChildren(...conteudo);
}
function mostrarCarregando() {
  mostrarSoHoje([
    el('h1', { id: 'titulo-hoje' }, 'Hoje'),
    el('div', { classe: 'lista esqueleto', 'aria-hidden': 'true' }, [1, 2, 3].map(() => el('div', { classe: 'tarefa esqueleto-cartao' }))),
    el('p', { classe: 'vazio', role: 'status' }, 'Trazendo as suas tarefas…'),
  ]);
}
function mostrarSemBanco(tentar = () => entrar(estado.usuario)) {
  mostrarEstado('Não carregou', true);
  mostrarSoHoje([
    el('h1', { id: 'titulo-hoje' }, 'Não consegui falar com o banco'),
    el('p', { classe: 'data' }, 'Suas tarefas estão guardadas. Só não chegaram até aqui agora.'),
    el('ul', { classe: 'lista' },
      el('li', { classe: 'vazio' }, 'Sem internet? Quando ela voltar, eu tento de novo sozinho.'),
      el('li', { classe: 'vazio' }, 'O banco pode estar em pausa. Tente de novo em alguns minutos.')),
    el('button', { type: 'button', classe: 'btn grande', id: 'tentar-de-novo', onclick: tentar }, 'Tentar de novo'),
  ]);
}

// ---------- Entrar ----------
function mostrarEntrar() {
  window.__centelhaIniciou = true;
  for (const nome of TELAS) $(`tela-${nome}`).hidden = true;
  estado.painel = null;
  document.body.classList.remove('logado', 'com-painel');
  mostrarPet(false);
  $('tela-entrar').hidden = false;
  $('abas').hidden = true;
  $('ouvir-tela').hidden = true;
  $('abrir-ajustes').hidden = false;
  mostrarEstado('');
}

async function pedirLogin() {
  $('erro-entrar').hidden = true;
  const { error } = await dados.banco.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) {
    $('erro-entrar').textContent = 'Não deu para abrir o login do Google. Confira a internet e tente de novo.';
    $('erro-entrar').hidden = false;
  }
}

async function entrar(usuario) {
  estado.usuario = usuario;
  $('tela-entrar').hidden = true;
  $('abas').hidden = false;
  document.body.classList.add('logado');
  mostrarPet(true);
  mostrarEstado('Carregando…');
  if (!estado.carregadoEm) mostrarCarregando();
  try {
    [estado.espacoId] = await comTempo(Promise.all([dados.espacoPessoal(usuario.id), dados.conferir0007()]));   // a 0007 já rodou?
  } catch (erro) {
    console.error(erro);
    mostrarSemBanco();
    return;
  }
  if (await carregar()) { irPara('hoje'); retomarMergulho(); }
}

// Abertas + feitas desde segunda (para as luzes do dia e o varal da semana).
async function carregar() {
  const desde = deISO(segundaDaSemana(hojeISO())).toISOString();
  try {
    [estado.tarefas, estado.passos, estado.projetos, estado.etiquetas] = await comTempo(Promise.all([
      dados.carregarTarefas(estado.espacoId, desde), dados.contarPassos(), dados.projetos(estado.espacoId), dados.etiquetas(estado.espacoId)]));
  } catch (erro) {
    console.error(erro);
    if (!estado.carregadoEm) { mostrarSemBanco(); return false; }   // na 1ª carga, a tela que explica; depois, o que já está na tela fica
    mostrarEstado('Não carregou', true);
    avisar('Não deu para trazer as tarefas. Recarregue a página.');
    return false;
  }
  fixarSecoes();
  estado.carregadoEm = Date.now();
  mostrarEstado('Salvo ✓');
  return true;
}

async function recarregar() {
  const diaAntes = estado.hoje;
  if (!(await carregar())) return;
  if (estado.hoje !== diaAntes) esquecerDiario();
  if (estado.painel) fecharPainel();
  if (estado.lista) prepararLista(estado.lista.tipo, estado.lista.area, estado.lista.subgrupo);
  if (estado.aba === 'tarefa') irPara(abaDeVolta);
  else desenharAtual(false);
}

async function sair() {
  fecharFolha('folha-ajustes');
  pararDeOuvir();
  salvarAgora();
  await dados.banco.auth.signOut();
  estado.usuario = null; estado.espacoId = null; estado.tarefas = [];
  esquecerDiario();
  mostrarEntrar();
}

// ---------- Exportar tudo ----------
async function exportar() {
  mostrarEstado('Preparando…');
  try {
    const tudo = await dados.exportarTudo(estado.espacoId, estado.usuario.id);
    const arquivo = new Blob([JSON.stringify(tudo, null, 2)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(arquivo), download: `centelha-${hojeISO()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    mostrarEstado('Salvo ✓');
    avisar(`Arquivo pronto: ${tudo.contagem.tarefas} tarefas, ${tudo.contagem.subtarefas} passos, ${tudo.contagem.diario} dias de diário.`);
  } catch (erro) { falha(erro); }
}

// ---------- Atalhos de teclado (no jeito do Microsoft To Do) ----------
// Valem fora dos campos de texto: C conversar com a Centelha (o pet) · N nova tarefa · D ou Ctrl+D concluir · E estrela · H trazer para hoje · M mover.
// D, E, H e M agem na tarefa aberta; M também nas escolhidas. Ctrl+N e Ctrl+T o navegador não deixa usar.
function atalho(e) {
  if (!estado.usuario || e.altKey || e.metaKey || momentoAberto() || folhaAtual() || mergulhoAberto()) return;
  const alvo = e.target;
  if (alvo.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const tecla = e.key.toLowerCase();
  if (e.ctrlKey && tecla !== 'd') return;
  const t = tarefaAberta();
  const fazer = (f) => { e.preventDefault(); f(); };
  if (tecla === 'c') fazer(abrirConversa);   // C chama o pet
  else if (tecla === 'n') fazer(() => {
    const campo = $('adicionar-tarefa') && !$('tela-lista').hidden ? $('adicionar-tarefa') : null;
    if (campo) campo.focus(); else { if (estado.aba !== 'hoje') irPara('hoje'); setTimeout(() => $('texto-anotar')?.focus(), 50); }
  });
  else if (tecla === 'd' && t) fazer(() => alternarFeita(t));
  else if (tecla === 'e' && t) fazer(() => alternarEstrela(t));
  else if (tecla === 'h' && t && t.dia !== estado.hoje) fazer(() => moverPara(t, estado.hoje));
  else if (tecla === 'm' && (selecao.size || t)) fazer(() => abrirMover(selecao.size ? [...selecao].map((id) => estado.tarefas.find((x) => x.id === id)).filter(Boolean) : [t]));
}

// ---------- Ouvir a tela ----------
function ouvirTela() {
  if (estado.aba === 'tarefa') { ouvir(textoParaOuvir()); return; }
  const tela = $(`tela-${estado.aba}`);
  const partes = [...tela.querySelectorAll('h1, h2, .contagem, .tarefa .titulo-t, .dobra > button')]
    .map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  ouvir(partes.join('. '));
}

// ---------- Ligações ----------
function ligar() {
  preferencias.ligar();
  ligarAviso();
  ligarPet();
  $('entrar').addEventListener('click', pedirLogin);
  $('ouvir-tela').addEventListener('click', ouvirTela);
  $('abrir-ajustes').addEventListener('click', () => abrirFolha('folha-ajustes'));
  $('fechar-ajustes').addEventListener('click', () => fecharFolha('folha-ajustes'));
  $('exportar').addEventListener('click', exportar);
  $('sair').addEventListener('click', sair);
  const versao = $('versao-app');   // página velha guardada pode não ter esta linha: o app não quebra por isso
  if (versao) versao.textContent = `Versão do app: ${self.VERSAO_APP || 'dev'}`;
  document.querySelectorAll('#abas .aba').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (momentoAberto()) fecharMomento(true);
      else if (folhaAtual()) fecharFolha();
      else if (mergulhoAberto()) fecharCartaoMergulho();   // no mergulho, Esc só fecha o cartão: sair é no botão "Sair"
      else if (estado.selecionando) limparSelecao();
      else if (estado.painel) fecharPainel();
      else if (estado.aba === 'tarefa') irPara(abaDeVolta);
      return;
    }
    atalho(e);
  });
  window.addEventListener('offline', () => mostrarEstado('Sem internet: o que mudar agora não salva', true));
  window.addEventListener('online', () => {
    mostrarEstado('Conectado');
    if (estado.usuario && !estado.carregadoEm) entrar(estado.usuario);   // voltou a internet: tenta de novo sozinho
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && versaoNova && !textoPelaMetade() && !mergulhoAberto()) { location.reload(); return; }
    if (document.visibilityState === 'visible') navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    if (document.visibilityState !== 'visible' || !estado.espacoId || folhaAtual() || momentoAberto() || mergulhoAberto()) return;
    if (Date.now() - estado.carregadoEm > RECARREGAR_DEPOIS_MS || hojeISO() !== estado.hoje) recarregar();
  });
}

let versaoNova = false;
const textoPelaMetade = () => [...document.querySelectorAll('input:not([type]), input[type=text], input[type=search], textarea')].some((c) => c.value.trim());

async function iniciar() {
  try { await comecar(); } catch (erro) {
    if (erro?.tempo) mostrarSemBanco(() => location.reload());   // o login nem respondeu: recarregar começa tudo de novo
    else mostrarErroAoAbrir(erro);
  }
}

async function comecar() {
  preferencias.aplicar();
  ligar();
  if ('serviceWorker' in navigator) {
    // Versão nova publicada: o service worker novo assume, e a página recarrega na próxima vez que ficar escondida,
    // sem nada digitado pela metade. 'none': a conferência da versão não usa a cópia de 10 min do navegador.
    const tinhaControle = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaControle) versaoNova = true; });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
  dados.iniciar();
  const { data } = await comTempo(dados.banco.auth.getSession());
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
  dados.banco.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT' && estado.usuario) { estado.usuario = null; mostrarEntrar(); } });
  if (data.session) await entrar(data.session.user);
  else mostrarEntrar();
}

iniciar();
