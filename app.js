// Centelha · app da fase 1A: entrar com Google, Hoje, Caixa de entrada, Ficou para trás,
// anotar rápido, feita e adiar com desfazer, ouvir. Regras de tela: docs/operacao/07-APP.md.
import { hojeISO, somarDias, rotuloDia, diaPorExtenso, interpretar } from './datas.js';

const SUPABASE_URL = 'https://hlvejnlirctodkvmjehj.supabase.co';
// Chave pública por desenho: só abre o que as regras por linha (RLS) do banco deixarem.
const CHAVE_PUBLICA = 'sb_publishable_B8VUf-oWJwakz9uBSXEeIA_TeSn9y0m';
const CAMPOS = 'id,titulo,notas,estado,dia,parte_do_dia,hora,area,etiquetas,prioridade_semana,vezes_adiada,criado_em';
const ORDEM_PARTE = { manha: 1, almoco: 2, tarde: 3, noite: 4 };
const NOME_PARTE = { manha: 'manhã', almoco: 'almoço', tarde: 'tarde', noite: 'noite' };
const RECARREGAR_DEPOIS_MS = 30 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const estado = {
  usuario: null,
  espacoId: null,
  tarefas: [],
  aba: 'hoje',
  aberta: null,          // id da tarefa com o detalhe aberto
  marcas: new Map(),     // id → aviso local ("vai para amanhã"); não vai para o banco
  ignorarData: false,
  carregadoEm: 0,
};
let banco;

function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'classe') n.className = v;
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) n.append(f);
  return n;
}

// ---------- Estado na tela ----------
function mostrarEstado(texto, erro = false) {
  const e = $('estado');
  e.textContent = texto;
  e.classList.toggle('erro', erro);
}

let temporizadorAviso;
function avisar(texto, desfazer) {
  const a = $('aviso');
  a.replaceChildren(el('span', {}, texto));
  if (desfazer) {
    a.append(el('button', { type: 'button', onclick: () => { a.hidden = true; desfazer(); } }, 'Desfazer'));
  }
  a.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { a.hidden = true; }, 8000);
}

function falhou(erro) {
  console.error(erro);
  mostrarEstado('Não salvou', true);
  avisar('Não salvou: sem internet ou o servidor não respondeu. Tente de novo.');
}

// ---------- Entrar ----------
async function iniciar() {
  const hoje = diaPorExtenso(hojeISO());
  $('hoje-extenso').textContent = hoje[0].toUpperCase() + hoje.slice(1);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!('speechSynthesis' in window)) $('ouvir-tela').hidden = true;

  banco = window.supabase.createClient(SUPABASE_URL, CHAVE_PUBLICA, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
  });
  const { data } = await banco.auth.getSession();
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
  banco.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') mostrarEntrar(); });

  if (data.session) await entrar(data.session.user);
  else mostrarEntrar();
}

function mostrarEntrar() {
  $('tela-entrar').hidden = false;
  $('tela-app').hidden = true;
  $('abas').hidden = true;
  mostrarEstado('');
}

