import './style.css';
import SERVICES from './services.json';
import { cloud } from './lib/cloud.js';
import corpoSvg from './assets/mapa/corpo.svg?raw';
import rostoSvg from './assets/mapa/rosto.svg?raw';
import { preencher as preencherContrato, faltando as faltandoContrato, novoToken, cpfValido } from './lib/contrato.js';

const KEY = 'rc-clinica-v1';
const CATS = ['Estética Convencional','Estética Facial','Aparelhos','Estética Avançada'];
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate()+n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const fmtD = s => s ? s.split('-').reverse().join('/') : '';
const money = n => n == null || n === '' ? 'a definir' : 'R$ ' + Number(n).toLocaleString('pt-BR', {maximumFractionDigits: 2});
const initials = n => n.trim().split(/\s+/).slice(0,2).map(p => p[0]).join('').toUpperCase();
const age = s => { if (!s) return ''; const d = parse(s), t = new Date(); let a = t.getFullYear()-d.getFullYear(); if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--; return a >= 0 && a < 120 ? a + ' anos' : ''; };

/* ---------- dados (localStorage, com cópia em memória) ---------- */
let mem = null;
function localLoad(){ try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch(e){} return mem; }
/* na nuvem os dados de pacientes não ficam gravados no aparelho */
function save(){ if (cloud) return cloud.queue(db); mem = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){} }
const svc = id => db.services.find(s => s.id === id);
const svcBy = p => db.services.find(s => s.nome.startsWith(p));

function seed(){
  /* dados de exemplo determinísticos: 12 pacientes ativas e 4 que sumiram */
  const t = today(); let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const nomes = ['Ana','Beatriz','Carla','Daniela','Eduarda','Fernanda','Gabriela','Helena','Isabela','Juliana','Karina','Larissa','Mariana','Natália','Patrícia','Renata'];
  const find = n => SERVICES.find(x => x.nome.startsWith(n));
  const leves = ['Drenagem Linfática — corporal','Modeladora — corporal','Limpeza de pele','Ultrassom corporal','Radiofrequência facial','Drenagem Linfática — 2 regiões'].map(find);
  const altos = ['SkinBooster','Toxina botulínica','Microagulhamento facial','Bioestimulador — Nutriex','Preenchimento — baixa viscosidade (Renova)'].map(find);
  const mk = (i, atend) => ({id: uid(), demo: true, nome: nomes[i] + ' Exemplo', tel: '12 9' + String(8000 + i * 37).padStart(4, '0') + '-' + String(1000 + i * 91).slice(0, 4), nasc: '19' + (80 + i) + '-0' + (1 + i % 9) + '-1' + (i % 9), insta: '', origem: ['Instagram','Indicação','Google'][i % 3], obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend});
  const patients = nomes.map((_, i) => {
    const sumiu = i >= 12; let d = (sumiu ? 175 + i * 6 : 150 + i * 4); const fim = sumiu ? 100 + (i - 12) * 40 : 0; const atend = [];
    while (d > fim) { const s = rnd() < .75 ? leves[Math.floor(rnd() * leves.length)] : altos[Math.floor(rnd() * altos.length)]; const data = addDays(t, -d);
      atend.push({id: uid(), data, servicoId: s.id, regiao: '', produto: '', lote: '', sessao: '', valor: s.pix ?? '', evolucao: '', retorno: addDays(data, s.ret)});
      d -= Math.round(14 + rnd() * 30 + (s.ret > 60 ? 40 : 0)); }
    return mk(i, atend); });
  const pacotes = [{id: uid(), pid: patients[3].id, sid: leves[0].id, total: 8, usadas: 3, valor: 400, criado: addDays(t, -30), validade: addDays(t, 6), forma: 'Pix',
    parc: [{id: uid(), venc: addDays(t, -30), valor: 200, pago: true, pagoEm: addDays(t, -30)}, {id: uid(), venc: addDays(t, 3), valor: 200, pago: false, pagoEm: ''}]}];
  const agenda = [[0, 1, '10:00'], [1, 1, '14:30'], [2, 2, '09:00']].map(([i, d, h]) => ({id: uid(), pid: patients[i].id, sid: leves[i].id, ini: addDays(t, d) + 'T' + h, dur: leves[i].dur || 60, status: 'agendado', obs: '', gid: '', rem: []}));
  return {v: 1, services: SERVICES.map(x => ({...x})), patients, msgs: [], tpl: {}, agenda, pacotes};
}
let db = {v: 1, services: [], patients: [], msgs: [], tpl: {}, agenda: [], pacotes: []};

/* ---------- interface base ---------- */
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
function openSheet(title, html){ $('#sheet-title').textContent = title; $('#sheet-body').innerHTML = html; $('#sheet').hidden = false; document.body.classList.add('lock'); const f = $('#sheet-body input,#sheet-body select,#sheet-body textarea'); if (f && !/Mobi|Android/i.test(navigator.userAgent)) f.focus(); }
function closeSheet(){ $('#sheet').hidden = true; document.body.classList.remove('lock'); }
$('#sheet-x').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
function arm(btn, fn){ /* confirmação em dois toques, sem diálogo do navegador */
  btn.onclick = () => { if (btn.dataset.armed) return fn(); btn.dataset.armed = 1; btn.classList.add('armed'); btn.textContent = 'Toque de novo para confirmar'; setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = btn.dataset.label; }, 3500); };
  btn.dataset.label = btn.textContent;
}
const field = (id, label, val = '', type = 'text', extra = '') => `<div class="f"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}" ${extra}></div>`;
const area = (id, label, val = '') => `<div class="f"><label for="${id}">${label}</label><textarea id="${id}">${esc(val)}</textarea></div>`;
const select = (id, label, opts, val = '') => `<div class="f"><label for="${id}">${label}</label><select id="${id}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v == val ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></div>`;
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };

/* ---------- rotas ---------- */
let ptab = 'dados';
function route(){
  const h = location.hash.slice(1) || 'agenda';
  const m = h.match(/^paciente-([\w-]+)$/);
  const tab = m ? 'pacientes' : (['agenda','pacientes','servicos','lembretes','financeiro'].includes(h) ? h : 'agenda');
  $$('.tabs a').forEach(a => a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const app = $('#app');
  if (m) { const p = db.patients.find(x => x.id === m[1]); p ? viewPaciente(app, p) : (location.hash = '#pacientes'); }
  else if (tab === 'pacientes') viewPacientes(app);
  else if (tab === 'servicos') viewServicos(app);
  else if (tab === 'lembretes') viewLembretes(app);
  else if (tab === 'agenda') viewAgenda(app);
  else if (tab === 'financeiro') viewFinanceiro(app);
  else viewAgenda(app);
  badge();
}
window.addEventListener('hashchange', () => { ptab = 'dados'; agSel = null; closeSheet(); route(); window.scrollTo(0, 0); const a = $('#app'); a.classList.remove('entra'); void a.offsetWidth; a.classList.add('entra'); });

/* ---------- início: painel de gestão ---------- */
const SUMIDA_DIAS = 90, INATIVA_DIAS = 365;
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const TPL_PADRAO = {
  aniversario: 'Oi, {nome}! Passando para te desejar um feliz aniversário! Que o seu novo ciclo seja lindo e cheio de saúde. Um beijo da Rose Coutinho.',
  manutencao: 'Oi, {nome}! Está chegando a hora do seu retorno ({servico}). Quer que eu veja um horário pra você?',
  sumida: 'Oi, {nome}! Tudo bem? Faz um tempinho que não te vejo por aqui na Rose Coutinho. Como você está? Posso ver um horário pra você essa semana?',
  procedimento: 'Oi, {nome}! Passando para lembrar do seu horário amanhã, {data} às {hora}: {servico}. Posso confirmar?',
  pagamento: 'Oi, {nome}! Lembrando que a parcela de {valor} do seu plano ({servico}) vence em {data}. Qualquer dúvida é só me chamar.',
  pagamento_atraso: 'Oi, {nome}! Notei que a parcela de {valor} do seu plano ({servico}), com vencimento em {data}, ainda está em aberto. Posso te ajudar com alguma dúvida?',
  contrato: 'Oi, {nome}! Segue o link para você ler e assinar o seu contrato com a Rose Coutinho: {link}',
  fim_plano: 'Oi, {nome}! Seu plano ({servico}) termina em {data}. Vamos conversar sobre a continuidade do seu tratamento?',
};
const tplOf = k => (db.tpl && db.tpl[k]) || TPL_PADRAO[k];
const monthAdd = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const money0 = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
const short = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + 'k' : String(Math.round(n));
const firstName = n => n.trim().split(/\s+/)[0];
const msgText = (p, tpl, x = {}) => tpl.replace('{nome}', firstName(p.nome)).replace('{servico}', x.servico || 'procedimento').replace('{data}', x.data ? fmtD(x.data).slice(0, 5) : '').replace('{hora}', x.hora || '').replace('{valor}', x.valor || '').replace('{link}', x.link || '');
function waLink(p, tpl, x){
  const d = (p.tel || '').replace(/\D/g, ''); if (d.length < 10) return '';
  const num = d.length >= 12 && d.startsWith('55') ? d : '55' + d;
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msgText(p, tpl, x));
}
function lastAtend(p){ return [...p.atend].sort((a, b) => b.data.localeCompare(a.data))[0]; }

