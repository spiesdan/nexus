import { cn } from "@/lib/utils";

import { corDaTrilha, frenteDaTrilha, iniciaisDe } from "./paleta";
import type { Pessoa } from "./tipos";

const TAMANHOS = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
} as const;

/**
 * A pessoa, em cor E em letra.
 *
 * O par é o ponto: cerca de 8% dos homens não distingue as trilhas 2 e 3 uma da
 * outra, e uma agenda que só usasse a bolinha entregaria a eles uma tela de
 * pontos iguais. A inicial não é enfeite — é o canal redundante que faz a cor
 * ser um atalho em vez de um requisito.
 *
 * O `title` carrega o nome inteiro porque duas iniciais também colidem numa
 * equipe grande, e aí quem decide é o ponteiro parado em cima.
 */
export function AvatarDaPessoa({
  pessoa,
  tamanho = "md",
  ativo = true,
  className,
  decorativo = false,
}: {
  pessoa: Pessoa;
  tamanho?: keyof typeof TAMANHOS;
  /** Fora do filtro: a cor recua e a letra permanece. */
  ativo?: boolean;
  className?: string;
  /**
   * DENTRO DE UM CONTROLE JÁ ROTULADO, a inicial sai do nome acessível.
   *
   * No filtro de pessoas o botão tem `aria-label="Ver só a agenda de <nome>"` e
   * o único texto visível é a inicial ("EA"). O axe reprova isso como
   * `label-content-name-mismatch` (sério): o nome acessível não contém o texto
   * visível. Como o rótulo já diz o nome INTEIRO, esconder a inicial do nome
   * acessível não tira informação de ninguém — e a letra continua na tela.
   */
  decorativo?: boolean;
}) {
  return (
    <span
      aria-hidden={decorativo || undefined}
      data-testid={`avatar-pessoa-${pessoa.id}`}
      data-trilha={pessoa.trilha}
      data-ativo={ativo}
      title={pessoa.nome}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        "ring-2 ring-surface transition-[background-color,opacity] duration-fast ease-out",
        TAMANHOS[tamanho],
        className,
      )}
      style={{
        backgroundColor: ativo ? corDaTrilha(pessoa.trilha) : "var(--color-surface-elevated)",
        // A frente é POR TRILHA: com três trilhas escuras no tema claro, uma
        // frente única (Carbon) reprovava AA nas iniciais. Ver `paleta.ts`.
        color: ativo ? frenteDaTrilha(pessoa.trilha) : "var(--color-text-muted)",
      }}
    >
      {iniciaisDe(pessoa.nome)}
    </span>
  );
}
