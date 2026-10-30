import assert from 'node:assert/strict';
import {CUSTOS_SEED} from '../src/custos-seed.js';
import {semear, custoDe, sugerido, horaFixa, totalFixo, cartao} from '../src/lib/custos.js';

/* valores que a planilha da Rose calcula (coluna "Despesas" de Procedimentos). Diferença aceita: R$ 3,15 do gaze,
   que a planilha conta pelo pacote inteiro (R$ 3,50) e o painel conta por unidade (R$ 0,35). */
const PLANILHA = {"Drenagem Linfática — 1 região": 22.099, "Drenagem Linfática — 2 regiões": 29.1601, "Drenagem Linfática — corporal": 36.2213, "Drenagem Linfática — corporal e facial": 50.3436, "Modeladora — 1 região": 25.3906, "Modeladora — 2 regiões": 32.4518, "Modeladora — corporal": 39.5129, "Limpeza de pele": 71.8946, "Limpeza de pele com dermaplaning": 73.9446, "Limpeza de pele com radiofrequência": 73.853, "Dermaplaning simples": 19.2156, "Dermaplaning completo": 27.7351, "Microcorrentes": 19.6323, "Radiofrequência facial": 19.924, "Radiofrequência corporal": 19.924, "Ultrassom corporal": 19.4656, "Endermoterapia": 23.1323, "Corrente russa": 19.6323, "Eletrolipólise": 19.6323, "Pump Up": 23.1323, "Peeling químico": 21.6573, "Peeling mecânico": 21.1573, "Microagulhamento facial": 43.1179, "SkinBooster": 67.0456, "Emagrecimento facial": 92.9156, "Lipo enzimática — papada": 56.9823, "Hidrolipoclasia não aspirativa — papada": 29.1101, "Lipo enzimática — corporal": 105.7935, "Hidrolipoclasia não aspirativa — corporal": 43.0435, "Fios de PDO lisos — 5 fios": 233.7269, "Fios de PDO lisos — 10 fios": 398.7269, "Fios de PDO lisos — 5 fios extras": 179.1223, "Fios de PDO filler — 2 fios": 251.2269, "Fios de PDO filler — 4 fios": 433.7269, "Fios de PDO filler — 2 fios extras": 196.6223, "Bioestimulador — Nutriex": 425.9869, "Bioestimulador — Renova Diamond": 670.9869, "Bioestimulador — Biometik": 520.9869, "Bioestimulador — Radiesse": 920.9869, "Bioestimulador — Pró Vitae (glúteos)": 465.9869, "Toxina botulínica": 694.2823, "Preenchimento — baixa viscosidade (Renova)": 441.0002, "Preenchimento — média viscosidade (Renova)": 531.0003, "Preenchimento — alta viscosidade (Renova)": 691.0003, "2ª seringa — baixa viscosidade": 289.1223, "2ª seringa — média viscosidade": 379.1223, "2ª seringa — alta viscosidade": 539.1223, "Preenchimento de glúteos com ácido hialurônico": 788.8246, "2ª seringa — glúteos": 788.8246};
const services = Object.keys(PLANILHA).map((nome, i) => ({id: 's' + i, nome}));
const c = semear(CUSTOS_SEED, services);

assert.equal(Math.round(totalFixo(c) * 100) / 100, 5084.03);
assert.equal(Math.round(horaFixa(c) * 10000) / 10000, 28.2446);
let n = 0;
for (const s of services) {
  const dif = PLANILHA[s.nome] - custoDe(c, c.rec[s.id]);
  assert.ok(Math.abs(dif) < 0.02 || Math.abs(dif - 3.15) < 0.02, s.nome + ' difere ' + dif);
  n++;
}
console.log('ok - custo de ' + n + ' procedimentos confere com a planilha');

/* mudou o aluguel: tudo recalcula; preço sugerido = custo x 2; cartão = preço + taxa */
{
  const s = services[0], antes = custoDe(c, c.rec[s.id]);
  const c2 = semear(CUSTOS_SEED, services); c2.itens.find(i => i.nome === 'Aluguel').valor += 180;
  const depois = custoDe(c2, c2.rec[s.id]);
  assert.ok(Math.abs((depois - antes) - c.rec[s.id].h * 1) < 1e-6, 'sobe 180/180 = R$ 1 por hora gasta');
  assert.equal(sugerido(c, 100), 200); assert.equal(cartao(c, 100), 107);
  console.log('ok - aluguel mais caro recalcula o custo; sugerido e cartão');
}
