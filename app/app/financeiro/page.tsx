import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { FinanceiroClient } from "./_client";

export const dynamic = "force-dynamic";

const ABAS_CONHECIDAS = ["recebiveis", "pagar", "cobrancas", "conciliacao", "fluxo", "titulos"];

/**
 * FINANCEIRO — contas a receber como entidade (0233).
 *
 * Sem sidebar de propósito (doutrina da dobra, como Faturamento): a porta é o
 * ⌘K e os links (pedido, cliente, Indicadores). `?aba=` escolhe a aba na
 * montagem — é assim que a busca global e o redirect de /app/titulos chegam
 * na aba Títulos; `?busca=` nasce com o filtro aplicado.
 */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; busca?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const podeRegistrar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  const { aba, busca } = await searchParams;
  const abaInicial = aba && ABAS_CONHECIDAS.includes(aba) ? aba : undefined;
  return (
    // `key` nas query params: mudou a URL (aba da busca global, redirect de
    // /app/titulos), o cliente remonta com o estado inicial certo — o
    // `useState` da aba só vale na montagem.
    <FinanceiroClient
      key={`${abaInicial ?? ""}|${busca ?? ""}`}
      podeRegistrar={podeRegistrar}
      abaInicial={abaInicial}
      buscaInicial={busca}
    />
  );
}
