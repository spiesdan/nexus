import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Campo canônico: rótulo + controle + ajuda + recusa no mesmo vocabulário.
 *
 * Antes dele havia 136 arquivos remontando o mesmo grupo à mão (rótulo com
 * `htmlFor`, controle com `id`, par de ajuda e par de recusa em classes
 * soltas) — cada um com o espaçamento e o token de cor que o autor preferiu.
 * Este componente fecha a divergência: `space-y-1.5` e
 * `text-muted-foreground`/`text-error-fg` são o vocabulário, e os dois
 * tokens `text-text-muted`/`text-muted-foreground` resolvem para a MESMA
 * cor (`--muted-foreground: var(--color-text-muted)` em `app/globals.css`).
 *
 * Acessibilidade (R2 da auditoria): quando recebe `id`, liga o rótulo ao
 * controle, injeta no controle o `id` + `aria-describedby` apontando para a
 * ajuda e/ou a recusa, e marca `aria-invalid` quando há recusa — o que os
 * forms faziam à mão, campo a campo. Controles Radix (`Select`) recebem o
 * `id` no TRIGGER (como já faziam): o clone no root é inerte, e a moldura,
 * os ids derivados e a recusa continuam valendo.
 *
 * Só clona quando `children` é um elemento único — condição dos 7 forms que
 * o adotaram; com fragmento ou lista vale a moldura sozinha.
 */
interface FormFieldProps {
  readonly label: React.ReactNode;
  /** O id DO CONTROLE: vira o `htmlFor` do rótulo e o id injetado no controle. */
  readonly id?: string;
  /** Marca o campo como obrigatório (asterisco na cor de recusa). */
  readonly obrigatorio?: boolean;
  readonly hint?: React.ReactNode;
  readonly erro?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function FormField({
  label,
  id,
  obrigatorio,
  hint,
  erro,
  children,
  className,
}: FormFieldProps) {
  const temHint = Boolean(hint);
  const temErro = Boolean(erro);
  const idDoHint = id && temHint ? `${id}-hint` : null;
  const idDoErro = id && temErro ? `${id}-erro` : null;
  const descricao = [idDoHint, idDoErro].filter(Boolean).join(" ") || null;

  let controle = children;
  if (id && React.isValidElement(children)) {
    const atual = children.props as Record<string, unknown>;
    const descricaoHerdada =
      descricao !== null
        ? [atual["aria-describedby"], descricao].filter(Boolean).join(" ")
        : undefined;
    controle = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      id,
      ...(descricaoHerdada ? { "aria-describedby": descricaoHerdada } : {}),
      ...(temErro ? { "aria-invalid": true } : {}),
    });
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {obrigatorio ? <span className="text-error-fg"> *</span> : null}
      </Label>
      {controle}
      {temHint ? (
        <p id={idDoHint ?? undefined} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {temErro ? (
        <p id={idDoErro ?? undefined} role="alert" className="text-xs text-error-fg">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
