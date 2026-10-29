/* Testa as funções do servidor com banco e Google simulados (nada sai para a internet). */
import assert from 'node:assert/strict';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'csecret'; process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.APP_URL = 'https://painel.test';
const lib = await import('../api/_lib.js');
const google = (await import('../api/google.js')).default;
const drive = (await import('../api/drive.js')).default;
const agenda = (await import('../api/agenda.js')).default;
const backupMod = await import('../api/backup.js'); const backup = backupMod.default;
const { restaurar } = await import('../scripts/restaurar.mjs');

/* ---- banco falso ---- */
const T = { membros: [{ user_id: 'u1' }], pacientes: [{ id: 'p1', nome: 'Maria Fulana de Tal', telefone: '11999990000', drive_folder_id: null }], servicos: [{ id: 's1', nome: 'Limpeza de pele' }], fotos: [], agendamentos: [], config: [], google_tokens: [] };
const hit = (r, m) => Object.entries(m || {}).every(([k, v]) => r[k] === v);
const jwt = aal => 'h.' + Buffer.from(JSON.stringify({ aal })).toString('base64url') + '.s';
const TK = { 'tok-ok': jwt('aal2') };
const OUT = jwt('aal2') + 'x'; /* sessão válida com 2FA, mas de quem não está na lista */
const realUser = async t => (t === TK['tok-ok'] || t === jwt('aal1') ? { id: 'u1' } : t === OUT ? { id: 'u9' } : null);
lib.setImpl({ user: realUser,
  get: async (t, m, order) => { const rows = T[t].filter(r => hit(r, m)); if (order) rows.sort((a, b) => String(b[order]).localeCompare(String(a[order]))); return rows[0] || null; },
  list: async (t, m) => (T[t] || []).filter(r => hit(r, m)),
  insert: async (t, row) => { const r = { id: 'f' + (T[t].length + 1), ...row }; T[t].push(r); return r; },
  upsert: async (t, row, key) => { const i = T[t].findIndex(r => r[key] === row[key]); if (i >= 0) T[t][i] = { ...T[t][i], ...row }; else T[t].push(row); return row; },
  update: async (t, m, patch) => { T[t].filter(r => hit(r, m)).forEach(r => Object.assign(r, patch)); return []; },
  del: async (t, m) => { T[t] = T[t].filter(r => !hit(r, m)); },
});

