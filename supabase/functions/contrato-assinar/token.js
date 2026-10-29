/* Abre o token do Google guardado pelo painel (AES-GCM, chave derivada do segredo do cliente Google).
   Mesmo formato de api/_lib.js: "v1.<iv>.<tag>.<cifrado>". Texto sem esse prefixo é tratado como token puro (formato antigo). */
const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function abrirToken(guardado, segredoDoCliente){
  const [v, iv, tag, enc] = String(guardado).split('.');
  if (v !== 'v1' || !iv || !tag || !enc) return guardado;
  const bruta = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rc-tokens:' + segredoDoCliente));
  const chave = await crypto.subtle.importKey('raw', bruta, 'AES-GCM', false, ['decrypt']);
  const c = b64(enc), t = b64(tag), junto = new Uint8Array(c.length + t.length); junto.set(c); junto.set(t, c.length);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(iv) }, chave, junto));
}
