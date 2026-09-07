/**
 * Code.gs COMPLETO da planilha "Split WB" — teste A/B das páginas do webinário.
 *
 * Guarda três coisas:
 *  - Eventos:  um registro por pageview e por clique no botão do grupo
 *  - Config:   os pesos do sorteio, editáveis pelo /painel-wb sem deploy
 *  - Grupos:   entradas reais no grupo, uma linha por variante/dia (manual)
 *
 * DUAS PLANILHAS USAM ESTE MESMO ARQUIVO. O que muda sao as duas constantes
 * VARIANTES e GRUPO_UNICO, logo abaixo:
 *
 *   Planilha "Split WB"      -> VARIANTES = ['A', 'B']   GRUPO_UNICO = false
 *   Planilha "Split WB Form" -> VARIANTES = ['D', 'C']   GRUPO_UNICO = true
 *
 * No teste com formulario um grupo so basta: a atribuicao por variante vem do
 * telefone do cadastro (aba Leads), nao da separacao de grupos.
 *
 * COMO INSTALAR
 * 1. Extensoes -> Apps Script, apague tudo e cole este arquivo inteiro
 * 2. Ajuste VARIANTES e GRUPO_UNICO conforme a planilha
 * 3. Implantar -> Nova implantacao -> App da Web
 *    - Executar como: Eu | Quem pode acessar: Qualquer pessoa
 * 4. Abra a URL /exec uma vez — as abas se criam sozinhas
 * 5. Passe a URL /exec pro Claude configurar a env na Vercel
 *
 * Nao existe passo de criar aba na mao: o script cria a que faltar.
 *
 * Este arquivo é COMPLETO de propósito. Em 2026-08-28 o doPost do rastreamento
 * antigo foi perdido porque o arquivo guardado aqui só tinha o doGet e acabou
 * colado por cima do Code.gs inteiro — o rastreamento ficou mudo com campanha
 * no ar. Nunca guarde pedaço de script aqui, só arquivo inteiro.
 *
 * ENDPOINTS
 *   POST { variante, evento, ... }        → grava um evento
 *   POST { acao:'pesos', pesos:[...] }    → salva os pesos (vem do painel)
 *   GET  ?modo=pesos                      → pesos ativos (o roteador consome)
 *   GET                                   → resumo por variante (o painel consome)
 *   GET  ?desde=2026-09-10                → resumo a partir da data
 */

const ABA_EVENTOS = 'Eventos';
const ABA_CONFIG  = 'Config';
const ABA_GRUPOS  = 'Grupos';
const ABA_LEADS   = 'Leads';

// QUAIS VARIANTES ESTA PLANILHA MEDE — mude ao instalar numa planilha nova.
//   Teste 1 (/wb):  ['A', 'B']  — uma pagina sem form contra outra sem form
//   Teste 2 (/wb2): ['D', 'C']  — as duas com formulario
// A ordem importa: a primeira e a coluna B da aba Grupos, a segunda e a C.
const VARIANTES = ['A', 'B'];

// Com formulario, um grupo so basta: a atribuicao vem do telefone do cadastro,
// nao da separacao de grupos. Ligue isto no teste 2 e a aba Grupos passa a ter
// uma coluna unica de total.
const GRUPO_UNICO = false;

const TZ = 'America/Sao_Paulo';

// Linhas de teste não entram na conta.
const IGNORAR = ['check', 'teste', 'test-final', 'claude', 'sonda', 'verificacao'];

