// Centelha · tudo o que fala com o banco (Supabase). As regras de quem vê o quê estão no próprio banco (RLS).
const SUPABASE_URL = 'https://hlvejnlirctodkvmjehj.supabase.co';
// Chave pública por desenho: só abre o que as regras por linha (RLS) do banco deixarem.
const CHAVE_PUBLICA = 'sb_publishable_B8VUf-oWJwakz9uBSXEeIA_TeSn9y0m';

export const CAMPOS = 'id,titulo,notas,estado,dia,parte_do_dia,hora,area,subgrupo,ordem,etiquetas,lentes,prioridade_semana,vezes_adiada,' +
  'porque,parei_aqui,proximo_passo,pronto_quando,resultado_meta,resultado_efeito,prova_url,privada,feita_em,criado_em';

export let banco;

export function iniciar() {
  banco = window.supabase.createClient(SUPABASE_URL, CHAVE_PUBLICA, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
  });
  return banco;
}

const exigir = ({ data, error }) => { if (error) throw error; return data; };
// Gravação que não mudou nenhuma linha (as regras do banco recusaram em silêncio) vira erro, nunca "Salvo ✓".
const mudouUma = (resposta) => { const linhas = exigir(resposta); if (!linhas?.length) throw new Error('nada foi gravado: sem permissão ou a linha não existe'); };

export async function espacoPessoal(usuarioId) {
  return exigir(await banco.from('espacos').select('id').eq('tipo', 'pessoal').eq('criado_por', usuarioId).single()).id;
}

// Abertas (todas) + feitas desde um instante (para as luzes do dia e da semana).
export async function carregarTarefas(espacoId, feitasDesde) {
  const abertas = exigir(await banco.from('tarefas').select(CAMPOS).eq('espaco_id', espacoId).eq('estado', 'aberta')
    .order('dia', { ascending: true, nullsFirst: false }).order('criado_em', { ascending: true }));
  const feitas = exigir(await banco.from('tarefas').select(CAMPOS).eq('espaco_id', espacoId).eq('estado', 'feita')
    .gte('feita_em', feitasDesde).order('feita_em', { ascending: true }));
  return [...abertas, ...feitas];
}

// Quantos passos cada tarefa tem e quantos estão feitos ("1 de 3", como no Microsoft To Do).
export async function contarPassos() {
  const linhas = exigir(await banco.from('subtarefas').select('tarefa_id,feita').eq('removida', false));
  const contagem = new Map();
  for (const l of linhas) {
    const c = contagem.get(l.tarefa_id) || { total: 0, feitos: 0 };
    c.total += 1;
    if (l.feita) c.feitos += 1;
    contagem.set(l.tarefa_id, c);
  }
  return contagem;
}

export async function mudarTarefa(id, patch) {
  mudouUma(await banco.from('tarefas').update(patch).eq('id', id).select('id'));
}

export async function criarTarefa(dados) {
  return exigir(await banco.from('tarefas').insert(dados).select(CAMPOS).single());
}

export async function passosDe(tarefaId) {
  return exigir(await banco.from('subtarefas').select('id,texto,feita,ordem,removida')
    .eq('tarefa_id', tarefaId).eq('removida', false).order('ordem', { ascending: true }));
}

export async function criarPasso(tarefaId, texto, ordem) {
  return exigir(await banco.from('subtarefas').insert({ tarefa_id: tarefaId, texto, ordem }).select('id,texto,feita,ordem,removida').single());
}

export async function mudarPasso(id, patch) {
  mudouUma(await banco.from('subtarefas').update(patch).eq('id', id).select('id'));
}

export async function registrarTravada(dados) {
  exigir(await banco.from('travadas').insert(dados));
}

// Diário: sempre privado (o banco garante). Uma entrada por dia.
export async function diarioDoDia(usuarioId, dia) {
  return exigir(await banco.from('diario').select('id,dia,texto').eq('usuario_id', usuarioId).eq('dia', dia).limit(1))[0] || null;
}

export async function diarioAnteriores(usuarioId, antesDe) {
  return exigir(await banco.from('diario').select('id,dia,texto').eq('usuario_id', usuarioId).lt('dia', antesDe)
    .order('dia', { ascending: false }).limit(14));
}

