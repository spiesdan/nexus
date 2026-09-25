"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  buscarEntidades,
  MINIMO_DE_LETRAS,
  telasQueCasam,
  type ItemDeBusca,
  type SecaoDeBusca,
} from "@/lib/busca/global";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { NAV_GROUPS, searchable, type NavDestination } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";

/**
 * Os resultados da busca global, com o termo que veio na URL já no campo.
 *
 * Diferente da paleta, cada linha aqui é um `<a>` de verdade: a página é para
 * quem quer OLHAR os resultados (ler, escolher com o Tab, compartilhar a URL),
 * não para quem está lançando para a próxima tela — Enter no campo pega o
 * primeiro resultado, e o resto se navega como qualquer lista.
 */

const ROTULO_GRUPO = new Map(NAV_GROUPS.map((g) => [g.id, g.label]));

interface Bloco {
  rotulo: string;
  itens: ItemDeBusca[];
}

export function BuscaClient({ q }: { q: string }) {
  const t = useT();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const [busca, setBusca] = useState(q);
  const [secoes, setSecoes] = useState<SecaoDeBusca[]>([]);

  const visiveis = useMemo(
    () => searchable(user.is_platform_admin, activeOrg?.role ?? null),
    [user.is_platform_admin, activeOrg?.role],
  );

  const telas = useMemo(() => telasQueCasam(visiveis, busca), [busca, visiveis]);

  const buscar = useDebouncedCallback((termo: string) => {
    if (termo.trim().length < MINIMO_DE_LETRAS) {
      setSecoes([]);
      return;
    }
    void buscarEntidades(termo, 10).then(setSecoes);
  }, 300);

  useEffect(() => {
    buscar(busca);
  }, [busca, buscar]);

  const blocos = useMemo<Bloco[]>(() => {
    const saida: Bloco[] = [];
    if (telas.length > 0) {
      saida.push({
        rotulo: "Telas",
        itens: telas.map((d: NavDestination) => ({
          id: d.href,
          href: d.href,
          titulo: t(d.label),
          subtitulo: `${t(ROTULO_GRUPO.get(d.group) ?? "")} — ${t(d.description)}`,
        })),
      });
    }
    for (const secao of secoes) saida.push({ rotulo: t(secao.rotulo), itens: secao.itens });
    return saida;
  }, [telas, secoes, t]);

  const vazia = busca.trim() !== "" && blocos.length === 0;

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const primeiro = blocos[0]?.itens[0];
    if (primeiro) router.push(primeiro.href);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-6">
      <NexusPageHeader
        title={t("Busca")}
        subtitle={t("Telas, conversas, clientes, pedidos, leads, produtos e títulos num lugar só.")}
      />

      <div className="flex items-center gap-3 rounded-card border px-4">
        <MagnifyingGlass size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={aoTeclar}
          aria-label={t("Buscar no sistema")}
          placeholder={t("Buscar telas, clientes, conversas…")}
          className="h-12 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
      </div>

      {busca.trim() === "" ? (
        <p className="text-sm text-muted-foreground">
          {t("Digite ao menos 2 letras para varrer o sistema inteiro.")}
        </p>
      ) : null}

      {vazia ? (
        <p className="text-sm text-muted-foreground">
          {t("Nada encontrado para")} “{busca.trim()}”.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {blocos.map((bloco) => (
          <section key={bloco.rotulo} aria-label={bloco.rotulo}>
            <p className="pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {bloco.rotulo}
            </p>
            <ul>
              {bloco.itens.map((item) => (
                <li key={`${item.href}#${item.id}`}>
                  <Link
                    href={item.href}
                    className={cn(
                      "row-hover interactive flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{item.titulo}</span>
                        {item.subtitulo ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {item.subtitulo}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
