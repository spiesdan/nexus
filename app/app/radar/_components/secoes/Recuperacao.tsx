"use client";

import { useT } from "@/hooks/i18n/useT";

import { useRadarDados } from "../../_dados";
import { CampanhasTab } from "../../../prospeccao/_campanhas";
import { RecuperacaoLista } from "../RecuperacaoLista";

/**
 * A RECUPERAÇÃO — quem comprava e parou.
 *
 * Antes vivia em `#radar-recuperacao`, no fim de uma landing longa. Agora tem
 * endereço próprio: o alerta do Dashboard, o briefing e o `/app/recuperacao`
 * (redirect) caem aqui direto.
 *
 * A lista de campanhas de recuperação vive AQUI, onde a campanha é criada. A
 * aba Prospecção passou a mostrar só garimpagem de empresa, e a aba Campanha só
 * a região: sem esta lista, a campanha criada pelo botão acima não apareceria
 * em lugar nenhum.
 */
export function RecuperacaoDoRadar() {
  const t = useT();
  const { temBase, podeOperar } = useRadarDados();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-medium text-text">{t("Recuperação de clientes")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Quem comprava e parou, por ordem de prioridade — com ação direta.")}
        </p>
      </div>
      <RecuperacaoLista temBase={temBase} />

      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-medium text-text">{t("Campanhas de recuperação")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("As campanhas criadas acima, com o andamento do envio.")}
        </p>
        <CampanhasTab podeOperar={podeOperar} origem="recuperacao" />
      </div>
    </div>
  );
}