async function pedirLogin() {
  $('erro-entrar').hidden = true;
  const { error } = await banco.auth.signInWithOAuth({
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
  $('tela-app').hidden = false;
  $('abas').hidden = false;
  mostrarEstado('Carregando…');
  const { data, error } = await banco.from('espacos').select('id')
    .eq('tipo', 'pessoal').eq('criado_por', usuario.id).single();
  if (error) { mostrarEstado('Não carregou', true); avisar('Não deu para abrir o seu espaço. Recarregue a página.'); return; }
  estado.espacoId = data.id;
  await carregar();
}

// ---------- Dados ----------
async function carregar() {
  const { data, error } = await banco.from('tarefas').select(CAMPOS)
    .eq('espaco_id', estado.espacoId).eq('estado', 'aberta')
    .order('dia', { ascending: true, nullsFirst: false }).order('criado_em', { ascending: true });
  if (error) { mostrarEstado('Não carregou', true); avisar('Não deu para trazer as tarefas. Recarregue a página.'); return; }
  estado.tarefas = data.map((t) => ({ ...t, secao: secaoDe(t) }));
  estado.marcas.clear();
  estado.carregadoEm = Date.now();
  mostrarEstado('Salvo ✓');
  desenhar();
}

// A seção é fixada ao carregar: nada muda de lugar sozinho enquanto a tela está aberta.
function secaoDe(t) {
  const hoje = hojeISO();
  if (t.prioridade_semana) return 'prioridade';
  if (!t.dia) return 'caixa';
  if (t.dia === hoje) return 'hoje';
  if (t.dia < hoje) return 'para-tras';
  if (t.dia === somarDias(hoje, 1)) return 'amanha';
  return 'depois';
}

async function mudar(t, patch, mensagem, desfazerPatch, marca) {
  const antes = { ...t };
  Object.assign(t, patch);
  if (marca) estado.marcas.set(t.id, marca); else estado.marcas.delete(t.id);
  desenhar();
  mostrarEstado('Salvando…');
  const { error } = await banco.from('tarefas').update(patch).eq('id', t.id);
  if (error) {
    Object.assign(t, antes);
    estado.marcas.delete(t.id);
    desenhar();
    falhou(error);
    return;
  }
  mostrarEstado('Salvo ✓');
  if (mensagem) avisar(mensagem, desfazerPatch ? () => mudar(t, desfazerPatch, 'Desfeito') : null);
}

function marcarFeita(t, feita) {
  if (feita) mudar(t, { estado: 'feita' }, 'Feita ✓', { estado: 'aberta', feita_em: null, feita_por: null });
  else mudar(t, { estado: 'aberta', feita_em: null, feita_por: null }, 'Voltou a ficar aberta');
}

function moverPara(t, dia) {
  const desfazer = { dia: t.dia, vezes_adiada: t.vezes_adiada };
  const rotulo = dia ? rotuloDia(dia) : 'Caixa de entrada';
  mudar(t, { dia }, `Vai para ${dia ? rotulo.toLowerCase() : 'a Caixa de entrada'}`, desfazer, `→ ${rotulo}`);
}

async function anotar(evento) {
  evento.preventDefault();
  const campo = $('texto-anotar');
  const texto = campo.value.trim();
  if (!texto) return;
  const lido = interpretar(texto);
  const dia = estado.ignorarData ? null : lido.dia;
  const titulo = estado.ignorarData
    ? texto.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim()
    : lido.titulo;
  if (!titulo) return;

  mostrarEstado('Salvando…');
  const { data, error } = await banco.from('tarefas')
    .insert({ espaco_id: estado.espacoId, titulo, dia, etiquetas: lido.etiquetas })
    .select(CAMPOS).single();
  if (error) { falhou(error); return; }

  const nova = { ...data, secao: secaoDe(data), nova: true };
  estado.tarefas.unshift(nova);
  campo.value = '';
  estado.ignorarData = false;
  mostrarPrevia();
  mostrarEstado('Salvo ✓');
  const destino = dia ? rotuloDia(dia) : 'Caixa de entrada';
  avisar(`Anotado ✓ · ${destino}`, () => mudar(nova, { estado: 'cancelada' }, 'Desfeito'));
  if (nova.secao === 'caixa' && estado.aba !== 'caixa') estado.aba = 'caixa';
  else if (nova.secao === 'hoje' && estado.aba !== 'hoje') estado.aba = 'hoje';
  desenhar();
  campo.focus();
}

function mostrarPrevia() {
  const p = $('previa');
  const texto = $('texto-anotar').value.trim();
  if (!texto) { estado.ignorarData = false; p.replaceChildren(); return; }
  const lido = interpretar(texto);
  const partes = [];
  if (lido.dia && !estado.ignorarData) {
    partes.push(`Vai para: ${rotuloDia(lido.dia)}`);
    partes.push(el('button', { type: 'button', classe: 'leve', onclick: () => { estado.ignorarData = true; mostrarPrevia(); } },
      `"${lido.palavraData}" não é data`));
  } else {
    partes.push('Vai para: Caixa de entrada');
    if (lido.dia) {
      partes.push(el('button', { type: 'button', classe: 'leve', onclick: () => { estado.ignorarData = false; mostrarPrevia(); } },
        `Usar "${lido.palavraData}" como data`));
    }
  }
  if (lido.etiquetas.length) partes.splice(1, 0, ` · ${lido.etiquetas.map((e) => `#${e}`).join(' ')}`);
  p.replaceChildren(...partes);
}

// ---------- Desenho ----------
function ordenarDia(a, b) {
  if (a.nova !== b.nova) return a.nova ? -1 : 1;
  const pa = ORDEM_PARTE[a.parte_do_dia] ?? 9;
  const pb = ORDEM_PARTE[b.parte_do_dia] ?? 9;
  if (pa !== pb) return pa - pb;
  return (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.criado_em.localeCompare(b.criado_em);
}

function desenhar() {
  const lista = $('lista');
  const da = (secao) => estado.tarefas.filter((t) => t.secao === secao && t.estado !== 'cancelada');
  const blocos = [];

  if (estado.aba === 'hoje') {
    const prioridades = da('prioridade').sort(ordenarDia);
    if (prioridades.length) blocos.push(secao('Prioridades da semana', prioridades));
    blocos.push(secao('Hoje', da('hoje').sort(ordenarDia), 'Nada marcado para hoje. Anote acima ou traga algo da Caixa de entrada.'));
    const amanha = da('amanha').sort(ordenarDia);
    if (amanha.length) blocos.push(secao('Amanhã', amanha));
    const depois = da('depois').sort((a, b) => a.dia.localeCompare(b.dia) || ordenarDia(a, b));
    if (depois.length) {
      blocos.push(el('details', { classe: 'para-tras' },
        el('summary', {}, 'Próximos dias', el('span', { classe: 'n' }, `${depois.length}`)),
        listaDe(depois)));
    }
    const paraTras = da('para-tras').sort((a, b) => (b.dia.localeCompare(a.dia)) || ordenarDia(a, b));
    if (paraTras.length) {
      blocos.push(el('details', { classe: 'para-tras' },
        el('summary', {}, `Ficou para trás`, el('span', { classe: 'n' }, `${paraTras.length}`)),
        el('p', { classe: 'ajuda' }, 'Sem pressa. Escolha o que volta para hoje e deixe o resto aqui.'),
        listaDe(paraTras)));
    }
  } else {
    blocos.push(secao('Caixa de entrada', da('caixa').sort(ordenarDia),
      'Vazia. O que você anotar sem dia aparece aqui.',
      'Tudo o que você anotou sem dia. Dê um dia com um toque ou deixe aqui.'));
  }
  blocos.push(el('p', { classe: 'ajuda' }, el('button', { type: 'button', classe: 'leve', onclick: sair }, 'Sair da conta')));
  lista.replaceChildren(...blocos);

  for (const b of document.querySelectorAll('#abas [data-aba]')) {
    b.setAttribute('aria-pressed', String(b.dataset.aba === estado.aba));
  }
}

function secao(titulo, tarefas, vazio, ajuda) {
  return el('section', {},
    el('h2', {}, titulo, el('span', { classe: 'n' }, String(tarefas.length))),
    ajuda ? el('p', { classe: 'ajuda' }, ajuda) : null,
    tarefas.length ? listaDe(tarefas) : el('p', { classe: 'vazio' }, vazio || ''));
}

function listaDe(tarefas) {
  return el('ol', { classe: 'tarefas' }, tarefas.map(itemDe));
}

function itemDe(t) {
  const hoje = hojeISO();
  const feita = t.estado === 'feita';
  const marca = estado.marcas.get(t.id);
  const aberta = estado.aberta === t.id;

  const marcas = [];
  if (t.parte_do_dia) marcas.push(el('span', { classe: `marca parte ${t.parte_do_dia}` }, NOME_PARTE[t.parte_do_dia]));
  if (t.dia && t.dia !== hoje && !marca) marcas.push(el('span', { classe: 'marca' }, rotuloDia(t.dia)));
  if (t.area) marcas.push(el('span', { classe: 'marca' }, t.area));
  for (const e of (t.etiquetas || []).slice(0, 3)) marcas.push(el('span', { classe: 'marca' }, `#${e}`));
  if (marca) marcas.push(el('span', { classe: 'marca aviso-item' }, marca));

  // O botão de um toque muda com a seção: o mais provável fica à vista.
  const umToque = t.secao === 'hoje' || (t.secao === 'prioridade' && t.dia === hoje)
    ? el('button', { type: 'button', classe: 'leve', onclick: () => moverPara(t, somarDias(hoje, 1)) }, 'Amanhã')
    : el('button', { type: 'button', classe: 'leve', onclick: () => moverPara(t, hoje) }, 'Hoje');

  const alternar = () => { estado.aberta = aberta ? null : t.id; desenhar(); };
  const titulo = el('div', {
    classe: 'titulo', role: 'button', tabindex: '0', 'aria-expanded': String(aberta),
    onclick: alternar, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } },
  }, t.titulo);

  return el('li', { classe: `tarefa${feita ? ' feita' : ''}${marca ? ' saiu' : ''}${t.secao === 'prioridade' ? ' prioridade' : ''}` },
    el('input', {
      type: 'checkbox', checked: feita, 'aria-label': `Feita: ${t.titulo}`,
      onchange: (e) => marcarFeita(t, e.target.checked),
    }),
    el('div', { classe: 'corpo' },
      titulo,
      marcas.length ? el('div', { classe: 'marcas' }, marcas) : null,
      el('div', { classe: 'acoes-item' },
        umToque,
        el('button', { type: 'button', classe: 'leve', 'aria-expanded': String(aberta), onclick: alternar }, aberta ? 'Fechar' : 'Mais')),
      aberta ? detalheDe(t) : null));
}

function detalheDe(t) {
  const hoje = hojeISO();
  const escolherDia = el('input', {
    type: 'date', 'aria-label': 'Escolher outro dia',
    onchange: (e) => { if (e.target.value) moverPara(t, e.target.value); },
  });
  return el('div', { classe: 'detalhe' },
    t.notas ? el('p', {}, t.notas) : el('p', { classe: 'ajuda' }, 'Sem anotações.'),
    el('div', { classe: 'acoes-item' },
      el('button', { type: 'button', classe: 'leve', onclick: () => ouvir(`${t.titulo}. ${t.notas || ''}`) }, '🔊 Ouvir'),
      t.dia !== hoje ? el('button', { type: 'button', classe: 'leve', onclick: () => moverPara(t, hoje) }, 'Hoje') : null,
      el('button', { type: 'button', classe: 'leve', onclick: () => moverPara(t, somarDias(hoje, 1)) }, 'Amanhã'),
      t.dia ? el('button', { type: 'button', classe: 'leve', onclick: () => moverPara(t, null) }, 'Sem data') : null,
      el('label', { classe: 'ajuda' }, 'Outro dia: ', escolherDia)));
}

// ---------- Ouvir ----------
function ouvir(texto) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = 'pt-BR';
  speechSynthesis.speak(fala);
}

function ouvirTela() {
  const partes = [...document.querySelectorAll('#lista h2, #lista summary, #lista li .titulo')]
    .map((n, i) => n.textContent);
  ouvir(partes.join('. '));
}

async function sair() {
  await banco.auth.signOut();
  mostrarEntrar();
}

// ---------- Ligações ----------
$('entrar').addEventListener('click', pedirLogin);
$('anotar').addEventListener('submit', anotar);
$('texto-anotar').addEventListener('input', () => { estado.ignorarData = false; mostrarPrevia(); });
$('ouvir-tela').addEventListener('click', ouvirTela);
for (const b of document.querySelectorAll('#abas [data-aba]')) {
  b.addEventListener('click', () => { estado.aba = b.dataset.aba; estado.aberta = null; desenhar(); });
}
window.addEventListener('offline', () => mostrarEstado('Sem internet: o que anotar agora não salva', true));
window.addEventListener('online', () => mostrarEstado('Conectado'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.espacoId && Date.now() - estado.carregadoEm > RECARREGAR_DEPOIS_MS) carregar();
});

iniciar();
