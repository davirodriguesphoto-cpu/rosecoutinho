import assert from 'node:assert/strict';
import { createCloud, toRows, fromRows } from '../src/lib/cloud-core.js';

/* Supabase simulado em memória: guarda linhas por tabela e registra cada chamada. */
function fakeSb(){
  const t = {servicos: new Map(), pacientes: new Map(), atendimentos: new Map(), mensagens: new Map(), agendamentos: new Map(), config: new Map()};
  const calls = []; let failNext = 0, delayMs = 0;
  const wait = () => new Promise(r => setTimeout(r, delayMs));
  const from = name => ({
    select: () => { const q = {order: () => q, range: async (a, b) => ({data: [...t[name].values()].slice(a, b + 1), error: null})}; return q; },
    upsert: async (rows) => { rows = [].concat(rows); calls.push(['upsert', name, rows.length]); await wait(); if (failNext > 0) { failNext--; return {error: new Error('rede')}; } rows.forEach(r => t[name].set(r.id ?? r.chave, structuredClone(r))); return {error: null}; },
    delete: () => ({in: async (_c, ids) => { calls.push(['delete', name, ids.length]); await wait(); if (failNext > 0) { failNext--; return {error: new Error('rede')}; } ids.forEach(i => t[name].delete(i)); return {error: null}; }}),
  });
  return {from, t, calls, fail: n => failNext = n, delay: ms => delayMs = ms, auth: {}};
}
const seed = [{id: 'sv1', cat: 'Aparelhos', nome: 'Ultrassom', pix: 50, card: 55, dur: 30, ret: 7, pacotes: []}, {id: 'sv2', cat: 'Estética Facial', nome: 'Limpeza de pele', pix: 150, card: 160, dur: 60, ret: 30}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const opts = {retryMs: 30, debounceMs: 5};
let n = 0; const ok = m => console.log(`ok ${++n} - ${m}`);

/* 1. banco vazio: catálogo inicial sobe sozinho */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed);
  assert.equal(db.services.length, 2); assert.equal(sb.t.servicos.size, 2); assert.equal(sb.t.pacientes.size, 0); ok('banco vazio recebe o catálogo inicial'); }

/* 2. ida e volta: nada se perde nem muda de forma */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '12 9', nasc: '1990-02-03', insta: '', origem: '', obs: '', lgpd: {ok: true, data: '2026-10-27'}, aval: {queixa: 'x'}, anam: {gestante: {r: 'n', d: ''}}, atend: [{id: 'a1', data: '2026-10-01', servicoId: 'sv1', regiao: 'abdômen', produto: '', lote: '', sessao: '1 de 4', valor: 50, evolucao: 'ok', retorno: '2026-10-08'}]});
  c.queue(db); await sleep(60);
  const c2 = createCloud(sb, opts); const back = await c2.load(seed);
  assert.deepEqual(back.patients[0], db.patients[0]); assert.deepEqual(back.services.map(s => s.id), ['sv1', 'sv2']); ok('salvar e recarregar devolve exatamente os mesmos dados'); }

/* 3. só o que mudou é enviado */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []}, {id: 'p2', nome: 'Bia', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []});
  c.queue(db); await sleep(60); sb.calls.length = 0;
  db.patients[1].tel = '123'; c.queue(db); await sleep(60);
  assert.deepEqual(sb.calls, [['upsert', 'pacientes', 1]]); ok('editar 1 de 2 pacientes envia 1 linha'); }

/* 4. exclusão: paciente e atendimentos somem no servidor, na ordem certa */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: [{id: 'a1', data: '2026-10-01', servicoId: 'sv1', regiao: '', produto: '', lote: '', sessao: '', valor: '', evolucao: '', retorno: ''}]});
  c.queue(db); await sleep(60); assert.equal(sb.t.atendimentos.size, 1);
  db.patients = []; c.queue(db); await sleep(60);
  assert.equal(sb.t.pacientes.size, 0); assert.equal(sb.t.atendimentos.size, 0);
  const dels = sb.calls.filter(x => x[0] === 'delete').map(x => x[1]); assert.deepEqual(dels, ['atendimentos', 'pacientes']); ok('excluir paciente apaga atendimentos antes do cadastro'); }

/* 5. falha de rede: não perde nada e tenta de novo sozinho */
{ const sb = fakeSb(), c = createCloud(sb, opts); const st = []; c.onStatus(s => st.push(s)); const db = await c.load(seed);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []});
  sb.fail(2); c.queue(db); await sleep(25); assert.equal(c.pending, true); assert.ok(st.includes('error'));
  await sleep(200); assert.equal(c.pending, false); assert.equal(sb.t.pacientes.size, 1); ok('falha de rede: tenta de novo e conclui sem perder o paciente'); }

/* 6. edição durante um envio em andamento: a versão mais nova também chega */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed); sb.delay(40);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []});
  c.queue(db); await sleep(20);                       // envio começou
  db.patients[0].nome = 'Ana Paula'; c.queue(db);    // edição no meio do envio
  await sleep(300); assert.equal(sb.t.pacientes.get('p1').nome, 'Ana Paula'); assert.equal(c.pending, false); ok('edição feita durante o envio não é perdida'); }

/* 7. atendimento de serviço apagado não quebra a gravação */
{ const rows = toRows({services: seed, patients: [{id: 'p1', nome: 'A', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: [{id: 'a1', data: '2026-10-01', servicoId: 'apagado', regiao: '', produto: '', lote: '', sessao: '', valor: '', evolucao: '', retorno: ''}]}]});
  assert.equal(rows.atendimentos[0].servico_id, null); ok('serviço removido vira vazio em vez de erro de chave'); }

