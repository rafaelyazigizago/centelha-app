// Centelha · datas sem hora: o dia de hoje, nomes de dias e o "anotar rápido" ("amanhã", "sexta", "24/10", "#casa").
// Funções puras: recebem "agora" para poderem ser testadas (testes/datas.test.mjs).

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const doisDigitos = (n) => String(n).padStart(2, '0');

export function paraISO(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

export function deISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function hojeISO(agora = new Date()) {
  return paraISO(agora);
}

export function somarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return paraISO(d);
}

// "quarta-feira, 21 de outubro"
export function diaPorExtenso(iso) {
  const d = deISO(iso);
  const nome = DIAS[d.getDay()];
  const sufixo = d.getDay() === 0 || d.getDay() === 6 ? '' : '-feira';
  return `${nome}${sufixo}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// "Hoje", "Amanhã", "Ontem" ou "sexta, 24/10"
export function rotuloDia(iso, agora = new Date()) {
  const hoje = hojeISO(agora);
  if (iso === hoje) return 'Hoje';
  if (iso === somarDias(hoje, 1)) return 'Amanhã';
  if (iso === somarDias(hoje, -1)) return 'Ontem';
  const d = deISO(iso);
  const ano = d.getFullYear() === agora.getFullYear() ? '' : `/${d.getFullYear()}`;
  return `${DIAS[d.getDay()]}, ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}${ano}`;
}

const SEM_ACENTO = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Procura uma data no texto e devolve { titulo, dia, palavraData, etiquetas }.
// dia = null quando não há data (a tarefa fica sem dia; em Todas, filtro "Sem dia").
export function interpretar(texto, agora = new Date()) {
  const hoje = hojeISO(agora);
  let resto = ` ${texto.trim()} `;
  let dia = null;
  let palavraData = null;

  const etiquetas = [];
  resto = resto.replace(/\s#([\p{L}\p{N}_-]+)/gu, (_, tag) => {
    etiquetas.push(tag);
    return ' ';
  });

  const tentativas = [
    { re: /\sdepois de amanh[ãa](?=\s)/i, dia: () => somarDias(hoje, 2) },
    { re: /\samanh[ãa](?=\s)/i, dia: () => somarDias(hoje, 1) },
    { re: /\shoje(?=\s)/i, dia: () => hoje },
    { re: /\s(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s)/, dia: (m) => dataDoTexto(m, agora) },
    {
      re: /\s(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:-feira)?(?=\s)/i,
      dia: (m) => proximoDiaDaSemana(m[1], agora),
    },
  ];

  for (const t of tentativas) {
    const m = resto.match(t.re);
    if (!m) continue;
    const achado = t.dia(m);
    if (!achado) continue;
    dia = achado;
    palavraData = m[0].trim();
    resto = resto.replace(m[0], ' ');
    break;
  }

  const titulo = resto.replace(/\s+/g, ' ').trim();
  return { titulo, dia, palavraData, etiquetas };
}

function dataDoTexto(m, agora) {
  const d = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  let ano = m[3] ? Number(m[3]) : agora.getFullYear();
  let data = new Date(ano, mes - 1, d);
  if (data.getMonth() !== mes - 1) return null; // 31/02 e parecidos
  if (!m[3] && paraISO(data) < hojeISO(agora)) data = new Date(ano + 1, mes - 1, d);
  return paraISO(data);
}

// O mesmo dia da semana de hoje vale hoje.
function proximoDiaDaSemana(nome, agora) {
  const alvo = DIAS.map(SEM_ACENTO).indexOf(SEM_ACENTO(nome));
  const hoje = hojeISO(agora);
  const diferenca = (alvo - deISO(hoje).getDay() + 7) % 7;
  return somarDias(hoje, diferenca);
}
