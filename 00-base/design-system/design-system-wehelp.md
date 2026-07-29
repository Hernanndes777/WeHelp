# Design System — WeHelp (rascunho inicial)

> Extraído das LPs já publicadas (`retencao`, `ativacao`, `california`). **Provisório** — falta confirmar com o guia de marca oficial (logo já existe, cores/fontes finais a validar com a WeHelp/Rogerio Aranda). Atualize este arquivo assim que tiver o manual de marca.

## Cor

Azul é a cor de marca consistente nas 3 LPs existentes — duas paletas ligeiramente diferentes foram usadas, precisa unificar:

```css
/* Paleta A — usada em retencao/ e ativacao/ */
--blue: #3B6FE8;
--blue-light: #EEF3FD;
--bg: #F4F6FA;
--bg-dot: #CBD5E1;
--border: #E2E8F0;
--text-primary: #1A1A2E;
--text-secondary: #64748B;

/* Paleta B — usada em california/ (escala completa) */
--brand-50:  #eef5ff;
--brand-100: #d9e9ff;
--brand-200: #bcd5ff;
--brand-300: #8eb9ff;
--brand-400: #5990ff;
--brand-500: #3366ff;
--brand-600: #1a44f5;
--brand-700: #1330d4;
```

**Ação pendente**: decidir uma paleta única canônica (provavelmente a escala completa da `california/`, por ser mais versátil) e migrar as LPs antigas pra ela na próxima revisão.

## Logo

`shared/logo-wehelp.png` — usado hoje só na `california/`. Falta o logo em SVG (escalável) e a versão dark/light se existir.

## Tom de voz

Baseado no que já está publicado: direto, orientado a resultado numérico ("recupere até 40% dos alunos em risco"), fala com o dono/gestor como par (não como "empresa grande falando com cliente pequeno"). Reforça a lógica de "ouvir o cliente = decisão com dado, não achismo" — ver `00-base/personas/personas.md`.

## Redes / referências de marca

- Site: https://www.wehelpsoftware.com/pt-BR
- Instagram marca: https://www.instagram.com/wehelp.br/
- Instagram fundador/expert (Rogerio Aranda): https://www.instagram.com/rogerioparanda/

## Pendências

- [ ] Confirmar paleta de cor única (unificar Paleta A e B acima)
- [ ] Logo em SVG + variações
- [ ] Fontes oficiais (as LPs atuais usam Google Fonts genéricas — Inter aparece na california)
- [ ] Guia de tom de voz oficial, se existir
