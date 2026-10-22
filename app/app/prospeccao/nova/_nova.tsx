"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";

import { CampanhaWizard } from "../_campanha-wizard";

/**
 * A CRIAÇÃO DE CAMPANHA EM PÁGINA PRÓPRIA — não em modal dentro da lista.
 *
 * O assistente nasceu como um card que abria acima da lista. Na prática ele
 * disputava a tela com os cards: "Cancelar" ficava ao lado de campanhas que
 * continuavam clicáveis atrás, e fechar a aba no meio do fluxo não deixava
 * rastro de onde parou. Criar campanha é uma tarefa com começo, meio e fim —
 * por isso ela tem endereço próprio (`/app/prospeccao/nova`), que sobrevive ao
 * F5 e pode ser mandado por link.
 *
 * A tela não dispara nada: ao concluir, o operador cai no CONTROLE da campanha
 * recém-criada, onde vê o público e escolhe entre enviar agora e agendar.
 */
export function NovaCampanha({ categorias }: { categorias: MacroCategoria[] }) {
  const t = useT();
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <Link
        href="/app/prospeccao?aba=campanhas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        <ArrowLeft size={14} aria-hidden />
        {t("Campanhas")}
      </Link>

      <NexusPageHeader
        title={t("Nova campanha")}
        subtitle={t("Escolha as cidades e categorias da sua base. Você vê as empresas antes de criar.")}
      />

      <CampanhaWizard
        categorias={categorias}
        aoConcluir={(id) => router.push(`/app/prospeccao/campanhas/${id}`)}
        aoCancelar={() => router.push("/app/prospeccao?aba=campanhas")}
      />
    </div>
  );
}
