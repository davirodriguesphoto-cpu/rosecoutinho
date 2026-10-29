/* Camada de nuvem: login, carga e sincronização por diferença com o Supabase.
   A interface trabalha com um objeto `db` em memória; aqui ele é convertido em linhas
   das tabelas e só o que mudou é enviado. Não depende do SDK: recebe o cliente pronto. */

const N = v => (v === '' || v === undefined ? null : v);
const CHUNK = 400;
const opt = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
const P2 = n => String(n).padStart(2, '0');
/* agenda: o app usa hora local 'AAAA-MM-DDTHH:MM'; o banco guarda timestamptz */
const localIso = ts => { const d = new Date(ts); return `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())}T${P2(d.getHours())}:${P2(d.getMinutes())}`; };

export function toRows(db){
  const known = new Set(db.services.map(s => s.id)), pats = new Set(db.patients.map(p => p.id)), pk = (db.pacotes || []).filter(k => pats.has(k.pid));
  return {
    servicos: db.services.map((s, i) => ({id: s.id, categoria: s.cat, nome: s.nome, preco_pix: N(s.pix), preco_cartao: N(s.card), duracao_min: N(s.dur), retorno_dias: N(s.ret), pacotes: s.pacotes || [], ordem: i})),
    pacientes: db.patients.map(p => ({id: p.id, nome: p.nome, telefone: N(p.tel), nascimento: N(p.nasc), instagram: N(p.insta), origem: N(p.origem), observacoes: N(p.obs), consentimento_ok: !!(p.lgpd && p.lgpd.ok), consentimento_em: N(p.lgpd && p.lgpd.data), avaliacao: p.aval || {}, anamnese: p.anam || {}, ciclo: p.ciclo || {}, cpf: N(p.cpf), rg: N(p.rg), endereco: N(p.end), cep: N(p.cep), imagem_publicidade: N(p.img), imagem_publicidade_em: N(p.imgEm)})),
    atendimentos: db.patients.flatMap(p => p.atend.map(a => ({id: a.id, paciente_id: p.id, data: a.data, servico_id: known.has(a.servicoId) ? a.servicoId : null, regiao: N(a.regiao), produto: N(a.produto), lote: N(a.lote), sessao: N(a.sessao), valor: N(a.valor), evolucao: N(a.evolucao), retorno_em: N(a.retorno)}))),
    agendamentos: (db.agenda || []).map(a => ({id: a.id, paciente_id: pats.has(a.pid) ? a.pid : null, servico_id: known.has(a.sid) ? a.sid : null, inicio: new Date(a.ini).toISOString(), fim: new Date(new Date(a.ini).getTime() + (a.dur || 30) * 60000).toISOString(), status: a.status, observacoes: N(a.obs), remarcacoes: a.rem || []})),
    pacotes_paciente: pk.map(k => ({id: k.id, paciente_id: k.pid, servico_id: known.has(k.sid) ? k.sid : null, sessoes_total: k.total, sessoes_usadas: k.usadas, valor_total: N(k.valor), valor_pago: k.parc.filter(x => x.pago).reduce((t, x) => t + Number(x.valor), 0), criado_em: k.criado, validade: N(k.validade)})),
    lancamentos: pk.flatMap(k => k.parc.map((x, i) => ({id: x.id, data: x.venc, tipo: 'entrada', categoria: 'Pacote', descricao: `Parcela ${i + 1}/${k.parc.length}`, valor: x.valor, forma_pagamento: N(k.forma), pago: !!x.pago, paciente_id: k.pid, atendimento_id: null, pacote_id: k.id, pago_em: N(x.pagoEm)}))),
    mensagens: (db.msgs || []).map(m => ({id: m.id, paciente_id: m.pid, tipo: m.tipo, chave: N(m.chave), texto: N(m.texto), enviado_em: m.em})),
  };
}

