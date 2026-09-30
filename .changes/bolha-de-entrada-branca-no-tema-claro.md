---
impacto: nada_mudou
secao: corrigido
titulo: Bolha de entrada branca no tema claro do inbox
---

No tema claro, a bolha da mensagem recebida saía preta, com o texto invisível
por cima. A causa era uma alavanca do design system: o tema claro aponta
`--color-white` para `#111118` de propósito (para os tints `bg-white/10`
virarem sombra), e a bolha usava `bg-white`, que o Tailwind v4 compila para
`var(--color-white)`. A bolha passou a usar o branco literal `bg-[#ffffff]` —
branca nos dois temas, como a referência —, e o mesmo vale para os três
containers de QR code que também queriam branco de verdade (onboarding do
WhatsApp, modal de MFA e conexões), que antes ficavam escuros no tema claro.
Ninguém precisa fazer nada para receber isto.
