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
  const t = today();
  const s = p => SERVICES.find(x => x.nome.startsWith(p));
  const mk = (nome, tel, nasc, atend) => ({id: uid(), demo: true, nome, tel, nasc, insta: '', origem: '', obs: '', lgpd: {ok: false, data: ''}, aval: {}, anam: {}, atend});
  const at = (dias, p, regiao, valor, evol, ret) => { const sv = s(p); const data = addDays(t, -dias); return {id: uid(), data, servicoId: sv.id, regiao, produto: '', lote: '', sessao: '', valor, evolucao: evol, retorno: addDays(data, ret ?? sv.ret)}; };
  return {v: 1, services: SERVICES.map(x => ({...x})), patients: [
    mk('Ana Exemplo', '12 90000-0001', '1988-04-12', [at(10, 'Drenagem Linfática — corporal', 'Abdômen e flancos', 100, 'Boa resposta, relata menos inchaço.')]),
    mk('Beatriz Exemplo', '12 90000-0002', '1992-09-30', [at(108, 'Toxina botulínica', 'Terço superior', 950, 'Resultado natural. Retorno para avaliar manutenção.')]),
    mk('Carla Exemplo', '12 90000-0003', '1979-01-22', [at(70, 'Limpeza de pele', 'Face', 150, 'Pele oleosa, comedões na zona T.')]),
  ]};
}
let db = {v: 1, services: [], patients: []};

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
  const tab = m ? 'pacientes' : (['inicio','pacientes','servicos'].includes(h) ? h : 'inicio');
  $$('.tabs a').forEach(a => a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const app = $('#app');
  if (m) { const p = db.patients.find(x => x.id === m[1]); p ? viewPaciente(app, p) : (location.hash = '#pacientes'); }
  else if (tab === 'pacientes') viewPacientes(app);
  else if (tab === 'servicos') viewServicos(app);
  else viewInicio(app);
}
window.addEventListener('hashchange', () => { ptab = 'dados'; closeSheet(); route(); window.scrollTo(0, 0); });

