// Centelha · "Do seu jeito": tema, cor da luz, letra, tamanho, movimento e vibração.
// Guardado neste aparelho (localStorage). Padrão: Automático, Ouro, Atkinson, Vivo (Calmo se o aparelho pedir menos movimento), sem vibração.
import { $, el } from './ui.js';

export const LUZES = {
  Ouro: ['#F5B841', '#8A6416'], 'Âmbar': ['#FF9F43', '#8F4E0F'], Folha: ['#5BD69A', '#22704A'],
  'Céu': ['#6CC4F5', '#24607F'], 'Lilás': ['#B9A6FF', '#5845A8'], Rosa: ['#FF9EC4', '#93415F'],
};

const ler = (k, padrao) => { try { return localStorage.getItem('centelha-' + k) ?? padrao; } catch { return padrao; } };
const guardar = (k, v) => { try { localStorage.setItem('centelha-' + k, v); } catch { /* sem armazenamento: vale só nesta abertura */ } };

export const prefs = {
  movimento: ler('movimento', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'calmo' : 'vivo'),
  tema: ler('tema', 'auto'),
  luz: ler('luz', 'Ouro'),
  letra: ler('letra', 'atkinson'),
  tamanho: Number(ler('tamanho', '100')),
  vibrar: ler('vibrar', 'nao'),
};

export const temaEscuroAgora = () => {
  if (prefs.tema === 'escuro') return true;
  if (prefs.tema === 'claro') return false;
  const h = new Date().getHours();
  return h < 6 || h >= 18;
};

export function aplicar() {
  const raiz = document.documentElement, corpo = document.body;
  raiz.dataset.tema = temaEscuroAgora() ? 'noite' : 'dia';
  const [luz, sombra] = LUZES[prefs.luz] || LUZES.Ouro;
  raiz.style.setProperty('--luz', luz);
  raiz.style.setProperty('--luz-sombra', sombra);
  raiz.style.setProperty('--escala', prefs.tamanho + '%');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', temaEscuroAgora() ? '#0E1626' : '#F8F5EE');
  corpo.classList.remove('mov-vivo', 'mov-calmo', 'mov-parado', 'letra-lexend', 'letra-aparelho');
  corpo.classList.add('mov-' + prefs.movimento);
  if (prefs.letra !== 'atkinson') corpo.classList.add('letra-' + prefs.letra);
  corpo.dataset.movimento = prefs.movimento;
  corpo.dataset.vibrar = prefs.vibrar;
  marcar();
  estrelas();
}

function marcarSegmento(id, valor) {
  const seg = $(id);
  if (!seg) return;
  [...seg.querySelectorAll('button')].forEach((b, i) => {
    const sim = b.dataset.v === valor;
    b.setAttribute('aria-pressed', String(sim));
    if (sim) seg.querySelector('.marcador').style.transform = `translateX(calc(${i * 100}% + ${i * 6}px))`;
  });
}

function marcar() {
  marcarSegmento('seg-movimento', prefs.movimento);
  marcarSegmento('seg-tema', prefs.tema);
  marcarSegmento('seg-letra', prefs.letra);
  document.querySelectorAll('#cores .cor').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.luz)));
  if ($('tamanho')) $('tamanho').value = prefs.tamanho;
  if ($('vibrar')) $('vibrar').checked = prefs.vibrar === 'sim';
}

function estrelas() {
  const ceu = $('ceu');
  if (!ceu) return;
  ceu.replaceChildren();
  if (!temaEscuroAgora() || prefs.movimento === 'parado') return;
  for (let i = 0; i < 36; i++) {
    const s = el('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 65 + '%';
    ceu.append(s);
    if (prefs.movimento === 'vivo') {
      s.animate([{ opacity: .2 }, { opacity: .9 }, { opacity: .2 }], { duration: 3000 + Math.random() * 4000, iterations: Infinity, delay: Math.random() * 3000 });
    }
  }
}

export function ligar() {
  for (const [id, chave] of [['seg-movimento', 'movimento'], ['seg-tema', 'tema'], ['seg-letra', 'letra']]) {
    $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      prefs[chave] = b.dataset.v;
      guardar(chave, b.dataset.v);
      aplicar();
    }));
  }
  $('cores').replaceChildren(...Object.entries(LUZES).map(([nome, [cor]]) => {
    const b = el('button', { type: 'button', classe: 'cor', 'data-v': nome, 'aria-label': `Luz ${nome}` }, el('span'), nome);
    b.style.setProperty('--c', cor);
    b.addEventListener('click', () => { prefs.luz = nome; guardar('luz', nome); aplicar(); });
    return b;
  }));
  $('tamanho').addEventListener('input', (e) => { prefs.tamanho = Number(e.target.value); guardar('tamanho', e.target.value); aplicar(); });
  $('vibrar').addEventListener('change', (e) => { prefs.vibrar = e.target.checked ? 'sim' : 'nao'; guardar('vibrar', prefs.vibrar); aplicar(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') aplicar(); });
}
