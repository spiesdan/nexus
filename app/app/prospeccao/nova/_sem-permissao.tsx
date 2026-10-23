"use client";

import { LockKey } from "@phosphor-icons/react";

import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { useT } from "@/hooks/i18n/useT";

/**
 * O aviso de permissão da criação de campanha.
 *
 * Mora num componente de cliente só por causa do ícone: `@phosphor-icons/react`
 * usa contexto e não pode ser importado numa página de servidor (o erro é
 * "createContext only works in Client Components"). Importar o ícone no
 * `page.tsx` derrubava a rota inteira em 500, em vez de mostrar a explicação.
 */
export function SemPermissaoParaCriar() {
  const t = useT();

  return (
    <div className="p-6">
      <NexusEmptyState
        icon={LockKey}
        headline={t("Criar campanha exige papel de atendente ou superior.")}
      />
    </div>
  );
}
