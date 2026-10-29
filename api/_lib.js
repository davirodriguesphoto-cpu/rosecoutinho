/* Núcleo das funções do servidor (Vercel). Fala com o Google e com o banco usando a chave de serviço,
   que existe só aqui: nunca vai para o navegador. Toda chamada exige sessão com segundo fator. */
import crypto from 'node:crypto';

export class HttpError extends Error { constructor(status, msg){ super(msg); this.status = status; } }
export const E = (status, msg) => new HttpError(status, msg);

const env = k => process.env[k] || '';
export const cfg = () => ({
  url: env('SUPABASE_URL') || env('VITE_SUPABASE_URL'),
  service: env('SUPABASE_SERVICE_ROLE_KEY'),
  gid: env('GOOGLE_CLIENT_ID'),
  gsecret: env('GOOGLE_CLIENT_SECRET'),
  app: (env('APP_URL') || 'https://painel.rosecoutinho.com.br').replace(/\/$/, ''),
});
export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/calendar.events'];
export const TAGS = /\b(PACIENTE|ATENDIMENTO)\b/i;

/* ---------- banco (trocável nos testes) ---------- */
let impl = null;
export const setImpl = x => { impl = x; };
async function real(){
  const c = cfg();
  if (!c.url || !c.service) throw E(500, 'Servidor sem as chaves do Supabase (SUPABASE_SERVICE_ROLE_KEY).');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(c.url, c.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = r => { if (r.error) throw E(500, r.error.message); return r.data; };
  const match = (q, m) => { for (const [k, v] of Object.entries(m || {})) q = q.eq(k, v); return q; };
  return {
    async user(token){ const { data, error } = await sb.auth.getUser(token); return error ? null : data.user; },
    async get(t, m, order){ let q = match(sb.from(t).select('*'), m); if (order) q = q.order(order, { ascending: false }); return ok(await q.limit(1).maybeSingle()); },
    async list(t, m, pk){ /* lê em páginas de 1000 */
      const out = [];
      for (let from = 0; ; from += 1000) { let q = match(sb.from(t).select('*'), m); if (pk) q = q.order(pk); const rows = ok(await q.range(from, from + 999)); out.push(...rows); if (rows.length < 1000) break; }
      return out;
    },
    async insert(t, row){ return ok(await sb.from(t).insert(row).select().single()); },
    async upsert(t, row, key){ return ok(await sb.from(t).upsert(row, { onConflict: key }).select().single()); },
    async update(t, m, patch){ return ok(await match(sb.from(t).update(patch), m).select()); },
    async del(t, m){ ok(await match(sb.from(t).delete(), m).select()); },
  };
}
export const db = async () => impl || (impl = await real());

/* ---------- sessão: login + segundo fator + membro ---------- */
export async function member(req){
  const h = req.headers.authorization || '';
  const tk = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tk) throw E(401, 'Faça login.');
  const d = await db();
  const u = await d.user(tk);
  if (!u) throw E(401, 'Sessão inválida.');
  let aal = '';
  try { aal = JSON.parse(Buffer.from(tk.split('.')[1], 'base64url').toString()).aal; } catch (e) {}
  if (aal !== 'aal2') throw E(403, 'Confirme o código do segundo fator.');
  if (!(await d.get('membros', { user_id: u.id }))) throw E(403, 'Sem permissão.');
  return u;
}

/* ---------- respostas ---------- */
export const handler = fn => async (req, res) => {
  try { const out = await fn(req, res); if (out !== undefined && !res.writableEnded) res.status(200).json(out); }
  catch (e) {
    if (!(e instanceof HttpError)) console.error('api', e);
    if (!res.writableEnded) res.status(e.status || 500).json({ erro: e instanceof HttpError ? e.message : 'Erro no servidor.' });
  }
};
export const query = req => Object.fromEntries(new URL(req.url, 'http://x').searchParams);
export async function jsonBody(req){
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await rawBody(req, 1e6);
  try { return JSON.parse(raw.toString() || '{}'); } catch (e) { throw E(400, 'Pedido inválido.'); }
}
export async function rawBody(req, max){
  if (Buffer.isBuffer(req.body)) { if (req.body.length > max) throw E(413, 'Arquivo grande demais.'); return req.body; }
  const parts = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw E(413, 'Arquivo grande demais.'); parts.push(c); }
  return Buffer.concat(parts);
}

