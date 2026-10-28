// Centelha · o visual de cada grupo e de cada lista: emoji e cor (migração 0007; Rafael, 28/10, sobre as listas do To Do:
// "aceitam mudança de cores para cada lista, além de emojis"). O grupo usa subgrupo vazio; a lista, grupo + subgrupo.
// Aparece no menu do notebook, na aba Grupos e no título da lista. "Voltar ao padrão" tira os dois (nada se apaga).
import * as dados from './dados.js';
import { estado, redesenhar, falha } from './estado.js';
import { $, el, abrirFolha, mostrarEstado, avisar } from './ui.js';
import { paleta } from './etiquetas.js';

// Os emojis do To Do de Rafael (print de 28/10) e mais alguns
const SUGESTOES = ['💪', '🖥️', '❤️', '💫', '💡', '⚒️', '🛒', '🔐', '🏢', '📚', '💼', '🏠', '🌱', '🎯', '💰', '✈️', '🧠', '🎨'];

const achar = (area, sub) => estado.listas.find((x) => x.area === area && x.subgrupo === sub) || null;
export const visualDoGrupo = (area) => (area ? achar(area, '') : null);
// "Sem subgrupo" não tem visual próprio (e não pega o do grupo)
export const visualDaLista = (area, subgrupo) => (area && subgrupo ? achar(area, subgrupo) : null);
const visualDe = (area, subgrupo) => (subgrupo ? visualDaLista(area, subgrupo) : visualDoGrupo(area));
// O nome com o emoji na frente, quando houver
export const comEmoji = (nome, v) => (v?.emoji ? `${v.emoji} ${nome}` : nome);

// Só o primeiro emoji (ou símbolo) do que foi escrito
function primeiro(texto) {
  const limpo = String(texto || '').trim();
  if (!limpo) return null;
  const pedaco = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(limpo)][0].segment : [...limpo][0];
  return [...pedaco].length <= 16 ? pedaco : null;
}

export function abrirVisual(area, subgrupo = null) {
  desenhar(area, subgrupo);
  abrirFolha('folha-visual');
}

function desenhar(area, subgrupo) {
  const v = visualDe(area, subgrupo);
  const nome = subgrupo ?? area;
  const escrito = el('input', { id: 'visual-emoji', type: 'text', autocomplete: 'off', placeholder: 'ou cole um emoji', 'aria-label': 'Outro emoji' });
  escrito.addEventListener('change', () => { const e = primeiro(escrito.value); if (e) salvar(area, subgrupo, { emoji: e }); });
  $('folha-visual').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('h2', { id: 'titulo-visual' }, el('span', { classe: 'visual-previa', 'data-cor': v?.cor || null }, v?.emoji ? `${v.emoji} ${nome}` : nome)),
    el('p', { classe: 'ajuda' }, subgrupo ? `Lista do grupo ${area}` : 'O grupo inteiro'),
    el('p', { classe: 'rotulo' }, 'emoji'),
    el('div', { classe: 'emojis', role: 'group', 'aria-label': 'Emoji' }, SUGESTOES.map((e) => el('button', {
      type: 'button', classe: 'emoji', 'data-mantem-aviso': true, 'aria-pressed': String(v?.emoji === e), 'aria-label': `Emoji ${e}`,
      onclick: () => salvar(area, subgrupo, { emoji: v?.emoji === e ? null : e }),
    }, e))),
    el('div', { classe: 'campo' }, escrito),
    el('p', { classe: 'rotulo' }, 'cor'),
    paleta(v?.cor || null, (cor) => salvar(area, subgrupo, { cor })),
    v && (v.emoji || v.cor)
      ? el('button', { type: 'button', classe: 'btn claro grande', style: 'margin-top:16px', 'data-mantem-aviso': true, onclick: () => salvar(area, subgrupo, { emoji: null, cor: null }) }, 'Voltar ao padrão')
      : null,
  ));
}

async function salvar(area, subgrupo, patch) {
  mostrarEstado('Salvando…');
  const v = visualDe(area, subgrupo);
  try {
    if (v) {
      const antes = { ...v };
      Object.assign(v, patch);
      try { await dados.mudarLista(v.id, patch); } catch (erro) { Object.assign(v, antes); throw erro; }
    } else estado.listas.push(await dados.criarLista(estado.espacoId, area, subgrupo, patch));
    mostrarEstado('Salvo ✓');
    avisar(patch.emoji === null && patch.cor === null ? `Padrão de volta · ${subgrupo ?? area}` : `Visual salvo · ${subgrupo ?? area}`);
  } catch (erro) { falha(erro); }
  desenhar(area, subgrupo);
  redesenhar();
}