export async function salvarDiario(id, dia, texto) {
  if (id) { mudouUma(await banco.from('diario').update({ texto }).eq('id', id).select('id')); return id; }
  return exigir(await banco.from('diario').insert({ dia, texto }).select('id').single()).id;
}

// Áudio e vídeo do diário: o arquivo vai para o balde privado "diario", na pasta do usuário; a lista fica em diario_midias.
const CAMPOS_MIDIA = 'id,dia,tipo,caminho,mime,segundos,tamanho,removida,criado_em';

export async function midiasDesde(usuarioId, desde) {
  return exigir(await banco.from('diario_midias').select(CAMPOS_MIDIA).eq('usuario_id', usuarioId).eq('removida', false)
    .gte('dia', desde).order('criado_em', { ascending: true }));
}

export async function guardarMidia(usuarioId, dia, tipo, arquivo, segundos) {
  const mime = arquivo.type.split(';')[0];
  const extensao = mime.endsWith('mp4') ? 'mp4' : mime.endsWith('ogg') ? 'ogg' : 'webm';
  const caminho = `${usuarioId}/${dia}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await banco.storage.from('diario').upload(caminho, arquivo, { contentType: mime, upsert: false });
  if (error) throw error;
  return exigir(await banco.from('diario_midias').insert({ dia, tipo, caminho, mime, segundos, tamanho: arquivo.size })
    .select(CAMPOS_MIDIA).single());
}

export async function baixarMidia(caminho) {
  const { data, error } = await banco.storage.from('diario').download(caminho);
  if (error) throw error;
  return data;
}

export async function marcarMidia(id, removida) {
  mudouUma(await banco.from('diario_midias').update({ removida }).eq('id', id).select('id'));
}

// Exportar tudo o que é seu, num arquivo só (o Supabase grátis não faz cópia sozinho).
// O pet: manda a conversa para a função "agente" do Supabase (que lê as tarefas com o seu login e pergunta ao DeepSeek).
export async function conversar(mensagens, hoje) {
  const corpo = { mensagens: mensagens.filter((m) => !m.erro).map(({ role, content }) => ({ role, content })), hoje };
  const { data, error } = await banco.functions.invoke('agente', { body: corpo });
  if (error) {
    const e = new Error(error.message || 'a função agente falhou');
    try { if ((await error.context?.json?.())?.erro === 'sem_chave') e.semChave = true; } catch { /* resposta sem corpo */ }
    throw e;
  }
  if (!data?.resposta) throw new Error('a função agente não respondeu');
  return data;
}

export async function exportarTudo(espacoId, usuarioId) {
  const tarefas = exigir(await banco.from('tarefas').select('*').eq('espaco_id', espacoId).order('criado_em', { ascending: true }));
  const ids = new Set(tarefas.map((t) => t.id));
  const filtrar = (linhas) => linhas.filter((l) => ids.has(l.tarefa_id));
  const subtarefas = filtrar(exigir(await banco.from('subtarefas').select('*')));
  const comentarios = filtrar(exigir(await banco.from('comentarios').select('*')));
  const anexos = filtrar(exigir(await banco.from('anexos').select('*')));
  const travadas = exigir(await banco.from('travadas').select('*').eq('usuario_id', usuarioId));
  const diario = exigir(await banco.from('diario').select('*').eq('usuario_id', usuarioId).order('dia', { ascending: true }));
  // Áudios e vídeos: vem a lista; os arquivos ficam no balde "diario" do Supabase.
  const diario_midias = exigir(await banco.from('diario_midias').select('*').eq('usuario_id', usuarioId).order('criado_em', { ascending: true }));
  return {
    sistema: 'Centelha', exportado_em: new Date().toISOString(),
    contagem: { tarefas: tarefas.length, subtarefas: subtarefas.length, comentarios: comentarios.length, anexos: anexos.length, travadas: travadas.length, diario: diario.length, diario_midias: diario_midias.length },
    tarefas, subtarefas, comentarios, anexos, travadas, diario, diario_midias,
  };
}
