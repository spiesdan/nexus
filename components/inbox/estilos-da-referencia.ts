/**
 * As CLASSES da referência `Inbox – dark premium.html`, traduzidas para os
 * tokens do app.
 *
 * A folha da referência descreve GEOMETRIA e hierarquia, não cor fechada:
 * `.btn` é altura 34 / raio 8 / peso 600, `.sec` respira 18×20 e corta com
 * filete, `.chip` é pílula de 12px, `.dem` é cartão de raio 10. Cada constante
 * aqui espelha uma da folha, trocando `var(--x)` pelo token equivalente do
 * tema (brand→accent, surface→muted, line→border, ink→text) — nenhum hex novo
 * fora da paleta WhatsApp/nota já decidida, nenhum par de contraste novo: o
 * que passava na régua do branding continua passando.
 *
 * Por que um módulo e não classes soltas: estes mesmos estilos aparecem no
 * cabeçalho, no composer e no painel lateral. Duplicar a string é como as
 * três leituras de "quem manda" divergiram — uma cópia por arquivo é uma
 * segunda definição esperando para divergir.
 */
export const BTN_REF = "rounded-lg px-3.5 text-sm font-semibold shadow-none lg:h-[34px]";

/** `.btn` secundário: fundo um degrau acima da barra, borda `--line`, hover `--surface-2`. */
export const BTN_REF_SEC =
  "border border-border bg-muted text-text hover:bg-border hover:border-border hover:text-text";

/** `.link`: texto da marca, sem caixa, sem padding. */
export const BTN_REF_LINK =
  "h-auto p-0 text-sm font-semibold text-accent hover:bg-transparent hover:text-accent lg:h-auto";

/** `.sec` do painel: 16×20 de respiro (referência 18×20 — na grade de 4px da §15) e filete embaixo. */
export const SEC_REF = "border-b border-border px-5 py-4 last:border-b-0";

/** `.sec h3`: 12px, peso 700, sem `uppercase` — a folha nunca coloca caixa alta. */
export const H3_REF = "text-xs font-bold tracking-wide text-muted-foreground";

/** `.chip`: pílula 12px com borda e fundo `--surface`, hover na marca. */
export const CHIP_REF =
  "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-normal text-muted-foreground hover:border-accent hover:text-accent";

/** `.dem` e os cartões irmãos do painel: raio 10, borda, respiro 10/12. */
export const CARD_REF = "rounded-[10px] border border-border bg-surface p-2.5";
