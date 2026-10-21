// Centelha · peças de tela reaproveitadas: criar elementos, a lâmpada, faíscas, aviso com desfazer, folhas, "Salvo ✓" e ouvir.
export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'classe') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) n.append(f);
  return n;
}

export const icone = (nome, classe = '') => `<svg class="${classe}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
export const iconeEl = (nome, classe = '') => el('span', { html: icone(nome, classe), style: 'display:contents' });

const VIDRO = '<circle class="brilho" cx="15" cy="13" r="15" fill="url(#g-brilho)" style="color:var(--luz)"/>' +
  '<path class="vidro" d="M15 2a10.5 10.5 0 0 0-6 19.2c1.2.9 1.8 2.1 1.8 3.5V27h8.4v-2.3c0-1.4.6-2.6 1.8-3.5A10.5 10.5 0 0 0 15 2z"/>' +
  '<rect class="base" x="10.6" y="28.3" width="8.8" height="2.6" rx="1.2"/><rect class="base" x="11.8" y="32" width="6.4" height="2.6" rx="1.2"/>';
const OK = '<g class="ok"><circle cx="23" cy="31" r="6"/><path d="M20.3 31.1l1.8 1.8 3.5-3.6"/></g>';

// A lâmpada que serve de caixinha de marcar. Acesa = feita (com o ✓, para não depender só da cor).
export function lampada(acesa, comOk = true) {
  return `<svg viewBox="0 0 30 40" class="lamp${acesa ? ' acesa' : ''}" aria-hidden="true">${VIDRO}${comOk ? OK : ''}</svg>`;
}
export const lampadaInterna = (acesa, x, y, l, a) =>
  `<svg x="${x}" y="${y}" width="${l}" height="${a}" viewBox="0 0 30 40" class="lamp${acesa ? ' acesa' : ''}">${VIDRO}</svg>`;

export const movimento = () => document.body.dataset.movimento || 'vivo';

export function reiniciar(elemento, classe) {
  elemento.classList.remove(classe);
  void elemento.offsetWidth;
  elemento.classList.add(classe);
}

export function fagulhas(alvo) {
  if (movimento() !== 'vivo') return;
  const r = alvo.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2.4;
  for (let i = 0; i < 7; i++) {
    const f = el('span', { classe: 'fagulha' });
    f.style.left = cx - 3 + 'px';
    f.style.top = cy - 3 + 'px';
    document.body.append(f);
    const ang = (-90 + (i - 3) * 28) * Math.PI / 180, dist = 26 + Math.random() * 18;
    f.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(.3)`, opacity: 0 }],
      { duration: 520 + Math.random() * 160, easing: 'cubic-bezier(.2,.8,.3,1)' },
    ).onfinish = () => f.remove();
  }
}

export function vibrar() {
  if (document.body.dataset.vibrar === 'sim' && navigator.vibrate) navigator.vibrate(18);
}

export function contar(elemento, de, ate, ms = 500) {
  if (movimento() === 'parado' || de === ate) { elemento.textContent = ate; return; }
  const inicio = performance.now();
  const passo = (agora) => {
    const p = Math.min(1, (agora - inicio) / ms);
    elemento.textContent = Math.round(de + (ate - de) * p);
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// ---------- Estado ("Salvo ✓") ----------
export function mostrarEstado(texto, erro = false) {
  const e = $('estado');
  e.textContent = texto;
  e.classList.toggle('erro', erro);
  if (texto === 'Salvo ✓') reiniciar(e, 'pulso');
}

// ---------- Aviso com desfazer: fica até a próxima ação, nunca some por tempo ----------
let desfazerAtual = null;
export function avisar(texto, desfazer) {
  $('recado-texto').textContent = texto;
  desfazerAtual = desfazer || null;
  $('recado-desfazer').hidden = !desfazer;
  $('recado').hidden = false;
  void $('recado').offsetWidth;   // força o desenho antes de animar (não depende de quadro de animação)
  $('recado').classList.add('aberto');
}
export function fecharAviso() {
  $('recado').classList.remove('aberto');
}
export function ligarAviso() {
  $('recado-desfazer').addEventListener('click', () => {
    fecharAviso();
    const d = desfazerAtual;
    desfazerAtual = null;
    if (d) d();
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#recado') || e.target.closest('[data-mantem-aviso]')) return;
    fecharAviso();
  });
}

// ---------- Folhas que sobem ----------
let folhaAberta = null, aoFecharFolha = null;
export function abrirFolha(id, aoFechar) {
  const veu = $('veu'), f = $(id);
  folhaAberta = id;
  aoFecharFolha = aoFechar || null;
  veu.hidden = false;
  f.hidden = false;
  void f.offsetWidth;
  veu.classList.add('aberto');
  f.classList.add('aberta');
  veu.onclick = () => fecharFolha(id);
  const foco = f.querySelector('button, textarea, input');
  setTimeout(() => foco?.focus({ preventScroll: true }), 50);
}
export function fecharFolha(id = folhaAberta) {
  if (!id) return;
  const veu = $('veu'), f = $(id);
  veu.classList.remove('aberto');
  f.classList.remove('aberta');
  folhaAberta = null;
  const depois = aoFecharFolha;
  aoFecharFolha = null;
  if (depois) depois();
  setTimeout(() => { veu.hidden = true; f.hidden = true; }, movimento() === 'parado' ? 0 : 420);
}
export const folhaAtual = () => folhaAberta;

// ---------- Ouvir ----------
export function ouvir(texto) {
  if (!('speechSynthesis' in window) || !texto) return;
  speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = 'pt-BR';
  speechSynthesis.speak(fala);
}
