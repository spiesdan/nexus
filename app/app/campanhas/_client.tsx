"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";

import { ProspeccaoClient } from "../prospeccao/_client";
import { CampanhaPorRegiaoTab } from "./_regiao";

type PropsDaProspeccao = React.ComponentProps<typeof ProspeccaoClient>;

/**
 * A TELA "CAMPANHA" — duas subtelas, uma porta.
 *
 *   Campanha    — falar com a base: clientes que já compraram na região, por
 *                 número não oficial, uma mensagem por minuto.
 *   Prospecção  — a tela B2B de sempre (buscar, empresas, mapa, campanhas de
 *                 garimpagem). Ela não perdeu nada: mudou de porta.
 *
 * O endereço carrega a subtela (`?subtela=prospeccao`) para o F5 e o link
 * salvo caírem no mesmo lugar. O `?aba=` que a prospecção já usava continua
 * valendo DENTRO dela — as duas chaves não se misturam.
 */
export function CampanhasClient({
  podeOperar,
  ...prospeccao
}: PropsDaProspeccao & { podeOperar: boolean }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const subtela = params.get("subtela") === "prospeccao" ? "prospeccao" : "campanha";

  function trocarSubtela(valor: string) {
    const qs = new URLSearchParams(params.toString());
    if (valor === "campanha") qs.delete("subtela");
    else qs.set("subtela", valor);
    const busca = qs.toString();
    router.replace(busca ? `${pathname}?${busca}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("Campanha")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Fale com quem já comprou na sua região e encontre empresas novas — o mesmo lugar, duas campanhas.",
          )}
        </p>
      </div>

      <Tabs value={subtela} onValueChange={trocarSubtela}>
        <TabsList>
          <TabsTrigger value="campanha">{t("Campanha")}</TabsTrigger>
          <TabsTrigger value="prospeccao">{t("Prospecção")}</TabsTrigger>
        </TabsList>
        <TabsContent value="campanha" className="mt-4">
          <CampanhaPorRegiaoTab podeOperar={podeOperar} />
        </TabsContent>
        <TabsContent value="prospeccao" className="mt-4">
          <ProspeccaoClient {...prospeccao} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