export function fromRows(sv, pa, at, ms = [], tpl = {}, ag = [], pk = [], lc = []){
  const byP = new Map();
  at.forEach(a => { if (!byP.has(a.paciente_id)) byP.set(a.paciente_id, []); byP.get(a.paciente_id).push({id: a.id, data: a.data, servicoId: a.servico_id || '', regiao: a.regiao || '', produto: a.produto || '', lote: a.lote || '', sessao: a.sessao || '', valor: a.valor ?? '', evolucao: a.evolucao || '', retorno: a.retorno_em || ''}); });
  return {
    v: 1,
    services: sv.map(s => ({id: s.id, cat: s.categoria, nome: s.nome, pix: s.preco_pix, card: s.preco_cartao, dur: s.duracao_min, ret: s.retorno_dias, pacotes: s.pacotes || []})),
    patients: pa.map(p => ({id: p.id, nome: p.nome, tel: p.telefone || '', nasc: p.nascimento || '', insta: p.instagram || '', origem: p.origem || '', obs: p.observacoes || '', lgpd: {ok: !!p.consentimento_ok, data: p.consentimento_em || ''}, aval: p.avaliacao || {}, anam: p.anamnese || {}, ...(p.ciclo && Object.keys(p.ciclo).length ? {ciclo: p.ciclo} : {}), ...opt({cpf: p.cpf, rg: p.rg, end: p.endereco, cep: p.cep, img: p.imagem_publicidade, imgEm: p.imagem_publicidade_em}), atend: byP.get(p.id) || [], pasta: p.drive_folder_id || ''})),
    msgs: ms.map(m => ({id: m.id, pid: m.paciente_id, tipo: m.tipo, chave: m.chave || '', texto: m.texto || '', em: m.enviado_em})),
    tpl,
    pacotes: pk.map(k => { const ps = lc.filter(l => l.pacote_id === k.id).sort((a, b) => a.data.localeCompare(b.data) || (a.descricao || '').localeCompare(b.descricao || '', undefined, {numeric: true}));
      return {id: k.id, pid: k.paciente_id, sid: k.servico_id || '', total: k.sessoes_total, usadas: k.sessoes_usadas, valor: k.valor_total == null ? '' : Number(k.valor_total), criado: k.criado_em, validade: k.validade || '', forma: (ps[0] && ps[0].forma_pagamento) || '', parc: ps.map(l => ({id: l.id, venc: l.data, valor: Number(l.valor), pago: !!l.pago, pagoEm: l.pago_em || ''}))}; }),
    agenda: ag.map(a => ({id: a.id, pid: a.paciente_id || '', sid: a.servico_id || '', ini: localIso(a.inicio), dur: Math.round((new Date(a.fim) - new Date(a.inicio)) / 60000), status: a.status, obs: a.observacoes || '', gid: a.google_event_id || '', rem: a.remarcacoes || []})),
  };
}

const chunks = (arr, n = CHUNK) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const snapOf = rows => new Map(rows.map(r => [r.id, JSON.stringify(r)]));

