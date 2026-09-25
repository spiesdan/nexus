"use client";
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import type { Produto } from "@/lib/schemas/produtos";

interface Afim {
  product_id: string;
  vezes_junto: number;
  nome: string;
  codigo: string;
  preco_cents: number;
}

interface RespostaAfins {
  afins: Afim[];
  recorrentes: { product_id: string; vezes: number; nome: string; codigo: string; preco_cents: number }[];
}

/**
 * Levam junto (§25): quem compra o carrinho costuma levar estes — afinidade
 * real dos pedidos + recorrentes do cliente. Resolve o Produto completo no
 * catálogo já carregado (sem segunda fonte de preço/estoque).
 */
export function AfinsNoPedido({
  carrinho,
  contatoId,
  porId,
  aoAdicionar,
}: {
  carrinho: string[];
  contatoId: string | null;
  porId: Map<string, Produto>;
  aoAdicionar: (produto: Produto, quantidade: number) => void;
}) {
  const t = useT();
  const [afins, setAfins] = React.useState<Afim[]>([]);
  const chave = React.useMemo(() => [...carrinho].sort().join(","), [carrinho]);

  React.useEffect(() => {
    // Carrinho vazio: o render abaixo já retorna null; sem reset síncrono.
    if (chave.length === 0) return;
    let vivo = true;
    const timer = setTimeout(() => {
      const qs = `carrinho=${encodeURIComponent(chave)}${contatoId ? `&contact_id=${contatoId}` : ""}`;
      apiClient
        .get<{ data: RespostaAfins }>(`/api/v1/products/afins?${qs}`)
        .then((r) => {
          if (!vivo) return;
          const vistos = new Set(chave.split(","));
          const afins = (r.data?.afins ?? []).map((a) => ({ ...a }));
          const recs = (r.data?.recorrentes ?? []).map((a) => ({ ...a, vezes_junto: a.vezes }));
          const todos = [...afins, ...recs].filter((a) => a.product_id && !vistos.has(a.product_id));
          const unicos = [...new Map(todos.map((a) => [a.product_id, a])).values()].slice(0, 5);
          setAfins(unicos);
        })
        .catch(() => {
          // Sugestão é acessório: falha silenciosa, nunca bloqueia a venda.
          if (vivo) setAfins([]);
        });
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [chave, contatoId]);

  const comCatalogo = afins
    .map((a) => ({ a, p: porId.get(a.product_id) }))
    .filter((x): x is { a: Afim; p: Produto } => x.p !== undefined);
  if (chave.length === 0 || comCatalogo.length === 0) return null;

  return (
    <div className="rounded-2xl border p-3">
      <p className="mb-2 text-sm font-medium">{t("Quem leva junto")}</p>
      <div className="flex flex-wrap gap-2">
        {comCatalogo.map(({ a, p }) => (
          <Button key={a.product_id} size="sm" variant="outline" onClick={() => aoAdicionar(p, 1)}>
            + {a.nome} ({a.vezes_junto}x)
          </Button>
        ))}
      </div>
    </div>
  );
}