/* ---- Google falso ---- */
const G = { files: [], events: [], n: 0, calls: [] };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opt = {}) => {
  url = String(url); const u = new URL(url), m = opt.method || 'GET'; G.calls.push(m + ' ' + u.pathname);
  if (u.host === 'oauth2.googleapis.com') {
    const b = new URLSearchParams(opt.body);
    if (b.get('grant_type') === 'authorization_code') return b.get('code') === 'bom' ? json({ access_token: 'at', refresh_token: 'RT-SECRETO', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events', id_token: 'h.' + Buffer.from(JSON.stringify({ email: 'rosecoutinho.estetica@gmail.com' })).toString('base64url') + '.s' }) : json({ error: 'invalid_grant' }, 400);
    return b.get('refresh_token') === 'RT-SECRETO' ? json({ access_token: 'at' + (++G.n), expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400);
  }
  if (!String(opt.headers && opt.headers.authorization).startsWith('Bearer at')) return json({}, 401);
  if (u.pathname === '/drive/v3/files' && m === 'GET') {
    const q = u.searchParams.get('q'), par = /'([^']+)' in parents/.exec(q), nm = /name='((?:[^'\\]|\\.)*)'/.exec(q);
    if (q.includes("mimeType!=")) return json({ files: G.files.filter(f => !f.folder && !f.trashed && f.parents.includes(par[1])) });
    const name = nm[1].replace(/\\'/g, "'");
    return json({ files: G.files.filter(f => f.name === name && f.folder && !f.trashed && (!par || f.parents.includes(par[1]))) });
  }
  if (u.pathname === '/drive/v3/files' && m === 'POST') { const b = JSON.parse(opt.body); const f = { id: 'D' + (G.files.length + 1), name: b.name, folder: true, parents: b.parents || [] }; G.files.push(f); return json({ id: f.id }); }
  if (u.pathname === '/upload/drive/v3/files') {
    const txt = Buffer.from(opt.body).toString('latin1'), meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(txt)[1]);
    const f = { id: 'D' + (G.files.length + 1), name: meta.name, parents: meta.parents, bytes: Buffer.from(opt.body).length }; G.files.push(f); return json({ id: f.id, name: f.name });
  }
  const fm = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
  if (fm) {
    const f = G.files.find(x => x.id === fm[1]); if (!f) return json({}, 404);
    if (m === 'DELETE') { G.files = G.files.filter(x => x !== f); return new Response(null, { status: 204 }); }
    if (m === 'PATCH') { f.trashed = JSON.parse(opt.body).trashed; return json({ id: f.id }); }
    if (u.searchParams.get('alt') === 'media') return new Response(Buffer.from('JPEGDATA'), { headers: { 'content-type': 'image/jpeg' } });
    return json({ id: f.id, trashed: !!f.trashed, thumbnailLink: f.folder ? undefined : 'https://lh3.googleusercontent.com/abc=s220' });
  }
  if (u.host === 'lh3.googleusercontent.com') return new Response(Buffer.from('THUMB'), { headers: { 'content-type': 'image/jpeg' } });
  if (u.pathname === '/calendar/v3/calendars/primary/events') {
    if (m === 'GET') return json({ items: G.events });
    if (m === 'POST') { const b = JSON.parse(opt.body); const e = { id: 'E' + (G.eid = (G.eid || 0) + 1), ...b }; G.events.push(e); return json(e); }
  }
  const em = /^\/calendar\/v3\/calendars\/primary\/events\/([^/]+)$/.exec(u.pathname);
  if (em) { const e = G.events.find(x => x.id === em[1]); if (!e) return json({}, 404); if (m === 'DELETE') { G.events = G.events.filter(x => x !== e); return new Response(null, { status: 204 }); } if (m === 'PATCH') { Object.assign(e, JSON.parse(opt.body)); return json(e); } return json(e); }
  return json({}, 404);
};

/* ---- req/res falsos ---- */
const call = async (fn, { method = 'GET', url, token = TK['tok-ok'], body, headers = {} } = {}) => {
  const buf = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const req = { method, url, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(Buffer.isBuffer(body) ? {} : body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: buf, async *[Symbol.asyncIterator](){ if (buf) yield buf; } };
  req.body = undefined; /* simula bodyParser desligado: o corpo vem do fluxo */
  const res = { statusCode: 200, headers: {}, writableEnded: false, out: null, status(c){ this.statusCode = c; return this; }, setHeader(k, v){ this.headers[k.toLowerCase()] = v; }, json(o){ this.out = o; this.writableEnded = true; return this; }, end(b){ this.out = b !== undefined ? b : this.out; this.writableEnded = true; } };
  await fn(req, res); return res;
};

let ok = 0; const t = async (nome, f) => { try { await f(); ok++; console.log('ok  ', nome); } catch (e) { console.error('FALHOU', nome, '\n', e); process.exitCode = 1; } };

await t('sem login, sem 2FA ou fora da lista é barrado', async () => {
  assert.equal((await call(google, { url: '/api/google?action=status', token: null })).statusCode, 401);
  assert.equal((await call(google, { url: '/api/google?action=status', token: jwt('aal1') })).statusCode, 403);
  assert.equal((await call(google, { url: '/api/google?action=status', token: 'lixo' })).statusCode, 401);
  assert.equal((await call(google, { url: '/api/google?action=status', token: OUT })).statusCode, 403);
});
await t('status desconectado e URL de conexão', async () => {
  assert.equal((await call(google, { url: '/api/google?action=status' })).out.conectado, false);
  const u = new URL((await call(google, { url: '/api/google?action=start', method: 'POST' })).out.url);
  assert.equal(u.host, 'accounts.google.com'); assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://painel.test/api/google?action=callback');
  assert.match(u.searchParams.get('scope'), /drive\.file/); assert.ok(!/auth\/drive(\s|$)/.test(u.searchParams.get('scope')));
});
await t('retorno do Google guarda o token cifrado', async () => {
  const state = new URL((await call(google, { url: '/api/google?action=start', method: 'POST' })).out.url).searchParams.get('state');
  const bad = await call(google, { url: '/api/google?action=callback&code=bom&state=' + state.slice(0, -2) + 'xx', token: null });
  assert.match(bad.headers.location, /google=erro/); assert.equal(T.google_tokens.length, 0);
  const r = await call(google, { url: '/api/google?action=callback&code=bom&state=' + state, token: null });
  assert.match(r.headers.location, /#agenda\?google=ok/);
  assert.equal(T.google_tokens.length, 1); assert.ok(!T.google_tokens[0].refresh_token.includes('RT-SECRETO'));
  assert.equal(T.google_tokens[0].email, 'rosecoutinho.estetica@gmail.com');
  assert.equal((await call(google, { url: '/api/google?action=status' })).out.conectado, true);
});
await t('pasta do paciente: raiz "Pacientes Rose" > nome, sem duplicar', async () => {
  const r = await call(drive, { url: '/api/drive?action=pasta', method: 'POST', body: { paciente: 'p1' } });
  const raiz = G.files.find(f => f.name === 'Pacientes Rose'), pac = G.files.find(f => f.name === 'Maria Fulana de Tal');
  assert.ok(raiz && pac); assert.deepEqual(pac.parents, [raiz.id]); assert.equal(r.out.pasta, pac.id); assert.equal(T.pacientes[0].drive_folder_id, pac.id);
  await call(drive, { url: '/api/drive?action=pasta', method: 'POST', body: { paciente: 'p1' } });
  assert.equal(G.files.filter(f => f.name === 'Pacientes Rose').length, 1); assert.equal(G.files.filter(f => f.name === 'Maria Fulana de Tal').length, 1);
  assert.equal((await call(drive, { url: '/api/drive?action=pasta', method: 'POST', body: { paciente: 'nao' } })).statusCode, 404);
});
await t('upload: uma pasta por dia "27-10-26-Nome", foto dentro, linha em fotos', async () => {
  const img = Buffer.alloc(5000, 1);
  const r = await call(drive, { url: '/api/drive?action=upload&paciente=p1&data=2026-10-27&tipo=antes', method: 'POST', body: img, headers: { 'content-type': 'image/jpeg' } });
  assert.equal(r.statusCode, 200);
  const dia = G.files.find(f => f.name === '27-10-26-Maria Fulana de Tal'), pac = G.files.find(f => f.name === 'Maria Fulana de Tal');
  assert.ok(dia); assert.deepEqual(dia.parents, [pac.id]);
  const arq = G.files.find(f => f.name.startsWith('antes-')); assert.deepEqual(arq.parents, [dia.id]);
  assert.equal(r.out.foto.arquivo_path, 'drive:' + arq.id); assert.equal(r.out.foto.tirada_em, '2026-10-27');
  await call(drive, { url: '/api/drive?action=upload&paciente=p1&data=2026-10-27&tipo=depois', method: 'POST', body: img, headers: { 'content-type': 'image/jpeg' } });
  assert.equal(G.files.filter(f => f.name === '27-10-26-Maria Fulana de Tal').length, 1);
  await call(drive, { url: '/api/drive?action=upload&paciente=p1&data=2026-11-03&tipo=outra', method: 'POST', body: img, headers: { 'content-type': 'image/jpeg' } });
  assert.ok(G.files.find(f => f.name === '03-11-26-Maria Fulana de Tal'));
  assert.equal(T.fotos.length, 3);
});
await t('upload recusa tipo errado, data ruim e arquivo grande', async () => {
  const bad = (q, body, ct) => call(drive, { url: '/api/drive?action=upload&' + q, method: 'POST', body, headers: { 'content-type': ct } });
  assert.equal((await bad('paciente=p1&data=2026-10-27&tipo=antes', Buffer.from('x'), 'application/pdf')).statusCode, 415);
  assert.equal((await bad('paciente=p1&data=27/10/2026&tipo=antes', Buffer.from('x'), 'image/jpeg')).statusCode, 400);
  assert.equal((await bad('paciente=p1&data=2026-10-27&tipo=xx', Buffer.from('x'), 'image/jpeg')).statusCode, 400);
  assert.equal((await bad('paciente=p1&data=2026-10-27&tipo=antes', Buffer.alloc(4.2 * 1024 * 1024), 'image/jpeg')).statusCode, 413);
  assert.equal(T.fotos.length, 3);
});
await t('imagem: miniatura e original; foto desconhecida 404', async () => {
  const id = T.fotos[0].id;
  assert.equal((await call(drive, { url: `/api/drive?action=img&id=${id}&t=1` })).out.toString(), 'THUMB');
  const full = await call(drive, { url: `/api/drive?action=img&id=${id}` });
  assert.equal(full.out.toString(), 'JPEGDATA'); assert.match(full.headers['cache-control'], /private/);
  assert.equal((await call(drive, { url: '/api/drive?action=img&id=zzz' })).statusCode, 404);
  assert.equal((await call(drive, { url: `/api/drive?action=img&id=${id}`, token: null })).statusCode, 401);
});
await t('apagar manda para a lixeira do Drive e remove a linha', async () => {
  const f = T.fotos[2], did = f.arquivo_path.slice(6);
  assert.equal((await call(drive, { url: '/api/drive?action=apagar', method: 'POST', body: { id: f.id } })).statusCode, 200);
  assert.equal(G.files.find(x => x.id === did).trashed, true); assert.equal(T.fotos.length, 2);
});
await t('pasta apagada no Drive é recriada sem erro', async () => {
  const pac = G.files.find(f => f.name === 'Maria Fulana de Tal'); pac.trashed = true;
  const r = await call(drive, { url: '/api/drive?action=upload&paciente=p1&data=2026-10-28&tipo=outra', method: 'POST', body: Buffer.alloc(100), headers: { 'content-type': 'image/png' } });
  assert.equal(r.statusCode, 200); assert.notEqual(T.pacientes[0].drive_folder_id, pac.id);
});
const em = (dias, h = 10) => { const d = new Date(Date.now() + dias * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const sync = (o = {}) => call(agenda, { method: 'POST', url: '/api/agenda?action=sync', ...o });
await t('agenda: cria o evento no Google (nome e serviço, sem telefone), grava o vínculo e não duplica', async () => {
  G.events = []; T.agendamentos = [{ id: 'a1', paciente_id: 'p1', servico_id: 's1', inicio: em(2), fim: em(2, 11), status: 'agendado', google_event_id: null }];
  const r = (await sync()).out;
  assert.equal(r.criados, 1); assert.equal(G.events.length, 1);
  const ev = G.events[0]; assert.equal(ev.summary, 'ATENDIMENTO · Maria Fulana de Tal — Limpeza de pele');
  assert.ok(!JSON.stringify(ev).includes('11999990000')); assert.equal(ev.start.timeZone, 'America/Sao_Paulo'); assert.equal(ev.extendedProperties.private.painel, 'a1');
  assert.equal(T.agendamentos[0].google_event_id, ev.id); assert.deepEqual(r.atualizacoes, [{ id: 'a1', gid: ev.id }]);
  const r2 = (await sync()).out; assert.equal(r2.criados + r2.atualizados + r2.removidos, 0); assert.equal(G.events.length, 1);
});
await t('agenda: remarcar atualiza o evento; cancelar ou faltar tira do Google e limpa o vínculo', async () => {
  T.agendamentos[0].inicio = em(3); T.agendamentos[0].fim = em(3, 11);
  const r = (await sync()).out; assert.equal(r.atualizados, 1); assert.equal(G.events.length, 1); assert.equal(Date.parse(G.events[0].start.dateTime), Date.parse(em(3)));
  T.agendamentos[0].status = 'cancelado';
  const r2 = (await sync()).out; assert.equal(r2.removidos, 1); assert.equal(G.events.length, 0); assert.equal(T.agendamentos[0].google_event_id, null);
  T.agendamentos[0].status = 'agendado'; await sync(); assert.equal(G.events.length, 1); /* voltou a valer: recria */
  T.agendamentos[0].status = 'realizado'; await sync(); assert.equal(G.events.length, 1); /* realizado mantém o registro na agenda */
});
await t('agenda: agendamento excluído no painel some do Google; evento apagado no Google não é recriado', async () => {
  T.agendamentos = []; const r = (await sync()).out; assert.equal(r.removidos, 1); assert.equal(G.events.length, 0);
  T.agendamentos = [{ id: 'a2', paciente_id: 'p1', servico_id: null, inicio: em(4), fim: em(4, 11), status: 'agendado', google_event_id: 'E-sumiu' }];
  const r2 = (await sync()).out; assert.equal(r2.criados, 0); assert.equal(G.events.length, 0); assert.equal(T.agendamentos[0].google_event_id, 'E-sumiu');
});
await t('agenda: fora da janela (antigo) é ignorado', async () => {
  T.agendamentos = [{ id: 'old', paciente_id: 'p1', servico_id: null, inicio: em(-10), fim: em(-10, 11), status: 'agendado', google_event_id: null }];
  assert.equal((await sync()).out.criados, 0);
});
await t('agenda: devolve eventos PACIENTE/ATENDIMENTO só do Google; pessoal vira "ocupado" sem título', async () => {
  T.agendamentos = [];
  const dt = (h) => ({ dateTime: em(1, h) });
  G.events = [
    { id: 'a', summary: 'ATENDIMENTO · Maria — Limpeza', start: dt(10), end: dt(11) },
    { id: 'b', summary: 'paciente Joana', start: dt(14), end: dt(15) },
    { id: 'c', summary: 'Consulta do dentista (segredo)', description: 'dados', start: dt(16), end: dt(17) },
    { id: 'd', summary: 'Lembrete', transparency: 'transparent', start: { date: '2026-10-28' }, end: { date: '2026-10-29' } },
    { id: 'e', summary: 'ATENDIMENTO velho', status: 'cancelled', start: dt(8), end: dt(9) },
    { id: 'f', summary: 'Atendimentos de sábado no sítio', start: dt(18), end: dt(19) },
  ];
  const r = (await sync()).out;
  assert.deepEqual(r.externos.map(e => [e.id, e.tag, e.nome]), [['a', 'ATENDIMENTO', 'Maria — Limpeza'], ['b', 'PACIENTE', 'Joana']]);
  assert.equal(r.ocupado.length, 2); assert.ok(!JSON.stringify(r).includes('dentista') && !JSON.stringify(r).includes('segredo'));
  assert.equal(G.events.length, 6); /* eventos de outras origens nunca são apagados nem alterados */
});
await t('agenda: exige login com 2º fator e só aceita POST sync', async () => {
  assert.equal((await sync({ token: null })).statusCode, 401); assert.equal((await sync({ token: jwt('aal1') })).statusCode, 403);
  assert.equal((await call(agenda, { url: '/api/agenda?action=sync' })).statusCode, 404);
});
await t('token expirado/revogado pede nova conexão; desconectar apaga', async () => {
  T.google_tokens[0].refresh_token = lib.seal('outro'); lib.forgetToken();
  const r = await sync();
  assert.equal(r.statusCode, 409); assert.match(r.out.erro, /Conecte de novo/);
  await call(google, { url: '/api/google?action=disconnect', method: 'POST' });
  assert.equal(T.google_tokens.length, 0);
  assert.equal((await sync()).statusCode, 409);
});
await t('função de contratos abre o token cifrado pelo painel (e aceita o formato antigo)', async () => {
  const { abrirToken } = await import('../supabase/functions/contrato-assinar/token.js');
  assert.equal(await abrirToken(lib.seal('1//refresh-xyz'), 'csecret'), '1//refresh-xyz');
  assert.equal(await abrirToken('1//puro-antigo', 'csecret'), '1//puro-antigo');
  await assert.rejects(() => abrirToken(lib.seal('x'), 'outro-segredo'));
});
await t('cofre: ida e volta, e adulteração é detectada', () => {
  const s = lib.seal('segredo'); assert.equal(lib.unseal(s), 'segredo'); assert.notEqual(lib.seal('segredo'), s);
  assert.throws(() => lib.unseal(s.slice(0, -3) + 'AAA'));
  assert.equal(lib.nomeDia('2026-10-27', 'Maria / Silva'), '27-10-26-Maria Silva');
});

const lerBackup = () => { const f = G.files.find(x => x.name.startsWith('backup-painel-') && !x.trashed); return f; };
await t('backup: um arquivo só, na pasta certa; o anterior é apagado de vez', async () => {
  G.files = G.files.filter(f => !f.name.startsWith('backup-')); T.google_tokens.push({ user_id: 'u1', refresh_token: lib.seal('RT-SECRETO'), email: 'x', updated_at: '2026-10-28' }); lib.forgetToken();
  T.config = []; T.pacientes.push(...Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, nome: 'P' + i })));
  const r1 = (await call(backup, { method: 'POST', url: '/api/backup', body: {} })).out;
  const pasta = G.files.find(f => f.name === 'Backup Painel Rose Coutinho'); assert.ok(pasta && !pasta.parents.length);
  assert.equal(G.files.filter(f => f.name.startsWith('backup-painel-')).length, 1); assert.deepEqual(lerBackup().parents, [pasta.id]);
  assert.match(r1.arquivo, /^backup-painel-\d{4}-\d{2}-\d{2}\.json$/); assert.ok(r1.total >= 30);
  const r2 = (await call(backup, { method: 'POST', url: '/api/backup', body: {} })).out;
  assert.equal(G.files.filter(f => f.name.startsWith('backup-painel-')).length, 1); assert.equal(lerBackup().id, r2.id); assert.notEqual(r1.id, r2.id);
  assert.ok(!JSON.stringify(r2).includes('RT-SECRETO'));
});
await t('backup não guarda tokens do Google e lista as tabelas', async () => {
  const r = await call(backup, { url: '/api/backup' }); assert.equal(r.out.ultimo.arquivo.startsWith('backup-painel-'), true); assert.equal(r.out.automatico, false);
});
await t('backup que encolheu muito não apaga o bom (só com "forçar")', async () => {
  T.pacientes = T.pacientes.slice(0, 2);
  const bom = lerBackup().id;
  const r = (await call(backup, { method: 'POST', url: '/api/backup', body: {} })).out;
  assert.ok(r.aviso); assert.equal(G.files.filter(f => f.name.startsWith('backup-painel-') && !f.trashed).length, 2); assert.ok(G.files.find(f => f.id === bom));
  const r3 = (await call(backup, { method: 'POST', url: '/api/backup', body: {} })).out; assert.ok(r3.aviso);
  const r4 = (await call(backup, { method: 'POST', url: '/api/backup', body: { forcar: true } })).out; assert.equal(r4.aviso, null);
  assert.equal(G.files.filter(f => f.name.startsWith('backup-painel-')).length, 1);
});
await t('backup agendado exige o segredo; sem ele é barrado', async () => {
  process.env.CRON_SECRET = 'cron-123';
  assert.equal((await call(backup, { url: '/api/backup', token: 'Errado' })).statusCode, 401);
  const r = await call(backup, { url: '/api/backup', token: 'cron-123' }); assert.equal(r.statusCode, 200); assert.ok(r.out.arquivo);
  assert.equal((await call(backup, { url: '/api/backup' })).out.automatico, true);
});
await t('restaurar: simulação não grava; execução grava em ordem e em lotes', async () => {
  const calls = []; const sb = { from: t => ({ upsert: async (rows, o) => { calls.push([t, rows.length, o.onConflict]); return { error: null }; } }) };
  const dump = { app: 'painel-rosecoutinho', tabelas: { servicos: [{ id: 's' }], pacientes: Array.from({ length: 850 }, (_, i) => ({ id: 'p' + i })), atendimentos: [{ id: 'a' }], membros: [{ user_id: 'u' }] } };
  const logs = []; await restaurar(sb, dump, { log: x => logs.push(x) }); assert.equal(calls.length, 0);
  await restaurar(sb, dump, { executar: true, log: () => {} });
  assert.deepEqual(calls.map(c => c[0] + ':' + c[1]), ['servicos:1', 'pacientes:400', 'pacientes:400', 'pacientes:50', 'atendimentos:1']);
  await assert.rejects(() => restaurar(sb, { foo: 1 }), /não parece/);
});
console.log(ok + ' testes passaram');
