// Centelha · o estado do app e as ações que mudam tarefas: tudo muda na tela na hora, grava no banco e pode ser desfeito.
import { hojeISO, rotuloDia, interpretar } from './datas.js';
import { secaoDe } from './calculos.js';
import * as dados from './dados.js';
import { avisar, mostrarEstado, fagulhas, vibrar } from './ui.js';

export const estado = {
  usuario: null,
  espacoId: null,
  tarefas: [],
  hoje: hojeISO(),
  secoes: new Map(),   // id → seção fixada ao carregar (nada muda de lugar sozinho)
  marcas: new Map(),   // id → aviso local, como "→ Amanhã" (não vai para o banco)
  lentes: new Set(),
  aba: 'hoje',
  tarefaAberta: null,
  recem: null,         // id da lâmpada que acabou de acender
  carregadoEm: 0,
};

const ouvintes = new Set();
export const aoMudar = (f) => ouvintes.add(f);
export const redesenhar = () => ouvintes.forEach((f) => f());

export function fixarSecoes() {
  estado.hoje = hojeISO();
  estado.secoes = new Map(estado.tarefas.map((t) => [t.id, secaoDe(t, estado.hoje)]));
  estado.marcas.clear();
}
export const secao = (t) => estado.secoes.get(t.id) ?? secaoDe(t, estado.hoje);

function falhou(erro) {
  console.error(erro);
  mostrarEstado('Não salvou', true);
  avisar('Não salvou: sem internet ou o servidor não respondeu. Tente de novo.');
}

// Muda campos de uma tarefa: na tela primeiro, depois no banco; volta tudo se o banco recusar.
export async function mudar(t, patch, { mensagem, desfazer, marca } = {}) {
  const antes = Object.fromEntries(Object.keys(patch).map((k) => [k, t[k]]));
  Object.assign(t, patch);
  if (marca) estado.marcas.set(t.id, marca);
  redesenhar();
  mostrarEstado('Salvando…');
  try {
    await dados.mudarTarefa(t.id, patch);
  } catch (erro) {
    Object.assign(t, antes);
    estado.marcas.delete(t.id);
    redesenhar();
    falhou(erro);
    return false;
  }
  mostrarEstado('Salvo ✓');
  if (mensagem) avisar(mensagem, desfazer ? () => { estado.marcas.delete(t.id); mudar(t, desfazer, { mensagem: 'Desfeito' }); } : null);
  return true;
}

export function alternarFeita(t, botao) {
  if (t.estado !== 'feita') {
    estado.recem = t.id;   // a lâmpada nova nasce acendendo (a tela é redesenhada)
    if (botao) fagulhas(botao);
    vibrar();
    return mudar(t, { estado: 'feita', feita_em: new Date().toISOString() }, {
      mensagem: `Acesa · ${t.titulo}`, desfazer: { estado: 'aberta', feita_em: null, feita_por: null },
    });
  }
  return mudar(t, { estado: 'aberta', feita_em: null, feita_por: null }, { mensagem: `Apagada · ${t.titulo}` });
}

export function moverPara(t, dia) {
  const rotulo = dia ? rotuloDia(dia) : 'Caixa de entrada';
  return mudar(t, { dia }, {
    mensagem: `Vai para ${dia ? rotulo.toLowerCase() : 'a Caixa de entrada'} · ${t.titulo}`,
    desfazer: { dia: t.dia, vezes_adiada: t.vezes_adiada },
    marca: `→ ${rotulo}`,
  });
}

// Recomeçar: traz várias de "Ficou para trás" para hoje, de uma vez, com um desfazer só.
export async function recomecar(lista) {
  const antes = lista.map((t) => [t, t.dia, t.vezes_adiada]);
  for (const t of lista) { t.dia = estado.hoje; estado.marcas.set(t.id, '→ Hoje'); }
  redesenhar();
  mostrarEstado('Salvando…');
  try {
    for (const t of lista) await dados.mudarTarefa(t.id, { dia: estado.hoje });
  } catch (erro) {
    for (const [t, dia] of antes) { t.dia = dia; estado.marcas.delete(t.id); }
    redesenhar();
    falhou(erro);
    return;
  }
  mostrarEstado('Salvo ✓');
  avisar(`${lista.length} voltaram para hoje`, async () => {
    for (const [t, dia, vezes] of antes) { t.dia = dia; estado.marcas.delete(t.id); }
    redesenhar();
    try { for (const [t, dia, vezes] of antes) await dados.mudarTarefa(t.id, { dia, vezes_adiada: vezes }); mostrarEstado('Salvo ✓'); }
    catch (erro) { falhou(erro); }
  });
}

// Anotar: "amanhã", "sexta", "24/10" viram o dia; "#casa" vira etiqueta; sem dia vai para a Caixa.
export async function anotar(texto, ignorarData) {
  const lido = interpretar(texto);
  const dia = ignorarData ? null : lido.dia;
  const titulo = ignorarData ? texto.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim() : lido.titulo;
  if (!titulo) return null;
  mostrarEstado('Salvando…');
  try {
    const nova = await dados.criarTarefa({ espaco_id: estado.espacoId, titulo, dia, etiquetas: lido.etiquetas });
    nova.nova = true;
    estado.tarefas.unshift(nova);
    estado.secoes.set(nova.id, secaoDe(nova, estado.hoje));
    redesenhar();
    mostrarEstado('Salvo ✓');
    avisar(`Anotado · ${dia ? rotuloDia(dia) : 'Caixa de entrada'}`, () => mudar(nova, { estado: 'cancelada' }, { mensagem: 'Desfeito' }));
    return nova;
  } catch (erro) {
    falhou(erro);
    return null;
  }
}

export const falha = falhou;