// Cabeçalhos de cada aba. O script cria a aba que faltar em vez de quebrar —
// assim não existe "instalação manual" pra dar errado, e se alguém renomear ou
// apagar uma aba o script se recompõe sozinho em vez de ficar mudo. Foi
// exatamente esse tipo de falha silenciosa que derrubou o rastreamento antigo.
const CABECALHOS = {
  'Eventos': ['Data', 'Variante', 'Evento', 'Campaign', 'Adset', 'Criativo', 'Source', 'Medium', 'Referral'],
  'Config':  ['Variante', 'Peso', 'Ativa'],
  // Uma linha por DIA. Com dois grupos, uma coluna pra cada variante; com
  // grupo unico, uma coluna so — a atribuicao por variante vem do cadastro.
  'Grupos':  GRUPO_UNICO
    ? ['Data', 'Entradas no grupo']
    : ['Data', 'Grupo de ' + VARIANTES[0], 'Grupo de ' + VARIANTES[1]],
  // Variante C captura contato antes de liberar o grupo. Quem preenche e nao
  // entra no grupo vira lista de recuperacao em vez de dinheiro perdido.
  'Leads':   ['Data', 'Variante', 'Nome', 'E-mail', 'WhatsApp', 'Formato do negócio', 'Alunos', 'Campaign', 'Adset', 'Criativo', 'Source', 'Medium'],
};

// Sorteio padrão enquanto só existe a variante A.
const CONFIG_INICIAL = [['A', 100, 'sim']];

function _aba(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);

  if (sh) {
    // Conserta cabeçalho antigo, mas SÓ com a aba vazia — reescrever cabeçalho
    // em aba com dados desalinharia tudo que já foi gravado.
    const cabEsperado = CABECALHOS[nome];
    if (cabEsperado && sh.getLastRow() <= 1) {
      sh.getRange(1, 1, 1, cabEsperado.length).setValues([cabEsperado]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  }

  const cab = CABECALHOS[nome];
  if (!cab) throw new Error('Aba desconhecida: ' + nome);

  // Reaproveita a aba padrão vazia ("Página1"/"Sheet1") em vez de deixar lixo.
  const abas = ss.getSheets();
  if (abas.length === 1 && abas[0].getLastRow() === 0) {
    sh = abas[0].setName(nome);
  } else {
    sh = ss.insertSheet(nome);
  }

  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  sh.setFrozenRows(1);

  if (nome === 'Config') {
    sh.getRange(2, 1, CONFIG_INICIAL.length, 3).setValues(CONFIG_INICIAL);
  }
  return sh;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Ordena por volume e já calcula a conversão da página de cada linha. */
function _ranking(mapa) {
  return Object.keys(mapa).map(function (nome) {
    const s = mapa[nome];
    s.taxa_pagina = s.visitantes ? +(s.cliques / s.visitantes * 100).toFixed(1) : 0;
    return s;
  }).sort(function (a, b) { return b.visitantes - a.visitantes; });
}

function _ehTeste(txt) {
  const s = String(txt || '').toLowerCase();
  return IGNORAR.some(function (t) { return s.indexOf(t) !== -1; });
}

/* ─────────────────────────── ESCRITA ─────────────────────────── */

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);

    if (d.acao === 'pesos')  return _salvarPesos(d.pesos);
    if (d.acao === 'grupos') return _salvarGrupos(d);
    if (d.acao === 'lead')   return _salvarLead(d);

    // Data como Date real, não string formatada: string em dd/MM/yyyy não é
    // parseável em JS e quebrava o filtro por data na versão anterior.
    _aba(ABA_EVENTOS).appendRow([
      new Date(),
      d.variante     || '',
      d.evento       || 'pageview',
      d.utm_campaign || '',
      d.utm_adset    || '',
      d.utm_content  || '',
      d.utm_source   || '',
      d.utm_medium   || '',
      d.referral     || ''
    ]);

    return _json({ status: 'ok' });
  } catch (err) {
    return _json({ status: 'erro', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function _salvarPesos(pesos) {
  if (!Array.isArray(pesos) || !pesos.length) {
    return _json({ status: 'erro', message: 'pesos vazio' });
  }
  const sh = _aba(ABA_CONFIG);
  const ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 3).clearContent();

  const linhas = pesos.map(function (p) {
    return [String(p.variante || ''), Number(p.peso) || 0, p.ativa === false ? 'nao' : 'sim'];
  });
  sh.getRange(2, 1, linhas.length, 3).setValues(linhas);

  return _json({ status: 'ok', salvos: linhas.length });
}

function _salvarLead(d) {
  if (!d.nome && !d.whatsapp) return _json({ status: 'erro', message: 'lead vazio' });
  _aba(ABA_LEADS).appendRow([
    new Date(),
    d.variante     || 'C',
    d.nome         || '',
    d.email        || '',
    d.whatsapp     || '',
    d.formato      || '',
    d.alunos       || '',
    d.utm_campaign || '',
    d.utm_adset    || '',
    d.utm_content  || '',
    d.utm_source   || '',
    d.utm_medium   || ''
  ]);
  return _json({ status: 'ok' });
}

/* ─────────────────────────── LEITURA ─────────────────────────── */

function _lerPesos() {
  const sh = _aba(ABA_CONFIG);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (l) { return String(l[0]).trim() !== ''; })
    .map(function (l) {
      return {
        variante: String(l[0]).trim(),
        peso: Number(l[1]) || 0,
        ativa: String(l[2]).trim().toLowerCase() !== 'nao'
      };
    });
}

function _lerEntradasGrupo(desde) {
  const sh = _aba(ABA_GRUPOS);
  const out = {};
  if (sh.getLastRow() < 2) return out;

  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (l) {
    const quando = l[0] instanceof Date ? l[0] : new Date(l[0]);
    if (desde && !(quando >= desde)) return;
    if (GRUPO_UNICO) {
      // Total do dia, sem quebra por variante — quem veio de onde sai do
      // cruzamento telefone x aba Leads.
      out._total = (out._total || 0) + (Number(l[1]) || 0);
    } else {
      out[VARIANTES[0]] = (out[VARIANTES[0]] || 0) + (Number(l[1]) || 0);
      out[VARIANTES[1]] = (out[VARIANTES[1]] || 0) + (Number(l[2]) || 0);
    }
  });
  return out;
}

