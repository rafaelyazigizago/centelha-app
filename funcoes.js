// Centelha · as funções que a própria pessoa liga (28/10, Rafael: "deixe para o usuário decidir ativar cada funcionalidade em
// opções ou configurações. Ele mesmo ativa o que quer usar, da forma como quer usar"). O básico vem sempre; o resto nasce desligado.
// Desligar só esconde da tela: o que já foi gravado continua no banco e volta quando você liga de novo (nada se apaga).
// Fica guardado neste aparelho, como o resto de "Do seu jeito". Lido uma vez ao abrir; muda na hora em que você toca.
import * as dados from './dados.js';
import { $, el } from './ui.js';

const CHAVE = 'centelha-funcoes';
// [chave, nome, o que faz, grupo, precisa da migração 0007]
export const FUNCOES = [
  ['chama', 'Chama', 'Foco numa tarefa só, com tempo (o Pomodoro)', 'Foco', false],
  ['matriz', 'Importante, Urgente e a Matriz', 'Marcar o que é importante e o que é urgente, e ver os 4 quadros', 'Prioridade', false],
  ['quadro', 'Quadro', 'As colunas A fazer, Em andamento, Aguardando e Feitas', 'Jeitos de ver uma lista', false],
  ['tabela', 'Tabela', 'Uma linha por tarefa; ordena pela coluna', 'Jeitos de ver uma lista', false],
  ['linha', 'Linha do tempo', 'Seis semanas, com uma barra por tarefa', 'Jeitos de ver uma lista', false],
  ['calendario', 'Calendário da lista', 'O mês, só com as tarefas daquela lista', 'Jeitos de ver uma lista', false],
  ['repetir', 'Repetir', 'Tarefa que volta todo dia, semana, 15 dias ou mês', 'Organizar', false],
  ['projetos', 'Projetos', 'Ligar a tarefa a um projeto e ver o projeto como lista', 'Organizar', true],
  ['etiquetas', 'Etiquetas com cor', 'Cadastrar as suas etiquetas e dar uma cor a cada uma', 'Organizar', true],
  ['visual', 'Emoji e cor nas listas', 'Um emoji e uma cor para cada grupo e cada lista', 'Organizar', true],
  ['tempo', 'Tempo e energia', 'Quanto a tarefa deve levar e quanta energia ela pede', 'Planejar', true],
];

let ligadas = {};
try { ligadas = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch { ligadas = {}; }
const ouvintes = new Set();
export const aoMudarFuncoes = (f) => ouvintes.add(f);

const precisa0007 = (chave) => FUNCOES.find(([k]) => k === chave)?.[4];
// Ligada pela pessoa e, quando depende da 0007, com o banco já pronto
export const usavel = (chave) => !!ligadas[chave] && (!precisa0007(chave) || dados.tem0007);

function ligar(chave, sim) {
  ligadas = { ...ligadas, [chave]: sim };
  if (!sim) delete ligadas[chave];
  try { localStorage.setItem(CHAVE, JSON.stringify(ligadas)); } catch { /* sem guardar: vale só nesta página */ }
  ouvintes.forEach((f) => f());
}

// O bloco "Funções que você usa" em "Do seu jeito"
export function desenharFuncoes() {
  const caixa = $('funcoes');
  if (!caixa) return;
  const grupos = [...new Set(FUNCOES.map(([, , , g]) => g))];
  caixa.replaceChildren(...grupos.flatMap((grupo) => [
    el('p', { classe: 'rotulo' }, grupo.toLocaleLowerCase('pt-BR')),
    ...FUNCOES.filter(([, , , g]) => g === grupo).map(([chave, nome, explica, , depende]) => {
      const espera = depende && !dados.tem0007;
      const caixinha = el('input', { type: 'checkbox', id: `funcao-${chave}`, disabled: espera || null });
      caixinha.checked = !!ligadas[chave];
      caixinha.addEventListener('change', () => ligar(chave, caixinha.checked));
      return el('label', { classe: 'chave funcao', for: `funcao-${chave}` },
        el('span', {}, el('strong', {}, nome), el('span', { classe: 'ajuda' }, espera ? `${explica}. Chega depois da atualização do banco.` : explica)),
        caixinha);
    }),
  ]));
}
