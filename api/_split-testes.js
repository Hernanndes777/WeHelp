// api/_split-testes.js — de qual planilha cada teste fala.
//
// Dois testes rodam em paralelo e NAO podem se misturar:
//   ab   → /wb  → A (curta, sem form) x B (longa, sem form)
//   form → /wb2 → D (curta, com form) x C (longa, com form)
//
// Um endpoint so, duas planilhas. Duplicar roteador e painel seria mais codigo
// pra manter e mais jeito de quebrar em silencio — que ja aconteceu demais aqui.

export const TESTES = {
  ab: {
    env: 'SHEETS_SPLIT_WB_URL',
    catalogo: {
      A: { path: '/wb-a', label: 'Curta — replica do WB03' },
      B: { path: '/wb-b', label: 'Longa — replica do WB02' },
    },
    fallback: [{ variante: 'A', peso: 50 }, { variante: 'B', peso: 50 }],
  },
  form: {
    env: 'SHEETS_SPLIT_WB2_URL',
    catalogo: {
      D: { path: '/wb-d', label: 'Curta com formulario' },
      C: { path: '/wb-c', label: 'Longa com formulario' },
    },
    fallback: [{ variante: 'D', peso: 50 }, { variante: 'C', peso: 50 }],
  },
};

/** Devolve a config do teste pedido; cai no 'ab' se vier lixo. */
export function pegarTeste(nome) {
  const t = TESTES[String(nome || '').toLowerCase()];
  return t || TESTES.ab;
}

export function urlDaPlanilha(nome) {
  return process.env[pegarTeste(nome).env];
}
