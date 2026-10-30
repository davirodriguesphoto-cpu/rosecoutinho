import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { precoSessoes, descontoDe, servicoGrupos, nomeItem, rotuloVariacao, vazio, novaVersao, linhaPix, totalPix, totalCanal, taxaDe, porParcela, mensagem, fechar } from '../src/lib/orcamento.js';

const services = [{id: 'a', nome: 'Drenagem', pix: 100, card: 110, pacotes: [[10, 900]]}, {id: 'b', nome: 'Toxina', pix: 1000, card: 1100, pacotes: []}];
const orc = vazio(), v = novaVersao();
v.itens.push({sid: 'a', ses: 10, pix: linhaPix(services[0], 10)}, {sid: 'b', ses: 1, pix: linhaPix(services[1], 1)});
const ok = (n, f) => { f(); console.log('ok -', n); };
const ajuda = () => { let n = 0; return {pid: 'p', hoje: '2026-10-30', uid: () => 'u' + ++n, addMonths: (s, i) => '2026-' + String(11 + i).padStart(2, '0') + '-30', addDays: () => '2027-04-28'}; };

ok('linha usa o pacote do catálogo quando as sessões batem, senão sessão × preço', () => { assert.equal(linhaPix(services[0], 10), 900); assert.equal(linhaPix(services[0], 3), 300); });
ok('total Pix soma as linhas', () => assert.equal(totalPix(v), 1900));
ok('taxa padrão da Infiniti à vista: Pix ÷ (1 - 4,20%)', () => assert.equal(totalCanal(v, 'link', orc, services), Math.round(190000 / (1 - 0.042)) / 100));
ok('sem taxa para o parcelamento cai no preço de cartão da tabela', () => { v.pag.par = 15; assert.equal(totalCanal(v, 'pag', orc, services), 1100 + 1100); v.pag.par = 1; });
ok('taxa do parcelamento tem prioridade; total digitado vence a taxa', () => {
  orc.taxas.link[6] = 10; v.link.par = 6; assert.equal(totalCanal(v, 'link', orc, services), 2111.11);
  v.link.total = 2000; assert.equal(totalCanal(v, 'link', orc, services), 2000); v.link.total = null;
});
ok('reproduz os orçamentos reais da Rose no link (3x e 4x)', () => {
  const o = vazio(), q = (pix, par) => { const w = novaVersao(); w.pix = pix; w.link.par = par; w.itens.push({sid: '', nome: 'x', ses: 1, pix: 0}); return porParcela(totalCanal(w, 'link', o, services), 0, par); };
  assert.equal(q(510, 3), 182.82); assert.equal(q(410, 3), 146.97); assert.equal(q(660, 4), 179.17);
});
ok('recebimento na hora (nitro), escolhido no orçamento, usa a outra tabela', () => { const o = vazio(), w = novaVersao(); w.nitro = true; w.pix = 1000; assert.equal(totalCanal(w, 'link', o, services), Math.round(100000 / (1 - 0.0549)) / 100); });
ok('faixas que faltam na tabela são interpoladas; fora das pontas não há taxa', () => {
  const o = vazio(); assert.equal(taxaDe(o.taxas.nitro, 6), 13.99); assert.ok(Math.abs(taxaDe(o.taxas.nitro, 8) - 15.44) < 1e-9); assert.equal(taxaDe(o.taxas.nitro, 15), null);
  const w = novaVersao(); w.nitro = true; w.pix = 510; w.link.par = 3; w.itens.push({sid: '', nome: 'x', ses: 1, pix: 0}); assert.ok(totalCanal(w, 'link', o, services) > 510);
  w.link.par = 15; assert.equal(totalCanal(w, 'link', o, services), 510);
});
ok('parcela = (total - entrada) / parcelas', () => assert.equal(porParcela(2090, 290, 6), 300));
ok('mensagem no jeito da Rose: opção, linhas com quantidade, Pix e parcelas', () => {
  const m = mensagem('Ana', [v, novaVersao(), novaVersao()], orc, services);
  assert.match(m, /1° opção/); assert.doesNotMatch(m, /2° opção/);
  assert.match(m, /10 drenagem/); assert.match(m, /R\$ 1\.900 dinheiro ou pix/);
  assert.match(m, /6x [\d.,]+ \( via link \)/); assert.match(m, /1x [\d.,]+ \( na maquininha \)/);
});
ok('texto livre e total no Pix digitado (como a Rose monta hoje)', () => {
  const w = novaVersao();
  w.itens.push({sid: '', nome: 'lipo enzimática (abdômen) com radiofrequência', ses: 1, pix: 0}, {sid: 'a', ses: 2, pix: 0}); w.pix = 510; w.link.par = 3;
  assert.equal(totalPix(w), 510);
  const m = mensagem('Ana', [w, novaVersao(), novaVersao()], orc, services);
  assert.match(m, /1 lipo enzimática \(abdômen\) com radiofrequência\n2 drenagem/);
  assert.match(m, /R\$ 510 dinheiro ou pix\n3x [\d.,]+ \( via link \)/);
  const ks = fechar(w, 'pix', 1, 100, orc, services, ajuda());
  assert.equal(ks.length, 2); assert.equal(Math.round(ks.reduce((t, k) => t + k.valor, 0) * 100), 51000);
});
ok('fechar: um pacote por procedimento, soma bate e entrada vira parcela paga', () => {
  v.link.par = 3; const ks = fechar(v, 'link', 3, 290, orc, services, ajuda());
  assert.equal(ks.length, 2);
  assert.equal(Math.round(ks.reduce((t, k) => t + k.valor, 0) * 100), totalCanal(v, 'link', orc, services) * 100);
  assert.equal(Math.round(ks.reduce((t, k) => t + k.parc.filter(x => x.pago).reduce((a, x) => a + x.valor, 0), 0) * 100), 29000);
  ks.forEach(k => assert.equal(Math.round(k.parc.reduce((a, x) => a + x.valor, 0) * 100), Math.round(k.valor * 100)));
  assert.equal(ks[0].total, 10); assert.equal(ks[0].parc.filter(x => !x.pago).length, 3);
});

