// api/perf-login.js — valida a senha do /performance e grava o cookie de sessao assinado.
// Senha = env PERF_PASSWORD (Production). Usuario opcional = env PERF_USER (se setado, exige bater).
// "Lembrar por 90 dias" -> cookie persistente 90d; senao cookie de sessao (expira ao fechar) com token de 12h.

import crypto from 'crypto';

function readRaw(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => resolve(d));
    req.on('error', () => resolve(''));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const SECRET = (process.env.PERF_PASSWORD || '').trim();
  const USER = (process.env.PERF_USER || '').trim();

  let body = req.body;
  if (body == null || body === '') {
    const raw = await readRaw(req);
    try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }
  } else if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  body = body || {};

  const usuario = String(body.usuario || '').trim();
  const senha = String(body.senha || '').trim();
  const lembrar = body.lembrar === 'on' || body.lembrar === true || body.lembrar === '1' || body.lembrar === 'true';

  let next = String(body.next || '/performance');
  if (!next.startsWith('/performance') || next.startsWith('/performance-login')) next = '/performance';

  const userOk = USER ? usuario === USER : true;
  if (!SECRET || !userOk || senha !== SECRET) {
    res.setHeader('Location', '/performance-login?erro=1&next=' + encodeURIComponent(next));
    return res.status(303).end();
  }

  const maxAgeSec = lembrar ? 90 * 24 * 3600 : 12 * 3600;
  const exp = Date.now() + maxAgeSec * 1000;
  const sig = crypto.createHmac('sha256', SECRET).update('perf|' + exp).digest('hex');
  const token = exp + '.' + sig;

  const parts = ['perf_auth=' + token, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (lembrar) parts.push('Max-Age=' + maxAgeSec);
  res.setHeader('Set-Cookie', parts.join('; '));
  res.setHeader('Location', next);
  return res.status(303).end();
}
