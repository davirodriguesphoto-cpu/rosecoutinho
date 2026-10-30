/* Google: fotos no Drive (com visualizador), sincronia da agenda com o Google Agenda e backup.
   O navegador só fala com /api; a autorização do Google fica no servidor. */
export function createGoogle(h){
  const { $, $$, esc, toast, field, select, arm, fmtD, today, cloud } = h;
  const pad = n => String(n).padStart(2, '0');
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const nomeDia = (data, nome) => { const [y, m, d] = data.split('-'); return `${d}-${m}-${y.slice(2)}-${nome}`; };
  const JSONH = { 'content-type': 'application/json' };

  /* ---------- conexão com o Google ---------- */
  let gs = null;
  async function getGs(force){ if (!gs || force) gs = await cloud.api('/api/google?action=status'); return gs; }
  function connectCard(oque){
    const falta = gs && !gs.configurado;
    return `<div class="card form"><h2 style="font-size:17px;margin:0">Conectar o Google</h2>
      <p class="sub" style="margin:0">${esc(oque)} usam a conta Google da clínica. A conexão é feita uma vez e fica guardada só no servidor.</p>
      ${falta ? '<p class="sub" style="margin:0;color:var(--bad)">O servidor ainda não tem as chaves do Google. Veja o README, passo "Google".</p>' : '<button class="btn" id="g-conn" type="button">Conectar com o Google</button>'}</div>`;
  }
  function wireConnect(root){
    const b = $('#g-conn', root); if (!b) return;
    b.onclick = async () => { b.disabled = true; try { const r = await cloud.api('/api/google?action=start', { method: 'POST' }); location.href = r.url; } catch (e) { b.disabled = false; toast(e.message); } };
  }
  const offline = '<div class="card"><p style="margin:0">Disponível só com login. O modo de teste não conecta ao Google.</p></div>';

  /* ---------- pasta automática do paciente ---------- */
  const novos = new Map();
  const marcarNovo = id => novos.set(id, 0);
  async function afterSyncPastas(){
    if (!cloud || !novos.size || cloud.pending) return;
    let s; try { s = await getGs(); } catch (e) { return; }
    if (!s.conectado) return;
    for (const [id, tries] of [...novos]) {
      const p = h.getDb().patients.find(x => x.id === id);
      if (!p || p.pasta) { novos.delete(id); continue; }
      try { const r = await cloud.api('/api/drive?action=pasta', { method: 'POST', headers: JSONH, body: JSON.stringify({ paciente: id }) }); p.pasta = r.pasta; novos.delete(id); }
      catch (e) { if (tries >= 2) novos.delete(id); else novos.set(id, tries + 1); }
    }
  }

  /* ---------- fotos ---------- */
  let urls = [];
  const freeUrls = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };
  const blobs = new Map();
  async function imgUrl(f, thumb){
    const k = f.id + (thumb ? 't' : 'f');
    if (blobs.has(k)) return blobs.get(k);
    const r = await cloud.api(`/api/drive?action=img&id=${encodeURIComponent(f.id)}${thumb ? '&t=1' : ''}`, { raw: true });
    const u = URL.createObjectURL(await r.blob()); urls.push(u); blobs.set(k, u); return u;
  }
  async function shrink(file){
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
    for (let q = .88; q > .4; q -= .12) { const bl = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (bl && bl.size <= 3.8e6) return bl; }
    throw new Error('Foto grande demais.');
  }
  const TIPO = { antes: 'Antes', depois: 'Depois', outra: 'Foto' };

  async function tabFotos(b, p){
    freeUrls(); blobs.clear();
    if (!cloud) { b.innerHTML = offline; return; }
    b.innerHTML = '<p class="sub">Carregando…</p>';
    let s, fotos;
    try { s = await getGs(true); if (s.conectado) fotos = await cloud.fotos(p.id); }
    catch (e) { if (b.isConnected) b.innerHTML = '<div class="card"><p style="margin:0">Não foi possível carregar as fotos. Verifique a conexão.</p></div>'; return; }
    if (!b.isConnected) return;
    if (!s.conectado) { b.innerHTML = connectCard('As fotos e a agenda'); wireConnect(b); return; }
    b.innerHTML = `<div class="card form">
      <div class="two">${field('f-data', 'Dia das fotos', today(), 'date')}${select('f-tipo', 'Tipo', [['antes', 'Antes'], ['depois', 'Depois'], ['outra', 'Outra']])}</div>
      <label class="btn" for="f-file" id="f-lbl">Tirar ou escolher fotos</label><input id="f-file" type="file" accept="image/*" multiple hidden>
      <p class="sub" id="f-st" role="status" style="margin:0"></p>
      <p class="sub" style="margin:0;font-size:12.5px">No Drive: Pacientes Rose › ${esc(p.nome)} › <span id="f-pasta"></span></p></div>
      <div id="f-list"></div>`;
    const pasta = () => { $('#f-pasta').textContent = nomeDia($('#f-data').value || today(), p.nome); };
    $('#f-data').oninput = pasta; pasta();
    $('#f-file').onchange = async ev => {
      const files = [...ev.target.files]; ev.target.value = ''; if (!files.length) return;
      const st = $('#f-st'), data = $('#f-data').value || today(), tipo = $('#f-tipo').value;
      $('#f-lbl').setAttribute('aria-disabled', 'true'); let ok = 0;
      try { if (cloud.pending) await cloud.flush(); } catch (e) {}
      for (let i = 0; i < files.length; i++) {
        st.textContent = `Enviando ${i + 1} de ${files.length}…`;
        try {
          const bl = await shrink(files[i]);
          await cloud.api(`/api/drive?action=upload&paciente=${encodeURIComponent(p.id)}&data=${data}&tipo=${tipo}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: bl });
          ok++;
        } catch (e) { st.textContent = e.message || 'Falha no envio.'; toast('Falha em uma foto: ' + (e.message || 'erro')); }
      }
      if (ok) toast(ok + (ok > 1 ? ' fotos enviadas' : ' foto enviada'));
      if ($('#f-list')) tabFotos(b, p);
    };
    lista($('#f-list'), fotos, p, () => tabFotos(b, p));
  }

  function lista(box, fotos, p, refresh){
    if (!fotos.length) { box.innerHTML = '<p class="sub" style="text-align:center;margin-top:20px">Nenhuma foto ainda.</p>'; return; }
    const dias = [...new Set(fotos.map(f => f.tirada_em || ''))];
    let sel = null; /* modo comparar: ids escolhidos */
    const draw = () => {
      box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px"><span class="sub" style="margin:0">${fotos.length} foto${fotos.length > 1 ? 's' : ''}</span><button class="chip" id="f-cmp" type="button" aria-selected="${!!sel}">${sel ? 'Escolha 2 fotos · cancelar' : 'Comparar'}</button></div>` +
        dias.map(d => `<section class="fday"><h3>${d ? fmtD(d) : 'Sem data'}</h3><div class="fgrid">${fotos.filter(f => (f.tirada_em || '') === d).map(f => `<button class="ph" data-id="${f.id}" type="button" aria-pressed="${!!(sel && sel.includes(f.id))}" aria-label="${TIPO[f.tipo] || 'Foto'} de ${d ? fmtD(d) : ''}"><img alt="" hidden><span class="tp">${TIPO[f.tipo] || 'Foto'}</span></button>`).join('')}</div></section>`).join('');
      $('#f-cmp').onclick = () => { sel = sel ? null : []; draw(); };
      $$('.ph', box).forEach(btn => btn.onclick = () => {
        const f = fotos.find(x => x.id === btn.dataset.id);
        if (!sel) return viewer(fotos, fotos.indexOf(f), refresh);
        sel = sel.includes(f.id) ? sel.filter(x => x !== f.id) : [...sel, f.id];
        if (sel.length === 2) { const par = sel.map(id => fotos.find(x => x.id === id)).sort((a, b) => (a.tirada_em || '').localeCompare(b.tirada_em || '')); sel = null; draw(); return comparar(par); }
        draw();
      });
      carregar([...$$('.ph', box)].map(btn => [btn, fotos.find(x => x.id === btn.dataset.id)]));
    };
    draw();
  }
  async function carregar(pares){
    let i = 0;
    const worker = async () => { while (i < pares.length) { const [btn, f] = pares[i++]; try { const u = await imgUrl(f, true); const im = $('img', btn); if (im && btn.isConnected) { im.src = u; im.hidden = false; } } catch (e) {} } };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  /* visualizador em tela cheia */
  let vw = null;
  function overlay(){
    if (vw) vw.remove();
    vw = document.createElement('div'); vw.id = 'viewer'; vw.setAttribute('role', 'dialog'); vw.setAttribute('aria-modal', 'true');
    document.body.appendChild(vw); document.body.classList.add('lock');
    return vw;
  }
  function fechar(){ if (vw) { vw.remove(); vw = null; } document.body.classList.remove('lock'); document.removeEventListener('keydown', keys); }
  let keyFn = null; const keys = e => keyFn && keyFn(e);
  function viewer(fotos, i, refresh){
    const el = overlay(); let cur = i;
    const show = async () => {
      const f = fotos[cur];
      el.innerHTML = `<div class="vbar"><button class="btn ghost small" id="v-x" type="button">Fechar</button><span class="vcap">${f.tirada_em ? fmtD(f.tirada_em) : ''} · ${cur + 1}/${fotos.length}</span>
          <select id="v-t" aria-label="Tipo da foto">${['antes', 'depois', 'outra'].map(t => `<option value="${t}" ${t === f.tipo ? 'selected' : ''}>${TIPO[t]}</option>`).join('')}</select></div>
        <div class="vimg"><button class="vnav" id="v-p" type="button" aria-label="Anterior" ${cur === 0 ? 'disabled' : ''}>‹</button><img id="v-i" alt="" hidden><span id="v-l" class="sub">Carregando…</span><button class="vnav" id="v-n" type="button" aria-label="Próxima" ${cur === fotos.length - 1 ? 'disabled' : ''}>›</button></div>
        <div class="vbar"><button class="btn danger small" id="v-d" type="button">Apagar foto</button></div>`;
      $('#v-x').onclick = fechar;
      $('#v-p').onclick = () => { if (cur > 0) { cur--; show(); } };
      $('#v-n').onclick = () => { if (cur < fotos.length - 1) { cur++; show(); } };
      $('#v-t').onchange = async e => { try { await cloud.fotoMeta(f.id, { tipo: e.target.value }); f.tipo = e.target.value; toast('Tipo atualizado'); } catch (x) { toast('Não foi possível salvar'); } };
      arm($('#v-d'), async () => { try { await cloud.api('/api/drive?action=apagar', { method: 'POST', headers: JSONH, body: JSON.stringify({ id: f.id }) }); fechar(); toast('Foto apagada (foi para a lixeira do Drive)'); refresh(); } catch (e) { toast(e.message || 'Falha ao apagar'); } });
      try { const u = await imgUrl(f, false); const im = $('#v-i'); if (im && vw === el && fotos[cur] === f) { im.src = u; im.hidden = false; $('#v-l').hidden = true; } } catch (e) { const l = $('#v-l'); if (l) l.textContent = 'Não foi possível abrir esta foto.'; }
    };
    let x0 = null;
    el.ontouchstart = e => { x0 = e.touches[0].clientX; };
    el.ontouchend = e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) { cur = Math.max(0, Math.min(fotos.length - 1, cur + (dx < 0 ? 1 : -1))); show(); } };
    keyFn = e => { if (e.key === 'Escape') fechar(); else if (e.key === 'ArrowRight' && cur < fotos.length - 1) { cur++; show(); } else if (e.key === 'ArrowLeft' && cur > 0) { cur--; show(); } };
    document.addEventListener('keydown', keys);
    show();
  }
  function comparar(par){
    const el = overlay();
    el.innerHTML = `<div class="vbar"><button class="btn ghost small" id="v-x" type="button">Fechar</button><span class="vcap">Comparação</span></div>
      <div class="vcmp">${par.map((f, k) => `<figure><img id="c-${k}" alt="" hidden><figcaption>${TIPO[f.tipo] || 'Foto'} · ${f.tirada_em ? fmtD(f.tirada_em) : ''}</figcaption></figure>`).join('')}</div>`;
    $('#v-x').onclick = fechar;
    keyFn = e => { if (e.key === 'Escape') fechar(); }; document.addEventListener('keydown', keys);
    par.forEach(async (f, k) => { try { const u = await imgUrl(f, false); const im = $('#c-' + k); if (im) { im.src = u; im.hidden = false; } } catch (e) {} });
  }

  /* ---------- agenda: sincronia com o Google Agenda ---------- */
  let ge = { externos: [], ocupado: [] }, ultima = 0, rodando = false, tSync = null;
  const dayOf = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
  const noDia = (e, dia) => { /* dia local AAAA-MM-DD */
    const ini = dayOf(e.inicio), fim = dayOf(e.fim), d0 = new Date(dia + 'T00:00:00'), d1 = new Date(d0.getTime() + 86400000);
    return ini < d1 && fim > d0;
  };
  /* compromisso pessoal ou evento só do Google no horário escolhido (aviso ao agendar) */
  function aviso(dia, hora, dur){
    if (!gs || !gs.conectado || !dia || !hora) return '';
    const i = new Date(`${dia}T${hora}`), f = new Date(i.getTime() + (dur || 30) * 60000);
    const bate = [...ge.externos, ...ge.ocupado].some(e => !e.diaInteiro && dayOf(e.inicio) < f && dayOf(e.fim) > i);
    return bate ? 'Já existe algo nesse horário no Google Agenda.' : '';
  }
  async function syncAgenda(app){
    if (!cloud || rodando || !gs || !gs.conectado) return;
    if (cloud.pending) { try { await cloud.flush(); } catch (e) {} if (cloud.pending) return; }
    rodando = true;
    try {
      const r = await cloud.api('/api/agenda?action=sync', { method: 'POST' });
      ge = { externos: r.externos || [], ocupado: r.ocupado || [] }; ultima = Date.now();
      (r.atualizacoes || []).forEach(u => { const a = h.getDb().agenda.find(x => x.id === u.id); if (a) a.gid = u.gid; }); /* o servidor é dono deste campo: não vai para o banco pelo painel */
      if (app && app.isConnected) extras(app);
    } catch (e) { if (app && app.isConnected) { const n = $('#g-st', app); if (n) n.textContent = 'Não foi possível sincronizar com o Google Agenda agora.'; } }
    finally { rodando = false; }
  }
  const diaSel = () => h.getAgSel();
  function extras(app){
    const sec = $('.ag-col > section', app); if (!sec) return;
    let box = $('.g-ext', sec); if (box) box.remove();
    const dia = diaSel(), itens = [...ge.externos.map(e => ({ ...e, t: 'x' })), ...ge.ocupado.map(e => ({ ...e, t: 'o' }))].filter(e => noDia(e, dia)).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    if (!itens.length) return;
    box = document.createElement('div'); box.className = 'g-ext';
    box.innerHTML = '<h3>No Google Agenda</h3>' + itens.map(e => {
      const hr = e.diaInteiro ? 'Dia todo' : `${hhmm(dayOf(e.inicio))}–${hhmm(dayOf(e.fim))}`;
      return e.t === 'o' ? `<div class="g-li"><b>${hr}</b><span>Ocupado (compromisso pessoal)</span></div>` : `<div class="g-li"><b>${hr}</b><span>${esc(e.nome)}</span><span class="pill">${e.tag === 'PACIENTE' ? 'Paciente' : 'Atendimento'}</span></div>`;
    }).join('');
    sec.appendChild(box);
  }
  /* chamado ao fim de viewAgenda: card do Google (conectar / estado / backup) e eventos só do Google no dia */
  async function afterAgenda(app, onde){
    if (!cloud) return;
    let card = null;
    if (onde) { card = $('#g-card', onde); if (!card) { card = document.createElement('section'); card.id = 'g-card'; card.className = 'card form g-card'; onde.appendChild(card); } }
    try { await getGs(); } catch (e) { if (card) card.innerHTML = `<p class="sub" style="margin:0">Não foi possível falar com o servidor do Google.<br><b>Motivo:</b> ${esc(e.message || 'sem resposta')}${e.status ? ' (código ' + e.status + ')' : ''}</p>`; return; }
    if (!app.isConnected) return;
    if (!card) { if (gs.conectado) { extras(app); if (Date.now() - ultima > 20000) syncAgenda(app); } return; }
    if (!gs.conectado) { card.innerHTML = connectCard('A agenda, as fotos e o backup').replace(/^<div class="card form">/, '').replace(/<\/div>$/, ''); wireConnect(card); return; }
    card.innerHTML = `<h2 style="font-size:16px;margin:0">Google conectado</h2>
      <p class="sub" id="g-st" style="margin:0">A agenda do painel e o Google Agenda ficam iguais.${gs.email ? ' Conta: ' + esc(gs.email) + '.' : ''}</p>
      <h2 style="font-size:16px;margin:8px 0 0">Backup</h2><p class="sub" id="bk-st" style="margin:0">Verificando…</p>
      <div class="actions"><button class="btn ghost small" id="bk-now" type="button">Fazer backup agora</button><button class="btn ghost small" id="g-off" type="button">Desconectar o Google</button></div>`;
    arm($('#g-off', card), async () => { try { await cloud.api('/api/google?action=disconnect', { method: 'POST' }); gs = null; ge = { externos: [], ocupado: [] }; toast('Google desconectado'); afterAgenda(app, onde); } catch (e) { toast(e.message); } });
    backup(card);
  }
  const quando = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${hhmm(d)}`; };
  async function backup(root){
    const st = $('#bk-st', root), btn = $('#bk-now', root); if (!st) return;
    const pinta = r => {
      const u = r.ultimo;
      st.innerHTML = (u ? `Último backup: ${quando(u.em)} · ${u.total} registros · ${u.kb} KB.<br>No Drive: Backup Painel Rose Coutinho › ${esc(u.arquivo)}` : 'Ainda não há backup.') +
        (r.automatico ? '<br>Automático todo dia de madrugada. Cada backup substitui o anterior.' : '<br><b style="color:var(--warn)">Backup automático desligado</b> (falta CRON_SECRET no servidor).') +
        (u && u.aviso ? `<br><b style="color:var(--bad)">${esc(u.aviso)}</b>` : '');
    };
    try { pinta(await cloud.api('/api/backup')); } catch (e) { st.textContent = 'Não foi possível ver o estado do backup.'; }
    btn.onclick = async () => { btn.disabled = true; st.textContent = 'Fazendo backup…'; try { await cloud.api('/api/backup', { method: 'POST', headers: JSONH, body: '{}' }); toast('Backup feito'); } catch (e) { toast(e.message || 'Falha no backup'); } btn.disabled = false; try { pinta(await cloud.api('/api/backup')); } catch (e) {} };
  }
  /* depois de cada salvamento do painel: cria pastas de pacientes novos e reconcilia a agenda com o Google */
  function depoisDoSync(){
    afterSyncPastas();
    if (!cloud || cloud.pending) return;
    clearTimeout(tSync); tSync = setTimeout(async () => { try { await getGs(); } catch (e) { return; } if (Date.now() - ultima > 15000) syncAgenda($('#app')); }, 3000);
  }

  /* volta do login do Google: #agenda?google=ok */
  function retornoGoogle(){
    const m = location.hash.match(/google=(\w+)/); if (!m) return;
    const msg = { ok: 'Google conectado', negado: 'Conexão cancelada', incompleto: 'Faltou liberar Drive e Agenda no Google', erro: 'Não foi possível conectar' }[m[1]];
    history.replaceState(null, '', '#agenda'); gs = null; if (msg) setTimeout(() => toast(msg), 300);
  }
  return { tabFotos, afterAgenda, aviso, marcarNovo, afterSync: depoisDoSync, retornoGoogle, freeUrls };
}