const REAL = JSON.parse(readFileSync(new URL('../src/services.json', import.meta.url), 'utf8'));
ok('preço de N sessões: pacote exato, valor por sessão do maior pacote que cabe, ou individual', () => {
  const dren = REAL.find(x => x.nome === 'Drenagem Linfática — 1 região');
  assert.deepEqual(precoSessoes(dren, 1), {total: 60, por: 60, pacote: 0});
  assert.equal(precoSessoes(dren, 4).total, 220); assert.equal(precoSessoes(dren, 8).total, 400);
  assert.equal(precoSessoes(dren, 2).total, 120); assert.equal(precoSessoes(dren, 6).total, 330); assert.equal(precoSessoes(dren, 10).total, 500);
});
ok('desconto do pacote em % sobre o individual', () => { const d = REAL.find(x => x.nome === 'Drenagem Linfática — 1 região'); assert.equal(descontoDe(d, 55), 8); assert.equal(descontoDe(d, 50), 17); assert.equal(descontoDe(d, 60), 0); });
ok('catálogo agrupado: serviço com região, e serviço sem variação', () => {
  const g = servicoGrupos(REAL), d = g.find(x => x.nome === 'Drenagem Linfática'), l = g.find(x => x.nome === 'Limpeza de pele');
  assert.equal(d.vars.length, 4); assert.equal(d.vars[0].rotulo, '1 região'); assert.equal(l.vars.length, 1); assert.equal(l.vars[0].rotulo, '');
  assert.equal(rotuloVariacao('Drenagem Linfática'), 'Região'); assert.equal(rotuloVariacao('Bioestimulador'), 'Produto');
});
ok('texto do item montado do catálogo, com o tipo', () => { const d = REAL.find(x => x.nome === 'Drenagem Linfática — 2 regiões'); assert.equal(nomeItem({sid: d.id, tipo: 'Pós-operatório'}, REAL), 'Drenagem Linfática 2 regiões (pós-operatório)'); });
