"use client";

/**
 * EDIÇÃO DOS ITENS DE UM PEDIDO QUE JÁ EXISTE — inclusive depois de pronto.
 *
 * ═══ POR QUE UM COMPONENTE, E NÃO MAIS UM CAMPO NA FICHA ═══════════════════
 *
 * A ficha (`_detalhe.tsx`) já tem um modo de edição, para condição de
 * pagamento, transportadora, endereço e observação. Misturar os dois no mesmo
 * `editando` daria ao usuário um "Salvar" que grava duas coisas de naturezas
 * diferentes ao mesmo tempo — e o PATCH de itens é DELETE + INSERT + recálculo,
 * que só faz sentido atômico. São dois modos, dois "Salvar", duas chances de
 * errar sem misturar.
 *
 * ═══ UM PATCH, NÃO UM POR LINHA ═══════════════════════════════════════════
 *
 * Ajustar quantidade e preço de uma linha é `PATCH /itens` com um `ajustar`.
 * Remover, com um `remover`. Adicionar, com um `adicionar`. Tudo num único
 * `PATCH`, num único clique de salvar.
 *
 * O motivo é o mesmo do serviço: um PATCH item a item deixa o pedido com item
 * novo e total velho no meio da operação — e "total velho com item novo" é a
 * forma mais cara de errar num pedido comercial. Se o servidor recusar, nada
 * foi gravado.
 *
 * ═══ O QUE A TELHA FAZ COM O AVISO ════════════════════════════════════════
 *
 * Pedido `entregue`, `faturado` ou `expedido` aceita a troca. A rota devolve
 * `avisos` com o que a troca NÃO estorna (comissão apurada, expedição, NF
 * emitida), porque a regra de negócio disso **não está escrita** neste
 * repositório. A tela mostra o aviso — quem lê decide.
 */
import * as React from "react";

import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { comoMoeda } from "@/lib/format/moeda";
import type { ItemDoPedido, PedidoComercial } from "@/lib/schemas/pedidos";

import { ProductSearch } from "../novo/_produtos";
import type { Produto } from "@/lib/schemas/produtos";

/** Status em que a troca precisa de aviso — espelha `STATUS_COMPROMETIDOS`. */
const COMPROMETIDOS = new Set(["aprovado", "expedido", "entregue", "faturado"]);

interface LinhaEditavel {
  quantidade: number;
  /** Em REAIS, porque é o que se digita. `_cents` é o que se manda. */
  precoReais: string;
  desconto: string;
}

