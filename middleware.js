// Protege /performance (pagina + JSONs com PII dos leads).
// Em vez do popup nativo (Basic Auth), checa um COOKIE de sessao assinado (HMAC-SHA256).
// Quem valida a senha e grava o cookie e /api/perf-login; a pagina de login e /performance-login.
// Segredo de assinatura = env PERF_PASSWORD (Production). Repo e PUBLICO: nada de senha no codigo.
// Fail closed. A pagina /performance-login e o /api/perf-login NAO batem no matcher (ficam livres).

export const config = {
  matcher: ['/performance', '/performance/:path*'],
};

const enc = new TextEncoder();
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(req) {
  const SECRET = (process.env.PERF_PASSWORD || '').trim();
  const url = new URL(req.url);

  function toLogin() {
    const login = new URL('/performance-login', url);
    login.searchParams.set('next', url.pathname + url.search);
    return Response.redirect(login, 307);
  }

  if (!SECRET) return toLogin();

  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)perf_auth=([^;]+)/);
  if (!m) return toLogin();

  const val = decodeURIComponent(m[1]);
  const dot = val.lastIndexOf('.');
  if (dot < 0) return toLogin();

  const exp = val.slice(0, dot);
  const sig = val.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return toLogin();

  const good = await hmacHex(SECRET, 'perf|' + exp);
  if (sig !== good) return toLogin();

  return; // cookie valido -> libera
}
