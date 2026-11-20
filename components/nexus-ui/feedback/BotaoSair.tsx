"use client";

import { useTransition } from "react";

import { signOut } from "@/app/actions/auth/signOut";
import { Button } from "@/components/ui/button";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * A saída da tela de conta suspensa. Link GET para `/login` deixa a sessão
 * antiga viva — a pessoa volta para a tela suspensa ao abrir `/app`. Aqui o
 * clique POSTA na Server Action canônica e diz "Saindo…" enquanto navega.
 */
export function BotaoSair({ rotulo, idioma }: { rotulo: string; idioma: Idioma }) {
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action={() => {
        iniciar(async () => {
          await signOut();
        });
      }}
    >
      <Button type="submit" disabled={pendente} variant="outline" className="min-h-11">
        {pendente ? traduzir("Saindo…", idioma) : traduzir(rotulo, idioma)}
      </Button>
    </form>
  );
}
