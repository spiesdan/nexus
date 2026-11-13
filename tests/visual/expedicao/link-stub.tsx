import * as React from "react";

/**
 * `next/link` de mentira, para a bancada.
 *
 * O roteirizador usa `Link` num único lugar (o atalho "Cadastrar frota" quando
 * a frota está vazia). Em vez de arrastar o router do Next — que não existe
 * fora do runtime dele —, o build troca o módulo por esta âncora. O que se
 * fotografa (mapa, distribuição, recuperação) não passa por aqui.
 */
export default function Link({
  href,
  children,
  ...props
}: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) {
  return (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  );
}