function paraCents(reais: string): number {
  const n = Number(reais.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function paraReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function EditorDeItens({
  pedido,
  itens,
  aoSalvar,
  aoCancelar,
}: {
  pedido: PedidoComercial;
  itens: ItemDoPedido[];
  /** Recarrega a ficha com o estado novo do servidor. */
  aoSalvar: () => Promise<void> | void;
  aoCancelar: () => void;
}) {
  const t = useT();

  // Chave de linha nova: `crypto.randomUUID` não é garantido em SSR, e aqui a
  // lista só existe depois do clique — mesmo assim, `Date.now()` + contador é
  // suficiente e não depende do ambiente.
  const seq = React.useRef(0);
  const novoId = React.useCallback(() => `novo-${seq.current++}-${Date.now()}`, []);

  const [rascunho, setRascunho] = React.useState<Record<string, LinhaEditavel>>(() =>
    Object.fromEntries(
      itens.map((i) => [
        i.id,
        {
          quantidade: i.quantidade,
          precoReais: paraReais(i.preco_unit_cents),
          desconto: String(Number(i.desconto_pct ?? 0)),
        },
      ]),
    ),
  );
  const [removidos, setRemovidos] = React.useState<Set<string>>(new Set());
  const [novos, setNovos] = React.useState<
    {
      chave: string;
      product_id: string | null;
      nome: string;
      codigo: string;
      precoReais: string;
      quantidade: number;
    }[]
  >([]);
  const [salvando, setSalvando] = React.useState(false);
  const [produtos, setProdutos] = React.useState<Produto[] | null>(null);
  const refBusca = React.useRef<HTMLInputElement | null>(null);

  // O catálogo é carregado SÓ ao abrir o editor, não com a página. São 635
  // produtos na instalação real, e a ficha é lida muito mais vezes do que é
  // editada — pagar o carregamento do catálogo na leitura para usar o editor uma
  // vez é o tipo de peso que a tela não sente e o dono sente no orçamento.
  //
  // `limite=2000`: o teto da rota é explícito justamente para isto. Com o 500
  // fixo, o editor perderia os produtos acima do 500º sem nenhum aviso.
  React.useEffect(() => {
    if (produtos !== null) return;
    let vivo = true;
    apiClient
      .get<{ data: Produto[] }>("/api/v1/products?limite=2000")
      .then((r) => {
        if (vivo) setProdutos(r.data ?? []);
      })
      .catch(() => {
        if (vivo) setProdutos([]);
      });
    return () => {
      vivo = false;
    };
  }, [produtos]);

  const visiveis = itens.filter((i) => !removidos.has(i.id));

  function mudar(id: string, campo: keyof LinhaEditavel, valor: string | number) {
    setRascunho((r) => ({ ...r, [id]: { ...r[id], [campo]: valor } as LinhaEditavel }));
  }

  function salvar() {
    const ajustar = visiveis
      .flatMap((i) => {
        const agora = rascunho[i.id];
        // `flatMap` em vez de `map`+`filter`: a linha estar no `rascunho` é o
        // que faz o par existir, e o TypeScript passa a saber disso sem
        // repetir a checagem `if (!agora)` dentro do `map` seguinte.
        return agora ? [{ original: i, agora }] : [];
      })
      // Só manda o que MUDOU. `ajustar` sem mudança reescreve a linha à toa e
      // polui a auditoria com um "alterou" que não alterou.
      .filter(({ original, agora }) => {
        const desconto = Number(agora.desconto) || 0;
        return (
          agora.quantidade !== original.quantidade ||
          paraCents(agora.precoReais) !== original.preco_unit_cents ||
          desconto !== Number(original.desconto_pct ?? 0)
        );
      })
      .map(({ original, agora }) => ({
        id: original.id,
        quantidade: Math.max(1, Math.trunc(Number(agora.quantidade) || 1)),
        preco_unit_cents: paraCents(agora.precoReais),
        desconto_pct: Number(agora.desconto) || 0,
      }));

    const adicionar = novos.map((n) => ({
      product_id: n.product_id,
      quantidade: n.quantidade,
      preco_unit_cents: paraCents(n.precoReais),
      desconto_pct: 0,
    }));

    if (ajustar.length === 0 && adicionar.length === 0 && removidos.size === 0) {
      toast.info(t("Nada mudou no pedido."));
      aoCancelar();
      return;
    }

    setSalvando(true);
    void (async () => {
      try {
        const r = await apiClient.patch<{
          data: { avisos?: string[]; total_cents?: number };
        }>(`/api/v1/commercial-orders/${pedido.id}/itens`, {
          adicionar,
          remover: [...removidos],
          ajustar,
        });
        for (const aviso of r.data.avisos ?? []) {
          toast.warning(aviso);
        }
        if ((r.data.avisos ?? []).length === 0) {
          toast.success(t("Itens do pedido atualizados."));
        }
        await aoSalvar();
      } catch (e) {
        showApiError(e);
      } finally {
        setSalvando(false);
      }
    })();
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          {t("EDITAR ITENS")}
        </p>
        {COMPROMETIDOS.has(pedido.status) && (
          <p className="text-xs text-muted-foreground">
            {t("O pedido está em")} <strong>{pedido.status}</strong>
            {t(". Commission, expedição e nota não serão estornadas.")}
          </p>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={aoCancelar} disabled={salvando}>
            {t("Cancelar")}
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? t("Salvando...") : t("Salvar itens")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>{t("Descrição")}</TableHead>
              <TableHead className="w-24 text-right">{t("Qtde.")}</TableHead>
              <TableHead className="w-32 text-right">{t("Preço un.")}</TableHead>
              <TableHead className="w-24 text-right">{t("Desc. %")}</TableHead>
              <TableHead className="w-24 text-right">{t("Subtotal")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((i) => {
              const l = rascunho[i.id];
              if (!l) return null;
              const sub = Math.round(
                l.quantidade * paraCents(l.precoReais) * (1 - (Number(l.desconto) || 0) / 100),
              );
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="block font-medium">{i.produto_nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {i.produto_codigo || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right tabular-nums"
                      type="number"
                      min={1}
                      step={1}
                      value={l.quantidade}
                      aria-label={t("Qtde.")}
                      onChange={(e) => mudar(i.id, "quantidade", Number(e.target.value))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right tabular-nums"
                      inputMode="decimal"
                      value={l.precoReais}
                      aria-label={t("Preço un.")}
                      onChange={(e) => mudar(i.id, "precoReais", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right tabular-nums"
                      inputMode="decimal"
                      value={l.desconto}
                      aria-label={t("Desc. %")}
                      onChange={(e) => mudar(i.id, "desconto", e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {comoMoeda(sub, pedido.moeda)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("Remover item")}
                      onClick={() =>
                        setRemovidos((r) => new Set(r).add(i.id))
                      }
                    >
                      {t("Remover")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {novos.map((n) => (
              <TableRow key={n.chave}>
                <TableCell>
                  <span className="block font-medium">{n.nome}</span>
                  <span className="block text-xs text-muted-foreground">{n.codigo || "—"}</span>
                </TableCell>
                <TableCell>
                  <Input
                    className="text-right tabular-nums"
                    type="number"
                    min={1}
                    step={1}
                    value={n.quantidade}
                    aria-label={t("Qtde.")}
                    onChange={(e) =>
                      setNovos((v) =>
                        v.map((x) =>
                          x.chave === n.chave
                            ? { ...x, quantidade: Math.max(1, Number(e.target.value) || 1) }
                            : x,
                        ),
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="text-right tabular-nums"
                    inputMode="decimal"
                    value={n.precoReais}
                    aria-label={t("Preço un.")}
                    onChange={(e) =>
                      setNovos((v) =>
                        v.map((x) => (x.chave === n.chave ? { ...x, precoReais: e.target.value } : x)),
                      )
                    }
                  />
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {comoMoeda(
                    n.quantidade * paraCents(n.precoReais),
                    pedido.moeda,
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("Remover item")}
                    onClick={() => setNovos((v) => v.filter((x) => x.chave !== n.chave))}
                  >
                    {t("Remover")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {visiveis.length === 0 && novos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  {t("O pedido ficou sem itens. Adicione ao menos um antes de salvar.")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {removidos.size > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Removidos nesta edição")}: <strong>{removidos.size}</strong>
        </p>
      )}

      {produtos !== null && (
        <ProductSearch
          produtos={produtos}
          tabela={null}
          ultimosPrecos={new Map()}
          inputRef={refBusca}
          aoAdicionar={(p, quantidade) =>
            setNovos((v) => [
              ...v,
              {
                chave: novoId(),
                product_id: p.id,
                nome: p.nome,
                codigo: p.codigo,
                // O preço do CATÁLOGO entra como sugestão, editável — não como
                // verdade. Preço de venda é da linha, não do cadastro: a mesma
                // pessoa que pega R$ 52,00 da tabela fecha outra a R$ 49,90, e
                // quem decide isso é quem está na tela, não este código.
                precoReais: paraReais(p.preco_cents),
                quantidade,
              },
            ])
          }
          textos={{ produtos: t("Adicionar produto"), buscarProduto: t("Buscar produto…") }}
        />
      )}
    </Card>
  );
}