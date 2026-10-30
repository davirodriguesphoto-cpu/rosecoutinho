/* Orçamentos: até 3 versões por paciente, cada uma com procedimentos, valor no Pix/dinheiro, no link de pagamento (Infiniti) e na maquininha (PagSeguro).
   db.orc = {taxas: {link: {[parcelas]: %}, pag: {...}}, por: {[pacienteId]: [versão, versão, versão]}}
   versão = {itens: [{sid, nome, ses, pix}], pix (total digitado ou null), entrada, link: {par, total}, nitro (recebimento do link na hora), pag: {par, total}, fechado}  (total null = calculado) */

const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
export const CANAIS = [['pix', 'Pix ou dinheiro'], ['link', 'Link de pagamento (Infiniti)'], ['pag', 'Maquininha (PagSeguro)']];
/* taxas padrão (%) do link da Infiniti: recebimento em 1 dia útil (a da Rose; 3x e 4x ajustadas pelos orçamentos reais dela, 5x e 7x a 9x estimadas entre as faixas da tabela) e na hora (nitro). Maquininha PagSeguro: 4,99 à vista, 5,59 de 2x a 12x. */
const faixa = (de, ate, t) => Object.fromEntries(Array.from({length: ate - de + 1}, (_, i) => [de + i, t]));
export const vazio = () => ({taxas: {
  link: {1: 4.20, 2: 6.09, 3: 7.013, 4: 7.908, 5: 8.79, 6: 9.67, 7: 11.02, 8: 12.37, 9: 13.71, 10: 15.06, 11: 15.87, 12: 16.66},
  nitro: {1: 5.49, 2: 10.89, 6: 13.99, 10: 16.89, 11: 17.89, 12: 18.29},
  pag: {1: 4.99, ...faixa(2, 12, 5.59)}}, por: {}});
export const novaVersao = () => ({itens: [], pix: null, entrada: 0, nitro: false, link: {par: 1, total: null}, pag: {par: 1, total: null}, fechado: ''});
export const versoesDe = (orc, pid) => { const por = orc.por[pid] || (orc.por[pid] = []); while (por.length < 3) por.push(novaVersao()); return por; };

/* preço Pix da linha: o do pacote do catálogo com as mesmas sessões, senão sessões × preço da sessão */
export const linhaPix = (s, ses) => { const o = ((s && s.pacotes) || []).find(x => num(x[0]) === num(ses)); return r2(o ? num(o[1]) : num(s && s.pix) * num(ses)); };
export const somaPix = v => r2(v.itens.reduce((t, i) => t + num(i.pix), 0));
/* o total no Pix é o digitado na versão; sem ele, a soma das linhas */
export const totalPix = v => v.pix != null && v.pix !== '' ? r2(num(v.pix)) : somaPix(v);
export const nomeItem = (it, services) => it.nome || ((services.find(x => x.id === it.sid) || {}).nome) || 'procedimento';
/* cartão: valor digitado; senão o Pix dividido por (1 - taxa), para a clínica receber o mesmo que no Pix depois da taxa; senão a soma dos preços de cartão da tabela (ou Pix) */
/* taxa do parcelamento: a da tabela; entre duas faixas preenchidas, interpolada (a tabela da operadora só traz 1x, 2x, 6x, 10x, 11x e 12x); fora delas, nenhuma */
export function taxaDe(tabela, par){
  const t = tabela || {}, k = Object.keys(t).filter(x => t[x] !== '' && t[x] != null).map(Number).sort((a, b) => a - b);
  if (t[par] != null && t[par] !== '') return num(t[par]);
  const ant = k.filter(x => x < par).pop(), dep = k.find(x => x > par);
  return ant == null || dep == null ? null : num(t[ant]) + (num(t[dep]) - num(t[ant])) * (par - ant) / (dep - ant);
}
/* cartão: valor digitado; senão o Pix dividido por (1 - taxa), para a clínica receber o mesmo que no Pix; sem taxa, o preço de cartão da tabela (ou o Pix) */
export function totalCanal(v, canal, orc, services){
  if (canal === 'pix') return totalPix(v);
  const c = v[canal]; if (c.total != null && c.total !== '') return r2(num(c.total));
  const tx = taxaDe(orc.taxas[canal === 'link' && v.nitro ? 'nitro' : canal], Math.max(1, Math.floor(num(c.par))));
  if (tx != null) return r2(totalPix(v) / (1 - tx / 100));
  const tabela = v.itens.reduce((t, i) => { const s = services.find(x => x.id === i.sid); return t + (s && s.card != null && s.card !== '' ? num(s.card) * num(i.ses) : 0); }, 0);
  return tabela > 0 ? Math.round(tabela) : totalPix(v);
}
export const porParcela = (total, entrada, par) => r2(Math.max(0, total - num(entrada)) / (Math.max(1, Math.floor(num(par))) || 1));