export function createCloud(sb, {retryMs = 6000, debounceMs = 700} = {}){
  let snapTpl = '{}', snap = null, latest = null, timer = null, busy = false, again = false, pending = false, ready = false, loadedAt = 0;
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
    for (const t of ['servicos', 'pacientes', 'atendimentos', 'agendamentos', 'pacotes_paciente', 'lancamentos', 'mensagens']) {
      if (plan[t].up.length) { await upsert(t, plan[t].up); plan[t].up.forEach(r => snap[t].set(r.id, now[t].get(r.id))); }
    }
    for (const t of ['mensagens', 'lancamentos', 'pacotes_paciente', 'agendamentos', 'atendimentos', 'pacientes', 'servicos']) {
      if (plan[t].del.length) { await remove(t, plan[t].del); plan[t].del.forEach(id => snap[t].delete(id)); }
    }
    const tj = JSON.stringify(db.tpl || {});
    if (tj !== snapTpl) { const {error} = await sb.from('config').upsert({chave: 'modelos_msg', valor: db.tpl || {}}, {onConflict: 'chave'}); if (error) throw error; snapTpl = tj; }
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
    /* 'login' | 'enroll' (sem segundo fator ainda) | 'challenge' (pedir o código) | 'ready' */
    async authState(){
      const {data: s} = await sb.auth.getSession();
      if (!s || !s.session) return 'login';
      const {data: a, error} = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (a.currentLevel === 'aal2') return 'ready';
      return a.nextLevel === 'aal2' ? 'challenge' : 'enroll';
    },
    async enroll(){
      const {data: l} = await sb.auth.mfa.listFactors();
      for (const f of (l && l.all) || []) if (f.factor_type === 'totp' && f.status === 'unverified') await sb.auth.mfa.unenroll({factorId: f.id});
      const {data, error} = await sb.auth.mfa.enroll({factorType: 'totp', friendlyName: 'Celular ' + new Date().toISOString().slice(0, 10)});
      if (error) throw error;
      return {factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret};
    },
    async verifyCode(factorId, code){ const {error} = await sb.auth.mfa.challengeAndVerify({factorId, code: String(code).replace(/\s/g, '')}); if (error) throw error; },
    async factorId(){ const {data, error} = await sb.auth.mfa.listFactors(); if (error) throw error; const f = ((data && data.totp) || [])[0]; if (!f) throw new Error('sem fator verificado'); return f.id; },
    /* chamadas às funções do servidor (/api), sempre com a sessão atual */
    async api(path, opt = {}){
      const {data} = await sb.auth.getSession();
      const tk = data && data.session && data.session.access_token;
      const r = await fetch(path, {...opt, headers: {...(opt.headers || {}), authorization: 'Bearer ' + tk}});
      if (!r.ok) { const j = await r.json().catch(() => ({})); const e = new Error(j.erro || 'Falha na comunicação com o servidor.'); e.status = r.status; throw e; }
      return opt.raw ? r : r.json();
    },
    async fotos(pacienteId){
      const {data, error} = await sb.from('fotos').select('id,tipo,tirada_em,legenda,created_at').eq('paciente_id', pacienteId).like('arquivo_path', 'drive:%').order('tirada_em', {ascending: false}).order('created_at', {ascending: false});
      if (error) throw error; return data;
    },
    async fotoMeta(id, patch){ const {error} = await sb.from('fotos').update(patch).eq('id', id); if (error) throw error; },
    onSignOut(cb){ sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') cb(); }); },
    async load(seedServices){
      const [sv, pa, at, ms, cfg, ag, pk, lc] = await Promise.all([all('servicos', 'ordem'), all('pacientes', 'id'), all('atendimentos', 'id'), all('mensagens', 'enviado_em'), all('config', 'chave'), all('agendamentos', 'inicio'), all('pacotes_paciente', 'id'), all('lancamentos', 'data')]);
      const tpl = ((cfg.find(c => c.chave === 'modelos_msg') || {}).valor) || {};
      const db = fromRows(sv, pa, at, ms, tpl, ag, pk, lc.filter(l => l.pacote_id)); snapTpl = JSON.stringify(tpl);
      snap = {servicos: new Map(), pacientes: new Map(), atendimentos: new Map(), mensagens: new Map(), agendamentos: new Map(), pacotes_paciente: new Map(), lancamentos: new Map()};
      if (!db.services.length) db.services = seedServices.map(s => ({...s}));
      // o que veio do servidor já está salvo; o catálogo inicial (banco vazio) ainda precisa subir
      const rows = toRows(db);
      for (const t of Object.keys(rows)) snap[t] = snapOf(rows[t]);
      if (!sv.length) { snap.servicos = new Map(); await push(db); }
      latest = db; pending = false; ready = true; loadedAt = Date.now(); status('ok');
      return db;
    },
    queue(db){ latest = db; pending = true; status('pending'); clearTimeout(timer); timer = setTimeout(flush, debounceMs); },
    /* documentos e modelos: direto no banco (não passam pela sincronização do painel) porque a assinatura acontece fora dele */
    docs: {
      async listar(pid){
        /* contrato que venceu sem assinatura perde o texto e o link */
        await sb.from('documentos').update({texto_final: null, token: null}).eq('paciente_id', pid).is('assinado_em', null).lt('expira_em', new Date().toISOString());
        const {data, error} = await sb.from('documentos').select('id,tipo,titulo,assinado_em,expira_em,token,drive_file_id,created_at').eq('paciente_id', pid).order('created_at', {ascending: false}); if (error) throw error; return data; },
      async criar(row){ const {data, error} = await sb.from('documentos').insert(row).select('id,token').single(); if (error) throw error; return data; },
      async apagar(id){ const {error} = await sb.from('documentos').delete().eq('id', id); if (error) throw error; },
      async modelos(){ const {data, error} = await sb.from('modelos_documento').select('*').eq('ativo', true).order('titulo'); if (error) throw error; return data; },
      async salvarModelo(row){ const {error} = await sb.from('modelos_documento').upsert(row, {onConflict: 'id'}); if (error) throw error; },
    },
    flush,
    get pending(){ return pending; },
    get ready(){ return ready; },
    get loadedAt(){ return loadedAt; },
  };
}
