import './style.css';
import SERVICES from './services.json';
import { cloud } from './lib/cloud.js';

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
  return {v: 1, services: SERVICES.map(x => ({...x})), patients, msgs: [], tpl: {}};
}
let db = {v: 1, services: [], patients: [], msgs: [], tpl: {}};

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
  const h = location.hash.slice(1) || 'inicio';
  const m = h.match(/^paciente-([\w-]+)$/);
  const tab = m ? 'pacientes' : (['inicio','pacientes','servicos','lembretes'].includes(h) ? h : 'inicio');
  $$('.tabs a').forEach(a => a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const app = $('#app');
  if (m) { const p = db.patients.find(x => x.id === m[1]); p ? viewPaciente(app, p) : (location.hash = '#pacientes'); }
  else if (tab === 'pacientes') viewPacientes(app);
  else if (tab === 'servicos') viewServicos(app);
  else if (tab === 'lembretes') viewLembretes(app);
  else viewInicio(app);
}
window.addEventListener('hashchange', () => { ptab = 'dados'; closeSheet(); route(); window.scrollTo(0, 0); });

/* ---------- início: painel de gestão ---------- */
const SUMIDA_DIAS = 90, INATIVA_DIAS = 365;
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const TPL_PADRAO = {
  aniversario: 'Oi, {nome}! Passando para te desejar um feliz aniversário! Que o seu novo ciclo seja lindo e cheio de saúde. Um beijo da Rose Coutinho.',
  manutencao: 'Oi, {nome}! Está chegando a hora do seu retorno ({servico}). Quer que eu veja um horário pra você?',
  sumida: 'Oi, {nome}! Tudo bem? Faz um tempinho que não te vejo por aqui na Rose Coutinho. Como você está? Posso ver um horário pra você essa semana?',
  procedimento: 'Oi, {nome}! Passando para lembrar do seu horário amanhã, {data}: {servico}. Posso confirmar?',
  pagamento: 'Oi, {nome}! Lembrando que o vencimento do seu pagamento é {data}. Qualquer dúvida é só me chamar.',
  fim_plano: 'Oi, {nome}! Seu plano ({servico}) termina em {data}. Vamos conversar sobre a continuidade do seu tratamento?',
};
const tplOf = k => (db.tpl && db.tpl[k]) || TPL_PADRAO[k];
const monthAdd = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const money0 = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
const short = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + 'k' : String(Math.round(n));
const firstName = n => n.trim().split(/\s+/)[0];
const msgText = (p, tpl, servico, data) => tpl.replace('{nome}', firstName(p.nome)).replace('{servico}', servico || 'procedimento').replace('{data}', data ? fmtD(data).slice(0, 5) : '');
function waLink(p, tpl, servico, data){
  const d = (p.tel || '').replace(/\D/g, ''); if (d.length < 10) return '';
  const num = d.length >= 12 && d.startsWith('55') ? d : '55' + d;
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msgText(p, tpl, servico, data));
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

