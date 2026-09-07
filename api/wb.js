// api/wb.js — roteador do teste A/B das páginas do webinário.
//
// O anúncio aponta SEMPRE pra lp.wehelpsoftware.com/wb. Esta função sorteia a
// variante pelos pesos da planilha "Split WB", grava um cookie de 30 dias pra
// mesma pessoa sempre cair na mesma página, e redireciona preservando as UTMs.
//
// Mesmo desenho do split da creatina (split-router-lib.php): catálogo de
// variantes no código, pesos fora do código. Assim mudar de 50/50 pra 80/20 é
// editar o painel, não fazer deploy.
//
// Cada variante tem o SEU grupo de WhatsApp (Opção A do teste). É isso que
// permite medir entrada real no grupo por variante — o WhatsApp não avisa
// ninguém quando alguém entra, então a contagem por grupo é a única atribuição
// confiável que existe.

// As duas páginas que já provaram converter, ambas direto pro grupo, sem
// formulário. A hipótese em teste é só uma: curta e minimalista (WB03) contra
// longa com prova social e rosto do fundador (WB02).


import { pegarTeste, urlDaPlanilha } from './_split-testes.js';

// Cookie por teste: se os dois usassem o mesmo, quem ja estivesse sorteado no
// A/B chegaria no segundo teste com uma variante que nao existe la, e o
// re-sorteio sobrescreveria o cookie — quebrando a estabilidade do primeiro.
const COOKIE = { ab: 'wb_v', form: 'wb2_v' };
const COOKIE_DIAS = 30;
const CACHE_MS = 60_000;

// Instâncias serverless são reaproveitadas, então na prática quase toda
// requisição pega o cache e não espera a planilha.
// Cache por teste — senao os pesos de um vazariam pro outro.
const cache = {};

async function lerPesos(nomeTeste) {
  const cfg = pegarTeste(nomeTeste);
  const sheetsUrl = urlDaPlanilha(nomeTeste);
  const c = cache[nomeTeste] || {};
  if (!sheetsUrl) return cfg.fallback;
  if (c.pesos && Date.now() - c.em < CACHE_MS) return c.pesos;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${sheetsUrl}?modo=pesos`, { signal: ctrl.signal });
    clearTimeout(t);

    const data = await r.json();
    const pesos = (data.pesos || []).filter((p) => cfg.catalogo[p.variante] && p.peso > 0);
    if (!pesos.length) return cfg.fallback;

    cache[nomeTeste] = { em: Date.now(), pesos };
    return pesos;
  } catch {
    return c.pesos || cfg.fallback;
  }
}

function sortear(pesos) {
  const total = pesos.reduce((s, p) => s + p.peso, 0);
  let n = Math.random() * total;
  for (const p of pesos) {
    n -= p.peso;
    if (n <= 0) return p.variante;
  }
  return pesos[pesos.length - 1].variante;
}

function lerCookie(req, nome) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export default async function handler(req, res) {
  const base = `https://${req.headers.host || 'lp.wehelpsoftware.com'}`;
  const entrada = new URL(req.url, base);

  // Qual teste: vem do rewrite (/wb -> ab, /wb2 -> form).
  const nomeTeste = entrada.searchParams.get('teste') === 'form' ? 'form' : 'ab';
  const cfg = pegarTeste(nomeTeste);
  const cookieNome = COOKIE[nomeTeste];

  let variante = null;

  // ?v=A força a variante — serve pra testar as páginas sem limpar cookie.
  const forcada = entrada.searchParams.get('v');
  if (forcada && cfg.catalogo[forcada]) variante = forcada;

  // Quem já foi sorteado antes continua na mesma página, senão o teste vira
  // ruído: a mesma pessoa contaria como visitante das duas variantes.
  if (!variante) {
    const doCookie = lerCookie(req, cookieNome);
    if (doCookie && cfg.catalogo[doCookie]) variante = doCookie;
  }

  if (!variante) {
    variante = sortear(await lerPesos(nomeTeste));
  }

  const destino = new URL(cfg.catalogo[variante].path, base);
  entrada.searchParams.forEach((valor, chave) => {
    if (chave !== 'v' && chave !== 'teste') destino.searchParams.set(chave, valor);
  });
  destino.searchParams.set('v', variante);

  res.setHeader('Set-Cookie',
    `${cookieNome}=${variante}; Path=/; Max-Age=${COOKIE_DIAS * 86400}; SameSite=Lax; Secure`);
  // 302 e sem cache: o sorteio precisa acontecer por visitante, não ser
  // congelado no CDN nem no navegador.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.writeHead(302, { Location: destino.toString() });
  res.end();
}
