"use client";

/**
 * SELETOR DE PRODUTO PARA ITEM DA VENDA AVULSA — o "digita o nome e seleciona".
 *
 * Na NF-e de venda avulsa (balcão) o operador conta a venda: descrição, quantidade,
 * preço e desconto. Quando o produto já existe no catálogo, o caminho não é digitação
 * livre de NCM — é **escolher o produto**. Este seletor preenche o item com o que o
 * catálogo sabe (descrição, NCM, unidade) e deixa o preço da venda com o operador.
 *
 * O que ele NÃO faz: assumir preço. Preço de venda é fato do balcão, não do catálogo
 * — o catálogo traz custo/origem, a venda avulsa traz o valor que o cliente pagou.
 *
 * O XML continua resolvendo depois (`resolverProdutosDosItens` por id/código/nome), e
 * a tela só preenche: a verdade fiscal (NCM) vem do cadastro, o fato (preço) vem do
 * operador. Duas fontes, uma decisão — não mistura.
 */
import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
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

const MAXIMO_NA_LISTA = 50;

export function ProdutoParaItem({ onSelecionar }: { onSelecionar: (produto: Produto) => void }) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [produtos, setProdutos] = React.useState<Produto[] | null>(null);
  const [carregando, setCarregando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto || produtos !== null || carregando) return;
    let vivo = true;
    setCarregando(true);
    apiClient
      .get<{ data: Produto[] }>("/api/v1/products?limite=2000")
      .then((r) => {
        if (vivo) setProdutos(r.data ?? []);
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

  const termo = normalizar(busca.trim());
  const visiveis = (produtos ?? []).filter(
    (p) => termo === "" || normalizar(p.nome).includes(termo) || normalizar(p.codigo).includes(termo),
  );
  const lista = visiveis.slice(0, MAXIMO_NA_LISTA);

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setAberto(true)}>
        {t("Associar")}
      </Button>
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
                onClick={() => {
                  onSelecionar(p);
                  setAberto(false);
                  setBusca("");
                }}
                disabled={false}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60"
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.codigo}</span>
                </span>
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
    </>
  );
}
