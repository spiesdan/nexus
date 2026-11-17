"use client";
import * as React from "react";

/**
 * O tokenizador NÃO entra no bundle inicial.
 *
 * `gpt-tokenizer` mede ~1 MB gzip. Importado estaticamente, ele era baixado em
 * TODA visita a uma tela que usa o editor de agente — mesmo antes de a pessoa
 * digitar qualquer coisa, e mesmo que ela nunca olhe o contador. O número do
 * contador é acessório; o vocabulário inteiro do tokenizador não precisa viajar
 * junto com a tela.
 *
 * O import dinâmico move o pacote para um chunk próprio, carregado só quando o
 * efeito roda (200 ms depois da última tecla). A tela abre sem ele e o contador
 * aparece quando o chunk chega. `import()` dentro do efeito também mantém o
 * pacote fora do servidor: o componente é client e o cálculo é do navegador.
 */

interface Props {
  text: string;
  contextWindow?: number | null;
  className?: string;
}

export function TokenCounter({ text, contextWindow, className }: Props) {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    const t = setTimeout(() => {
      void import("gpt-tokenizer")
        .then(({ encode }) => {
          if (!cancelado) setCount(encode(text ?? "").length);
        })
        .catch(() => {
          if (!cancelado) setCount(null);
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [text]);

  if (count === null) {
    return (
      <span className={className} aria-live="polite">
        — tokens
      </span>
    );
  }

  const ratio = contextWindow && contextWindow > 0 ? count / contextWindow : null;
  const warn = ratio !== null && ratio > 0.8;
  const danger = ratio !== null && ratio > 1;

  const tone = danger
    ? "text-destructive"
    : warn
      ? "text-warning-fg"
      : "text-muted-foreground";

  return (
    <span className={`${tone} ${className ?? ""}`} aria-live="polite">
      ~{count.toLocaleString("pt-BR")} tokens
      {contextWindow ? ` / ${contextWindow.toLocaleString("pt-BR")}` : ""}
      {warn && !danger ? " · próximo do limite" : ""}
      {danger ? " · acima do limite" : ""}
    </span>
  );
}