function viewInicio(app){
  const D = dashData(), {cur, prev, t, dia} = D, demo = db.patients.some(p => p.demo);
  const K = [
    {l: 'Receita', v: money0(cur.rec), a: cur.rec, b: prev.rec},
    {l: 'Atendimentos', v: cur.n, a: cur.n, b: prev.n, abs: true},
    {l: 'Ticket médio', v: money0(cur.ticket), a: cur.ticket, b: prev.ticket},
    {l: 'Pacientes novos', v: cur.novos, a: cur.novos, b: prev.novos, abs: true},
  ].map(k => ({...k, rel: k.b > 0 ? (k.a - k.b) / k.b : null, dif: k.a - k.b}));
  const delta = k => { const cls = k.dif > 0.0001 ? 'up' : k.dif < -0.0001 ? 'down' : 'flat';
    if (k.abs) return {cls, txt: k.dif === 0 ? '= mês anterior' : (k.dif > 0 ? '▲ +' : '▼ −') + Math.abs(k.dif) + ' vs mês anterior'};
    if (k.rel == null) return {cls: 'flat', txt: '— sem base no mês anterior'};
    return {cls, txt: (cls === 'flat' ? '= ' : cls === 'up' ? '▲ ' : '▼ ') + Math.abs(Math.round(k.rel * 100)) + '% vs mês anterior'}; };
  const mesNome = new Date(+D.mes.slice(0, 4), +D.mes.slice(5) - 1, 1).toLocaleDateString('pt-BR', {month: 'long'});
  const maxS = Math.max(...D.porServico.map(x => x.rec), 1), maxC = Math.max(...D.porCategoria.map(x => x.rec), 1);
  const linha = (x, tipo) => { const s = svc(x.l.servicoId), nome = esc(x.p.nome), link = waLink(x.p, tipo === 'sumida' ? tplOf('sumida') : tplOf('manutencao'), s && s.nome);
    return `<div class="item static"><a class="avatar" href="#paciente-${x.p.id}" aria-label="Abrir ficha de ${nome}" style="text-decoration:none">${esc(initials(x.p.nome))}</a><div class="grow"><a class="t" href="#paciente-${x.p.id}" style="color:inherit;text-decoration:none">${nome}</a><div class="m">${tipo === 'sumida' ? 'última visita há ' + x.dias + ' dias' : esc(s ? s.nome : 'Retorno') + ' · venceu há ' + x.atraso + ' dias'}</div></div>${link ? `<a class="btn small" href="${link}" target="_blank" rel="noopener">Chamar</a>` : '<span class="pill">sem telefone</span>'}</div>`; };
  const lista = (rows, tipo, vazio) => rows.length ? `<div class="list">${rows.slice(0, 6).map(x => linha(x, tipo)).join('')}${rows.length > 6 ? `<div class="empty" style="padding:10px">e mais ${rows.length - 6}</div>` : ''}</div>` : `<div class="list"><div class="empty">${vazio}</div></div>`;
  const receitaK = K[0], alerta = receitaK.rel != null && receitaK.rel <= -0.15 ? `<div class="alert" role="alert">Receita ${Math.abs(Math.round(receitaK.rel * 100))}% abaixo do mesmo período do mês anterior</div>` : '';
  const comBase = K.filter(k => k.rel != null), melhor = comBase.filter(k => k.rel > 0).sort((a, b) => b.rel - a.rel)[0], pior = comBase.filter(k => k.rel < 0).sort((a, b) => a.rel - b.rel)[0];
  const fmtK = k => `${k.l} ${k.rel > 0 ? '+' : '−'}${Math.abs(Math.round(k.rel * 100))}%`;
  const acoes = [D.atrasados.length ? `chamar ${D.atrasados.length} ${D.atrasados.length === 1 ? 'paciente com retorno vencido' : 'pacientes com retorno vencido'}` : '', D.sumidos.length ? `reativar ${D.sumidos.length} ${D.sumidos.length === 1 ? 'paciente sumido' : 'pacientes sumidos'}` : ''].filter(Boolean);
  app.innerHTML = `
    <div><h1>Olá, Rose</h1><p class="sub">${new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'})}</p></div>
    ${demo ? `<div class="note"><span>Modo de teste com pacientes de exemplo. Não cadastre pacientes reais aqui: nada fica protegido por login.</span><button class="btn small" id="rm-demo" type="button">Remover exemplos</button></div>` : ''}
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
  const rm = $('#rm-demo'); if (rm) rm.onclick = () => { db.patients = db.patients.filter(p => !p.demo); db.msgs = db.msgs.filter(m => db.patients.some(p => p.id === m.pid)); save(); route(); toast('Exemplos removidos'); };
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
  openSheet('Novo paciente', `<div class="form">${field('n-nome', 'Nome completo')}${field('n-tel', 'WhatsApp', '', 'tel', 'inputmode="tel"')}${field('n-nasc', 'Nascimento', '', 'date')}<button class="btn" id="n-ok" type="button">Cadastrar</button></div>`);
  $('#n-ok').onclick = () => {
    const nome = val('n-nome'); if (!nome) return toast('Informe o nome');
    const p = {id: uid(), nome, tel: val('n-tel'), nasc: val('n-nasc'), insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend: []};
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
const TABS = [['dados', 'Dados'], ['aval', 'Avaliação'], ['anam', 'Anamnese'], ['atend', 'Atendimentos'], ['ciclo', 'Ciclo']];
const ANAM = [['gestante', 'Gestante ou lactante'], ['alergia', 'Alergias (medicamentos, látex, anestésicos, cosméticos)'], ['medic', 'Uso contínuo de medicamentos'], ['anticoag', 'Anticoagulante ou AAS'], ['diabetes', 'Diabetes'], ['hipert', 'Hipertensão'], ['tireoide', 'Alteração de tireoide'], ['cardio', 'Doença cardíaca ou marca-passo'], ['metal', 'Implantes metálicos ou próteses'], ['onco', 'Histórico oncológico'], ['autoimune', 'Doença autoimune'], ['queloide', 'Tendência a queloide ou má cicatrização'], ['herpes', 'Herpes labial recorrente'], ['isotret', 'Isotretinoína nos últimos 6 meses'], ['cirurgia', 'Cirurgias recentes ou plásticas'], ['procs', 'Procedimentos estéticos anteriores'], ['fuma', 'Fumante'], ['sol', 'Exposição solar frequente ou bronzeamento recente']];
function viewPaciente(app, p){
  app.innerHTML = `
    <div><a href="#pacientes" class="sub" style="text-decoration:none">&larr; Pacientes</a></div>
    <div class="head"><div style="display:flex;gap:12px;align-items:center;min-width:0"><div class="avatar" style="width:48px;height:48px;font-size:17px">${esc(initials(p.nome))}</div><div style="min-width:0"><h1 style="font-size:20px;overflow-wrap:anywhere">${esc(p.nome)}</h1><p class="sub">${[age(p.nasc), p.tel].filter(Boolean).map(esc).join(' · ')}</p></div></div></div>
    <div class="chips" role="tablist">${TABS.map(([k, l]) => `<button class="chip" role="tab" data-t="${k}" aria-selected="${k === ptab}" type="button">${l}${k === 'atend' ? ' (' + p.atend.length + ')' : ''}</button>`).join('')}</div>
    <div id="pbody"></div>`;
  $$('.chip', app).forEach(c => c.onclick = () => { ptab = c.dataset.t; viewPaciente(app, p); });
  const b = $('#pbody');
  ({dados: tabDados, aval: tabAval, anam: tabAnam, atend: tabAtend, ciclo: tabCiclo})[ptab](b, p);
}
function tabDados(b, p){
  b.innerHTML = `<div class="card form">${field('d-nome', 'Nome completo', p.nome)}
    <div class="two">${field('d-tel', 'WhatsApp', p.tel, 'tel', 'inputmode="tel"')}${field('d-nasc', 'Nascimento', p.nasc, 'date')}</div>
    <div class="two">${field('d-insta', 'Instagram', p.insta)}${field('d-origem', 'Como conheceu', p.origem)}</div>
    ${area('d-obs', 'Observações', p.obs)}
    <label class="check"><input type="checkbox" id="d-lgpd" ${p.lgpd && p.lgpd.ok ? 'checked' : ''}><span>Paciente autorizou o uso dos dados e das imagens (termo assinado)${p.lgpd && p.lgpd.ok ? `<br><span class="sub">Registrado em ${fmtD(p.lgpd.data)}</span>` : ''}</span></label>
    <div class="actions"><button class="btn" id="d-ok" type="button">Salvar</button><button class="btn danger" id="d-del" type="button">Excluir paciente</button></div></div>`;
  $('#d-ok').onclick = () => { const nome = val('d-nome'); if (!nome) return toast('Informe o nome');
    const ok = $('#d-lgpd').checked; Object.assign(p, {nome, tel: val('d-tel'), nasc: val('d-nasc'), insta: val('d-insta'), origem: val('d-origem'), obs: val('d-obs')});
    p.lgpd = {ok, data: ok ? ((p.lgpd && p.lgpd.ok && p.lgpd.data) || today()) : ''}; save(); route(); toast('Salvo'); };
  arm($('#d-del'), () => { db.patients = db.patients.filter(x => x.id !== p.id); db.msgs = db.msgs.filter(m => m.pid !== p.id); save(); location.hash = '#pacientes'; });
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
function tabAnam(b, p){
  const a = p.anam || {};
  b.innerHTML = `<div class="card form"><div>${ANAM.map(([k, l]) => { const v = a[k] || {}; return `<div class="yn"><div class="q"><span>${esc(l)}</span><div class="seg" data-k="${k}"><button type="button" data-v="n" aria-pressed="${v.r === 'n'}">Não</button><button type="button" data-v="s" aria-pressed="${v.r === 's'}">Sim</button></div></div><div class="f" ${v.r === 's' ? '' : 'hidden'} data-d="${k}"><input id="an-${k}" aria-label="Detalhes: ${esc(l)}" placeholder="Qual? Desde quando?" value="${esc(v.d || '')}"></div></div>`; }).join('')}</div>
    <div class="two">${field('an-agua', 'Água por dia', a.agua, 'text', 'placeholder="ex.: 6 copos"')}${field('an-sono', 'Sono', a.sono, 'text', 'placeholder="ex.: 7h"')}</div>
    ${field('an-ativ', 'Atividade física', a.ativ)}${area('an-outras', 'Outras informações de saúde', a.outras)}
    <button class="btn" id="an-ok" type="button">Salvar anamnese</button></div>`;
  $$('.seg', b).forEach(s => $$('button', s).forEach(btn => btn.onclick = () => { $$('button', s).forEach(x => x.setAttribute('aria-pressed', x === btn)); const d = $(`[data-d="${s.dataset.k}"]`, b); d.hidden = btn.dataset.v !== 's'; }));
  $('#an-ok').onclick = () => { const n = {}; ANAM.forEach(([k]) => { const on = $(`.seg[data-k="${k}"] [aria-pressed="true"]`, b); if (on) n[k] = {r: on.dataset.v, d: on.dataset.v === 's' ? val('an-' + k) : ''}; });
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
const TIPO_NOME = {aniversario: 'Aniversário', manutencao: 'Manutenção', sumida: 'Sumida', procedimento: 'Procedimento', pagamento: 'Pagamento', fim_plano: 'Fim de plano'};
const MSG_ORDEM = ['aniversario', 'manutencao', 'sumida', 'procedimento', 'pagamento', 'fim_plano'];
function lembretesData(){
  const t = today(), D = dashData(), out = [];
  const enviado = (pid, chave) => db.msgs.some(m => m.pid === pid && m.chave === chave);
  const add = (p, tipo, chave, det, extra = {}) => out.push({p, tipo, chave, det, sent: enviado(p.id, chave), ...extra});
  db.patients.forEach(p => { if (p.nasc && p.nasc.slice(5) === t.slice(5)) add(p, 'aniversario', 'aniversario:' + t.slice(0, 4), 'faz aniversário hoje' + (age(p.nasc) ? ' (' + age(p.nasc) + ')' : '')); });
  db.patients.filter(p => p.atend.length).forEach(p => { const l = lastAtend(p), s = svc(l.servicoId);
    if (diffDays(t, l.data) < SUMIDA_DIAS && l.retorno && l.retorno <= addDays(t, 3))
      add(p, 'manutencao', 'manutencao:' + l.id, (s ? s.nome : 'Retorno') + (l.retorno < t ? ' · venceu há ' + diffDays(t, l.retorno) + ' dias' : l.retorno === t ? ' · é hoje' : ' · em ' + fmtD(l.retorno).slice(0, 5)), {servico: s && s.nome, data: l.retorno, aviso: cicloAviso(p, l.retorno)}); });
  D.sumidos.forEach(x => add(x.p, 'sumida', 'sumida:' + t.slice(0, 7), 'última visita há ' + x.dias + ' dias'));
  return out.sort((a, b) => a.sent - b.sent || MSG_ORDEM.indexOf(a.tipo) - MSG_ORDEM.indexOf(b.tipo));
}
function viewLembretes(app){
  const L = lembretesData(), pend = L.filter(x => !x.sent), feitos = L.filter(x => x.sent).length;
  const nomeDe = id => (db.patients.find(p => p.id === id) || {nome: 'Paciente removida'}).nome;
  const linha = (x, i) => { const link = waLink(x.p, tplOf(x.tipo), x.servico, x.data);
    return `<div class="item static"><a class="avatar" href="#paciente-${x.p.id}" aria-label="Abrir ficha de ${esc(x.p.nome)}" style="text-decoration:none">${esc(initials(x.p.nome))}</a><div class="grow"><a class="t" href="#paciente-${x.p.id}" style="color:inherit;text-decoration:none">${esc(x.p.nome)}</a><div class="m"><b>${TIPO_NOME[x.tipo]}</b> · ${esc(x.det)}</div>${x.aviso ? `<div class="m" style="color:var(--warn)">${esc(x.aviso)}</div>` : ''}</div>${link ? `<a class="btn small" data-send="${i}" href="${link}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="pill">sem telefone</span>'}</div>`; };
  const recentes = [...db.msgs].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 8);
  app.innerHTML = `<div class="head"><div><h1>Lembretes</h1><p class="sub">${pend.length ? pend.length + ' para enviar hoje' : 'Nada para enviar agora'}${feitos ? ' · ' + feitos + ' já enviado' + (feitos > 1 ? 's' : '') : ''}</p></div><div class="actions"><button class="btn ghost small" id="l-tpl" type="button">Editar mensagens</button></div></div>
    <section><div class="list">${pend.length ? pend.map(linha).join('') : '<div class="empty">Tudo em dia.</div>'}</div></section>
    <section><h2>Enviados recentemente</h2><div class="list">${recentes.length ? recentes.map(m => `<div class="item static"><div class="grow"><span class="t">${esc(nomeDe(m.pid))}</span><div class="m">${TIPO_NOME[m.tipo] || 'Mensagem'} · ${new Date(m.em).toLocaleDateString('pt-BR')}</div></div></div>`).join('') : '<div class="empty">Nenhum envio registrado.</div>'}</div></section>
    <p class="src">O botão abre o WhatsApp com a mensagem pronta; quem envia é a Rose. Ao tocar, o envio fica registrado e o lembrete sai da lista. Aniversário no dia; manutenção até 3 dias antes do retorno; sumida a partir de ${SUMIDA_DIAS} dias sem vir. Procedimento, pagamento e fim de plano entram com a agenda e os pacotes.</p>`;
  $$('a[data-send]', app).forEach(a => a.onclick = () => { const x = pend[+a.dataset.send];
    registrarEnvio(x.p.id, x.tipo, x.chave, msgText(x.p, tplOf(x.tipo), x.servico, x.data)); setTimeout(route, 400); });
  $('#l-tpl').onclick = tplForm;
}
function registrarEnvio(pid, tipo, chave, texto){ db.msgs.push({id: uid(), pid, tipo, chave, texto, em: new Date().toISOString()}); save(); }
function tplForm(){
  openSheet('Mensagens do WhatsApp', `<div class="form"><p class="sub" style="margin:0">Use {nome}, {servico} e {data}. Procedimento, pagamento e fim de plano ficam prontos para quando essas telas entrarem.</p>
    ${MSG_ORDEM.map(k => area('t-' + k, TIPO_NOME[k], tplOf(k))).join('')}
    <div class="actions"><button class="btn" id="t-ok" type="button">Salvar</button><button class="btn ghost" id="t-rst" type="button">Voltar ao padrão</button></div></div>`);
  $('#t-ok').onclick = () => { const tpl = {}; MSG_ORDEM.forEach(k => { const v = val('t-' + k); if (v && v !== TPL_PADRAO[k]) tpl[k] = v; }); db.tpl = tpl; save(); closeSheet(); route(); toast('Mensagens salvas'); };
  $('#t-rst').onclick = () => { db.tpl = {}; save(); closeSheet(); route(); toast('Mensagens padrão'); };
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
  if (!cloud) { if (!demoOk) return viewConfig(); db = localLoad() || seed(); db.msgs = db.msgs || []; db.tpl = db.tpl || {}; chrome(true); route(); return; }
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
