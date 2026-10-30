/* Custos: despesas fixas (viram custo por hora), materiais (valor da embalagem ÷ usos) e a receita de cada procedimento
   (horas gastas + materiais). Mudou o aluguel ou a luva, tudo recalcula porque o custo nunca fica salvo, só é calculado.
   custos = {horasMes, mult, taxa, itens: [{id, tipo: 'fixa'|'var', grupo, nome, valor, rend}], rec: {[servicoId]: {h, i: [[itemId, qtd]]}}} */

const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const vazio = () => ({horasMes: 180, mult: 2, taxa: 7.29, itens: [], rec: {}});

export const fixas = c => c.itens.filter(i => i.tipo === 'fixa');
export const totalFixo = c => fixas(c).reduce((t, i) => t + num(i.valor), 0);
export const horaFixa = c => totalFixo(c) / (num(c.horasMes) || 180);
export const unitario = i => num(i.valor) / (num(i.rend) || 1);

export function custoDe(c, rec){
  if (!rec) return null;
  const by = new Map(c.itens.map(i => [i.id, i]));
  return num(rec.h) * horaFixa(c) + (rec.i || []).reduce((t, [id, q]) => t + (by.has(id) ? num(q) * unitario(by.get(id)) : 0), 0);
}
export const sugerido = (c, custo) => custo == null ? null : Math.round(custo * (num(c.mult) || 2));
export const cartao = (c, preco) => preco == null || preco === '' ? null : Math.round(num(preco) * (1 + num(c.taxa) / 100));
/* margem sobre o preço final: quanto sobra de cada real depois do custo */
export const margem = (custo, preco) => custo == null || !num(preco) ? null : (num(preco) - custo) / num(preco);

/* base inicial (da planilha): a receita vem por nome do serviço e é ligada ao id de cada serviço do painel */
export function semear(seed, services){
  const byName = new Map(services.map(s => [s.nome, s.id])), rec = {};
  for (const [nome, r] of Object.entries(seed.rec)) if (byName.has(nome)) rec[byName.get(nome)] = {h: r.h, i: r.i.map(x => [...x])};
  return {horasMes: seed.horasMes, mult: seed.mult, taxa: seed.taxa, itens: seed.itens.map(i => ({...i})), rec};
}

/* lucro de cada plano sobre custo × multiplicador (planilha da Rose: avulsa 25%, pacote de 4 sessões 15%, pacote de 8 sessões 5%) */
export const LUCRO_PADRAO = {ind: 25, p4: 15, p8: 5};
export const lucroDe = c => ({...LUCRO_PADRAO, ...(c.lucro || {})});
/* preço sugerido por sessão em cada plano ('ind', 'p4' ou 'p8'), arredondado de 5 em 5 */
export const sugeridoPlano = (c, custo, k) => custo == null ? null : Math.round(custo * (num(c.mult) || 2) * (1 + num(lucroDe(c)[k]) / 100) / 5) * 5;
