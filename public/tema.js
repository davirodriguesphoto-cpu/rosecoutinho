/* Alternar claro/escuro. Arquivo próprio porque a política de segurança do site não aceita script dentro do HTML. */
(function () {
  var K = 'tema', r = document.documentElement;
  var SOL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  var LUA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function get() { try { return localStorage.getItem(K); } catch (e) { return null; } }
  function put(t) { try { localStorage.setItem(K, t); } catch (e) {} }
  function atual() { return r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  function pinta() {
    var t = atual(), b = document.getElementById('tema');
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', t === 'dark' ? '#2a0e18' : '#fdf5f5'); m.removeAttribute('media'); });
    if (!b) return;
    b.innerHTML = t === 'dark' ? SOL : LUA;
    b.setAttribute('aria-label', t === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
  }
  var s = get();
  if (s === 'light' || s === 'dark') r.setAttribute('data-theme', s);
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('tema');
    if (b) b.addEventListener('click', function () { var n = atual() === 'dark' ? 'light' : 'dark'; r.setAttribute('data-theme', n); put(n); pinta(); });
    pinta();
  });
})();
