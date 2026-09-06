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

const CATALOGO = {
  A: { path: '/visibilidade-operativa', label: 'Visibilidade Operativa' },
  // Para adicionar a variante B: crie a página, registre aqui, e dê a ela o
  // link do SEGUNDO grupo de WhatsApp. Sem grupo próprio o teste não mede nada.
  // B: { path: '/wb-b', label: 'Variante B' },
};

// Usado quando a planilha não responde. Nunca deixa o anúncio na mão.
const PESOS_FALLBACK = [{ variante: 'A', peso: 100 }];

const COOKIE = 'wb_v';
const COOKIE_DIAS = 30;
const CACHE_MS = 60_000;

// Instâncias serverless são reaproveitadas, então na prática quase toda
// requisição pega o cache e não espera a planilha.
let cache = { em: 0, pesos: null };

async function lerPesos(sheetsUrl) {
  if (!sheetsUrl) return PESOS_FALLBACK;
  if (cache.pesos && Date.now() - cache.em < CACHE_MS) return cache.pesos;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${sheetsUrl}?modo=pesos`, { signal: ctrl.signal });
    clearTimeout(t);

    const data = await r.json();
    const pesos = (data.pesos || []).filter((p) => CATALOGO[p.variante] && p.peso > 0);
    if (!pesos.length) return PESOS_FALLBACK;

    cache = { em: Date.now(), pesos };
    return pesos;
  } catch {
    return cache.pesos || PESOS_FALLBACK;
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

  let variante = null;

  // ?v=A força a variante — serve pra testar as duas páginas sem limpar cookie.
  const forcada = entrada.searchParams.get('v');
  if (forcada && CATALOGO[forcada]) variante = forcada;

  // Quem já foi sorteado antes continua na mesma página, senão o teste vira
  // ruído: a mesma pessoa contaria como visitante das duas variantes.
  if (!variante) {
    const doCookie = lerCookie(req, COOKIE);
    if (doCookie && CATALOGO[doCookie]) variante = doCookie;
  }

  if (!variante) {
    variante = sortear(await lerPesos(process.env.SHEETS_SPLIT_WB_URL));
  }

  const destino = new URL(CATALOGO[variante].path, base);
  entrada.searchParams.forEach((valor, chave) => {
    if (chave !== 'v') destino.searchParams.set(chave, valor);
  });
  destino.searchParams.set('v', variante);

  res.setHeader('Set-Cookie',
    `${COOKIE}=${variante}; Path=/; Max-Age=${COOKIE_DIAS * 86400}; SameSite=Lax; Secure`);
  // 302 e sem cache: o sorteio precisa acontecer por visitante, não ser
  // congelado no CDN nem no navegador.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.writeHead(302, { Location: destino.toString() });
  res.end();
}
