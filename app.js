// Centelha · o começo: entrar com Google, carregar, as abas, "Do seu jeito" e os atalhos.
// Regras de tela: docs/operacao/07-APP.md. Visual e movimento: docs/PROPOSTA-VISUAL-2026-10-21.md.
import { hojeISO, deISO } from './datas.js';
import { segundaDaSemana } from './calculos.js';
import * as dados from './dados.js';
import { estado, aoMudar, fixarSecoes, falha } from './estado.js';
import { desenharHoje, desenharSemana, desenharCaixa, aoAbrirTarefa } from './telas.js';
import { abrirTarefa, fecharTarefa, atualizarTarefa, aoVoltar, textoParaOuvir, fecharMomento, momentoAberto } from './tela-tarefa.js';
import { desenharDiario, salvarAgora, esquecerDiario, pararDeOuvir } from './tela-diario.js';
import * as preferencias from './preferencias.js';
import { $, el, mostrarEstado, avisar, fecharAviso, ligarAviso, abrirFolha, fecharFolha, folhaAtual, ouvir, reiniciar, movimento } from './ui.js';

const ABAS = ['hoje', 'semana', 'caixa', 'diario'];
const NOMES = { hoje: 'Hoje', semana: 'Semana', caixa: 'Caixa', diario: 'Diário' };
const RECARREGAR_DEPOIS_MS = 30 * 60 * 1000;
let abaDeVolta = 'hoje';

// ---------- Desenhar a tela atual ----------
function desenharAtual(entrando = false) {
  if (estado.aba === 'tarefa') { atualizarTarefa(); return; }
  if (estado.aba === 'hoje') desenharHoje();
  else if (estado.aba === 'semana') desenharSemana(entrando);
  else if (estado.aba === 'caixa') desenharCaixa();
  else if (estado.aba === 'diario') desenharDiario();
  estado.recem = null;   // a lâmpada nova já acendeu na lista
}
aoMudar(() => desenharAtual(false));

function irPara(aba, { deLado = false } = {}) {
  if (estado.aba === 'diario' && aba !== 'diario') { pararDeOuvir(); salvarAgora(); }
  if (estado.aba === 'tarefa' && aba !== 'tarefa') fecharTarefa();
  estado.aba = aba;
  for (const nome of [...ABAS, 'tarefa']) $(`tela-${nome}`).hidden = nome !== aba;
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

aoAbrirTarefa((t) => {
  if (estado.aba !== 'tarefa') abaDeVolta = estado.aba;
  fecharAviso();
  abrirTarefa(t, NOMES[abaDeVolta]);
  irPara('tarefa', { deLado: true });
});
aoVoltar(() => irPara(abaDeVolta));

// ---------- Entrar ----------
function mostrarEntrar() {
  for (const nome of [...ABAS, 'tarefa']) $(`tela-${nome}`).hidden = true;
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
  mostrarEstado('Carregando…');
  try {
    estado.espacoId = await dados.espacoPessoal(usuario.id);
  } catch (erro) {
    console.error(erro);
    mostrarEstado('Não carregou', true);
    avisar('Não deu para abrir o seu espaço. Recarregue a página.');
    return;
  }
  if (await carregar()) irPara('hoje');
}

// Abertas + feitas desde segunda (para as luzes do dia e o varal da semana).
async function carregar() {
  const desde = deISO(segundaDaSemana(hojeISO())).toISOString();
  try {
    estado.tarefas = await dados.carregarTarefas(estado.espacoId, desde);
  } catch (erro) {
    console.error(erro);
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
  $('entrar').addEventListener('click', pedirLogin);
  $('ouvir-tela').addEventListener('click', ouvirTela);
  $('abrir-ajustes').addEventListener('click', () => abrirFolha('folha-ajustes'));
  $('fechar-ajustes').addEventListener('click', () => fecharFolha('folha-ajustes'));
  $('exportar').addEventListener('click', exportar);
  $('sair').addEventListener('click', sair);
  document.querySelectorAll('#abas .aba').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (momentoAberto()) fecharMomento(true);
    else if (folhaAtual()) fecharFolha();
    else if (estado.aba === 'tarefa') irPara(abaDeVolta);
  });
  window.addEventListener('offline', () => mostrarEstado('Sem internet: o que mudar agora não salva', true));
  window.addEventListener('online', () => mostrarEstado('Conectado'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !estado.espacoId || folhaAtual() || momentoAberto()) return;
    if (Date.now() - estado.carregadoEm > RECARREGAR_DEPOIS_MS || hojeISO() !== estado.hoje) recarregar();
  });
}

async function iniciar() {
  preferencias.aplicar();
  ligar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  dados.iniciar();
  const { data } = await dados.banco.auth.getSession();
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
  dados.banco.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT' && estado.usuario) { estado.usuario = null; mostrarEntrar(); } });
  if (data.session) await entrar(data.session.user);
  else mostrarEntrar();
}

iniciar();