/* ---------- cofre do token (AES-GCM, chave derivada do segredo do Google) ---------- */
const key = () => crypto.createHash('sha256').update('rc-tokens:' + cfg().gsecret).digest();
export function seal(text){
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return 'v1.' + [iv, c.getAuthTag(), enc].map(b => b.toString('base64url')).join('.');
}
export function unseal(s){
  const [v, a, b, c] = String(s).split('.');
  if (v !== 'v1') throw E(500, 'Token em formato desconhecido.');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(a, 'base64url'));
  d.setAuthTag(Buffer.from(b, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(c, 'base64url')), d.final()]).toString('utf8');
}
export const signState = payload => { const b = Buffer.from(JSON.stringify(payload)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', key()).update(b).digest('base64url'); };
export function readState(s){
  const [b, sig] = String(s || '').split('.');
  const ok = b && sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(crypto.createHmac('sha256', key()).update(b).digest('base64url')));
  if (!ok) throw E(400, 'Retorno do Google inválido.');
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (Date.now() - p.t > 10 * 60000) throw E(400, 'O pedido de conexão expirou. Tente de novo.');
  return p;
}

/* ---------- Google ---------- */
export const redirectUri = () => cfg().app + '/api/google?action=callback';
export function authUrl(userId){
  const c = cfg();
  if (!c.gid || !c.gsecret) throw E(500, 'Servidor sem GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.');
  const p = new URLSearchParams({ client_id: c.gid, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: signState({ u: userId, t: Date.now() }) });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}
async function tokenCall(params){
  const c = cfg();
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.gid, client_secret: c.gsecret, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = E(r.status === 400 || r.status === 401 ? 409 : 502, j.error === 'invalid_grant' ? 'A conexão com o Google expirou. Conecte de novo.' : 'O Google recusou o pedido.'); e.google = j.error; throw e; }
  return j;
}
export const exchangeCode = code => tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

let cache = { at: '', exp: 0, id: '' };
export async function conexao(){
  const row = await (await db()).get('google_tokens', null, 'updated_at');
  if (!row) throw E(409, 'Google não conectado.');
  return row;
}
export async function accessToken(){
  const row = await conexao();
  if (cache.id === row.user_id + row.updated_at && cache.exp > Date.now() + 30000) return { token: cache.at, row };
  const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: unseal(row.refresh_token) });
  cache = { at: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000, id: row.user_id + row.updated_at };
  return { token: j.access_token, row };
}
export const forgetToken = () => { cache = { at: '', exp: 0, id: '' }; };
export async function g(url, opt = {}, raw = false){
  const { token } = await accessToken();
  const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), authorization: 'Bearer ' + token } });
  if (raw) return r;
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('google', r.status, JSON.stringify(j).slice(0, 300)); throw E(r.status === 404 ? 404 : 502, r.status === 401 || r.status === 403 ? 'O Google recusou o acesso. Conecte de novo.' : 'Falha ao falar com o Google.'); }
  return j;
}

/* ---------- Drive: pastas ---------- */
const DRIVE = 'https://www.googleapis.com/drive/v3', FOLDER = 'application/vnd.google-apps.folder';
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export const clean = s => String(s || '').replace(/[\/\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Sem nome';
export async function findFolder(name, parent){
  const qs = `name='${q(name)}' and mimeType='${FOLDER}' and trashed=false` + (parent ? ` and '${q(parent)}' in parents` : '');
  const j = await g(`${DRIVE}/files?` + new URLSearchParams({ q: qs, fields: 'files(id,name)', pageSize: '1', spaces: 'drive' }));
  return j.files && j.files[0] ? j.files[0].id : null;
}
export async function makeFolder(name, parent){
  const j = await g(`${DRIVE}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }) });
  return j.id;
}
export const ensureFolder = async (name, parent) => (await findFolder(name, parent)) || makeFolder(name, parent);
const alive = async id => { try { const j = await g(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id,trashed`); return !j.trashed; } catch (e) { if (e.status === 404) return false; throw e; } };

export async function rootFolder(){
  const d = await db();
  const row = await d.get('config', { chave: 'drive_root' });
  if (row && typeof row.valor === 'string' && (await alive(row.valor))) return row.valor;
  const id = await ensureFolder('Pacientes Rose', null);
  await d.upsert('config', { chave: 'drive_root', valor: id }, 'chave');
  return id;
}
export async function pastaPaciente(pacienteId){
  const d = await db();
  const p = await d.get('pacientes', { id: pacienteId });
  if (!p) throw E(404, 'Paciente ainda não foi salvo. Aguarde a sincronização.');
  if (p.drive_folder_id && (await alive(p.drive_folder_id))) return { id: p.drive_folder_id, nome: p.nome };
  const id = await ensureFolder(clean(p.nome), await rootFolder());
  await d.update('pacientes', { id: pacienteId }, { drive_folder_id: id });
  return { id, nome: p.nome };
}
export const nomeDia = (data, nome) => { const [y, m, dd] = String(data).split('-'); return `${dd}-${m}-${y.slice(2)}-${clean(nome)}`; };

export async function uploadImagem(parent, nome, mime, bytes){
  const b = 'rc' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name: nome, parents: [parent] });
  const body = Buffer.concat([Buffer.from(`--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\ncontent-type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${b}--`)]);
  return g('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${b}` }, body });
}
export const baixar = (id, thumb) => (async () => {
  if (thumb) { const m = await g(`${DRIVE}/files/${encodeURIComponent(id)}?fields=thumbnailLink`); if (m.thumbnailLink) { const r = await g(m.thumbnailLink.replace(/=s\d+$/, '=s480'), {}, true); if (r.ok) return r; } }
  return g(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, {}, true);
})();
export const lixeira = id => g(`${DRIVE}/files/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
export const CAL = 'https://www.googleapis.com/calendar/v3/calendars/';

export const apagarDefinitivo = id => g(`${DRIVE}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
export async function arquivosDaPasta(parent){
  const j = await g(`${DRIVE}/files?` + new URLSearchParams({ q: `'${q(parent)}' in parents and trashed=false and mimeType!='${FOLDER}'`, fields: 'files(id,name)', pageSize: '100' }));
  return j.files || [];
}
