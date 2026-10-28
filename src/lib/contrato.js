/* Regras do contrato online, sem dependência de tela: modelo com {{campos}}, o que a paciente ainda precisa preencher e o token do link. */

/* campos que a paciente completa na página pública; o banco (contrato_assinar) aceita só estes */
export const CAMPOS_DA_PACIENTE = ['cpf', 'rg', 'endereco', 'cep', 'nascimento', 'telefone'];
export const ROTULOS = {cpf: 'CPF', rg: 'RG', endereco: 'Endereço', cep: 'CEP', nascimento: 'Data de nascimento', telefone: 'Telefone'};
/* preenchido pelo banco na hora de assinar */
const DO_BANCO = ['data_hora'];

/* troca {{campo}} pelo valor; campo sem valor continua como está */
export const preencher = (texto, vars) => texto.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null && String(vars[k]).trim() !== '' ? String(vars[k]) : m));

export const pendentes = texto => CAMPOS_DA_PACIENTE.filter(k => texto.includes('{{' + k + '}}'));

/* campos que a clínica deveria ter preenchido e ficaram em branco (a paciente não consegue completar) */
export const faltando = texto => [...new Set([...texto.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].filter(k => !CAMPOS_DA_PACIENTE.includes(k) && !DO_BANCO.includes(k));

/* 32 bytes aleatórios em base64url: 43 caracteres, não dá para adivinhar */
export function novoToken(){
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* CPF com dígitos verificadores (aceita pontos e traço). Vazio é válido: o campo é opcional no cadastro. */
export function cpfValido(v){
  const d = String(v || '').replace(/\D/g, ''); if (!d) return true;
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === +d[9] && dig(10) === +d[10];
}
