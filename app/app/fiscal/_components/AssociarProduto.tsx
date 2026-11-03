"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { normalizar } from "@/lib/catalogo/busca";
import type { Produto } from "@/lib/schemas/produtos";

/**
 * Associação item da nota ↔ produto do catálogo.
 *
 * O XML traz o código do fornecedor, que quase nunca é o SKU interno. A
 * importação casa por código e, sem casar, cria um produto novo — o que a spec
 * 21 (§14) só admite depois da conferência. Este seletor é onde quem confere
 * corrige o destino **antes** de o estoque andar.
 *
 * O catálogo é carregado só quando o seletor abre e uma vez por página: são
 * centenas de produtos na instalação real, e a ficha é lida muito mais vezes do
 * que conferida.
 */
let catalogo: Promise<Produto[]> | null = null;

function carregarCatalogo(): Promise<Produto[]> {
  if (!catalogo) {
    catalogo = apiClient
      .get<{ data: Produto[] }>("/api/v1/products?limite=2000")
      .then((r) => r.data ?? [])
      .catch((e: unknown) => {
        // Falha não fica em cache: a próxima abertura tenta de novo.
        catalogo = null;
        throw e;
      });
  }
  return catalogo;
}

const MAXIMO_NA_LISTA = 50;

export function AssociarProduto({
  entradaId,
  itemId,
  produtoId,
  produtoNome,
  podeGerir,
  bloqueado,
}: {
  entradaId: string;
  itemId: string;
  produtoId: string | null;
  produtoNome: string | null;
  podeGerir: boolean;
  bloqueado: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [produtos, setProdutos] = React.useState<Produto[] | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [salvando, setSalvando] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto || produtos !== null || carregando) return;
    let vivo = true;
    setCarregando(true);
    carregarCatalogo()
      .then((lista) => {
        if (vivo) setProdutos(lista);
      })
      .catch((e: unknown) => {
        if (vivo) showApiError(e);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [aberto, produtos, carregando]);

  async function salvar(escolhido: string | null) {
    setSalvando(escolhido ?? "remover");
    try {
      await apiClient.patch(`/api/v1/fiscal-entradas/${entradaId}/itens/${itemId}`, {
        produto_id: escolhido,
      });
      toast.success(escolhido ? t("Item associado ao produto.") : t("Associação removida."));
      setAberto(false);
      setBusca("");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(null);
    }
  }

  const termo = normalizar(busca.trim());
  const visiveis = (produtos ?? []).filter((p) => {
    if (termo === "") return true;
    return normalizar(p.nome).includes(termo) || normalizar(p.codigo).includes(termo);
  });
  const lista = visiveis.slice(0, MAXIMO_NA_LISTA);

  return (
    <div className="flex flex-col items-start gap-1">
      {produtoId ? (
        <span className="max-w-48 truncate text-xs" title={produtoNome ?? produtoId}>
          {produtoNome ?? t("Produto associado")}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t("Não associado")}</span>
      )}

      {podeGerir && !bloqueado && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setAberto(true)}
            disabled={salvando !== null}
          >
            {produtoId ? t("Trocar") : t("Associar")}
          </Button>
          {produtoId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => void salvar(null)}
              disabled={salvando !== null}
            >
              {salvando === "remover" ? t("Removendo…") : t("Remover")}
            </Button>
          )}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Associar item ao catálogo")}</DialogTitle>
            <DialogDescription>
              {t(
                "O estoque e o custo deste item vão para o produto escolhido. Sem associação, a importação casa pelo código do fornecedor e cria um produto novo se não achar.",
              )}
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar por código ou nome…")}
            aria-label={t("Buscar produto no catálogo")}
          />

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {carregando && (
              <p className="p-3 text-sm text-muted-foreground">{t("Carregando catálogo…")}</p>
            )}
            {!carregando && lista.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                {termo ? t("Nenhum produto encontrado.") : t("O catálogo está vazio.")}
              </p>
            )}
            {lista.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void salvar(p.id)}
                disabled={salvando !== null}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.codigo}</span>
                </span>
                {p.id === produtoId && (
                  <span className="shrink-0 text-xs text-accent">{t("Atual")}</span>
                )}
              </button>
            ))}
          </div>

          {visiveis.length > lista.length && (
            <p className="text-xs text-muted-foreground">
              {t("Mostrando os 50 primeiros — refine a busca para ver os demais.")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
