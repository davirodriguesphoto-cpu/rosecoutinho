import { handler, member, db, query, E, cfg, authUrl, readState, exchangeCode, seal, forgetToken, SCOPES } from './_lib.js';

export const config = { maxDuration: 15 };

export default handler(async (req, res) => {
  const { action } = query(req);

  if (action === 'callback') { /* volta do Google: sem cabeçalho de login, protegido pelo "state" assinado */
    const q = query(req), back = u => { res.statusCode = 302; res.setHeader('location', cfg().app + '/#' + u); res.end(); };
    if (q.error) return back('agenda?google=negado');
    try {
      const st = readState(q.state), d = await db();
      if (!(await d.get('membros', { user_id: st.u }))) throw E(403, 'Sem permissão.');
      const t = await exchangeCode(q.code);
      if (!t.refresh_token) throw E(400, 'O Google não devolveu a autorização permanente.');
      if (!String(t.scope || '').includes('drive.file') || !String(t.scope).includes('calendar.events')) return back('agenda?google=incompleto');
      let email = '';
      try { email = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()).email || ''; } catch (e) {}
      await d.upsert('google_tokens', { user_id: st.u, refresh_token: seal(t.refresh_token), email, updated_at: new Date().toISOString() }, 'user_id');
      forgetToken();
      return back('agenda?google=ok');
    } catch (e) { console.error('callback', e); return back('agenda?google=erro'); }
  }

  const u = await member(req), d = await db();
  if (action === 'status') {
    const row = await d.get('google_tokens', null, 'updated_at');
    return { conectado: !!row, email: row ? row.email || '' : '', configurado: !!(cfg().gid && cfg().gsecret) };
  }
  if (action === 'start') return { url: authUrl(u.id) };
  if (action === 'disconnect') {
    for (const r of await d.list('google_tokens')) await d.del('google_tokens', { user_id: r.user_id });
    forgetToken();
    return { ok: true };
  }
  throw E(404, 'Ação desconhecida.');
});
