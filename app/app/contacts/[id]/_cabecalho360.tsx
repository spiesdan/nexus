"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";
import { PencilSimple } from "@/lib/ui/icons";
import { comoMoeda } from "@/lib/format/moeda";
import { ROTULO_RECOMPRA } from "@/lib/comercial/radar-compras";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import type { Contact } from "@/lib/types/contacts";
import { useResumo360 } from "./_resumo360";

/**
 * Cabeçalho 360°: identidade + fatos comerciais (última compra, acumulado,
 * situação de recompra, negócios em aberto). Responsável NÃO aparece porque o
 * campo não existe no contato — inventar dono seria mentir; negócios em aberto
 * com link cumprem o papel sem falsificar.
 *
 * Título/subtítulo/ação moram no `NexusPageHeader` canônico; as badges e os
 * KPIs ficam num bloco logo abaixo. A tag `<header>` continua envolvendo TUDO
 * — o e2e `confirmar-dado-do-contato` ancora o email em `locator("header")`.
 */
export function Cabecalho360({
  contact,
  contactId,
  onEdit,
}: {
  contact: Contact;
  contactId: string;
  onEdit: () => void;
}) {
  const { resumo, isLoading } = useResumo360(contactId);
  const t = useT();
  const displayName = rotuloDoContato(contact);
  const h = resumo?.historico ?? null;
  const linhasDeContato = [
    contact.email,
    contact.phone_number ? phoneForDisplay(contact.phone_number) : null,
  ].filter(Boolean);

  return (
    <header className="space-y-3">
      <NexusPageHeader
        title={displayName}
        subtitle={linhasDeContato.length > 0 ? linhasDeContato.join(" • ") : undefined}
        actions={
          !contact.is_anonymized ? (
            <Button variant="outline" onClick={onEdit} className="shrink-0">
              <PencilSimple size={16} weight="bold" aria-hidden />
              <span>{t("Editar")}</span>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-1">
        {contact.tags.map((tag) => (
          <Badge key={tag} variant="neutral">
            {tag}
          </Badge>
        ))}
        {contact.tipo_pessoa === "J" && <Badge variant="info">PJ</Badge>}
        {contact.tipo_pessoa === "F" && <Badge variant="neutral">PF</Badge>}
        {h && h.situacao !== "ok" && (
          <Badge variant="warning">{ROTULO_RECOMPRA[h.situacao]}</Badge>
        )}
        {h && h.situacao === "ok" && <Badge variant="success">{t("Em dia")}</Badge>}
        {contact.is_blocked && <Badge variant="warning">{t("Bloqueado")}</Badge>}
        {contact.is_anonymized && <Badge variant="destructive">{t("Anonimizado")}</Badge>}
      </div>
      {isLoading ? (
        <Skeleton className="h-12 w-72" />
      ) : h ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground uppercase">{t("Última compra")}</dt>
            <dd className="font-medium text-text tabular-nums">
              {h.ultima_compra.split("-").reverse().join("/")} · {t("há")} {h.dias_sem_compra}d
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">{t("Valor acumulado")}</dt>
            <dd className="font-medium text-text tabular-nums">
              {comoMoeda(h.faturamento_cents, "BRL")} · {h.qtd_pedidos} {t("pedido(s)")}
            </dd>
          </div>
          {resumo && resumo.leadsAbertos > 0 ? (
            <div>
              <dt className="text-xs text-muted-foreground uppercase">
                {t("Negócios em aberto")}
              </dt>
              <dd className="font-medium text-text tabular-nums">{resumo.leadsAbertos}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Ainda sem compras registradas.")}</p>
      )}
    </header>
  );
}