/* ---------- início ---------- */
function lastAtend(p){ return [...p.atend].sort((a, b) => b.data.localeCompare(a.data))[0]; }
function viewInicio(app){
  const t = today(), mes = t.slice(0, 7);
  const todos = db.patients.flatMap(p => p.atend.map(a => ({p, a})));
  const doMes = todos.filter(x => x.a.data.startsWith(mes)).length;
  const retornos = db.patients.map(p => ({p, a: lastAtend(p)})).filter(x => x.a && x.a.retorno && diffDays(x.a.retorno, t) <= 14).sort((x, y) => x.a.retorno.localeCompare(y.a.retorno)).slice(0, 8);
  const recentes = todos.sort((x, y) => y.a.data.localeCompare(x.a.data)).slice(0, 5);
  const demo = db.patients.some(p => p.demo);
  app.innerHTML = `
    <div><h1>Olá, Rose</h1><p class="sub">${new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'})}</p></div>
    ${demo ? `<div class="note"><span>Modo de teste com pacientes de exemplo. Os dados ficam só neste aparelho.</span><button class="btn small" id="rm-demo" type="button">Remover exemplos</button></div>` : ''}
    <div class="stats">
      <div class="stat"><b>${db.patients.length}</b><span>pacientes</span></div>
      <div class="stat"><b>${doMes}</b><span>atendimentos no mês</span></div>
      <div class="stat"><b>${retornos.length}</b><span>retornos em 14 dias</span></div>
    </div>
    <section><h2>Retornos próximos</h2>${retornos.length ? `<div class="list">${retornos.map(({p, a}) => { const d = diffDays(a.retorno, t); const s = svc(a.servicoId); return `<a class="item" href="#paciente-${p.id}"><div class="avatar">${esc(initials(p.nome))}</div><div class="grow"><div class="t">${esc(p.nome)}</div><div class="m">${esc(s ? s.nome : 'Atendimento')} · ${fmtD(a.retorno)}</div></div><span class="pill ${d < 0 ? 'late' : d <= 3 ? 'soon' : ''}">${d < 0 ? Math.abs(d) + 'd atrasado' : d === 0 ? 'hoje' : 'em ' + d + 'd'}</span></a>`; }).join('')}</div>` : `<div class="list"><div class="empty">Nenhum retorno previsto para as próximas duas semanas.</div></div>`}</section>
    <section><h2>Últimos atendimentos</h2>${recentes.length ? `<div class="list">${recentes.map(({p, a}) => { const s = svc(a.servicoId); return `<a class="item" href="#paciente-${p.id}"><div class="grow"><div class="t">${esc(p.nome)}</div><div class="m">${esc(s ? s.nome : '')} · ${fmtD(a.data)}</div></div><div class="price">${a.valor !== '' && a.valor != null ? money(a.valor) : ''}</div></a>`; }).join('')}</div>` : `<div class="list"><div class="empty">Os atendimentos registrados aparecem aqui.</div></div>`}</section>`;
  const rm = $('#rm-demo'); if (rm) rm.onclick = () => { db.patients = db.patients.filter(p => !p.demo); save(); route(); toast('Exemplos removidos'); };
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
const TABS = [['dados', 'Dados'], ['aval', 'Avaliação'], ['anam', 'Anamnese'], ['atend', 'Atendimentos']];
const ANAM = [['gestante', 'Gestante ou lactante'], ['alergia', 'Alergias (medicamentos, látex, anestésicos, cosméticos)'], ['medic', 'Uso contínuo de medicamentos'], ['anticoag', 'Anticoagulante ou AAS'], ['diabetes', 'Diabetes'], ['hipert', 'Hipertensão'], ['tireoide', 'Alteração de tireoide'], ['cardio', 'Doença cardíaca ou marca-passo'], ['metal', 'Implantes metálicos ou próteses'], ['onco', 'Histórico oncológico'], ['autoimune', 'Doença autoimune'], ['queloide', 'Tendência a queloide ou má cicatrização'], ['herpes', 'Herpes labial recorrente'], ['isotret', 'Isotretinoína nos últimos 6 meses'], ['cirurgia', 'Cirurgias recentes ou plásticas'], ['procs', 'Procedimentos estéticos anteriores'], ['fuma', 'Fumante'], ['sol', 'Exposição solar frequente ou bronzeamento recente']];
function viewPaciente(app, p){
  app.innerHTML = `
    <div><a href="#pacientes" class="sub" style="text-decoration:none">&larr; Pacientes</a></div>
    <div class="head"><div style="display:flex;gap:12px;align-items:center;min-width:0"><div class="avatar" style="width:48px;height:48px;font-size:17px">${esc(initials(p.nome))}</div><div style="min-width:0"><h1 style="font-size:20px;overflow-wrap:anywhere">${esc(p.nome)}</h1><p class="sub">${[age(p.nasc), p.tel].filter(Boolean).map(esc).join(' · ')}</p></div></div></div>
    <div class="chips" role="tablist">${TABS.map(([k, l]) => `<button class="chip" role="tab" data-t="${k}" aria-selected="${k === ptab}" type="button">${l}${k === 'atend' ? ' (' + p.atend.length + ')' : ''}</button>`).join('')}</div>
    <div id="pbody"></div>`;
  $$('.chip', app).forEach(c => c.onclick = () => { ptab = c.dataset.t; viewPaciente(app, p); });
  const b = $('#pbody');
  ({dados: tabDados, aval: tabAval, anam: tabAnam, atend: tabAtend})[ptab](b, p);
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
  arm($('#d-del'), () => { db.patients = db.patients.filter(x => x.id !== p.id); save(); location.hash = '#pacientes'; });
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
    ${area('x-evo', 'Evolução', a.evolucao)}${field('x-ret', 'Retorno previsto', a.retorno, 'date')}
    <div class="actions"><button class="btn" id="x-ok" type="button">Salvar</button>${e ? '<button class="btn danger" id="x-del" type="button">Excluir</button>' : ''}</div></div>`);
  let retTouched = e, valTouched = e;
  $('#x-ret').oninput = () => retTouched = true; $('#x-val').oninput = () => valTouched = true;
  const sync = () => { const s = svc($('#x-svc').value); if (!s) return; if (!valTouched && s.pix != null) $('#x-val').value = s.pix; if (!retTouched) $('#x-ret').value = addDays($('#x-data').value || today(), s.ret); };
  $('#x-svc').onchange = sync; $('#x-data').onchange = sync;
  $('#x-ok').onclick = () => { if (!val('x-svc')) return toast('Escolha o serviço');
    const v = val('x-val').replace(',', '.'); const n = {id: a.id || uid(), data: val('x-data') || today(), servicoId: val('x-svc'), regiao: val('x-reg'), produto: val('x-prod'), lote: val('x-lote'), sessao: val('x-ses'), valor: v === '' ? '' : Number(v), evolucao: val('x-evo'), retorno: val('x-ret')};
    if (e) Object.assign(a, n); else p.atend.push(n); save(); closeSheet(); route(); toast('Atendimento salvo'); };
  if (e) arm($('#x-del'), () => { p.atend = p.atend.filter(x => x.id !== a.id); save(); closeSheet(); route(); });
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


/* ---------- login, nuvem e inicialização ---------- */
const setSync = st => { const e = $('#sync'); if (!e) return; const t = {pending: 'Alterações pendentes', syncing: 'Salvando…', ok: 'Salvo na nuvem', error: 'Sem conexão. Tentando de novo'}[st] || ''; e.textContent = t; e.className = 'sync' + (st === 'error' ? ' error' : ''); };
function chrome(on){ $('.tabs').hidden = !on; $('#logout').hidden = !on || !cloud; }
function viewLogin(){
  chrome(false);
  $('#app').innerHTML = `<div class="login card form"><h1 style="font-size:20px">Entrar</h1><p class="sub" style="margin:-6px 0 0">Acesso restrito à equipe da clínica.</p>
    ${field('l-mail', 'E-mail', '', 'email', 'autocomplete="username" inputmode="email"')}${field('l-pass', 'Senha', '', 'password', 'autocomplete="current-password"')}
    <p class="sub" id="l-err" style="color:var(--bad);margin:0" hidden></p><button class="btn" id="l-ok" type="button">Entrar</button></div>`;
  const go = async () => { const b = $('#l-ok'); b.disabled = true; $('#l-err').hidden = true;
    try { await cloud.signIn(val('l-mail'), $('#l-pass').value); await startCloud(); }
    catch (e) { $('#l-err').textContent = e && e.status >= 400 && e.status < 500 ? 'E-mail ou senha incorretos.' : 'Não foi possível conectar. Verifique a internet e tente de novo.'; $('#l-err').hidden = false; b.disabled = false; } };
  $('#l-ok').onclick = go; $('#l-pass').onkeydown = e => { if (e.key === 'Enter') go(); };
}
async function startCloud(){
  chrome(true); $('#app').innerHTML = '<p class="sub">Carregando…</p>';
  try { db = await cloud.load(SERVICES); route(); }
  catch (e) { console.error(e); $('#app').innerHTML = '<div class="card form"><p style="margin:0">Não foi possível carregar os dados. Verifique a conexão.</p><button class="btn" id="retry" type="button">Tentar de novo</button></div>'; $('#retry').onclick = startCloud; }
}
async function boot(){
  if (!cloud) { db = localLoad() || seed(); chrome(true); route(); return; }
  cloud.onStatus(setSync); cloud.onSignOut(() => location.reload());
  $('#logout').onclick = async () => { await cloud.signOut(); location.reload(); };
  (await cloud.session()) ? startCloud() : viewLogin();
  document.addEventListener('visibilitychange', async () => { /* traz mudanças feitas em outro aparelho */
    if (document.visibilityState !== 'visible' || !cloud.ready || cloud.pending || Date.now() - cloud.loadedAt < 60000) return;
    if (!$('#sheet').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    try { db = await cloud.load(SERVICES); route(); } catch (e) {}
  });
  window.addEventListener('beforeunload', e => { if (cloud.pending) { e.preventDefault(); e.returnValue = ''; } });
}
boot();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