const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', {minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2});
const val2 = n => Number(n).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
/* mesmas palavras que a Rose usa hoje no WhatsApp: "R$ 510 dinheiro ou pix", "3x 182,82 ( via link )" */
function linhasValor(v, orc, services){
  const e = num(v.entrada), pix = totalPix(v);
  const out = ['R$ ' + val2(pix).replace(',00', '') + ' dinheiro ou pix' + (e ? ' (entrada de ' + brl(e) + ')' : '')];
  [['link', 'via link'], ['pag', 'na maquininha']].forEach(([k, onde]) => { const par = Math.max(1, Math.floor(num(v[k].par))); out.push(par + 'x ' + val2(porParcela(totalCanal(v, k, orc, services), e, par)) + ' ( ' + onde + ' )'); });
  return out;
}
/* um texto só com todas as versões preenchidas */
export function mensagem(nome, versoes, orc, services){
  const blocos = versoes.map((v, i) => ({v, i})).filter(x => x.v.itens.length).map(({v, i}) =>
    (i + 1) + '° opção\n\n' + v.itens.map(it => num(it.ses) + ' ' + nomeItem(it, services).toLowerCase()).join('\n') + '\n\n' + linhasValor(v, orc, services).join('\n'));
  return blocos.length ? 'Oi, ' + nome + '! Tudo bem?\n\nEnviando as opções do próximo plano.\n\n' + blocos.join('\n\n') : '';
}

/* fecha a versão: um pacote por procedimento, com valor e entrada divididos na proporção do preço Pix de cada um; a entrada entra como parcela já paga */
export function fechar(v, canal, par, entrada, orc, services, {pid, hoje, uid, addMonths, addDays}){
  const total = totalCanal(v, canal, orc, services), base = somaPix(v), e = Math.min(num(entrada), total), n = Math.max(1, Math.floor(num(par)) || 1);
  let restoT = total, restoE = e;
  return v.itens.map((it, k) => {
    const ultimo = k === v.itens.length - 1, f = base > 0 ? num(it.pix) / base : 1 / v.itens.length;
    const valor = ultimo ? r2(restoT) : r2(total * f), ent = ultimo ? r2(restoE) : r2(e * f); restoT -= valor; restoE -= ent;
    const falta = r2(valor - ent), primeiro = ent > 0 ? addMonths(hoje, 1) : hoje, parc = [];
    if (ent > 0) parc.push({id: uid(), venc: hoje, valor: ent, pago: true, pagoEm: hoje});
    if (falta > 0) { const cents = Math.round(falta * 100), cada = Math.floor(cents / n);
      for (let i = 0; i < n; i++) parc.push({id: uid(), venc: addMonths(primeiro, i), valor: (i === n - 1 ? cents - cada * (n - 1) : cada) / 100, pago: false, pagoEm: ''}); }
    return {id: uid(), pid, sid: it.sid || '', total: Math.max(1, Math.floor(num(it.ses)) || 1), usadas: 0, valor, criado: hoje, validade: addDays(hoje, 180), forma: canal === 'pix' ? 'Pix' : 'Cartão', parc};
  });
}
