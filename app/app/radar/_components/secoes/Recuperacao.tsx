"use client";

import { useT } from "@/hooks/i18n/useT";

import { useRadarDados } from "../../_dados";
import { RecuperacaoLista } from "../RecuperacaoLista";

/**
 * A RECUPERAÇÃO — quem comprava e parou.
 *
 * Antes vivia em `#radar-recuperacao`, no fim de uma landing longa. Agora tem
 * endereço próprio: o alerta do Dashboard, o briefing e o `/app/recuperacao`
 * (redirect) caem aqui direto.
 */
export function RecuperacaoDoRadar() {
  const t = useT();
  const { temBase } = useRadarDados();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-medium text-text">{t("Recuperação de clientes")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Quem comprava e parou, por ordem de prioridade — com ação direta.")}
        </p>
      </div>
      <RecuperacaoLista temBase={temBase} />
    </div>
  );
}
