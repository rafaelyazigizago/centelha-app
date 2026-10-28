// Centelha · etiquetas com cadastro e cor (migração 0007; Rafael, 28/10: "A ideia de etiquetas do Vikunja também é muito boa.
// Eu posso criar as minhas e cadastrar"). As tarefas guardam o nome em tarefas.etiquetas, como sempre; o cadastro dá a cor
// e a lista de escolha. As de sistema (situação, Importante, Urgente, ideia) têm os seus botões e ficam de fora daqui.
// Nada se apaga: arquivar só tira das sugestões; a etiqueta continua nas tarefas.
import { PALETA, etiquetasEmUso, mesmoNome } from './calculos.js';
import * as dados from './dados.js';
import { estado, redesenhar, falha } from './estado.js';
import { $, el, abrirFolha, mostrarEstado, avisar } from './ui.js';
import { usavel } from './funcoes.js';

export const cadastroDe = (nome) => estado.etiquetas.find((x) => mesmoNome(x.nome, nome));
export const corDe = (nome) => (usavel('etiquetas') ? cadastroDe(nome)?.cor || null : null);
// Para escolher numa tarefa: as cadastradas ativas e as que já estão em uso, sem repetir.
export function sugestoes() {
  const nomes = estado.etiquetas.filter((x) => !x.arquivada).map((x) => x.nome);
  for (const { nome } of etiquetasEmUso(estado.tarefas)) if (!nomes.some((n) => mesmoNome(n, nome)) && !cadastroDe(nome)?.arquivada) nomes.push(nome);
  return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Cadastra (se ainda não existe) e devolve o cadastro. Uma etiqueta nova escrita numa tarefa também nasce aqui.
export async function garantirCadastro(nome, cor = null) {
  const ja = cadastroDe(nome);
  if (ja) return ja;
  const nova = await dados.criarEtiqueta(estado.espacoId, nome.trim(), cor);
  estado.etiquetas.push(nova);
  return nova;
}

// Uma etiqueta em forma de pílula, com a bolinha da cor
export const chipEtiqueta = (nome, extra = {}) => el('span', { classe: 'marca-t etiqueta', 'data-cor': corDe(nome) || null, ...extra }, '#' + nome);

// ---------- O cadastro (aba Grupos → Etiquetas) ----------
export function abrirCadastroEtiquetas() {
  desenhar();
  abrirFolha('folha-etiquetas');
}

function desenhar() {
  const uso = new Map(etiquetasEmUso(estado.tarefas).map((u) => [u.nome.toLocaleLowerCase('pt-BR'), u.total]));
  const totalDe = (nome) => uso.get(nome.trim().toLocaleLowerCase('pt-BR')) || 0;
  const ativas = estado.etiquetas.filter((x) => !x.arquivada).map((x) => x.nome);
  for (const { nome } of etiquetasEmUso(estado.tarefas)) if (!cadastroDe(nome)) ativas.push(nome);   // em uso, ainda sem cadastro
  ativas.sort((a, b) => totalDe(b) - totalDe(a) || a.localeCompare(b, 'pt-BR'));
  const arquivadas = estado.etiquetas.filter((x) => x.arquivada);

  const novaNome = el('input', { id: 'etq-nova', type: 'text', autocomplete: 'off', placeholder: 'ex.: contabilidade', maxlength: '40' });
  let novaCor = null;
  const corNova = el('div', {});
  const pintar = () => corNova.replaceChildren(paleta(novaCor, (cor) => { novaCor = cor; pintar(); }));
  pintar();
  const form = el('form', { classe: 'etq-nova', 'data-mantem-aviso': true },
    el('div', { classe: 'campo' }, el('label', { for: 'etq-nova' }, el('span', {}, 'Nova etiqueta')), novaNome),
    corNova,
    el('button', { type: 'submit', classe: 'btn' }, 'Cadastrar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = novaNome.value.replace(/\s+/g, ' ').trim().replace(/^#/, '');
    if (!nome) return;
    if (cadastroDe(nome)) { avisar(`"${nome}" já está cadastrada`); return; }
    await gravar(() => garantirCadastro(nome, novaCor), `Etiqueta cadastrada · ${nome}`);
  });

  $('folha-etiquetas').replaceChildren(el('div', { classe: 'miolo' },
    el('div', { classe: 'alca' }),
    el('h2', { id: 'titulo-etiquetas' }, 'Etiquetas'),
    el('p', { classe: 'ajuda' }, 'As suas etiquetas, com cor. As que já estão nas tarefas aparecem aqui; dê uma cor e elas ficam cadastradas.'),
    form,
    ativas.length ? el('ul', { classe: 'etq-lista' }, ativas.map((nome) => linhaEtiqueta(nome, totalDe(nome)))) : el('p', { classe: 'vazio' }, 'Nenhuma etiqueta ainda.'),
    arquivadas.length ? el('details', { classe: 'etq-arquivadas' }, el('summary', {}, `Arquivadas · ${arquivadas.length}`),
      el('ul', { classe: 'etq-lista' }, arquivadas.map((x) => el('li', {}, chipEtiqueta(x.nome),
        el('button', { type: 'button', classe: 'pilula', 'data-mantem-aviso': true, onclick: () => gravar(() => mudar(x, { arquivada: false }), `De volta · ${x.nome}`) }, 'Voltar a usar'))))) : null,
  ));
}

function linhaEtiqueta(nome, total) {
  const cad = cadastroDe(nome);
  return el('li', { 'data-etiqueta': nome },
    el('div', { classe: 'etq-topo' }, chipEtiqueta(nome), el('span', { classe: 'ajuda' }, total ? `${total} ${total === 1 ? 'aberta' : 'abertas'}` : 'nenhuma aberta'),
      cad ? el('button', { type: 'button', classe: 'pilula leve', 'data-mantem-aviso': true, onclick: () => gravar(() => mudar(cad, { arquivada: true }), `Arquivada · ${nome} (continua nas tarefas)`) }, 'Arquivar') : null),
    paleta(cad?.cor || null, (cor) => gravar(async () => {
      const c = cadastroDe(nome);
      if (c) await mudar(c, { cor });
      else await garantirCadastro(nome, cor);
    }, cor ? `Cor ${cor} · ${nome}` : `Sem cor · ${nome}`)));
}

// As 10 cores e "sem cor". Tocar na cor escolhida tira a cor. Também no visual das listas (listas.js).
export function paleta(atual, escolher) {
  return el('div', { classe: 'paleta', role: 'group', 'aria-label': 'Cor' }, PALETA.map((cor) => el('button', {
    type: 'button', classe: 'cor', 'data-cor': cor, 'data-mantem-aviso': true, 'aria-pressed': String(cor === atual), 'aria-label': `Cor ${cor}`, title: cor,
    onclick: () => escolher(cor === atual ? null : cor),
  })));
}

async function mudar(cad, patch) {
  const antes = { ...cad };
  Object.assign(cad, patch);
  try { await dados.mudarEtiqueta(cad.id, patch); } catch (erro) { Object.assign(cad, antes); throw erro; }
}

async function gravar(fazer, mensagem) {
  mostrarEstado('Salvando…');
  try {
    await fazer();
    mostrarEstado('Salvo ✓');
    avisar(mensagem);
  } catch (erro) { falha(erro); }
  desenhar();
  redesenhar();
}
