// Protege /performance (pagina + JSONs de dados com PII dos leads) com senha.
// A senha vem da env var PERF_PASSWORD na Vercel (nunca no codigo, repo e publico).
// Usuario e opcional (PERF_USER); se nao setado, aceita qualquer usuario e valida so a senha.
// Fail closed: sem PERF_PASSWORD configurada, ninguem entra.

export const config = {
  matcher: ['/performance', '/performance/:path*'],
};

export default function middleware(req) {
  const PASS = process.env.PERF_PASSWORD;
  const USER = process.env.PERF_USER;

  function ask() {
    return new Response('Acesso restrito ao time WeHelp.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="WeHelp Performance", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  if (!PASS) return ask();

  const auth = req.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic' || !encoded) return ask();

  let decoded;
  try { decoded = atob(encoded); } catch { return ask(); }
  const i = decoded.indexOf(':');
  const user = decoded.slice(0, i);
  const pass = decoded.slice(i + 1);

  const userOk = USER ? user === USER : true;
  if (userOk && pass === PASS) return; // libera o acesso

  return ask();
}