/**
 * Lança as entradas de um dia. Se o dia já existe, ATUALIZA a linha em vez de
 * criar outra — assim recontar o mesmo dia corrige o número, não duplica.
 */
function _salvarGrupos(d) {
  const dia = String(d.data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return _json({ status: 'erro', message: 'data deve ser AAAA-MM-DD' });
  }
  // Formato certo não garante data que existe: "2026-13-99" passava no regex,
  // virava Invalid Date e gravava uma linha em 1969. Só aceita se voltar igual.
  const quando = new Date(dia + 'T12:00:00-03:00');
  if (isNaN(quando.getTime()) || Utilities.formatDate(quando, TZ, 'yyyy-MM-dd') !== dia) {
    return _json({ status: 'erro', message: 'data inexistente: ' + dia });
  }

  const sh = _aba(ABA_GRUPOS);
  const linha = [quando, Number(d.A) || 0, Number(d.B) || 0];

  if (sh.getLastRow() >= 2) {
    const datas = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < datas.length; i++) {
      const q = datas[i][0] instanceof Date ? datas[i][0] : new Date(datas[i][0]);
      if (!isNaN(q.getTime()) && Utilities.formatDate(q, TZ, 'yyyy-MM-dd') === dia) {
        sh.getRange(i + 2, 1, 1, 3).setValues([linha]);
        return _json({ status: 'ok', acao: 'atualizado', data: dia });
      }
    }
  }
  sh.appendRow(linha);
  return _json({ status: 'ok', acao: 'criado', data: dia });
}

