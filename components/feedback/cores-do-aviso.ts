/**
 * AS CORES DO AVISO SAEM DOS NOSSOS TOKENS — NÃO DA BIBLIOTECA.
 *
 * ─── O QUE FOI MEDIDO (18/11/2026) ────────────────────────────────────────
 *
 * O `<Toaster/>` ligava `richColors`, que pinta sucesso/erro/aviso/informação
 * com a paleta EMBUTIDA do `sonner`. O aviso é o único feedback do produto que
 * pintava fora do design system: cor escolhida pela biblioteca, não por nós,
 * sem passar pela régua de contraste nem pelo tema.
 *
 * A decisão do dono foi remover o `richColors` e mapear os quatro tipos para os
 * tokens semânticos do produto (`--color-success|warning|error|info` + `-fg`).
 *
 * ─── POR QUE `!` (IMPORTANT) EM TODA CLASSE ───────────────────────────────
 *
 * O `sonner` injeta o próprio `<style>` com `background: var(--normal-bg)` em
 * `[data-sonner-toast]` — mesma especificidade de um utilitário nosso (0,1,0),
 * e a ordem de injeção não é contrato. Sem `!`, o tema do aviso depende de quem
 * chega primeiro no `<head>`, que é o tipo de coisa que muda entre `dev`,
 * `build` e uma atualização da biblioteca. O `!` fixa a intenção.
 *
 * ─── A COMPOSIÇÃO ENTRA NA CONTA ──────────────────────────────────────────
 *
 * Os tokens `-bg` são translúcidos (`rgba(…, 0.12)` no claro, `0.18` no escuro)
 * de propósito: o aviso pousa sobre conteúdo. A cor final do fundo é o token
 * composto sobre a superfície, e é sobre ELA que o texto é medido — por isso o
 * gate compõe antes de calcular. Aprovar o `rgba` cru seria aprovar um número
 * que não existe na tela.
 */
export type TipoDeAviso = "success" | "error" | "warning" | "info";

/** As classes por tipo. `default` cobre o `toast()` sem tipo. */
export const CLASSES_DO_AVISO = {
  toast: "!rounded-xl !border !shadow-lg !font-sans",
  success: "!bg-success-bg !text-success-fg !border-success/40",
  error: "!bg-error-bg !text-error-fg !border-error/40",
  warning: "!bg-warning-bg !text-warning-fg !border-warning/40",
  info: "!bg-info-bg !text-info-fg !border-info/40",
  default: "!bg-surface !text-text !border-border-control",
  title: "!text-inherit",
  description: "!text-inherit",
  closeButton: "!border-border-control !bg-transparent !text-inherit",
} as const;

/**
 * Os pares (texto, fundo) que o gate mede, por tipo. Vive aqui — e não no teste
 * — para o teste medir exatamente o que o componente usa: duas listas seriam
 * duas verdades, e a que envelhece é sempre a que não está em produção.
 */
export const PARES_DO_AVISO: Record<TipoDeAviso, { texto: string; fundo: string }> = {
  success: { texto: "--color-success-fg", fundo: "--color-success-bg" },
  error: { texto: "--color-error-fg", fundo: "--color-error-bg" },
  warning: { texto: "--color-warning-fg", fundo: "--color-warning-bg" },
  info: { texto: "--color-info-fg", fundo: "--color-info-bg" },
};