function dashData(){
  const t = today(), dia = +t.slice(8), mes = t.slice(0, 7), ant = monthAdd(mes, -1);
  const rows = db.patients.flatMap(p => p.atend.map(a => ({p, a, v: Number(a.valor) > 0 ? Number(a.valor) : 0})));
  const ate = key => rows.filter(x => x.a.data.startsWith(key) && +x.a.data.slice(8) <= dia);
  const soma = rs => { const rec = rs.reduce((s, x) => s + x.v, 0), cv = rs.filter(x => x.v > 0).length; return {rec, n: rs.length, ticket: cv ? rec / cv : 0}; };
  const primeira = [...db.patients.filter(p => p.atend.length).map(p => p.atend.reduce((m, a) => a.data < m ? a.data : m, '9999'))];
  const novos = key => primeira.filter(d => d.startsWith(key) && +d.slice(8) <= dia).length;
  const cur = {...soma(ate(mes)), novos: novos(mes)}, prev = {...soma(ate(ant)), novos: novos(ant)};
  const meses = Array.from({length: 6}, (_, i) => monthAdd(mes, i - 5)).map(k => ({k, rec: rows.filter(x => x.a.data.startsWith(k)).reduce((s, x) => s + x.v, 0), parcial: k === mes}));
  const doMes = rows.filter(x => x.a.data.startsWith(mes));
  const agrupa = fn => { const m = new Map(); doMes.forEach(x => { const k = fn(x); if (!k) return; const g = m.get(k) || {nome: k, rec: 0, n: 0}; g.rec += x.v; g.n++; m.set(k, g); }); return [...m.values()].sort((a, b) => b.rec - a.rec || b.n - a.n); };
  const porServico = agrupa(x => (svc(x.a.servicoId) || {}).nome), porCategoria = agrupa(x => (svc(x.a.servicoId) || {}).cat);
  const info = db.patients.filter(p => p.atend.length).map(p => { const l = lastAtend(p); return {p, l, dias: diffDays(t, l.data), gasto: p.atend.reduce((s, a) => s + (Number(a.valor) > 0 ? Number(a.valor) : 0), 0)}; });
  const sumidos = info.filter(x => x.dias >= SUMIDA_DIAS && x.dias <= INATIVA_DIAS).sort((a, b) => b.gasto - a.gasto);
  const inativos = info.filter(x => x.dias > INATIVA_DIAS).length;
  const atrasados = info.filter(x => x.dias < SUMIDA_DIAS && x.l.retorno && x.l.retorno < t).map(x => ({...x, atraso: diffDays(t, x.l.retorno)})).sort((a, b) => b.atraso - a.atraso);
  return {t, dia, mes, cur, prev, meses, porServico, porCategoria, sumidos, inativos, atrasados};
}
function chartSvg(meses){
  const W = 360, H = 160, pb = 24, pt = 22, n = meses.length, bw = 34, gap = (W - n * bw) / (n + 1), max = Math.max(...meses.map(m => m.rec), 1);
  const bars = meses.map((m, i) => { const h = Math.max(2, (H - pb - pt) * m.rec / max), x = gap + i * (bw + gap), y = H - pb - h;
    return `<rect class="bar${m.parcial ? ' partial' : ''}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"/><text class="val" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${m.rec ? short(m.rec) : '0'}</text><text class="mes" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${MES[+m.k.slice(5) - 1]}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita dos últimos 6 meses">${bars}<line class="base" x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}"/></svg>`;
}
const rankHtml = (rows, max) => rows.length ? `<div class="rank">${rows.map(r => `<div class="r"><div class="top"><span class="nm">${esc(r.nome)}</span><span class="vl"><b>${money0(r.rec)}</b> · ${r.n}x</span></div><div class="track"><i style="width:${Math.max(3, Math.round(r.rec / max * 100))}%"></i></div></div>`).join('')}</div>` : '<div class="empty">Sem atendimentos neste mês ainda.</div>';

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const ICO_SINO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>';
/* número de lembretes pendentes na aba */
function badge(){
  const a = $('.tabs a[data-tab="lembretes"]'); if (!a || !db.patients.length) return;
  const n = lembretesData().filter(x => !x.sent).length; let b = a.querySelector('.bdg');
  if (!n) { if (b) b.remove(); a.removeAttribute('aria-label'); return; }
  if (!b) { b = document.createElement('span'); b.className = 'bdg'; b.setAttribute('aria-hidden', 'true'); a.append(b); }
  b.textContent = n > 99 ? '99+' : n; a.setAttribute('aria-label', 'Lembretes, ' + n + ' para enviar');
}
const demoNoteHtml = () => db.patients.some(p => p.demo) ? `<div class="note"><span>Modo de teste com pacientes de exemplo. Não cadastre pacientes reais aqui: nada fica protegido por login.</span><button class="btn small" id="rm-demo" type="button">Remover exemplos</button></div>` : '';
function demoBind(){
  const rm = $('#rm-demo'); if (rm) rm.onclick = () => { db.patients = db.patients.filter(p => !p.demo); db.msgs = db.msgs.filter(m => db.patients.some(p => p.id === m.pid)); db.agenda = db.agenda.filter(a => db.patients.some(p => p.id === a.pid)); db.pacotes = db.pacotes.filter(k => db.patients.some(p => p.id === k.pid)); save(); route(); toast('Exemplos removidos'); };
}
function viewFinanceiro(app){
  const D = dashData(), {cur, prev, t, dia} = D;
  const K = [
    {l: 'Receita', v: money0(cur.rec), a: cur.rec, b: prev.rec},
    {l: 'Atendimentos', v: cur.n, a: cur.n, b: prev.n, abs: true},
    {l: 'Ticket médio', v: money0(cur.ticket), a: cur.ticket, b: prev.ticket},
    {l: 'Pacientes novos', v: cur.novos, a: cur.novos, b: prev.novos, abs: true},
  ].map(k => ({...k, rel: k.b > 0 ? (k.a - k.b) / k.b : null, dif: k.a - k.b}));
  const AR = {up: '<svg class="ar" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2 9 8H1z"/></svg>', down: '<svg class="ar" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8 1 2h8z"/></svg>'};
  const delta = k => { const cls = k.dif > 0.0001 ? 'up' : k.dif < -0.0001 ? 'down' : 'flat';
    if (k.abs) return {cls, txt: k.dif === 0 ? '= mês anterior' : (k.dif > 0 ? AR.up + '+' : AR.down + '−') + Math.abs(k.dif) + ' vs mês anterior'};
    if (k.rel == null) return {cls: 'flat', txt: '— sem base no mês anterior'};
    return {cls, txt: (cls === 'flat' ? '= ' : cls === 'up' ? AR.up : AR.down) + Math.abs(Math.round(k.rel * 100)) + '% vs mês anterior'}; };
  const mesNome = new Date(+D.mes.slice(0, 4), +D.mes.slice(5) - 1, 1).toLocaleDateString('pt-BR', {month: 'long'});
  const maxS = Math.max(...D.porServico.map(x => x.rec), 1), maxC = Math.max(...D.porCategoria.map(x => x.rec), 1);
  const linha = (x, tipo) => { const s = svc(x.l.servicoId), nome = esc(x.p.nome), link = waLink(x.p, tipo === 'sumida' ? tplOf('sumida') : tplOf('manutencao'), {servico: s && s.nome});
    return `<div class="item static"><a class="avatar" href="#paciente-${x.p.id}" aria-label="Abrir ficha de ${nome}" style="text-decoration:none">${esc(initials(x.p.nome))}</a><div class="grow"><a class="t" href="#paciente-${x.p.id}" style="color:inherit;text-decoration:none">${nome}</a><div class="m">${tipo === 'sumida' ? 'última visita há ' + x.dias + ' dias' : esc(s ? s.nome : 'Retorno') + ' · venceu há ' + x.atraso + ' dias'}</div></div>${link ? `<a class="btn small" href="${link}" target="_blank" rel="noopener">Chamar</a>` : '<span class="pill">sem telefone</span>'}</div>`; };
  const lista = (rows, tipo, vazio) => rows.length ? `<div class="list">${rows.slice(0, 6).map(x => linha(x, tipo)).join('')}${rows.length > 6 ? `<div class="empty" style="padding:10px">e mais ${rows.length - 6}</div>` : ''}</div>` : `<div class="list"><div class="empty">${vazio}</div></div>`;
  const receitaK = K[0], alerta = receitaK.rel != null && receitaK.rel <= -0.15 ? `<div class="alert" role="alert">Receita ${Math.abs(Math.round(receitaK.rel * 100))}% abaixo do mesmo período do mês anterior</div>` : '';
  const comBase = K.filter(k => k.rel != null), melhor = comBase.filter(k => k.rel > 0).sort((a, b) => b.rel - a.rel)[0], pior = comBase.filter(k => k.rel < 0).sort((a, b) => a.rel - b.rel)[0];
  const fmtK = k => `${k.l} ${k.rel > 0 ? '+' : '−'}${Math.abs(Math.round(k.rel * 100))}%`;
  const acoes = [D.atrasados.length ? `chamar ${D.atrasados.length} ${D.atrasados.length === 1 ? 'paciente com retorno vencido' : 'pacientes com retorno vencido'}` : '', D.sumidos.length ? `reativar ${D.sumidos.length} ${D.sumidos.length === 1 ? 'paciente sumido' : 'pacientes sumidos'}` : ''].filter(Boolean);
  app.innerHTML = `
    <div><h1>Gestão financeira</h1><p class="sub">Como a clínica está indo neste mês</p></div>
    <section><h2>${esc(mesNome)} até o dia ${dia}</h2>
      <div class="kpis">${K.map(k => { const d = delta(k); return `<div class="kpi"><span class="lbl">${k.l}</span><b>${k.v}</b><span class="delta ${d.cls}">${d.txt}</span></div>`; }).join('')}</div></section>
    <section><h2>Receita dos últimos 6 meses</h2><div class="card chart">${chartSvg(D.meses)}<p class="src" style="margin-top:4px">Barra tracejada: mês em andamento.</p></div></section>
    <section><h2>Serviços que mais faturam em ${esc(mesNome)}</h2><div class="card">${rankHtml(D.porServico.slice(0, 6), maxS)}</div></section>
    <section><h2>Receita por categoria</h2><div class="card">${rankHtml(D.porCategoria, maxC)}</div></section>
    <section><h2>O que merece atenção</h2><div style="display:flex;flex-direction:column;gap:14px">${alerta}
      <div><div class="subh"><h2>Retornos vencidos</h2><span class="pill ${D.atrasados.length ? 'late' : ''}">${D.atrasados.length}</span></div>${lista(D.atrasados, 'retorno', 'Nenhum retorno vencido.')}</div>
      <div><div class="subh"><h2>Pacientes sumidos (${SUMIDA_DIAS}+ dias)</h2><span class="pill ${D.sumidos.length ? 'soon' : ''}">${D.sumidos.length}</span></div>${lista(D.sumidos, 'sumida', 'Ninguém sumido por enquanto.')}${D.inativos ? `<p class="src">${D.inativos} ${D.inativos === 1 ? 'paciente inativo' : 'pacientes inativos'} há mais de 1 ano não aparecem aqui.</p>` : ''}</div></div></section>
    <section><h2>Resumo</h2><div class="card"><ul class="sumario">
      <li><span class="tag ok">Melhorou</span><span>${melhor ? esc(fmtK(melhor)) : 'Nada acima do mês anterior até agora.'}</span></li>
      <li><span class="tag bad">Piorou</span><span>${pior ? esc(fmtK(pior)) : 'Nada abaixo do mês anterior até agora.'}</span></li>
      <li><span class="tag act">Exige ação</span><span>${acoes.length ? esc(acoes.join(' e ')) : 'Nenhuma pendência de retorno ou reativação.'}</span></li></ul></div></section>
    <p class="src">Fonte: atendimentos registrados no app. A receita soma só atendimentos com valor informado. Comparação: dias 1 a ${dia} deste mês contra dias 1 a ${dia} do mês anterior. Paciente novo: primeira visita registrada no app. Sumido: última visita entre ${SUMIDA_DIAS} dias e 1 ano.</p>`;
}

/* ---------- pacientes ---------- */
function viewPacientes(app){
  app.innerHTML = `
    <div class="head"><div><h1>Pacientes</h1><p class="sub" id="count"></p></div>
      <div class="actions"><button class="btn ghost" id="imp" type="button">Importar</button><button class="btn" id="new" type="button">Novo</button></div></div>
    <input class="search" id="q" type="search" placeholder="Buscar por nome ou telefone" autocomplete="off">
    <div id="plist"></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    const rows = db.patients.filter(p => !q || p.nome.toLowerCase().includes(q) || (qd && (p.tel || '').replace(/\D/g, '').includes(qd))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    $('#count').textContent = db.patients.length + (db.patients.length === 1 ? ' cadastrada' : ' cadastradas');
    $('#plist').innerHTML = rows.length ? `<div class="list">${rows.slice(0, 80).map(p => { const l = lastAtend(p); return `<a class="item" href="#paciente-${p.id}"><div class="avatar">${esc(initials(p.nome))}</div><div class="grow"><div class="t">${esc(p.nome)}${p.demo ? ' <span class="pill">exemplo</span>' : ''}</div><div class="m">${esc(p.tel || 'sem telefone')}${l ? ' · último: ' + fmtD(l.data) : ''}</div></div></a>`; }).join('')}</div>${rows.length > 80 ? `<p class="sub" style="text-align:center;margin-top:10px">Mostrando 80 de ${rows.length}. Refine a busca.</p>` : ''}` : `<div class="list"><div class="empty">${db.patients.length ? 'Ninguém encontrado.' : 'Nenhum paciente ainda. Cadastre um ou importe sua base.'}</div></div>`;
  };
  $('#q').oninput = draw; draw();
  $('#new').onclick = () => patientForm();
  $('#imp').onclick = importForm;
}
function patientForm(){
  openSheet('Novo paciente', `<div class="form">${field('n-nome', 'Nome completo')}${field('n-tel', 'WhatsApp', '', 'tel', 'inputmode="tel"')}${field('n-nasc', 'Nascimento', '', 'date')}<div class="two">${field('n-cpf', 'CPF', '', 'text', 'inputmode="numeric"')}${field('n-rg', 'RG')}</div><button class="btn" id="n-ok" type="button">Cadastrar</button></div>`);
  $('#n-ok').onclick = () => {
    const nome = val('n-nome'); if (!nome) return toast('Informe o nome'); if (!cpfValido(val('n-cpf'))) return toast('CPF inválido: confira os números');
    const p = {id: uid(), nome, tel: val('n-tel'), nasc: val('n-nasc'), cpf: val('n-cpf'), rg: val('n-rg'), end: '', cep: '', insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []};
    db.patients.push(p); save(); closeSheet(); location.hash = '#paciente-' + p.id;
  };
}
function splitCSV(text){
  const first = text.split(/\r?\n/)[0] || ''; const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function importForm(){
  openSheet('Importar pacientes', `<div class="form"><p class="sub" style="margin:0">Envie um arquivo CSV com cabeçalho na primeira linha. Colunas reconhecidas: nome, telefone (ou celular, whatsapp), nascimento, observações. No Excel ou Google Planilhas: Arquivo, Salvar como CSV.</p>
    <div class="f"><label for="i-file">Arquivo CSV</label><input id="i-file" type="file" accept=".csv,.txt,text/csv"></div>
    <div class="f"><label for="i-txt">Ou cole as linhas aqui</label><textarea id="i-txt" placeholder="nome;telefone;nascimento&#10;Maria Silva;12 99999-0000;1985-03-10"></textarea></div>
    <p class="sub" id="i-info" style="margin:0"></p><button class="btn" id="i-ok" type="button" disabled>Importar</button></div>`);
  let found = [];
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const read = text => {
    const rows = splitCSV(text); if (rows.length < 2) { found = []; $('#i-info').textContent = 'Nada reconhecido ainda.'; $('#i-ok').disabled = true; return; }
    const head = rows[0].map(norm), col = (...k) => head.findIndex(h => k.some(x => h.includes(x)));
    const ci = {nome: col('nome', 'name', 'paciente', 'cliente'), tel: col('telefone', 'celular', 'whatsapp', 'fone', 'tel'), nasc: col('nasc', 'aniversario'), obs: col('obs')};
    if (ci.nome < 0) { found = []; $('#i-info').textContent = 'Não achei a coluna "nome" no cabeçalho.'; $('#i-ok').disabled = true; return; }
    const date = s => { s = (s || '').trim(); let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`; m = s.match(/^\d{4}-\d{2}-\d{2}$/); return m ? s : ''; };
    const have = new Set(db.patients.map(p => norm(p.nome) + '|' + (p.tel || '').replace(/\D/g, '')));
    found = rows.slice(1).map(r => ({nome: (r[ci.nome] || '').trim(), tel: ci.tel >= 0 ? (r[ci.tel] || '').trim() : '', nasc: ci.nasc >= 0 ? date(r[ci.nasc]) : '', obs: ci.obs >= 0 ? (r[ci.obs] || '').trim() : ''})).filter(x => x.nome && !have.has(norm(x.nome) + '|' + x.tel.replace(/\D/g, '')));
    $('#i-info').textContent = found.length + ' paciente(s) novos para importar.'; $('#i-ok').disabled = !found.length;
  };
  $('#i-file').onchange = e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = () => read(String(r.result)); r.readAsText(f); } };
  $('#i-txt').oninput = e => read(e.target.value);
  $('#i-ok').onclick = () => { found.forEach(x => db.patients.push({id: uid(), nome: x.nome, tel: x.tel, nasc: x.nasc, insta: '', origem: '', obs: x.obs, lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []})); save(); closeSheet(); route(); toast(found.length + ' pacientes importados'); };
}