/* 8. mais de 400 pacientes sobem em lotes */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed); sb.calls.length = 0;
  for (let i = 0; i < 950; i++) db.patients.push({id: 'p' + i, nome: 'P' + i, tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []});
  c.queue(db); await sleep(80); assert.equal(sb.t.pacientes.size, 950); assert.deepEqual(sb.calls.map(x => x[2]), [400, 400, 150]);
  const c2 = createCloud(sb, opts); assert.equal((await c2.load(seed)).patients.length, 950); ok('importação de 950 pacientes em lotes de 400, e recarrega todos'); }


/* ---- login em dois passos ---- */
function fakeAuth(st){
  const log = [];
  const sb = {auth: {
    getSession: async () => ({data: {session: st.session ? {} : null}}),
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({data: {currentLevel: st.cur, nextLevel: st.next}, error: null}),
      listFactors: async () => ({data: {all: st.factors, totp: st.factors.filter(f => f.status === 'verified')}, error: null}),
      unenroll: async ({factorId}) => { log.push(['unenroll', factorId]); st.factors = st.factors.filter(f => f.id !== factorId); return {error: null}; },
      enroll: async () => { const f = {id: 'f' + (st.factors.length + 1), factor_type: 'totp', status: 'unverified'}; st.factors.push(f); return {data: {id: f.id, totp: {qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCD'}}, error: null}; },
      challengeAndVerify: async ({factorId, code}) => { log.push(['verify', factorId, code]); if (code !== '123456') return {error: Object.assign(new Error('bad'), {status: 400})}; st.factors.forEach(f => { if (f.id === factorId) f.status = 'verified'; }); st.cur = 'aal2'; return {error: null}; },
    }}, from: () => ({})};
  return {sb, log, st};
}
{ const k = (o) => { const f = fakeAuth(o); return {c: createCloud(f.sb, opts), ...f}; };
  assert.equal(await k({session: false, cur: null, next: null, factors: []}).c.authState(), 'login');
  assert.equal(await k({session: true, cur: 'aal1', next: 'aal1', factors: []}).c.authState(), 'enroll');
  assert.equal(await k({session: true, cur: 'aal1', next: 'aal2', factors: [{id: 'f1', factor_type: 'totp', status: 'verified'}]}).c.authState(), 'challenge');
  assert.equal(await k({session: true, cur: 'aal2', next: 'aal2', factors: [{id: 'f1', factor_type: 'totp', status: 'verified'}]}).c.authState(), 'ready');
  ok('estados do login: sem sessão, sem 2º fator, pedir código, liberado'); }
{ const f = fakeAuth({session: true, cur: 'aal1', next: 'aal1', factors: [{id: 'velho', factor_type: 'totp', status: 'unverified'}]}); const c = createCloud(f.sb, opts);
  const e = await c.enroll(); assert.deepEqual(f.log, [['unenroll', 'velho']]); assert.equal(e.secret, 'ABCD'); assert.ok(e.qr.startsWith('data:image/svg'));
  await assert.rejects(c.verifyCode(e.factorId, '000000')); assert.equal(await c.authState(), 'enroll');
  await c.verifyCode(e.factorId, '123 456'); assert.equal(f.log.at(-1)[2], '123456'); assert.equal(await c.authState(), 'ready');
  ok('cadastro do 2º fator: descarta tentativa antiga, rejeita código errado, aceita código com espaço'); }

/* 11. lembretes enviados, modelos de mensagem e ciclo voltam iguais */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, ciclo: {inicios: ['2026-09-01']}, atend: []});
  db.msgs = [{id: 'm1', pid: 'p1', tipo: 'aniversario', chave: 'aniversario:2026', texto: 'Oi', em: '2026-10-28T10:00:00.000Z'}]; db.tpl = {aniversario: 'Parabéns, {nome}!'};
  c.queue(db); await sleep(60);
  const back = await createCloud(sb, opts).load(seed);
  assert.deepEqual(back.msgs, db.msgs); assert.deepEqual(back.tpl, db.tpl); assert.deepEqual(back.patients[0].ciclo, {inicios: ['2026-09-01']});
  sb.calls.length = 0; db.msgs = []; c.queue(db); await sleep(60); assert.deepEqual(sb.calls, [['delete', 'mensagens', 1]]); ok('mensagens, modelos e ciclo sincronizam e apagam'); }

/* 12. agenda: hora local ida e volta, remarcações e vínculo com o Google preservados */
{ const sb = fakeSb(), c = createCloud(sb, opts); const db = await c.load(seed);
  db.patients.push({id: 'p1', nome: 'Ana', tel: '', nasc: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []});
  db.agenda = [{id: 'g1', pid: 'p1', sid: 'sv1', ini: '2026-10-30T14:30', dur: 45, status: 'agendado', obs: 'x', gid: 'ev123', rem: [{de: '2026-10-28T09:00', motivo: 'periodo', em: '2026-10-27T10:00'}]}];
  c.queue(db); await sleep(60);
  const back = await createCloud(sb, opts).load(seed); assert.deepEqual(back.agenda, db.agenda);
  sb.calls.length = 0; db.patients = []; db.agenda = []; c.queue(db); await sleep(60);
  assert.deepEqual(sb.calls, [['delete', 'agendamentos', 1], ['delete', 'pacientes', 1]]); ok('agenda sincroniza em hora local e sai antes do paciente'); }

console.log(`\n${n} testes passaram`);
