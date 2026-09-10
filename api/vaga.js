// api/vaga.js — porteiro da janela de aplicação do webinário.
//
// /vaga só leva pro formulário durante a janela combinada. Fora dela cai numa
// página de agenda encerrada que joga a pessoa no WhatsApp do comercial.
//
// A checagem é de propósito NO SERVIDOR: se fosse no navegador, bastaria o
// relógio do visitante estar adiantado pra vaga abrir cedo — ou atrasado pra
// ela nunca fechar. Aqui quem decide é o relógio da Vercel, igual pra todo
// mundo.
//
// A CADA CICLO: troque as duas datas abaixo. São UTC — Brasília é UTC-3, então
// 13:00 de Brasília é 16:00Z.

const ABRE  = '2026-09-10T16:00:00Z';   // 13:00 de Brasília
const FECHA = '2026-09-10T16:30:00Z';   // 13:30 de Brasília

const DESTINO = '/sessao-estrategica';
const FECHADA = '/vaga-encerrada';

export default function handler(req, res) {
  const agora = Date.now();
  const abre = Date.parse(ABRE);
  const fecha = Date.parse(FECHA);

  // Repassa as UTMs que vieram no link — sem isso o lead que entra pela vaga
  // chega na planilha sem origem nenhuma e some do relatório do ciclo.
  const entrada = new URL(req.url, 'https://lp.wehelpsoftware.com').searchParams;
  const saida = new URLSearchParams();
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid']
    .forEach(function (k) {
      const v = entrada.get(k);
      if (v) saida.set(k, v);
    });

  // Se o link foi divulgado sem UTM, marca como vindo da vaga mesmo assim.
  if (!saida.get('utm_source')) {
    saida.set('utm_source', 'webinario08');
    saida.set('utm_medium', 'vaga');
    saida.set('utm_campaign', 'apresentacao');
  }

  let destino;
  if (agora < abre) {
    destino = FECHADA + '?estado=antes&abre=' + encodeURIComponent(ABRE);
  } else if (agora > fecha) {
    destino = FECHADA + '?estado=depois';
  } else {
    const qs = saida.toString();
    destino = DESTINO + (qs ? '?' + qs : '');
  }

  // no-store: sem isso a Vercel ou o navegador guardam o 302 e a pessoa que
  // abrir depois continua sendo mandada pro destino da primeira vez.
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Location', destino);
  return res.status(302).end();
}