/* ---------- ficha do paciente ---------- */
const TABS = [['dados', 'Dados'], ['aval', 'Avaliação'], ['anam', 'Anamnese'], ['atend', 'Atendimentos'], ['pacotes', 'Pacotes'], ['docs', 'Documentos'], ['ciclo', 'Ciclo']];
const ANAM = [['gestante', 'Gestante ou lactante'], ['alergia', 'Alergias (medicamentos, látex, anestésicos, cosméticos)'], ['medic', 'Uso contínuo de medicamentos'], ['anticoag', 'Anticoagulante ou AAS'], ['diabetes', 'Diabetes'], ['hipert', 'Hipertensão'], ['tireoide', 'Alteração de tireoide'], ['cardio', 'Doença cardíaca ou marca-passo'], ['metal', 'Implantes metálicos ou próteses'], ['onco', 'Histórico oncológico'], ['autoimune', 'Doença autoimune'], ['queloide', 'Tendência a queloide ou má cicatrização'], ['herpes', 'Herpes labial recorrente'], ['isotret', 'Isotretinoína nos últimos 6 meses'], ['cirurgia', 'Cirurgias recentes ou plásticas'], ['procs', 'Procedimentos estéticos anteriores'], ['fuma', 'Fumante'], ['sol', 'Exposição solar frequente ou bronzeamento recente']];
function viewPaciente(app, p){
  app.innerHTML = `
    <div><a href="#pacientes" class="sub" style="text-decoration:none">&larr; Pacientes</a></div>
    <div class="head"><div style="display:flex;gap:12px;align-items:center;min-width:0"><div class="avatar" style="width:48px;height:48px;font-size:17px">${esc(initials(p.nome))}</div><div style="min-width:0"><h1 style="font-size:20px;overflow-wrap:anywhere">${esc(p.nome)}</h1><p class="sub">${[age(p.nasc), p.tel].filter(Boolean).map(esc).join(' · ')}</p></div></div><button class="btn small" id="p-ag" type="button">Agendar</button></div>
    <div class="chips" role="tablist">${TABS.map(([k, l]) => `<button class="chip" role="tab" data-t="${k}" aria-selected="${k === ptab}" type="button">${l}${k === 'atend' ? ' (' + p.atend.length + ')' : ''}</button>`).join('')}</div>
    <div id="pbody"></div>`;
  $$('.chip', app).forEach(c => c.onclick = () => { ptab = c.dataset.t; viewPaciente(app, p); });
  $('#p-ag').onclick = () => agNovo(p.id);
  const b = $('#pbody');
  ({dados: tabDados, aval: tabAval, anam: tabAnam, atend: tabAtend, pacotes: tabPacotes, docs: tabDocs, ciclo: tabCiclo})[ptab](b, p);
}
function tabDados(b, p){
  b.innerHTML = `<div class="card form">${field('d-nome', 'Nome completo', p.nome)}
    <div class="two">${field('d-tel', 'WhatsApp', p.tel, 'tel', 'inputmode="tel"')}${field('d-nasc', 'Nascimento', p.nasc, 'date')}</div>
    <div class="two">${field('d-cpf', 'CPF', p.cpf, 'text', 'inputmode="numeric"')}${field('d-rg', 'RG', p.rg)}</div>
    <div class="two">${field('d-end', 'Endereço', p.end)}${field('d-cep', 'CEP', p.cep, 'text', 'inputmode="numeric"')}</div>
    ${select('d-img', 'Uso de imagem em publicidade' + (p.img && p.imgEm ? ' (respondido em ' + fmtD(p.imgEm) + ')' : ''), [['', 'Não informado'], ['sim', 'Autorizado'], ['nao', 'Não autorizado']], p.img || '')}
    <div class="two">${field('d-insta', 'Instagram', p.insta)}${field('d-origem', 'Como conheceu', p.origem)}</div>
    ${area('d-obs', 'Observações', p.obs)}
    <label class="check"><input type="checkbox" id="d-lgpd" ${p.lgpd && p.lgpd.ok ? 'checked' : ''}><span>Paciente autorizou o uso dos dados e das imagens (termo assinado)${p.lgpd && p.lgpd.ok ? `<br><span class="sub">Registrado em ${fmtD(p.lgpd.data)}</span>` : ''}</span></label>
    <div class="actions"><button class="btn" id="d-ok" type="button">Salvar</button><button class="btn danger" id="d-del" type="button">Excluir paciente</button></div></div>`;
  $('#d-ok').onclick = () => { const nome = val('d-nome'); if (!nome) return toast('Informe o nome'); if (!cpfValido(val('d-cpf'))) return toast('CPF inválido: confira os números');
    const ok = $('#d-lgpd').checked; Object.assign(p, {nome, tel: val('d-tel'), nasc: val('d-nasc'), cpf: val('d-cpf'), rg: val('d-rg'), end: val('d-end'), cep: val('d-cep'), img: val('d-img'), imgEm: val('d-img') === (p.img || '') ? (p.imgEm || '') : (val('d-img') ? today() : ''), insta: val('d-insta'), origem: val('d-origem'), obs: val('d-obs')});
    p.lgpd = {ok, data: ok ? ((p.lgpd && p.lgpd.ok && p.lgpd.data) || today()) : ''}; save(); route(); toast('Salvo'); };
  arm($('#d-del'), () => { db.patients = db.patients.filter(x => x.id !== p.id); db.msgs = db.msgs.filter(m => m.pid !== p.id); db.agenda = db.agenda.filter(a => a.pid !== p.id); db.pacotes = db.pacotes.filter(k => k.pid !== p.id); save(); location.hash = '#pacientes'; });
}
function tabAval(b, p){
  const a = p.aval || {}, peso = parseFloat(String(a.peso || '').replace(',', '.')), alt = parseFloat(String(a.altura || '').replace(',', '.'));
  b.innerHTML = `<div class="card form">${field('a-data', 'Data da avaliação', a.data || today(), 'date')}
    ${area('a-queixa', 'Queixa principal', a.queixa)}${area('a-obj', 'Objetivo do tratamento', a.obj)}
    <div class="two">${select('a-pele', 'Tipo de pele', ['', 'Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível', 'Acneica'], a.pele)}${select('a-foto', 'Fototipo (Fitzpatrick)', ['', 'I', 'II', 'III', 'IV', 'V', 'VI'], a.foto)}</div>
    <div class="two">${field('a-peso', 'Peso (kg)', a.peso, 'text', 'inputmode="decimal"')}${field('a-alt', 'Altura (m)', a.altura, 'text', 'inputmode="decimal"')}</div>
    <p class="sub" id="a-imc" style="margin:-6px 0 0"></p>
    ${area('a-med', 'Medidas e áreas avaliadas', a.medidas)}${area('a-obs', 'Observações da avaliação', a.obs)}
    <button class="btn" id="a-ok" type="button">Salvar avaliação</button></div>`;
  const imc = () => { const w = parseFloat(val('a-peso').replace(',', '.')), h = parseFloat(val('a-alt').replace(',', '.')); $('#a-imc').textContent = w > 0 && h > 0 ? 'IMC ' + (w / (h * h)).toFixed(1).replace('.', ',') : ''; };
  $('#a-peso').oninput = imc; $('#a-alt').oninput = imc; imc();
  $('#a-ok').onclick = () => { p.aval = {data: val('a-data'), queixa: val('a-queixa'), obj: val('a-obj'), pele: val('a-pele'), foto: val('a-foto'), peso: val('a-peso'), altura: val('a-alt'), medidas: val('a-med'), obs: val('a-obs')}; save(); toast('Avaliação salva'); };
}
/* ---------- mapa de áreas: corpo (frente e costas) e rosto (frente e perfil) ----------
   O desenho vem de src/assets/mapa/*.svg. Cada área clicável é um elemento com data-r (código) e data-nome (nome na ficha),
   então trocar o desenho por outro, mantendo essa regra, não exige mexer no código. */
