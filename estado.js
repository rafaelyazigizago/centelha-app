// Centelha · o estado do app e as ações que mudam tarefas: tudo muda na tela na hora, grava no banco e pode ser desfeito.
import { hojeISO, rotuloDia, interpretar } from './datas.js';
import { secaoDe, situacaoDe, comSituacao, temMarca, comMarca, proximaVez } from './calculos.js';
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
  passos: new Map(),   // id da tarefa → { total, feitos }
  abertasNoInicio: new Set(),   // as abertas ao carregar: ficam na aba Grupos mesmo depois de feitas
  lugares: new Map(),  // id → { area, subgrupo } ao carregar: a tarefa movida fica no lugar, com a marca, até recarregar
  lista: null,         // a lista aberta (subgrupo, área ou Prioridades)
  selecionando: false, // modo de escolher várias tarefas
  segurando: false,    // no celular, o dedo segurando um cartão (pode virar arrasto)
  painel: null,        // no notebook: id da tarefa aberta no painel da direita
  carregadoEm: 0,
};

const ouvintes = new Set();
export const aoMudar = (f) => ouvintes.add(f);
export const redesenhar = () => ouvintes.forEach((f) => f());

export function fixarSecoes() {
  estado.hoje = hojeISO();
  estado.secoes = new Map(estado.tarefas.map((t) => [t.id, secaoDe(t, estado.hoje)]));
  estado.abertasNoInicio = new Set(estado.tarefas.filter((t) => t.estado === 'aberta').map((t) => t.id));
  estado.lugares = new Map(estado.tarefas.map((t) => [t.id, { area: t.area || null, subgrupo: t.subgrupo || null }]));
  estado.marcas.clear();
}
export const secao = (t) => estado.secoes.get(t.id) ?? secaoDe(t, estado.hoje);
export const lugar = (t) => estado.lugares.get(t.id) ?? { area: t.area || null, subgrupo: t.subgrupo || null };

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
    document.dispatchEvent(new CustomEvent('centelha:acendeu'));   // o pet acende junto
    if (t.repetir_dias > 0) {   // repete: nasce a próxima vez, e o Desfazer leva as duas de volta
      return mudar(t, { estado: 'feita', feita_em: new Date().toISOString() }).then(async (ok) => {
        if (!ok) return false;
        const nova = await criarProximaVez(t);
        avisar(`Acesa · ${t.titulo}${nova ? ` · volta ${rotuloDia(nova.dia).toLowerCase()}` : ''}`, async () => {
          await cancelarProxima(t);
          mudar(t, { estado: 'aberta', feita_em: null, feita_por: null }, { mensagem: 'Desfeito' });
        });
        return true;
      });
    }
    return mudar(t, { estado: 'feita', feita_em: new Date().toISOString() }, {
      mensagem: `Acesa · ${t.titulo}`, desfazer: { estado: 'aberta', feita_em: null, feita_por: null },
    });
  }
  return mudar(t, { estado: 'aberta', feita_em: null, feita_por: null }, { mensagem: `Apagada · ${t.titulo}` });
}

// Em andamento e Aguardando outros (caixas do Hoje): uma etiqueta, como no Quadro. A tarefa vai para a caixa na hora.
export function mudarSituacao(t, situacao) {
  const nomes = { andamento: 'Em andamento', aguardando: 'Aguardando outros' };
  const antes = [...(t.etiquetas || [])];
  const mensagem = situacao ? `${t.titulo} → ${nomes[situacao]}` : `Saiu de ${nomes[situacaoDe(t)] || 'a situação'} · ${t.titulo}`;
  return mudar(t, { etiquetas: comSituacao(antes, situacao) }, { mensagem, desfazer: { etiquetas: antes } });
}

// Importante e Urgente (a Matriz): pôr ou tirar a marca, com Desfazer.
export function mudarMarca(t, marca) {
  const antes = [...(t.etiquetas || [])], tem = temMarca(t, marca);
  const nome = marca === 'importante' ? 'Importante' : 'Urgente';
  return mudar(t, { etiquetas: comMarca(antes, marca, !tem) }, { mensagem: `${tem ? `Sem "${nome}"` : nome} · ${t.titulo}`, desfazer: { etiquetas: antes } });
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
// "extra" leva a área e o subgrupo quando se anota dentro de um grupo.
// Repetir (28/10): ao acender uma tarefa que repete, nasce a próxima vez, com o mesmo título, grupo, marcas e porquê.
// A situação (em andamento, aguardando) não vai junto: a próxima começa do zero.
const proximas = new Map();   // id da acesa → a próxima que nasceu dela, para o Desfazer cancelar junto
function entrouNova(nova) {
  nova.nova = true;
  estado.abertasNoInicio.add(nova.id);
  estado.lugares.set(nova.id, { area: nova.area || null, subgrupo: nova.subgrupo || null });
  estado.tarefas.unshift(nova);
  estado.secoes.set(nova.id, secaoDe(nova, estado.hoje));
}
export async function criarProximaVez(t) {
  const dia = proximaVez(t, estado.hoje);
  if (!dia) return null;
  try {
    const nova = await dados.criarTarefa({
      espaco_id: estado.espacoId, titulo: t.titulo, dia, parte_do_dia: t.parte_do_dia ?? null, area: t.area ?? null, subgrupo: t.subgrupo ?? null,
      etiquetas: comSituacao(t.etiquetas, null), lentes: t.lentes || [], porque: t.porque ?? null, pronto_quando: t.pronto_quando ?? null,
      repetir_dias: t.repetir_dias,
    });
    entrouNova(nova);
    proximas.set(t.id, nova);
    redesenhar();
    return nova;
  } catch (erro) { falhou(erro); return null; }   // a de hoje já acendeu; só a próxima não nasceu
}
// Nada se apaga: a próxima desfeita fica cancelada.
export async function cancelarProxima(t) {
  const nova = proximas.get(t.id);
  if (!nova) return;
  proximas.delete(t.id);
  await mudar(nova, { estado: 'cancelada' });
}

export async function anotar(texto, ignorarData, extra = {}, aoCriar) {
  const lido = interpretar(texto);
  const dia = ignorarData ? null : lido.dia;
  const titulo = ignorarData ? texto.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim() : lido.titulo;
  if (!titulo) return null;
  mostrarEstado('Salvando…');
  try {
    const nova = await dados.criarTarefa({ espaco_id: estado.espacoId, titulo, dia, etiquetas: lido.etiquetas, ...extra });
    aoCriar?.(nova);
    entrouNova(nova);
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