function doGet(e) {
  const p = (e && e.parameter) || {};

  // O roteador só quer saber pra onde mandar — resposta mínima e rápida.
  if (p.modo === 'pesos') {
    return _json({ pesos: _lerPesos().filter(function (x) { return x.ativa && x.peso > 0; }) });
  }

  const desde = p.desde ? new Date(p.desde + 'T00:00:00-03:00') : null;
  const sh = _aba(ABA_EVENTOS);

  const porVariante = {};
  function slot(v) {
    if (!porVariante[v]) porVariante[v] = { variante: v, visitantes: 0, leads: 0, cliques: 0, entradas: 0 };
    return porVariante[v];
  }

  // Quebra por conjunto e por criativo. O Meta já mostra clique e custo por
  // conjunto, mas não sabe quem chegou na página nem quem clicou no botão do
  // grupo — esse cruzamento só existe aqui.
  const porConjunto = {};
  const porCriativo = {};
  function slotN(mapa, nome) {
    if (!mapa[nome]) mapa[nome] = { nome: nome, visitantes: 0, cliques: 0 };
    return mapa[nome];
  }

  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (l) {
      const quando = l[0] instanceof Date ? l[0] : new Date(l[0]);
      if (desde && !(quando >= desde)) return;

      const variante = String(l[1] || '').trim();
      if (!variante) return;
      if (_ehTeste(variante) || _ehTeste(l[3]) || _ehTeste(l[4])) return;

      const evento = String(l[2] || 'pageview').trim().toLowerCase();
      const s = slot(variante);
      const ehClique = evento === 'clique';
      const ehLead   = evento === 'lead';
      if (ehClique) s.cliques++; else if (ehLead) s.leads++; else s.visitantes++;

      const conj = String(l[4] || '').trim() || '(direto / sem conjunto)';
      const crit = String(l[5] || '').trim() || '(direto / sem criativo)';
      const sc = slotN(porConjunto, conj);
      const sr = slotN(porCriativo, crit);
      if (ehClique) { sc.cliques++; sr.cliques++; } else { sc.visitantes++; sr.visitantes++; }
    });
  }

  const entradas = _lerEntradasGrupo(desde);
  Object.keys(entradas).forEach(function (v) {
    if (v === '_total') return;
    slot(v).entradas = entradas[v];
  });

  const linhas = Object.keys(porVariante).map(function (v) {
    const s = porVariante[v];
    // Três taxas, cada uma respondendo uma pergunta diferente:
    //  clique    — a página convenceu a pessoa a agir?
    //  entrada   — quem agiu conseguiu de fato entrar no grupo?
    //  conversao — do total que viu a página, quantos viraram participante?
    //              É esta que decide o teste; as outras dizem ONDE vaza.
    // Só a variante C tem formulário; nas outras fica zero, como deve ser.
    s.taxa_lead      = s.visitantes ? +(s.leads / s.visitantes * 100).toFixed(1) : 0;
    s.taxa_clique    = s.visitantes ? +(s.cliques / s.visitantes * 100).toFixed(1) : 0;
    s.taxa_entrada   = s.cliques ? +(s.entradas / s.cliques * 100).toFixed(1) : 0;
    s.taxa_conversao = s.visitantes ? +(s.entradas / s.visitantes * 100).toFixed(1) : 0;
    return s;
  }).sort(function (a, b) { return b.visitantes - a.visitantes; });

  // Histórico dia a dia, pro painel mostrar o que já foi lançado e permitir
  // corrigir um dia sem abrir a planilha.
  const shG = _aba(ABA_GRUPOS);
  const historico = shG.getLastRow() < 2 ? [] :
    shG.getRange(2, 1, shG.getLastRow() - 1, 3).getValues()
      .filter(function (l) { return l[0]; })
      .map(function (l) {
        const q = l[0] instanceof Date ? l[0] : new Date(l[0]);
        return {
          data: isNaN(q.getTime()) ? String(l[0]) : Utilities.formatDate(q, TZ, 'yyyy-MM-dd'),
          A: Number(l[1]) || 0,
          B: Number(l[2]) || 0
        };
      })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });

  return _json({
    geradoEm: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
    desde: p.desde || null,
    variantes: linhas,
    conjuntos: _ranking(porConjunto),
    criativos: _ranking(porCriativo),
    grupos: historico,
    pesos: _lerPesos(),
    totais: linhas.reduce(function (acc, s) {
      acc.visitantes += s.visitantes;
      acc.cliques += s.cliques;
      acc.entradas += s.entradas;
      return acc;
    }, { visitantes: 0, cliques: 0, entradas: 0 })
  });
}
