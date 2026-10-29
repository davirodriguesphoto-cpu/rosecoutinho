import crypto from 'node:crypto';
import { handler, member, db, query, jsonBody, E, ensureFolder, uploadImagem, arquivosDaPasta, apagarDefinitivo } from './_lib.js';

export const config = { maxDuration: 60 };
export const PASTA = 'Backup Painel Rose Coutinho';
/* ordem que respeita as chaves estrangeiras (serve também para restaurar) */
export const TABELAS = [['servicos', 'id'], ['pacientes', 'id'], ['atendimentos', 'id'], ['estoque_itens', 'id'], ['estoque_lotes', 'id'], ['estoque_movimentos', 'id'], ['servico_insumos', 'servico_id'], ['agendamentos', 'id'], ['mensagens', 'id'], ['modelos_documento', 'id'], ['documentos', 'id'], ['fotos', 'id'], ['lancamentos', 'id'], ['pacotes_paciente', 'id'], ['config', 'chave'], ['membros', 'user_id']];

const brasilia = () => new Date(Date.now() - 3 * 3600000).toISOString();
const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function fazerBackup({ forcar = false } = {}){
  const d = await db();
  const dados = {}, contagem = {}; let total = 0;
  for (const [t, pk] of TABELAS) { dados[t] = await d.list(t, null, pk); contagem[t] = dados[t].length; total += dados[t].length; }
  const ant = await d.get('config', { chave: 'backup_ultimo' }), prev = ant && ant.valor && typeof ant.valor === 'object' ? ant.valor : null;
  const base = prev ? (prev.base ?? prev.total) : 0;
  const encolheu = !forcar && base >= 20 && total < base * 0.5;
  const dia = brasilia().slice(0, 10), nome = `backup-painel-${dia}.json`;
  const bytes = Buffer.from(JSON.stringify({ app: 'painel-rosecoutinho', versao: 1, gerado_em: new Date().toISOString(), contagem, tabelas: dados }));
  const pasta = await ensureFolder(PASTA, null);
  const novo = await uploadImagem(pasta, nome, 'application/json', bytes);
  if (!novo || !novo.id) throw E(502, 'O Drive não confirmou o arquivo de backup.');
  let aviso = null;
  if (encolheu) aviso = `O banco tem ${total} registros, bem menos que os ${base} do último backup bom. O backup anterior foi mantido; confira os dados antes de apagar.`;
  else for (const f of await arquivosDaPasta(pasta)) if (f.id !== novo.id && f.name.startsWith('backup-painel-')) { try { await apagarDefinitivo(f.id); } catch (e) { console.error('backup: não apaguei o antigo', f.id); } }
  const valor = { em: new Date().toISOString(), arquivo: nome, id: novo.id, total, base: encolheu ? base : total, kb: Math.round(bytes.length / 1024), aviso };
  await d.upsert('config', { chave: 'backup_ultimo', valor }, 'chave');
  return valor;
}

export default handler(async (req) => {
  const segredo = process.env.CRON_SECRET;
  if (segredo && igual(String(req.headers.authorization || ''), 'Bearer ' + segredo)) return fazerBackup(); /* agendado pela Vercel */
  await member(req);
  if (req.method === 'POST') { const b = await jsonBody(req); return fazerBackup({ forcar: !!b.forcar }); }
  const row = await (await db()).get('config', { chave: 'backup_ultimo' });
  return { ultimo: row && typeof row.valor === 'object' ? row.valor : null, automatico: !!segredo };
});
