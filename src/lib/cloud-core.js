/* Camada de nuvem: login, carga e sincronização por diferença com o Supabase.
   A interface trabalha com um objeto `db` em memória; aqui ele é convertido em linhas
   das tabelas e só o que mudou é enviado. Não depende do SDK: recebe o cliente pronto. */

const N = v => (v === '' || v === undefined ? null : v);
const CHUNK = 400;

export function toRows(db){
  const known = new Set(db.services.map(s => s.id));
  return {
    servicos: db.services.map((s, i) => ({id: s.id, categoria: s.cat, nome: s.nome, preco_pix: N(s.pix), preco_cartao: N(s.card), duracao_min: N(s.dur), retorno_dias: N(s.ret), pacotes: s.pacotes || [], ordem: i})),
    pacientes: db.patients.map(p => ({id: p.id, nome: p.nome, telefone: N(p.tel), nascimento: N(p.nasc), instagram: N(p.insta), origem: N(p.origem), observacoes: N(p.obs), consentimento_ok: !!(p.lgpd && p.lgpd.ok), consentimento_em: N(p.lgpd && p.lgpd.data), avaliacao: p.aval || {}, anamnese: p.anam || {}})),
    atendimentos: db.patients.flatMap(p => p.atend.map(a => ({id: a.id, paciente_id: p.id, data: a.data, servico_id: known.has(a.servicoId) ? a.servicoId : null, regiao: N(a.regiao), produto: N(a.produto), lote: N(a.lote), sessao: N(a.sessao), valor: N(a.valor), evolucao: N(a.evolucao), retorno_em: N(a.retorno)}))),
  };
}

export function fromRows(sv, pa, at){
  const byP = new Map();
  at.forEach(a => { if (!byP.has(a.paciente_id)) byP.set(a.paciente_id, []); byP.get(a.paciente_id).push({id: a.id, data: a.data, servicoId: a.servico_id || '', regiao: a.regiao || '', produto: a.produto || '', lote: a.lote || '', sessao: a.sessao || '', valor: a.valor ?? '', evolucao: a.evolucao || '', retorno: a.retorno_em || ''}); });
  return {
    v: 1,
    services: sv.map(s => ({id: s.id, cat: s.categoria, nome: s.nome, pix: s.preco_pix, card: s.preco_cartao, dur: s.duracao_min, ret: s.retorno_dias, pacotes: s.pacotes || []})),
    patients: pa.map(p => ({id: p.id, nome: p.nome, tel: p.telefone || '', nasc: p.nascimento || '', insta: p.instagram || '', origem: p.origem || '', obs: p.observacoes || '', lgpd: {ok: !!p.consentimento_ok, data: p.consentimento_em || ''}, aval: p.avaliacao || {}, anam: p.anamnese || {}, atend: byP.get(p.id) || []})),
  };
}

const chunks = (arr, n = CHUNK) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const snapOf = rows => new Map(rows.map(r => [r.id, JSON.stringify(r)]));

export function createCloud(sb, {retryMs = 6000, debounceMs = 700} = {}){
  let snap = null, latest = null, timer = null, busy = false, again = false, pending = false, ready = false, loadedAt = 0;
  let statusCb = () => {};
  const status = s => statusCb(s);

  async function all(table, order){
    const out = [];
    for (let from = 0; ; from += 1000) {
      const {data, error} = await sb.from(table).select('*').order(order).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function upsert(table, rows){ for (const c of chunks(rows)) { const {error} = await sb.from(table).upsert(c, {onConflict: 'id'}); if (error) throw error; } }
  async function remove(table, ids){ for (const c of chunks(ids)) { const {error} = await sb.from(table).delete().in('id', c); if (error) throw error; } }

  async function push(db){
    const rows = toRows(db), now = {};
    for (const t of Object.keys(rows)) now[t] = snapOf(rows[t]);
    const plan = {};
    for (const t of Object.keys(rows)) {
      plan[t] = {up: rows[t].filter(r => snap[t].get(r.id) !== now[t].get(r.id)), del: [...snap[t].keys()].filter(id => !now[t].has(id))};
    }
    for (const t of ['servicos', 'pacientes', 'atendimentos']) {
      if (plan[t].up.length) { await upsert(t, plan[t].up); plan[t].up.forEach(r => snap[t].set(r.id, now[t].get(r.id))); }
    }
    for (const t of ['atendimentos', 'pacientes', 'servicos']) {
      if (plan[t].del.length) { await remove(t, plan[t].del); plan[t].del.forEach(id => snap[t].delete(id)); }
    }
  }

  async function flush(){
    if (!latest || !snap) return;
    if (busy) { again = true; return; }
    busy = true; status('syncing');
    try { await push(latest); pending = false; status('ok'); }
    catch (e) { console.error('sync', e); status('error'); clearTimeout(timer); timer = setTimeout(flush, retryMs); }
    finally { busy = false; if (again) { again = false; flush(); } }
  }

  return {
    onStatus(cb){ statusCb = cb; },
    async session(){ const {data} = await sb.auth.getSession(); return data.session; },
    async signIn(email, password){ const {error} = await sb.auth.signInWithPassword({email, password}); if (error) throw error; },
    async signOut(){ await sb.auth.signOut(); },
    onSignOut(cb){ sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') cb(); }); },
    async load(seedServices){
      const [sv, pa, at] = await Promise.all([all('servicos', 'ordem'), all('pacientes', 'id'), all('atendimentos', 'id')]);
      const db = fromRows(sv, pa, at);
      snap = {servicos: new Map(), pacientes: new Map(), atendimentos: new Map()};
      if (!db.services.length) db.services = seedServices.map(s => ({...s}));
      // o que veio do servidor já está salvo; o catálogo inicial (banco vazio) ainda precisa subir
      const rows = toRows(db);
      for (const t of Object.keys(rows)) snap[t] = snapOf(rows[t]);
      if (!sv.length) { snap.servicos = new Map(); await push(db); }
      latest = db; pending = false; ready = true; loadedAt = Date.now(); status('ok');
      return db;
    },
    queue(db){ latest = db; pending = true; status('pending'); clearTimeout(timer); timer = setTimeout(flush, debounceMs); },
    flush,
    get pending(){ return pending; },
    get ready(){ return ready; },
    get loadedAt(){ return loadedAt; },
  };
}
