"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";
import { comRecorte } from "@/lib/comercial/radar-filtros-url";
import { cn } from "@/lib/utils";

import { RadarDadosProvider, useRadarDados } from "./_dados";
import { HASH_ANTIGO, SECOES, secaoDaRota } from "./_secoes";

/**
 * Os hashes da landing antiga, e para onde eles vão agora — o mapa vive em
 * `_secoes.ts` (dado puro) para o teste conferir que nenhum deles aponta para
 * uma tela que não existe.
 *
 * O `replace` (não `push`) evita deixar um hash morto no histórico.
 */
export function RadarShell({
  temBase,
  podeOperar,
  usuarioId,
  children,
}: {
  temBase: boolean;
  podeOperar: boolean;
  usuarioId: string;
  children: React.ReactNode;
}) {
  return (
    <RadarDadosProvider temBase={temBase} podeOperar={podeOperar} usuarioId={usuarioId}>
      <Casca>{children}</Casca>
    </RadarDadosProvider>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { filtros } = useRadarDados();
  const secao = secaoDaRota(pathname) ?? SECOES[0];

  React.useEffect(() => {
    const alvo = HASH_ANTIGO[window.location.hash.replace("#", "")];
    if (!alvo) return;
    if (secaoDaRota(window.location.pathname)?.href === alvo) return;
    router.replace(alvo);
  }, [router]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <NexusPageHeader title={t("Radar Comercial")} subtitle={t(secao.subtitulo)} />

      {/* Cada seção tem endereço: o clique NAVEGA, não rola. `aria-current` é
          o que o leitor de tela anuncia — a cor sozinha não diz onde a pessoa
          está. O recorte viaja no href: filtrar "Joinville" e trocar de tela
          não pode devolver a carteira inteira. */}
      <nav
        aria-label={t("Seções do radar")}
        className="flex items-center gap-0.5 overflow-x-auto border-b border-border"
      >
        {SECOES.map((s) => {
          const ativa = s.id === secao.id;
          return (
            <Link
              key={s.id}
              href={comRecorte(s.href, filtros)}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center border-b-2 px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm",
                ativa
                  ? "border-accent text-text"
                  : "border-transparent text-muted-foreground hover:border-accent/40 hover:text-text",
              )}
            >
              {t(s.rotulo)}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