const MAPAS = {corpo: corpoSvg, rosto: rostoSvg};
const ICO_CORPO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.8" r="2.3"/><path d="M8.2 21v-7.5L6.4 9.8c-.3-.8.3-1.6 1.1-1.6h9c.8 0 1.4.8 1.1 1.6l-1.8 3.7V21M10.6 21v-4.6h2.8V21"/></svg>';
const ICO_ROSTO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="11.5" rx="6.4" ry="8.3"/><path d="M9.3 10.2h.01M14.7 10.2h.01M9.6 15.2c1.5 1.1 3.3 1.1 4.8 0"/></svg>';
const ICO_X = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
let mapaVis = 'corpo';
function montaMapa(host, p){
  const marcadas = k => new Set(((p.anam && p.anam.mapa) || {})[k] || []);
  const grava = (k, set) => { p.anam = {...(p.anam || {}), mapa: {...((p.anam && p.anam.mapa) || {}), [k]: [...set]}}; save(); };
  const total = k => marcadas(k).size;
  host.innerHTML = `<h2 style="margin:0 0 10px">Áreas avaliadas</h2>
    <div class="opts2" role="group" aria-label="Corpo ou rosto">${[['corpo', 'Corpo', ICO_CORPO], ['rosto', 'Rosto', ICO_ROSTO]].map(([k, l, ico]) => `<button class="opt" type="button" data-m="${k}" aria-pressed="${k === mapaVis}">${ico}<b>${l}</b><span class="m" data-n="${k}"></span></button>`).join('')}</div>
    <div class="mapa-svg"></div>
    <div class="marcadas" aria-live="polite"></div>
    <p class="sub" style="margin:0">Toque nas áreas para marcar ou desmarcar. O que você marca já fica salvo.</p>`;
  const svgHost = $('.mapa-svg', host), lista = $('.marcadas', host);
  const pinta = () => {
    const s = marcadas(mapaVis), regs = $$('[data-r]', svgHost);
    regs.forEach(r => { const on = s.has(r.dataset.r); r.classList.toggle('on', on); r.setAttribute('aria-pressed', String(on)); });
    ['corpo', 'rosto'].forEach(k => { const n = total(k); $(`[data-n="${k}"]`, host).textContent = n ? n + (n === 1 ? ' área' : ' áreas') : 'nenhuma marcada'; });
    const ativas = regs.filter(r => r.classList.contains('on'));
    lista.innerHTML = ativas.length ? ativas.map(r => `<button class="chip" type="button" data-x="${esc(r.dataset.r)}" aria-label="Tirar ${esc(r.dataset.nome)}">${esc(r.dataset.nome)}${ICO_X}</button>`).join('') + `<button class="btn ghost small" type="button" id="m-limpa">Limpar</button>` : '';
    $$('[data-x]', lista).forEach(b => b.onclick = () => alterna(b.dataset.x));
    const lm = $('#m-limpa', lista); if (lm) lm.onclick = () => { grava(mapaVis, new Set()); pinta(); };
  };
  const alterna = id => { const s = marcadas(mapaVis); s.has(id) ? s.delete(id) : s.add(id); grava(mapaVis, s); pinta(); };
  const mostra = () => {
    svgHost.innerHTML = MAPAS[mapaVis];
    $$('[data-r]', svgHost).forEach(r => { r.setAttribute('role', 'button'); r.setAttribute('tabindex', '0'); r.setAttribute('aria-label', r.dataset.nome);
      r.addEventListener('click', () => alterna(r.dataset.r));
      r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(r.dataset.r); } }); });
    $$('.opt', host).forEach(o => o.setAttribute('aria-pressed', String(o.dataset.m === mapaVis)));
    pinta();
  };
  $$('.opt', host).forEach(o => o.onclick = () => { mapaVis = o.dataset.m; mostra(); });
  mostra();
}
function tabAnam(b, p){
  const a = p.anam || {};
  b.innerHTML = `<div class="card mapa" id="mapa"></div><div class="card form"><div>${ANAM.map(([k, l]) => { const v = a[k] || {}; return `<div class="yn"><div class="q"><span>${esc(l)}</span><div class="seg" data-k="${k}"><button type="button" data-v="n" aria-pressed="${v.r === 'n'}">Não</button><button type="button" data-v="s" aria-pressed="${v.r === 's'}">Sim</button></div></div><div class="f" ${v.r === 's' ? '' : 'hidden'} data-d="${k}"><input id="an-${k}" aria-label="Detalhes: ${esc(l)}" placeholder="Qual? Desde quando?" value="${esc(v.d || '')}"></div></div>`; }).join('')}</div>
    <div class="two">${field('an-agua', 'Água por dia', a.agua, 'text', 'placeholder="ex.: 6 copos"')}${field('an-sono', 'Sono', a.sono, 'text', 'placeholder="ex.: 7h"')}</div>
    ${field('an-ativ', 'Atividade física', a.ativ)}${area('an-outras', 'Outras informações de saúde', a.outras)}
    <button class="btn" id="an-ok" type="button">Salvar anamnese</button></div>`;
  montaMapa($('#mapa', b), p);
  $$('.seg', b).forEach(s => $$('button', s).forEach(btn => btn.onclick = () => { $$('button', s).forEach(x => x.setAttribute('aria-pressed', x === btn)); const d = $(`[data-d="${s.dataset.k}"]`, b); d.hidden = btn.dataset.v !== 's'; }));
  $('#an-ok').onclick = () => { const n = {}; ANAM.forEach(([k]) => { const on = $(`.seg[data-k="${k}"] [aria-pressed="true"]`, b); if (on) n[k] = {r: on.dataset.v, d: on.dataset.v === 's' ? val('an-' + k) : ''}; });
    if (p.anam && p.anam.mapa) n.mapa = p.anam.mapa;
    Object.assign(n, {agua: val('an-agua'), sono: val('an-sono'), ativ: val('an-ativ'), outras: val('an-outras'), data: today()}); p.anam = n; save(); toast('Anamnese salva'); };
}
function tabAtend(b, p){
  const list = [...p.atend].sort((x, y) => y.data.localeCompare(x.data));
  b.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px"><button class="btn" id="at-new" type="button">Registrar atendimento</button>
    ${list.length ? list.map(a => { const s = svc(a.servicoId); const d = a.retorno ? diffDays(a.retorno, today()) : null; return `<article class="card" style="display:flex;flex-direction:column;gap:8px"><div class="head" style="flex-wrap:nowrap"><div style="min-width:0"><div class="t" style="font-weight:700">${esc(s ? s.nome : 'Serviço removido')}</div><div class="m sub" style="margin:0">${fmtD(a.data)}${a.regiao ? ' · ' + esc(a.regiao) : ''}${a.sessao ? ' · sessão ' + esc(a.sessao) : ''}</div></div><div class="price">${a.valor !== '' && a.valor != null ? money(a.valor) : ''}</div></div>
      ${a.produto || a.lote ? `<div class="pk">Produto: ${esc(a.produto)}${a.lote ? ' · lote ' + esc(a.lote) : ''}</div>` : ''}${a.evolucao ? `<div>${esc(a.evolucao)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">${a.retorno ? `<span class="pill ${d < 0 ? 'late' : d <= 3 ? 'soon' : ''}">Retorno ${fmtD(a.retorno)}</span>` : '<span></span>'}<button class="btn ghost small" data-e="${a.id}" type="button">Editar</button></div></article>`; }).join('') : `<div class="list"><div class="empty">Nenhum atendimento registrado.</div></div>`}</div>`;
  $('#at-new').onclick = () => atendForm(p);
  $$('[data-e]', b).forEach(x => x.onclick = () => atendForm(p, p.atend.find(a => a.id === x.dataset.e)));
}
function atendForm(p, a){
  const e = !!a; a = a || {data: today(), servicoId: '', regiao: '', produto: '', lote: '', sessao: '', valor: '', evolucao: '', retorno: ''};
  const opts = CATS.map(c => `<optgroup label="${esc(c)}">${db.services.filter(s => s.cat === c).map(s => `<option value="${s.id}" ${s.id === a.servicoId ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</optgroup>`).join('');
  openSheet(e ? 'Editar atendimento' : 'Novo atendimento', `<div class="form">${field('x-data', 'Data', a.data, 'date')}
    <div class="f"><label for="x-svc">Serviço</label><select id="x-svc"><option value="">Escolha um serviço</option>${opts}</select></div>
    ${field('x-reg', 'Região tratada', a.regiao)}
    <div class="two">${field('x-prod', 'Produto', a.produto)}${field('x-lote', 'Lote', a.lote)}</div>
    <div class="two">${field('x-ses', 'Sessão', a.sessao, 'text', 'placeholder="ex.: 3 de 10"')}${field('x-val', 'Valor cobrado (R$)', a.valor, 'text', 'inputmode="decimal"')}</div>
    ${area('x-evo', 'Evolução', a.evolucao)}${field('x-ret', 'Retorno previsto', a.retorno, 'date')}<p class="sub" id="x-aviso" role="status" style="margin:0;color:var(--warn)"></p>
    <div class="actions"><button class="btn" id="x-ok" type="button">Salvar</button>${e ? '<button class="btn danger" id="x-del" type="button">Excluir</button>' : ''}</div></div>`);
  let retTouched = e, valTouched = e;
  $('#x-ret').oninput = () => retTouched = true; $('#x-val').oninput = () => valTouched = true;
  const sync = () => { const s = svc($('#x-svc').value); if (!s) return; if (!valTouched && s.pix != null) $('#x-val').value = s.pix; if (!retTouched) $('#x-ret').value = addDays($('#x-data').value || today(), s.ret); };
  const aviso = () => { $('#x-aviso').textContent = cicloAviso(p, val('x-ret')); };
  $('#x-ret').addEventListener('input', aviso); aviso();
  $('#x-svc').onchange = () => { sync(); aviso(); }; $('#x-data').onchange = () => { sync(); aviso(); };
  $('#x-ok').onclick = () => { if (!val('x-svc')) return toast('Escolha o serviço');
    const v = val('x-val').replace(',', '.'); const n = {id: a.id || uid(), data: val('x-data') || today(), servicoId: val('x-svc'), regiao: val('x-reg'), produto: val('x-prod'), lote: val('x-lote'), sessao: val('x-ses'), valor: v === '' ? '' : Number(v), evolucao: val('x-evo'), retorno: val('x-ret')};
    if (e) Object.assign(a, n); else p.atend.push(n); save(); closeSheet(); route(); toast('Atendimento salvo'); };
  if (e) arm($('#x-del'), () => { p.atend = p.atend.filter(x => x.id !== a.id); save(); closeSheet(); route(); });
}

/* ---------- ciclo menstrual (mesma lógica do WÓD'IO: a previsão liga depois de 3 ciclos medidos) ---------- */
const MENSTR_DIAS = 5, CICLOS_MIN = 3;
function cicloCalc(p){
  const ini = [...((p.ciclo && p.ciclo.inicios) || [])].sort(), ints = [];
  for (let i = 1; i < ini.length; i++) { const d = diffDays(ini[i], ini[i - 1]); if (d >= 18 && d <= 45) ints.push(d); }
  const i6 = ints.slice(-6), med = i6.length ? [...i6].sort((a, b) => a - b)[Math.floor(i6.length / 2)] : 0;
  const reg = i6.filter(d => Math.abs(d - med) <= 5), u = reg.length >= CICLOS_MIN ? reg : i6; /* ignora ciclos muito irregulares */
  const ativo = u.length >= CICLOS_MIN, media = ativo ? Math.round(u.reduce((a, b) => a + b, 0) / u.length) : null;
  return {ini, medidos: ints.length, ativo, media};
}
function cicloProxima(C){ if (!C.ativo) return ''; let n = addDays(C.ini[C.ini.length - 1], C.media); while (n < today()) n = addDays(n, C.media); return n; }
/* texto de aviso quando a data cai (ou pode cair) na menstruação; vazio se não há motivo */
function cicloAviso(p, iso){
  if (!iso) return '';
  const C = cicloCalc(p); if (!C.ini.length) return '';
  const dentro = s => iso >= addDays(s, -1) && iso <= addDays(s, MENSTR_DIAS - 1);
  if (C.ini.some(dentro)) return 'Cai num período menstrual já registrado.';
  if (C.ativo) for (let k = 1; k <= 6; k++) { const s = addDays(C.ini[C.ini.length - 1], C.media * k); if (dentro(s)) return 'Pode cair no período menstrual (início previsto por volta de ' + fmtD(s).slice(0, 5) + ').'; }
  return '';
}
function tabCiclo(b, p){
  const C = cicloCalc(p), prox = cicloProxima(C);
  const status = !C.ini.length ? 'Nenhum registro ainda. Anote o início de cada menstruação que a paciente informar.'
    : C.ativo ? `Ciclo médio de ${C.media} dias. Próxima menstruação prevista por volta de ${fmtD(prox).slice(0, 5)}. Ao marcar um retorno, o app avisa se a data cair nesse período.`
    : `Coletando dados: ${C.medidos} de ${CICLOS_MIN} ciclos medidos. A previsão liga sozinha ao completar ${CICLOS_MIN}.`;
  b.innerHTML = `<div class="card form"><p class="sub" style="margin:0">${esc(status)}</p>
    <div class="two">${field('c-data', 'Início da menstruação', today(), 'date')}<div class="f"><label>&nbsp;</label><button class="btn" id="c-add" type="button">Registrar</button></div></div>
    ${C.ini.length ? `<div class="list">${[...C.ini].reverse().slice(0, 8).map(d => `<div class="item static"><div class="grow"><span class="t">${fmtD(d)}</span></div><button class="btn ghost small" data-rm="${d}" type="button">Remover</button></div>`).join('')}</div>` : ''}</div>`;
  $('#c-add').onclick = () => { const d = val('c-data'); if (!d) return toast('Informe a data');
    const ini = (p.ciclo && p.ciclo.inicios) || []; if (ini.includes(d)) return toast('Essa data já está registrada');
    p.ciclo = {inicios: [...ini, d].sort()}; save(); tabCiclo(b, p); toast('Registrado'); };
  $$('[data-rm]', b).forEach(x => x.onclick = () => { p.ciclo = {inicios: p.ciclo.inicios.filter(d => d !== x.dataset.rm)}; save(); tabCiclo(b, p); });
}

/* ---------- lembretes por WhatsApp (a Rose só toca em enviar) ---------- */
const TIPO_NOME = {aniversario: 'Aniversário', manutencao: 'Manutenção', sumida: 'Sumida', procedimento: 'Procedimento', pagamento: 'Pagamento', pagamento_atraso: 'Pagamento em atraso', fim_plano: 'Fim de plano', contrato: 'Contrato'};
const MSG_ORDEM = ['aniversario', 'manutencao', 'sumida', 'procedimento', 'pagamento', 'pagamento_atraso', 'fim_plano', 'contrato'];
function lembretesData(){
  const t = today(), D = dashData(), out = [];
  const enviado = (pid, chave) => db.msgs.some(m => m.pid === pid && m.chave === chave);
  const add = (p, tipo, chave, det, extra = {}) => out.push({p, tipo, chave, det, sent: enviado(p.id, chave), ...extra});
  db.patients.forEach(p => { if (p.nasc && p.nasc.slice(5) === t.slice(5)) add(p, 'aniversario', 'aniversario:' + t.slice(0, 4), 'faz aniversário hoje' + (age(p.nasc) ? ' (' + age(p.nasc) + ')' : '')); });
  db.patients.filter(p => p.atend.length).forEach(p => { const l = lastAtend(p), s = svc(l.servicoId);
    if (diffDays(t, l.data) < SUMIDA_DIAS && l.retorno && l.retorno <= addDays(t, 3))
      add(p, 'manutencao', 'manutencao:' + l.id, (s ? s.nome : 'Retorno') + (l.retorno < t ? ' · venceu há ' + diffDays(t, l.retorno) + ' dias' : l.retorno === t ? ' · é hoje' : ' · em ' + fmtD(l.retorno).slice(0, 5)), {servico: s && s.nome, data: l.retorno, aviso: cicloAviso(p, l.retorno)}); });
  db.agenda.filter(a => (a.status === 'agendado' || a.status === 'confirmado') && agDia(a.ini) === addDays(t, 1)).forEach(a => { const p = pacDe(a.pid), s = svc(a.sid); if (!p) return;
    add(p, 'procedimento', 'procedimento:' + a.id + ':' + a.ini, (s ? s.nome : 'Horário') + ' · amanhã às ' + agHora(a.ini), {servico: s && s.nome, data: agDia(a.ini), hora: agHora(a.ini)}); });
  db.pacotes.forEach(k => { const p = pacDe(k.pid); if (!p) return; const s = svc(k.sid), nome = s ? s.nome : 'Pacote';
    k.parc.filter(x => !x.pago).forEach(x => { const d = diffDays(x.venc, t), base = {servico: nome, data: x.venc, valor: money(x.valor)}, ch = 'pagamento:' + x.id + ':';
      if (d < 0) add(p, 'pagamento', ch + 'atraso:' + t.slice(0, 7), nome + ' · parcela de ' + money(x.valor) + ' venceu há ' + (-d) + ' dias', {...base, tpl: 'pagamento_atraso'});
      else if (d <= 1) add(p, 'pagamento', ch + '1d', nome + ' · parcela de ' + money(x.valor) + (d === 0 ? ' vence hoje' : ' vence amanhã'), base);
      else if (d <= 7) add(p, 'pagamento', ch + '7d', nome + ' · parcela de ' + money(x.valor) + ' vence em ' + d + ' dias', base); });
    if (k.validade && k.usadas < k.total) { const d = diffDays(k.validade, t);
      if (d >= 0 && d <= 7) add(p, 'fim_plano', 'fim_plano:' + k.id + ':' + k.validade, nome + ' · plano termina em ' + fmtD(k.validade).slice(0, 5) + ' (faltam ' + (k.total - k.usadas) + ' sessões)', {servico: nome, data: k.validade}); } });
  D.sumidos.forEach(x => add(x.p, 'sumida', 'sumida:' + t.slice(0, 7), 'última visita há ' + x.dias + ' dias'));
  return out.sort((a, b) => a.sent - b.sent || MSG_ORDEM.indexOf(a.tipo) - MSG_ORDEM.indexOf(b.tipo));
}
function viewLembretes(app){
  const L = lembretesData(), pend = L.filter(x => !x.sent), feitos = L.filter(x => x.sent).length;
  const nomeDe = id => (db.patients.find(p => p.id === id) || {nome: 'Paciente removida'}).nome;
  const linha = (x, i) => { const link = waLink(x.p, tplOf(x.tpl || x.tipo), x);
    return `<div class="item static"><a class="avatar" href="#paciente-${x.p.id}" aria-label="Abrir ficha de ${esc(x.p.nome)}" style="text-decoration:none">${esc(initials(x.p.nome))}</a><div class="grow"><a class="t" href="#paciente-${x.p.id}" style="color:inherit;text-decoration:none">${esc(x.p.nome)}</a><div class="m">${esc(x.det)}</div>${x.aviso ? `<div class="m" style="color:var(--warn)">${esc(x.aviso)}</div>` : ''}</div>${link ? `<a class="btn small" data-send="${i}" href="${link}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="pill">sem telefone</span>'}</div>`; };
  const grupos = MSG_ORDEM.map(t => ({t, rows: pend.map((x, i) => ({x, i})).filter(r => r.x.tipo === t)})).filter(g => g.rows.length);
  const recentes = [...db.msgs].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 8);
  app.innerHTML = `<div class="head"><div><h1>Lembretes</h1><p class="sub">${pend.length ? pend.length + ' para enviar hoje' : 'Nada para enviar agora'}${feitos ? ' · ' + feitos + ' já enviado' + (feitos > 1 ? 's' : '') : ''}</p></div><div class="actions"><button class="btn ghost small" id="l-tpl" type="button">Editar mensagens</button></div></div>
    ${grupos.length ? grupos.map(g => `<section><div class="subh"><h2>${TIPO_NOME[g.t]}</h2><span class="pill">${g.rows.length}</span></div><div class="list">${g.rows.map(r => linha(r.x, r.i)).join('')}</div></section>`).join('') : '<section><div class="list"><div class="empty">Tudo em dia.</div></div></section>'}
    <section><h2>Enviados recentemente</h2><div class="list">${recentes.length ? recentes.map(m => `<div class="item static"><div class="grow"><span class="t">${esc(nomeDe(m.pid))}</span><div class="m">${TIPO_NOME[m.tipo] || 'Mensagem'} · ${new Date(m.em).toLocaleDateString('pt-BR')}</div></div></div>`).join('') : '<div class="empty">Nenhum envio registrado.</div>'}</div></section>
    <p class="src">O botão abre o WhatsApp com a mensagem pronta; quem envia é a Rose. Ao tocar, o envio fica registrado e o lembrete sai da lista. Aniversário no dia; manutenção até 3 dias antes do retorno; sumida a partir de ${SUMIDA_DIAS} dias sem vir. Procedimento: 1 dia antes do horário. Pagamento: 7 dias e 1 dia antes do vencimento da parcela, e uma vez por mês enquanto estiver atrasada. Fim de plano: 7 dias antes da validade do pacote, se ainda houver sessões.</p>`;
  $$('a[data-send]', app).forEach(a => a.onclick = () => { const x = pend[+a.dataset.send];
    registrarEnvio(x.p.id, x.tipo, x.chave, msgText(x.p, tplOf(x.tpl || x.tipo), x)); setTimeout(route, 400); });
  $('#l-tpl').onclick = tplForm;
}
function registrarEnvio(pid, tipo, chave, texto){ db.msgs.push({id: uid(), pid, tipo, chave, texto, em: new Date().toISOString()}); save(); }
function tplForm(){
  openSheet('Mensagens do WhatsApp', `<div class="form"><p class="sub" style="margin:0">Use {nome}, {servico}, {data}, {hora}, {valor} e {link}.</p>
    ${MSG_ORDEM.map(k => area('t-' + k, TIPO_NOME[k], tplOf(k))).join('')}
    <div class="actions"><button class="btn" id="t-ok" type="button">Salvar</button><button class="btn ghost" id="t-rst" type="button">Voltar ao padrão</button></div></div>`);
  $('#t-ok').onclick = () => { const tpl = {}; MSG_ORDEM.forEach(k => { const v = val('t-' + k); if (v && v !== TPL_PADRAO[k]) tpl[k] = v; }); db.tpl = tpl; save(); closeSheet(); route(); toast('Mensagens salvas'); };
  $('#t-rst').onclick = () => { db.tpl = {}; save(); closeSheet(); route(); toast('Mensagens padrão'); };
}

/* ---------- agenda interna (a ligação com o Google entra depois, sem refazer) ---------- */
const STATUS_AG = {agendado: 'Agendado', confirmado: 'Confirmado', realizado: 'Realizado', faltou: 'Faltou', cancelado: 'Cancelado'};
const MOTIVOS = [['paciente', 'Pedido da paciente'], ['periodo', 'Período menstrual'], ['clinica', 'Imprevisto da clínica'], ['outro', 'Outro']];
const agDia = s => s.slice(0, 10), agHora = s => s.slice(11, 16);
const agMs = s => new Date(s).getTime(), agFim = a => agMs(a.ini) + (a.dur || 30) * 60000;
const pacDe = id => db.patients.find(p => p.id === id);
const nomeDia = d => { const t = today(); return d === t ? 'Hoje' : d === addDays(t, 1) ? 'Amanhã' : parse(d).toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'}); };
function agConflito(ini, dur, ignorar){ const fim = agMs(ini) + dur * 60000; return db.agenda.find(a => a.id !== ignorar && a.status !== 'cancelado' && agMs(a.ini) < fim && agFim(a) > agMs(ini)); }
/* avisos ao escolher data e hora: choque de horário e possível período menstrual */
function agAvisos(p, dia, hora, dur, ignorar){
  const out = [], c = dia && hora ? agConflito(dia + 'T' + hora, dur, ignorar) : null;
  if (c) out.push('Já existe agendamento nesse horário (' + (pacDe(c.pid) || {nome: 'paciente removida'}).nome + ', ' + agHora(c.ini) + ').');
  const ciclo = p ? cicloAviso(p, dia) : ''; if (ciclo) out.push(ciclo);
  return out.join(' ');
}
/* Agenda: é a tela inicial. Semana no topo, horários do dia escolhido embaixo. */
let agSel = null;
const DIAS_SEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const SETA_E = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6"/></svg>', SETA_D = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
const agFimHora = a => { const d = new Date(agMs(a.ini) + (a.dur || 30) * 60000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function viewAgenda(app){
  const t = today(); if (!agSel) agSel = t;
  const porDia = new Map(); db.agenda.filter(a => a.status !== 'cancelado').forEach(a => { const d = agDia(a.ini); porDia.set(d, (porDia.get(d) || 0) + 1); });
  const ini = addDays(agSel, -((parse(agSel).getDay() + 6) % 7)), semana = Array.from({length: 7}, (_, i) => addDays(ini, i));
  const doDia = db.agenda.filter(a => agDia(a.ini) === agSel).sort((a, b) => a.ini.localeCompare(b.ini));
  const ativos = doDia.filter(a => a.status !== 'cancelado'), agora = new Date().toTimeString().slice(0, 5);
  const proximoHoje = agSel === t ? ativos.find(a => agHora(a.ini) >= agora && a.status !== 'realizado') : null;
  const depois = db.agenda.filter(a => a.status !== 'cancelado' && agDia(a.ini) > agSel).sort((a, b) => a.ini.localeCompare(b.ini))[0];
  const resumo = ativos.length ? ativos.length + (ativos.length === 1 ? ' horário' : ' horários') + (proximoHoje ? ' · próximo às ' + agHora(proximoHoje.ini) : '') : 'Nenhum horário marcado';
  const linha = a => { const p = pacDe(a.pid), s = svc(a.sid), rem = (a.rem || []).length, off = a.status === 'cancelado' || a.status === 'faltou';
    return `<button class="item${off ? ' apagado' : ''}" data-ag="${a.id}" type="button"><div class="hr">${agHora(a.ini)}<small>até ${agFimHora(a)}</small></div><div class="grow"><span class="t">${esc(p ? p.nome : 'Paciente removida')}</span><div class="m">${esc(s ? s.nome : 'Sem serviço')}${rem ? ' · remarcado' + (rem > 1 ? ' ' + rem + 'x' : '') : ''}</div></div><span class="pill ${a.status === 'faltou' || a.status === 'cancelado' ? 'late' : a.status === 'agendado' ? 'soon' : ''}">${STATUS_AG[a.status]}</span></button>`; };
  const vazio = `<div class="empty">Dia livre.<div class="actions" style="justify-content:center;margin-top:12px"><button class="btn small" id="ag-vazio" type="button">Agendar neste dia</button>${depois ? `<button class="btn ghost small" id="ag-depois" type="button">Próximo: ${esc(nomeDia(agDia(depois.ini)).toLowerCase())}</button>` : ''}</div></div>`;
  const nL = lembretesData().filter(x => !x.sent).length;
  app.innerHTML = `<div class="head"><div><h1>${saudacao()}, Rose</h1><p class="sub">${new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'})}</p></div><div class="actions"><button class="btn" id="ag-novo" type="button">Novo horário</button></div></div>
    ${demoNoteHtml()}
    <div class="semana"><button class="seta" id="ag-prev" type="button" aria-label="Semana anterior">${SETA_E}</button>
      <div class="dias" role="group" aria-label="Dias da semana">${semana.map((d, i) => `<button class="dia${d === t ? ' hoje' : ''}${porDia.get(d) ? ' tem' : ''}" data-d="${d}" type="button" aria-pressed="${d === agSel}" aria-label="${esc(nomeDia(d))}${porDia.get(d) ? ', ' + porDia.get(d) + ' horários' : ''}"><small>${DIAS_SEM[i]}</small><b>${+d.slice(8)}</b><i></i></button>`).join('')}</div>
      <button class="seta" id="ag-next" type="button" aria-label="Próxima semana">${SETA_D}</button></div>
    <section><div class="subh"><div><h2 style="margin:0">${esc(agSel === t ? 'Hoje' : nomeDia(agSel))}</h2><p class="sub" style="margin:2px 0 0">${resumo}</p></div>${agSel !== t ? '<button class="btn ghost small" id="ag-hoje" type="button">Voltar para hoje</button>' : ''}</div>
      <div class="list">${doDia.length ? doDia.map(linha).join('') : vazio}</div></section>
    <div class="list"><a class="item" href="#lembretes"><div class="avatar">${ICO_SINO}</div><div class="grow"><span class="t">${nL ? nL + (nL === 1 ? ' lembrete para enviar' : ' lembretes para enviar') : 'Lembretes em dia'}</span><div class="m">${nL ? 'Mensagens prontas para o WhatsApp' : 'Nada para enviar agora'}</div></div>${nL ? `<span class="pill soon">${nL}</span>` : ''}</a></div>
    <p class="src">Agenda interna do painel. A ligação com o Google Agenda entra depois e usa estes mesmos agendamentos.</p>`;
  const vai = d => { agSel = d; viewAgenda(app); };
  $$('.dia', app).forEach(b => b.onclick = () => vai(b.dataset.d));
  $('#ag-prev').onclick = () => vai(addDays(agSel, -7)); $('#ag-next').onclick = () => vai(addDays(agSel, 7));
  const hoje = $('#ag-hoje'); if (hoje) hoje.onclick = () => vai(t);
  const dep = $('#ag-depois'); if (dep) dep.onclick = () => vai(agDia(depois.ini));
  const vz = $('#ag-vazio'); if (vz) vz.onclick = () => agNovo(null, agSel);
  $$('[data-ag]', app).forEach(b => b.onclick = () => agDetalhe(db.agenda.find(a => a.id === b.dataset.ag)));
  $('#ag-novo').onclick = () => agNovo(null, agSel);
  demoBind();
}
function agNovo(pid, dia){
  const p0 = pid ? pacDe(pid) : null, lista = [...db.patients].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const optsP = q => lista.filter(p => !q || p.nome.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  const optsS = CATS.map(c => `<optgroup label="${esc(c)}">${db.services.filter(s => s.cat === c).map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</optgroup>`).join('');
  openSheet('Novo agendamento', `<div class="form">
    ${p0 ? `<p class="t" style="margin:0;font-weight:700">${esc(p0.nome)}</p>` : `${field('a-q', 'Buscar paciente', '', 'search')}<div class="f"><label for="a-pac">Paciente</label><select id="a-pac">${optsP('')}</select></div>`}
    <div class="f"><label for="a-svc">Serviço</label><select id="a-svc"><option value="">Escolha um serviço</option>${optsS}</select></div>
    <div class="two">${field('a-dia', 'Data', dia || today(), 'date')}${field('a-hora', 'Hora', '09:00', 'time')}</div>
    ${field('a-dur', 'Duração (min)', 60, 'number', 'inputmode="numeric" min="5" step="5"')}${area('a-obs', 'Observações')}
    <p class="sub" id="a-aviso" role="status" style="margin:0;color:var(--warn)"></p>
    <div class="actions"><button class="btn" id="a-ok" type="button">Agendar</button></div></div>`);
  const cur = () => p0 || pacDe(val('a-pac')), aviso = () => { $('#a-aviso').textContent = agAvisos(cur(), val('a-dia'), val('a-hora'), +val('a-dur') || 30); };
  if (!p0) $('#a-q').oninput = () => { $('#a-pac').innerHTML = optsP(val('a-q')); aviso(); };
  ['a-pac', 'a-dia', 'a-hora', 'a-dur'].forEach(id => { const e = $('#' + id); if (e) e.addEventListener('input', aviso); });
  $('#a-svc').onchange = () => { const s = svc(val('a-svc')); if (s && s.dur) $('#a-dur').value = s.dur; aviso(); };
  $('#a-ok').onclick = () => { const p = cur(); if (!p) return toast('Escolha a paciente'); if (!val('a-dia') || !val('a-hora')) return toast('Informe data e hora');
    db.agenda.push({id: uid(), pid: p.id, sid: val('a-svc'), ini: val('a-dia') + 'T' + val('a-hora'), dur: +val('a-dur') || 30, status: 'agendado', obs: val('a-obs'), gid: '', rem: []});
    save(); closeSheet(); route(); toast('Agendado'); };
  aviso();
}
function agDetalhe(a){
  if (!a) return;
  const p = pacDe(a.pid), s = svc(a.sid), hist = a.rem || [];
  openSheet('Agendamento', `<div class="form">
    <div><p class="t" style="margin:0;font-weight:700">${esc(p ? p.nome : 'Paciente removida')}</p><p class="sub" style="margin:2px 0 0">${esc(s ? s.nome : 'Sem serviço')} · ${fmtD(agDia(a.ini))} às ${agHora(a.ini)} · ${a.dur} min</p></div>
    <div class="chips" role="group" aria-label="Situação">${Object.entries(STATUS_AG).map(([k, l]) => `<button class="chip" data-st="${k}" aria-selected="${a.status === k}" type="button">${l}</button>`).join('')}</div>
    ${area('g-obs', 'Observações', a.obs)}
    <h2 style="margin:6px 0 0">Remarcar</h2>
    <div class="two">${field('g-dia', 'Nova data', agDia(a.ini), 'date')}${field('g-hora', 'Hora', agHora(a.ini), 'time')}</div>
    ${select('g-mot', 'Motivo', MOTIVOS, 'paciente')}
    <div id="g-per" hidden>${field('g-ini', 'Início da menstruação (ficha de ciclo)', today(), 'date')}<p class="sub" id="g-cic" style="margin:0"></p></div>
    <p class="sub" id="g-aviso" role="status" style="margin:0;color:var(--warn)"></p>
    ${hist.length ? `<p class="src" style="margin:0">Remarcações: ${hist.map(r => esc(fmtD(agDia(r.de)) + ' ' + agHora(r.de) + ' (' + ((MOTIVOS.find(m => m[0] === r.motivo) || [0, 'outro'])[1]).toLowerCase() + ')')).join('; ')}</p>` : ''}
    <div class="actions"><button class="btn" id="g-rem" type="button">Remarcar</button><button class="btn ghost" id="g-save" type="button">Salvar</button><button class="btn danger" id="g-del" type="button">Excluir</button></div></div>`);
  $$('[data-st]').forEach(b => b.onclick = () => { a.status = b.dataset.st; a.obs = val('g-obs'); save(); closeSheet(); route(); toast(STATUS_AG[a.status]); });
  const aviso = () => { const novo = val('g-dia') + 'T' + val('g-hora'); $('#g-aviso').textContent = novo === a.ini ? '' : agAvisos(p, val('g-dia'), val('g-hora'), a.dur, a.id); };
  const motivo = () => { const per = val('g-mot') === 'periodo'; $('#g-per').hidden = !per;
    if (per && p) { const C = cicloCalc(p); $('#g-cic').textContent = C.ativo ? 'Previsão do ciclo já ativa (média de ' + C.media + ' dias). Esta data entra no histórico.' : 'Esta data entra no histórico do ciclo (' + C.medidos + ' de ' + CICLOS_MIN + ' ciclos medidos até agora).'; } };
  ['g-dia', 'g-hora'].forEach(id => $('#' + id).addEventListener('input', aviso)); $('#g-mot').onchange = motivo; motivo();
  $('#g-save').onclick = () => { a.obs = val('g-obs'); save(); closeSheet(); route(); toast('Salvo'); };
  $('#g-rem').onclick = () => { const dia = val('g-dia'), hora = val('g-hora'), novo = dia + 'T' + hora; if (!dia || !hora) return toast('Informe data e hora'); if (novo === a.ini) return toast('Escolha outra data ou hora');
    const mot = val('g-mot'); a.rem = [...(a.rem || []), {de: a.ini, motivo: mot, em: new Date().toISOString().slice(0, 16)}];
    if (mot === 'periodo' && p) { const d = val('g-ini'); const ini = (p.ciclo && p.ciclo.inicios) || []; if (d && !ini.includes(d)) p.ciclo = {inicios: [...ini, d].sort()}; }
    a.ini = novo; a.status = 'agendado'; a.obs = val('g-obs'); save(); closeSheet(); route(); toast('Remarcado'); };
  arm($('#g-del'), () => { db.agenda = db.agenda.filter(x => x.id !== a.id); save(); closeSheet(); route(); });
}

/* ---------- pacotes e pagamentos (cada parcela é um lançamento de entrada ligado ao pacote) ---------- */
const FORMAS = ['Pix', 'Cartão', 'Dinheiro', 'Transferência'];
const addMonths = (s, n) => { const d = parse(s), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const pagoDe = k => k.parc.filter(x => x.pago).reduce((s, x) => s + x.valor, 0);
const numBR = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
function parcelas(valor, n, primeiro, jaPaga){
  const cents = Math.round(valor * 100), cada = Math.floor(cents / n);
  return Array.from({length: n}, (_, i) => ({id: uid(), venc: addMonths(primeiro, i), valor: (i === n - 1 ? cents - cada * (n - 1) : cada) / 100, pago: !!(jaPaga && i === 0), pagoEm: jaPaga && i === 0 ? today() : ''}));
}
function tabPacotes(b, p){
  const t = today(), ks = db.pacotes.filter(k => k.pid === p.id).sort((a, c) => c.criado.localeCompare(a.criado));
  const st = x => x.pago ? ['Pago', ''] : x.venc < t ? ['Atrasada', 'late'] : diffDays(x.venc, t) <= 7 ? ['Vence em breve', 'soon'] : ['A vencer', ''];
  const card = k => { const s = svc(k.sid);
    return `<div class="card form"><div><span class="t" style="font-weight:700">${esc(s ? s.nome : 'Pacote')}</span><p class="sub" style="margin:0">${k.usadas} de ${k.total} sessões · ${k.validade ? 'válido até ' + fmtD(k.validade) : 'sem validade'}</p></div>
      <p class="sub" style="margin:0">Pago ${money(pagoDe(k))} de ${k.valor === '' ? 'valor a definir' : money(k.valor)}${k.forma ? ' · ' + esc(k.forma) : ''}</p>
      <div class="list">${k.parc.map(x => { const [txt, cls] = st(x);
        return `<div class="item static" style="flex-wrap:wrap"><div class="grow" style="min-width:120px"><span class="t" style="white-space:nowrap">${fmtD(x.venc)}</span><div class="m">${money(x.valor)}${x.pago && x.pagoEm ? ' · pago em ' + fmtD(x.pagoEm).slice(0, 5) : ''}</div></div><span class="pill ${cls}">${txt}</span><button class="btn ghost small" data-pg="${x.id}" data-k="${k.id}" type="button">${x.pago ? 'Desfazer' : 'Marcar pago'}</button></div>`; }).join('')}</div>
      <div class="actions"><button class="btn small" data-us="${k.id}" type="button">Registrar sessão</button><button class="btn ghost small" data-ed="${k.id}" type="button">Editar</button><button class="btn danger small" data-del="${k.id}" type="button">Excluir</button></div></div>`; };
  b.innerHTML = `<div class="actions"><button class="btn small" id="k-novo" type="button">Novo pacote</button></div>${ks.length ? ks.map(card).join('') : '<div class="list"><div class="empty">Nenhum pacote. Cadastre o plano contratado para acompanhar sessões e parcelas.</div></div>'}`;
  const achar = id => db.pacotes.find(k => k.id === id);
  $('#k-novo').onclick = () => pacoteForm(p);
  $$('[data-pg]', b).forEach(x => x.onclick = () => { const par = achar(x.dataset.k).parc.find(y => y.id === x.dataset.pg); par.pago = !par.pago; par.pagoEm = par.pago ? today() : ''; save(); tabPacotes(b, p); });
  $$('[data-us]', b).forEach(x => x.onclick = () => { const k = achar(x.dataset.us); if (k.usadas >= k.total) return toast('Todas as sessões já foram usadas'); k.usadas++; save(); tabPacotes(b, p); toast(k.usadas >= k.total ? 'Plano concluído' : 'Sessão registrada'); });
  $$('[data-ed]', b).forEach(x => x.onclick = () => pacoteEdit(achar(x.dataset.ed), p));
  $$('[data-del]', b).forEach(x => arm(x, () => { db.pacotes = db.pacotes.filter(k => k.id !== x.dataset.del); save(); tabPacotes(b, p); }));
}
function pacoteForm(p){
  const opts = CATS.map(c => `<optgroup label="${esc(c)}">${db.services.filter(s => s.cat === c).map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</optgroup>`).join('');
  openSheet('Novo pacote', `<div class="form">
    <div class="f"><label for="k-svc">Serviço</label><select id="k-svc"><option value="">Escolha um serviço</option>${opts}</select></div>
    <div class="f"><label for="k-opc">Pacote do catálogo</label><select id="k-opc"><option value="">Outro (preencher abaixo)</option></select></div>
    <div class="two">${field('k-ses', 'Sessões', '', 'number', 'inputmode="numeric" min="1"')}${field('k-val', 'Valor total (R$)', '', 'text', 'inputmode="decimal"')}</div>
    <div class="two">${select('k-forma', 'Forma de pagamento', FORMAS)}${field('k-par', 'Parcelas', 1, 'number', 'inputmode="numeric" min="1" max="24"')}</div>
    <div class="two">${field('k-venc', 'Primeiro vencimento', today(), 'date')}${field('k-validade', 'Validade do plano', addDays(today(), 180), 'date')}</div>
    <label class="check"><input type="checkbox" id="k-pago1"><span>A primeira parcela já foi recebida</span></label>
    <p class="sub" id="k-prev" style="margin:0"></p>
    <div class="actions"><button class="btn" id="k-ok" type="button">Salvar pacote</button></div></div>`);
  const prev = () => { const v = numBR(val('k-val')), n = Math.floor(+val('k-par')); const ok = v >= 0 && n >= 1 && n <= 24 && val('k-venc');
    $('#k-prev').textContent = ok ? (() => { const ps = parcelas(v, n, val('k-venc'), false); return n + (n === 1 ? ' parcela de ' : ' parcelas de ') + money(ps[0].valor) + (n > 1 ? ', de ' + fmtD(ps[0].venc).slice(0, 5) + ' a ' + fmtD(ps[n - 1].venc).slice(0, 5) : ', vence ' + fmtD(ps[0].venc).slice(0, 5)); })() : ''; };
  $('#k-svc').onchange = () => { const s = svc(val('k-svc')); $('#k-opc').innerHTML = '<option value="">Outro (preencher abaixo)</option>' + ((s && s.pacotes) || []).map((o, i) => `<option value="${i}">${o[0]} sessões · ${money(o[1])}</option>`).join(''); };
  $('#k-opc').onchange = () => { const s = svc(val('k-svc')), o = s && s.pacotes && s.pacotes[+val('k-opc')]; if (o && val('k-opc') !== '') { $('#k-ses').value = o[0]; $('#k-val').value = o[1]; } prev(); };
  ['k-val', 'k-par', 'k-venc'].forEach(id => $('#' + id).addEventListener('input', prev));
  $('#k-ok').onclick = () => { const ses = Math.floor(+val('k-ses')), v = numBR(val('k-val')), n = Math.floor(+val('k-par'));
    if (!val('k-svc')) return toast('Escolha o serviço'); if (!(ses >= 1)) return toast('Informe as sessões'); if (!(v >= 0)) return toast('Informe o valor total');
    if (!(n >= 1 && n <= 24)) return toast('Parcelas: de 1 a 24'); if (!val('k-venc')) return toast('Informe o primeiro vencimento');
    db.pacotes.push({id: uid(), pid: p.id, sid: val('k-svc'), total: ses, usadas: 0, valor: v, criado: today(), validade: val('k-validade'), forma: val('k-forma'), parc: parcelas(v, n, val('k-venc'), $('#k-pago1').checked)});
    save(); closeSheet(); route(); toast('Pacote salvo'); };
}
function pacoteEdit(k, p){
  openSheet('Editar pacote', `<div class="form"><div class="two">${field('e-ses', 'Sessões contratadas', k.total, 'number', 'inputmode="numeric" min="1"')}${field('e-us', 'Sessões usadas', k.usadas, 'number', 'inputmode="numeric" min="0"')}</div>
    ${field('e-validade', 'Validade do plano', k.validade, 'date')}<p class="sub" style="margin:0">Para mudar valores ou parcelas, exclua o pacote e cadastre de novo.</p>
    <div class="actions"><button class="btn" id="e-ok" type="button">Salvar</button></div></div>`);
  $('#e-ok').onclick = () => { const ses = Math.floor(+val('e-ses')), us = Math.floor(+val('e-us')); if (!(ses >= 1) || !(us >= 0)) return toast('Confira as sessões'); if (us > ses) return toast('Usadas não pode passar do total');
    Object.assign(k, {total: ses, usadas: us, validade: val('e-validade')}); save(); closeSheet(); route(); toast('Salvo'); };
}

/* ---------- documentos: contrato com assinatura online (só com login; o modo de teste não guarda documentos) ---------- */
const CONTRATO_URL = (import.meta.env.VITE_CONTRATO_URL || 'https://contrato.rosecoutinho.com.br') + '/contrato.html';
const docLink = d => d.token ? CONTRATO_URL + '#' + d.token : '';
const docEstado = d => d.assinado_em ? ['Assinado em ' + new Date(d.assinado_em).toLocaleDateString('pt-BR'), ''] : d.expira_em && new Date(d.expira_em) < new Date() ? ['Link expirado', 'late'] : ['Aguardando assinatura', 'soon'];
const DOC_AVISO = t => `<div class="note"><span>${t}</span></div>`;
async function tabDocs(b, p){
  if (!cloud) { b.innerHTML = DOC_AVISO('Contratos e termos só funcionam com o login ativo. O modo de teste não guarda documentos.'); return; }
  b.innerHTML = '<p class="sub">Carregando…</p>';
  let docs; try { docs = await cloud.docs.listar(p.id); } catch (e) { console.error(e); b.innerHTML = DOC_AVISO('Não foi possível carregar os documentos. Verifique a conexão.'); return; }
  const linha = d => { const [txt, cls] = docEstado(d), link = docLink(d), vivo = !d.assinado_em && cls !== 'late', wa = vivo && waLink(p, tplOf('contrato'), {link});
    return `<div class="item static" style="flex-wrap:wrap"><div class="grow" style="min-width:150px"><span class="t">${esc(d.titulo)}</span><div class="m">criado em ${new Date(d.created_at).toLocaleDateString('pt-BR')}</div></div><span class="pill ${cls}">${txt}</span>
      <div class="actions" style="width:100%">${d.assinado_em ? (d.drive_file_id ? `<a class="btn small" href="https://drive.google.com/file/d/${encodeURIComponent(d.drive_file_id)}/view" target="_blank" rel="noopener">Abrir no Drive</a>` : '') : `${wa ? `<a class="btn small" data-wa="${d.id}" href="${wa}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}${vivo ? `<button class="btn ghost small" data-cp="${d.id}" type="button">Copiar link</button>` : ''}<button class="btn danger small" data-del="${d.id}" type="button">Excluir</button>`}</div></div>`; };
  b.innerHTML = `<div class="actions"><button class="btn small" id="dc-novo" type="button">Novo documento</button><button class="btn ghost small" id="dc-mod" type="button">Modelos</button></div>
    ${docs.length ? `<div class="list">${docs.map(linha).join('')}</div>` : '<div class="list"><div class="empty">Nenhum documento. Crie um contrato a partir de um modelo e envie o link pelo WhatsApp.</div></div>'}
    <p class="src">A paciente abre o link no celular, lê, preenche os dados que faltam e assina na tela. O link vale 24 horas e uma única vez. O contrato assinado vai para a pasta dela no Google Drive e não fica guardado no painel.</p>`;
  const achar = id => docs.find(d => d.id === id), recarrega = () => tabDocs(b, p);
  $('#dc-novo').onclick = () => docNovo(p, recarrega);
  $('#dc-mod').onclick = modelosSheet;
  $$('[data-wa]', b).forEach(a => a.onclick = () => { const d = achar(a.dataset.wa); registrarEnvio(p.id, 'contrato', 'contrato:' + d.id, msgText(p, tplOf('contrato'), {link: docLink(d)})); });
  $$('[data-cp]', b).forEach(x => x.onclick = () => navigator.clipboard.writeText(docLink(achar(x.dataset.cp))).then(() => toast('Link copiado'), () => toast('Não foi possível copiar')));
  $$('[data-del]', b).forEach(x => arm(x, async () => { try { await cloud.docs.apagar(x.dataset.del); recarrega(); } catch (e) { console.error(e); toast('Não foi possível excluir'); } }));
}
async function docNovo(p, depois){
  let modelos; try { modelos = await cloud.docs.modelos(); } catch (e) { console.error(e); return toast('Não foi possível carregar os modelos'); }
  if (!modelos.length) { toast('Cadastre um modelo primeiro'); return modelosSheet(); }
  const ks = db.pacotes.filter(k => k.pid === p.id), pacoteTxt = k => { const s = svc(k.sid), n = k.parc.length;
    return {objeto: (s ? s.nome : 'Pacote') + ' — ' + k.total + ' sessões', valor: k.valor === '' ? '' : money(k.valor), pagamento: n ? n + (n === 1 ? ' parcela' : ' parcelas') + ' de ' + money(k.parc[0].valor) + (k.forma ? ' (' + k.forma + ')' : '') + ', primeiro vencimento em ' + fmtD(k.parc[0].venc) : ''}; };
  openSheet('Novo documento', `<div class="form">
    <div class="f"><label for="n-mod">Modelo</label><select id="n-mod">${modelos.map(m => `<option value="${m.id}">${esc(m.titulo)}</option>`).join('')}</select></div>
    <div class="f"><label for="n-pac">Pacote da paciente</label><select id="n-pac"><option value="">Sem pacote (preencher à mão)</option>${ks.map(k => `<option value="${k.id}">${esc((svc(k.sid) || {nome: 'Pacote'}).nome)} · ${k.total} sessões</option>`).join('')}</select></div>
    ${area('n-obj', 'Objeto: procedimentos, sessões e intervalo')}${field('n-val', 'Valor total', '')}${area('n-pag', 'Forma e condições de pagamento')}<p class="sub" style="margin:0">O link vale 24 horas. Depois disso ele não abre mais, nem para assinar nem para consultar. CPF, RG e endereço vêm da ficha; o que faltar, a paciente preenche ao assinar.</p>
    <p class="sub" id="n-erro" role="alert" style="margin:0;color:var(--bad)"></p>
    <div class="actions"><button class="btn" id="n-ok" type="button">Criar documento</button></div></div>`);
  $('#n-pac').onchange = () => { const k = ks.find(x => x.id === val('n-pac')); if (!k) return; const t = pacoteTxt(k); $('#n-obj').value = t.objeto; $('#n-val').value = t.valor; $('#n-pag').value = t.pagamento; };
  $('#n-ok').onclick = async () => { const m = modelos.find(x => x.id === val('n-mod'));
    const texto = preencherContrato(m.texto, {nome: p.nome, nascimento: p.nasc ? fmtD(p.nasc) : '', telefone: p.tel, cpf: p.cpf, rg: p.rg, endereco: p.end, cep: p.cep, data: fmtD(today()), objeto: val('n-obj'), valor_total: val('n-val'), pagamento: val('n-pag')});
    const falta = faltandoContrato(texto); if (falta.length) { $('#n-erro').textContent = 'Preencha: ' + falta.join(', ') + '.'; return; }
    $('#n-ok').disabled = true;
    try { await cloud.docs.criar({paciente_id: p.id, modelo_id: m.id, tipo: m.tipo, titulo: m.titulo, texto_final: texto, token: novoToken(), expira_em: new Date(Date.now() + 24 * 36e5).toISOString()}); closeSheet(); toast('Documento criado. Envie o link: vale 24 horas.'); depois(); }
    catch (e) { console.error(e); $('#n-ok').disabled = false; $('#n-erro').textContent = 'Não foi possível criar agora. Tente de novo.'; } };
}
async function modelosSheet(){
  let ms; try { ms = await cloud.docs.modelos(); } catch (e) { console.error(e); return toast('Não foi possível carregar os modelos'); }
  openSheet('Modelos de documento', `<div class="form"><div class="list">${ms.length ? ms.map(m => `<div class="item static"><div class="grow"><span class="t">${esc(m.titulo)}</span><div class="m">${esc(m.tipo)}</div></div><button class="btn ghost small" data-m="${m.id}" type="button">Editar</button></div>`).join('') : '<div class="empty">Nenhum modelo.</div>'}</div>
    <div class="actions"><button class="btn" id="m-novo" type="button">Novo modelo</button></div></div>`);
  $$('[data-m]').forEach(x => x.onclick = () => modeloForm(ms.find(m => m.id === x.dataset.m)));
  $('#m-novo').onclick = () => modeloForm(null);
}
function modeloForm(m){
  openSheet(m ? 'Editar modelo' : 'Novo modelo', `<div class="form">${field('m-tit', 'Título', m ? m.titulo : '')}${select('m-tipo', 'Tipo', [['contrato', 'Contrato'], ['termo', 'Termo'], ['ficha', 'Ficha']], m ? m.tipo : 'contrato')}
    ${area('m-txt', 'Texto', m ? m.texto : '')}
    <p class="sub" style="margin:0">Preenchidos pelo painel (da ficha e do pacote): {{nome}} {{nascimento}} {{telefone}} {{cpf}} {{rg}} {{endereco}} {{cep}} {{data}} {{objeto}} {{valor_total}} {{pagamento}}. Se algum dos dados da ficha estiver vazio, a paciente completa ao assinar. {{data_hora}} vira a data e hora da assinatura.</p>
    <div class="actions"><button class="btn" id="m-ok" type="button">Salvar</button>${m ? '<button class="btn danger" id="m-off" type="button">Desativar</button>' : ''}</div></div>`);
  $('#m-txt').style.minHeight = '340px';
  $('#m-ok').onclick = async () => { if (!val('m-tit') || !val('m-txt')) return toast('Informe título e texto');
    try { await cloud.docs.salvarModelo({...(m ? {id: m.id} : {}), titulo: val('m-tit'), tipo: val('m-tipo'), texto: $('#m-txt').value, ativo: true}); toast('Modelo salvo'); modelosSheet(); } catch (e) { console.error(e); toast('Não foi possível salvar'); } };
  if (m) arm($('#m-off'), async () => { try { await cloud.docs.salvarModelo({id: m.id, titulo: m.titulo, tipo: m.tipo, texto: m.texto, ativo: false}); modelosSheet(); } catch (e) { console.error(e); toast('Não foi possível desativar'); } });
}

/* ---------- serviços ---------- */
function viewServicos(app){
  app.innerHTML = `<div class="head"><div><h1>Serviços</h1><p class="sub">${db.services.length} no catálogo</p></div><button class="btn" id="s-new" type="button">Novo</button></div>
    <input class="search" id="q" type="search" placeholder="Buscar serviço" autocomplete="off"><div id="slist"></div>
    <p class="sub">Duração e prazo de retorno são sugestões iniciais. Toque em um serviço para ajustar.</p>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    $('#slist').innerHTML = CATS.map(c => { const rows = db.services.filter(s => s.cat === c && (!q || s.nome.toLowerCase().includes(q))); if (!rows.length) return '';
      return `<details class="group" ${q || c === CATS[0] ? 'open' : ''}><summary>${esc(c)}<span>${rows.length}</span></summary><div class="list" style="border:0;border-radius:0">${rows.map(s => `<button class="item" data-s="${s.id}" type="button"><div class="grow"><div class="t">${esc(s.nome)}</div><div class="m">${s.dur ? s.dur + ' min' : ''}${s.ret ? ' · retorno em ' + s.ret + ' dias' : ''}</div>${s.pacotes && s.pacotes.length ? `<div class="pk">${s.pacotes.map(([n, t]) => n + ' sessões ' + money(t)).join(' · ')}</div>` : ''}</div><div class="price">${s.pix != null ? money(s.pix) : '<span class="pill">a definir</span>'}${s.card ? `<small>cartão ${money(s.card)}</small>` : ''}</div></button>`).join('')}</div></details>`; }).join('') || '<div class="list"><div class="empty">Nenhum serviço encontrado.</div></div>';
    $$('[data-s]').forEach(x => x.onclick = () => serviceForm(svc(x.dataset.s)));
  };
  $('#q').oninput = draw; draw(); $('#s-new').onclick = () => serviceForm();
}
function serviceForm(s){
  const e = !!s; s = s || {nome: '', cat: CATS[0], pix: '', card: '', dur: 30, ret: 30, pacotes: []};
  const pk = n => ((s.pacotes || []).find(x => x[0] === n) || [])[1] ?? '';
  openSheet(e ? 'Editar serviço' : 'Novo serviço', `<div class="form">${field('v-nome', 'Nome', s.nome)}${select('v-cat', 'Categoria', CATS, s.cat)}
    <div class="two">${field('v-pix', 'Preço Pix ou dinheiro (R$)', s.pix ?? '', 'text', 'inputmode="decimal"')}${field('v-card', 'Preço no cartão (R$)', s.card ?? '', 'text', 'inputmode="decimal"')}</div>
    <div class="two">${field('v-dur', 'Duração (min)', s.dur ?? '', 'text', 'inputmode="numeric"')}${field('v-ret', 'Retorno em (dias)', s.ret ?? '', 'text', 'inputmode="numeric"')}</div>
    <div class="two">${field('v-p4', 'Pacote 4 sessões (total R$)', pk(4), 'text', 'inputmode="decimal"')}${field('v-p8', 'Pacote 8 sessões (total R$)', pk(8), 'text', 'inputmode="decimal"')}</div>
    <div class="actions"><button class="btn" id="v-ok" type="button">Salvar</button>${e ? '<button class="btn danger" id="v-del" type="button">Excluir</button>' : ''}</div></div>`);
  const num = id => { const v = val(id).replace(',', '.'); return v === '' || isNaN(Number(v)) ? null : Number(v); };
  $('#v-ok').onclick = () => { const nome = val('v-nome'); if (!nome) return toast('Informe o nome');
    const pacotes = [[4, num('v-p4')], [8, num('v-p8')]].filter(x => x[1] != null);
    const n = {id: s.id || 's' + uid(), nome, cat: val('v-cat'), pix: num('v-pix'), card: num('v-card'), dur: num('v-dur'), ret: num('v-ret'), pacotes};
    if (e) Object.assign(s, n); else db.services.push(n); save(); closeSheet(); route(); toast('Serviço salvo'); };
  if (e) arm($('#v-del'), () => { db.services = db.services.filter(x => x.id !== s.id); save(); closeSheet(); route(); });
}


/* ---------- login, segundo fator, nuvem e inicialização ---------- */
const IDLE_MIN = 15;
const demoOk = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';
const flag = (k, v) => { try { if (v === undefined) { const r = sessionStorage.getItem(k); sessionStorage.removeItem(k); return r; } sessionStorage.setItem(k, v); } catch (e) {} return null; };
const setSync = st => { const e = $('#sync'); if (!e) return; const t = {pending: 'Pendente', syncing: 'Salvando…', ok: '', error: 'Sem conexão'}[st] || ''; e.textContent = t; e.className = 'sync' + (st === 'error' ? ' error' : ''); };
let cloudStep = false;
function chrome(on){ $('.tabs').hidden = !on; $('#logout').hidden = !(on || cloudStep) || !cloud; }
const authErr = e => e && e.status >= 400 && e.status < 500 ? 'Dados incorretos ou código expirado.' : 'Não foi possível conectar. Verifique a internet e tente de novo.';
const logoutBtn = () => { const b = $('#logout'); b.hidden = false; };

async function gate(){
  let st; try { st = await cloud.authState(); } catch (e) { st = 'login'; }
  cloudStep = st === 'enroll' || st === 'challenge'; chrome(false);
  if (st === 'login') return viewLogin();
  if (st === 'enroll') return viewEnroll();
  if (st === 'challenge') return viewChallenge();
  cloudStep = false; return startCloud();
}
function viewLogin(){
  const idle = flag('rc-idle');
  $('#app').innerHTML = `<div class="login card form"><h1 style="font-size:20px">Entrar</h1><p class="sub" style="margin:-6px 0 0">Acesso restrito à equipe da clínica.</p>
    ${idle ? '<div class="note">Sessão encerrada por inatividade.</div>' : ''}
    ${field('l-mail', 'E-mail', '', 'email', 'autocomplete="username" inputmode="email"')}${field('l-pass', 'Senha', '', 'password', 'autocomplete="current-password"')}
    <p class="sub" id="l-err" style="color:var(--bad);margin:0" hidden></p><button class="btn" id="l-ok" type="button">Entrar</button></div>`;
  const go = async () => { const b = $('#l-ok'); b.disabled = true; $('#l-err').hidden = true;
    try { await cloud.signIn(val('l-mail'), $('#l-pass').value); await gate(); }
    catch (e) { $('#l-err').textContent = authErr(e); $('#l-err').hidden = false; b.disabled = false; } };
  $('#l-ok').onclick = go; $('#l-pass').onkeydown = e => { if (e.key === 'Enter') go(); };
}
/* o Supabase devolve o SVG com aspas no endereço; recodifica para uma imagem segura */
function qrSrc(qr){
  if (!/^data:image\/svg\+xml/i.test(qr)) return qr;
  const raw = qr.slice(qr.indexOf(',') + 1); let svg; try { svg = decodeURIComponent(raw); } catch (e) { svg = raw; }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
async function viewEnroll(){
  logoutBtn();
  $('#app').innerHTML = '<div class="login card form"><p class="sub" style="margin:0">Preparando a verificação em dois passos…</p></div>';
  let f; try { f = await cloud.enroll(); } catch (e) { $('#app').innerHTML = '<div class="login card form"><p style="margin:0">Não foi possível iniciar. Verifique a internet.</p><button class="btn" id="retry" type="button">Tentar de novo</button></div>'; $('#retry').onclick = viewEnroll; return; }
  $('#app').innerHTML = `<div class="login card form"><h1 style="font-size:20px">Proteja o acesso</h1>
    <p class="sub" style="margin:-6px 0 0">Os dados dos pacientes são de saúde. Além da senha, o app pede um código de 6 dígitos que muda a cada 30 segundos.</p>
    <ol class="sub" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px"><li>Instale um app autenticador (Google Authenticator, Microsoft Authenticator ou Authy).</li><li>Escaneie o QR code abaixo. Se quiser um reserva, escaneie também em outro celular agora.</li><li>Digite o código que aparece no app.</li></ol>
    <div style="display:grid;place-items:center;background:#fff;border-radius:12px;padding:10px"><img id="m-qr" alt="QR code para o app autenticador" width="190" height="190"></div>
    <div class="f"><label>Ou digite esta chave</label><code style="overflow-wrap:anywhere;font-size:13px;user-select:all">${esc(f.secret)}</code></div>
    ${field('m-code', 'Código de 6 dígitos', '', 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="7"')}
    <p class="sub" id="m-err" style="color:var(--bad);margin:0" hidden></p><button class="btn" id="m-ok" type="button">Ativar e entrar</button></div>`;
  $('#m-qr').src = qrSrc(f.qr);
  const go = async () => { const b = $('#m-ok'); b.disabled = true; $('#m-err').hidden = true;
    try { await cloud.verifyCode(f.factorId, val('m-code')); cloudStep = false; await startCloud(); }
    catch (e) { $('#m-err').textContent = authErr(e); $('#m-err').hidden = false; b.disabled = false; } };
  $('#m-ok').onclick = go; $('#m-code').onkeydown = e => { if (e.key === 'Enter') go(); };
}
async function viewChallenge(){
  logoutBtn();
  $('#app').innerHTML = `<div class="login card form"><h1 style="font-size:20px">Código de verificação</h1><p class="sub" style="margin:-6px 0 0">Abra o app autenticador e digite o código de 6 dígitos.</p>
    ${field('m-code', 'Código', '', 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="7"')}
    <p class="sub" id="m-err" style="color:var(--bad);margin:0" hidden></p><button class="btn" id="m-ok" type="button">Confirmar</button></div>`;
  $('#m-code').focus();
  const go = async () => { const b = $('#m-ok'); b.disabled = true; $('#m-err').hidden = true;
    try { await cloud.verifyCode(await cloud.factorId(), val('m-code')); cloudStep = false; await startCloud(); }
    catch (e) { $('#m-err').textContent = authErr(e); $('#m-err').hidden = false; b.disabled = false; } };
  $('#m-ok').onclick = go; $('#m-code').onkeydown = e => { if (e.key === 'Enter') go(); };
}
async function startCloud(){
  chrome(true); $('#app').innerHTML = '<p class="sub">Carregando…</p>';
  try { db = await cloud.load(SERVICES); armIdle(); route(); }
  catch (e) { console.error(e); $('#app').innerHTML = '<div class="card form"><p style="margin:0">Não foi possível carregar os dados. Verifique a conexão.</p><button class="btn" id="retry" type="button">Tentar de novo</button></div>'; $('#retry').onclick = startCloud; }
}
/* saída automática: computador esquecido aberto não expõe pacientes */
let idleTimer = null, idleArmed = false;
async function idleOut(){
  if (cloud.pending) { await cloud.flush(); if (cloud.pending) { idleTimer = setTimeout(idleOut, 30000); return; } }
  flag('rc-idle', '1'); try { await cloud.signOut(); } catch (e) {} location.reload();
}
function armIdle(){
  const bump = () => { clearTimeout(idleTimer); idleTimer = setTimeout(idleOut, IDLE_MIN * 60000); };
  if (!idleArmed) { idleArmed = true; ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, bump, {passive: true, capture: true})); }
  bump();
}
function viewConfig(){
  chrome(false);
  $('#app').innerHTML = '<div class="login card form"><h1 style="font-size:20px">Configuração pendente</h1><p style="margin:0">Faltam as variáveis do Supabase neste ambiente. Por segurança, o app não abre sem login. Veja o README, passo 3.</p></div>';
}
async function boot(){
  if (!cloud) { if (!demoOk) return viewConfig(); db = localLoad() || seed(); db.msgs = db.msgs || []; db.tpl = db.tpl || {}; db.agenda = db.agenda || []; db.pacotes = db.pacotes || []; chrome(true); route(); return; }
  cloud.onStatus(setSync); cloud.onSignOut(() => location.reload());
  $('#logout').onclick = async () => { await cloud.signOut(); location.reload(); };
  gate();
  document.addEventListener('visibilitychange', async () => { /* traz mudanças feitas em outro aparelho */
    if (document.visibilityState !== 'visible' || !cloud.ready || cloud.pending || Date.now() - cloud.loadedAt < 60000) return;
    if (!$('#sheet').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    try { db = await cloud.load(SERVICES); route(); } catch (e) {}
  });
  window.addEventListener('beforeunload', e => { if (cloud.pending) { e.preventDefault(); e.returnValue = ''; } });
}
boot();
if ('serviceWorker' in navigator && import.meta.env.PROD && cloud) navigator.serviceWorker.register('/sw.js').catch(() => {});
