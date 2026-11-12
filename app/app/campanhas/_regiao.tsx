"use client";

import * as React from "react";
import { Megaphone, Plus } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

import { CampanhasTab } from "../prospeccao/_campanhas";
import { CriarCampanhaPorRegiao } from "./_criar-regiao";

/**
 * A SUBTELA "CAMPANHA" — a campanha por região e o painel das campanhas dela.
 *
 * Duas perguntas no mesmo lugar: "quem eu já atendi nesta cidade e ainda posso
 * chamar?" (o diálogo de criação, com prévia real) e "o que está rodando agora?"
 * (a lista que a prospecção já tinha, reaproveitada — nenhuma segunda cópia da
 * consulta de campanhas).
 *
 * A lista pede `origem=regiao`: mostra só a audiência "quem já comprou nesta
 * cidade". Campanha de garimpagem de empresa (`publico: "prospects"`) e a
 * recuperação de conversa (contatos sem recorte geográfico) ficam na aba
 * Prospecção, onde foram criadas — misturar as duas fazia o operador procurar
 * campanha de região no meio de público que nunca comprou.
 */
export function CampanhaPorRegiaoTab({ podeOperar }: { podeOperar: boolean }) {
  const t = useT();
  const [criando, setCriando] = React.useState(false);
  // Trocar a chave REMONTA a lista depois de criar: é o refresh mais simples e
  // sem um segundo caminho de carregamento que poderia divergir do primeiro.
  const [versao, setVersao] = React.useState(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-0.5 size-5 text-primary" weight="duotone" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t("Campanha por região")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(
                "Mande mensagem para os clientes que já compraram nas cidades que você escolher. Uma mensagem por minuto, por um número não oficial — nada de API oficial.",
              )}
            </p>
          </div>
        </div>
        {podeOperar && (
          <Button onClick={() => setCriando(true)} className="shrink-0">
            <Plus className="mr-2 size-4" aria-hidden />
            {t("Nova campanha por região")}
          </Button>
        )}
      </div>

      {/* O diálogo é MONTADO a cada abertura (`criando && …`): o estado do
          formulário nasce limpo sem um efeito de reset, e o efeito de carga
          não roda com o diálogo fechado. */}
      {podeOperar && criando && (
        <CriarCampanhaPorRegiao
          aberto={criando}
          aoMudar={setCriando}
          aoCriar={() => setVersao((v) => v + 1)}
        />
      )}

      <CampanhasTab
        key={versao}
        podeOperar={podeOperar}
        origem="regiao"
        aoCriarPrimeira={() => setCriando(true)}
        rotuloCriarPrimeira={t("Criar primeira campanha por região")}
      />
    </div>
  );
}
