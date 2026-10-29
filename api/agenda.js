/* Mantém o Google Agenda em dia com a agenda do painel (o painel é a fonte da verdade) e devolve o que
   existe só no Google: eventos PACIENTE/ATENDIMENTO criados lá e, dos demais (pessoais), apenas o horário ocupado. */
import { handler, member, db, query, E, g, CAL, TAGS } from './_lib.js';

export const config = { maxDuration: 60 };
const VIVO = ['agendado', 'confirmado', 'realizado'];
const FIELDS = 'items(id,summary,status,transparency,start,end,extendedProperties/private)';
const ms = x => Date.parse(x);
const when = x => x && (x.dateTime || x.date);
const tag = s => { const m = TAGS.exec(s || ''); return m ? m[1].toUpperCase() : ''; };
const nomeDe = s => String(s || '').replace(TAGS, '').replace(/^[\s·\-–—:|\[\]()]+|[\s·\-–—:|\[\]()]+$/g, '').replace(/\s{2,}/g, ' ');

async function pool(itens, n, fn){
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]); } }));
  return out;
}
const ignora = (e, ...codes) => { if (!codes.includes(e.status)) throw e; };

export default handler(async (req) => {
  await member(req);
  if (req.method !== 'POST' || query(req).action !== 'sync') throw E(404, 'Ação desconhecida.');
  const d = await db(), cal = CAL + 'primary/events';
  const de = new Date(Date.now() - 86400000), ate = new Date(Date.now() + 120 * 86400000);

  const [todos, pacs, svs] = await Promise.all([d.list('agendamentos', null, 'id'), d.list('pacientes', null, 'id'), d.list('servicos', null, 'id')]);
  const nomeP = new Map(pacs.map(p => [p.id, p.nome])), nomeS = new Map(svs.map(s => [s.id, s.nome]));
  const existentes = new Set(todos.map(a => a.id));
  const naJanela = todos.filter(a => ms(a.inicio) >= de.getTime() && ms(a.inicio) <= ate.getTime());

  const lista = await g(`${cal}?` + new URLSearchParams({ timeMin: de.toISOString(), timeMax: ate.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', fields: FIELDS }));
  const eventos = (lista.items || []).filter(e => e.status !== 'cancelled');
  const porId = new Map(eventos.map(e => [e.id, e])), porPainel = new Map();
  for (const e of eventos) { const p = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.painel; if (p) porPainel.set(p, e); }

  const r = { criados: 0, atualizados: 0, removidos: 0, atualizacoes: [], externos: [], ocupado: [] };
  const titulo = a => `ATENDIMENTO · ${nomeP.get(a.paciente_id) || 'Paciente'}${a.servico_id && nomeS.get(a.servico_id) ? ' — ' + nomeS.get(a.servico_id) : ''}`;
  const corpo = a => ({ summary: titulo(a), description: 'Criado pelo painel da clínica.', start: { dateTime: new Date(a.inicio).toISOString(), timeZone: 'America/Sao_Paulo' }, end: { dateTime: new Date(a.fim).toISOString(), timeZone: 'America/Sao_Paulo' }, reminders: { useDefault: true }, extendedProperties: { private: { painel: a.id } } });
  const igual = (ev, a) => ev.summary === titulo(a) && ms(when(ev.start)) === ms(a.inicio) && ms(when(ev.end)) === ms(a.fim);

  await pool(naJanela, 5, async a => {
    const ev = (a.google_event_id && porId.get(a.google_event_id)) || porPainel.get(a.id);
    if (!VIVO.includes(a.status)) { /* cancelou, faltou: tira do Google */
      if (ev) { try { await g(`${cal}/${encodeURIComponent(ev.id)}`, { method: 'DELETE' }); r.removidos++; } catch (e) { ignora(e, 404); } }
      if (a.google_event_id) { await d.update('agendamentos', { id: a.id }, { google_event_id: null }); r.atualizacoes.push({ id: a.id, gid: '' }); }
      return;
    }
    if (!ev) {
      if (a.google_event_id) return; /* o evento foi apagado direto no Google: não recriamos */
      const novo = await g(`${cal}?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo(a)) });
      await d.update('agendamentos', { id: a.id }, { google_event_id: novo.id }); r.criados++; r.atualizacoes.push({ id: a.id, gid: novo.id }); return;
    }
    if (!igual(ev, a)) { await g(`${cal}/${encodeURIComponent(ev.id)}?fields=id`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary: titulo(a), start: corpo(a).start, end: corpo(a).end }) }); r.atualizados++; }
    if (a.google_event_id !== ev.id) { await d.update('agendamentos', { id: a.id }, { google_event_id: ev.id }); r.atualizacoes.push({ id: a.id, gid: ev.id }); }
  });

  for (const e of eventos) {
    const p = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.painel;
    if (p) { /* evento do painel cujo agendamento foi excluído: sai também do Google */
      if (!existentes.has(p)) { try { await g(`${cal}/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); r.removidos++; } catch (x) { ignora(x, 404); } }
      continue;
    }
    const item = { inicio: when(e.start), fim: when(e.end), diaInteiro: !!(e.start && e.start.date) }, t = tag(e.summary);
    if (t) r.externos.push({ ...item, id: e.id, tag: t, nome: nomeDe(e.summary) || e.summary });
    else if (e.transparency !== 'transparent') r.ocupado.push(item); /* pessoal: só o horário */
  }
  return r;
});
