"use client";
import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretRight } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { NAV_DESTINATIONS, NAV_GROUPS, canSee } from "@/lib/navigation/registry";

/**
 * Trilha de navegação do shell (§17). Não decide nada: o que existe em cada
 * nível vem do registro (`lib/navigation/registry.ts`) — destino ou hub de
 * grupo, respeitando `canSee`). Segmento que o registro não conhece (rota da
 * allowlist legada) é humanizado na hora; id no meio some e id no fim vira
 * "Detalhe" — o nome real do registro é assunto do cabeçalho da página. Some
 * quando houver menos de dois níveis: em `/app` e nos hubs a trilha seria o
 * próprio título da página repetido.
 */

const DESTINO_POR_HREF = new Map(NAV_DESTINATIONS.map((d) => [d.href, d]));
// O rótulo do crumb de um hub é o do GRUPO ("Inteligência"), não o do link
// do hub ("Ver tudo em IA") — o link é ação de rodapé, não é lugar.
const GRUPO_POR_HUB = new Map(
  NAV_GROUPS.filter((g) => g.hub).map((g) => [g.hub!.href, g.label]),
);

const EH_ID =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;

function humanizar(seg: string): string {
  const base = seg.replace(/[-_]+/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

interface Migalha {
  label: string;
  href?: string;
}

export function Breadcrumb() {
  const pathname = usePathname() ?? "";
  const t = useT();
  const { user, activeOrg } = useAuth();

  if (!pathname.startsWith("/app/")) return null;

  const segmentos = pathname.split("/").filter(Boolean).slice(1);
  const migalhas: Migalha[] = [];

  segmentos.forEach((seg, i) => {
    const prefixo = `/app/${segmentos.slice(0, i + 1).join("/")}`;
    const destino = DESTINO_POR_HREF.get(prefixo);
    if (destino && canSee(destino, user.is_platform_admin, activeOrg?.role ?? null)) {
      migalhas.push({ label: destino.label, href: prefixo });
      return;
    }
    const grupo = GRUPO_POR_HUB.get(prefixo);
    if (grupo) {
      migalhas.push({ label: grupo, href: prefixo });
      return;
    }
    if (EH_ID.test(seg)) {
      // Id no meio some ("Pedidos / <uuid> / itens" não é trilha); id no fim
      // é o próprio destino do detalhe — some e a página diz o nome real.
      if (i === segmentos.length - 1 && migalhas.length > 0) {
        migalhas.push({ label: "Detalhe" });
      }
      return;
    }
    migalhas.push({ label: humanizar(seg) });
  });

  if (migalhas.length < 2) return null;

  return (
    <nav
      aria-label={t("Trilha de navegação")}
      className="mb-4 hidden items-center gap-1 text-xs text-muted-foreground md:flex"
    >
      {migalhas.map((m, i) => (
        <Fragment key={m.href ?? `${m.label}-${i}`}>
          {i > 0 ? <CaretRight className="size-3 shrink-0 opacity-60" aria-hidden /> : null}
          {i === migalhas.length - 1 ? (
            <span className="truncate font-medium text-text" aria-current="page">
              {t(m.label)}
            </span>
          ) : (
            <Link href={m.href ?? "#"} className="truncate transition-colors hover:text-text">
              {t(m.label)}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
