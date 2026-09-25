"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import {
  ehStatusCompra,
  rotuloStatusCompra,
  tonalidadeStatusCompra,
} from "@/lib/comercial/rotulo-status-compra";
import { comoMoeda } from "@/lib/format/moeda";
import { Package } from "@/lib/ui/icons";

type Item = {
  id: string;
  product_id: string | null;
  produto_codigo: string;
  produto_nome: string;
  quantidade: number;
  recebido_qtd: number;
  custo_unit_cents: number;
  subtotal_cents: number;
};

type Pedido = {
  id: string;
  numero: number;
  supplier_id: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  itens: Item[];
};

type Fornecedor = { id: string; nome: string };

type Acao = "enviar" | "cancelar" | "receber";

const VARIANTE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  cinza: "neutral",
  azul: "info",
  verde: "success",
  vermelho: "error",
};

const CONFIRMA: Record<Acao, { titulo: string; descricao: string; botao: string }> = {
  enviar: {
    titulo: "Enviar este pedido?",
    descricao: "O pedido sai de rascunho e passa a valer para o fornecedor. Depois disso ele só pode ser cancelado ou recebido.",
    botao: "Enviar pedido",
  },
  cancelar: {
    titulo: "Cancelar este pedido?",
    descricao: "O pedido é cancelado. Itens já recebidos (se houver) não são desfeitos por aqui.",
    botao: "Cancelar pedido",
  },
  receber: {
    titulo: "Receber tudo no estoque?",
    descricao: "Cada item pendente vira uma entrada de estoque (origem compra). O pedido fica recebido quando tudo entrar.",
    botao: "Receber tudo",
  },
};

export function CompraDetalheClient({ id, podeEscrever }: { id: string; podeEscrever: boolean }) {
  const tagIdioma = useTagDeIdioma();
  const [pedido, setPedido] = React.useState<Pedido | null>(null);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [estado, setEstado] = React.useState<"loading" | "error" | "nao" | "ready">("loading");
  const [erro, setErro] = React.useState("");
  const [acao, setAcao] = React.useState<Acao | null>(null);
  const [submetendo, setSubmetendo] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: Pedido }>(
        `/api/v1/purchase-orders/${encodeURIComponent(id)}`,
      );
      setPedido(corpo.data);
      setEstado("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("404") || msg.toLowerCase().includes("not")) {
        setEstado("nao");
      } else {
        setErro(msg || "Erro ao carregar o pedido.");
        setEstado("error");
      }
    }
  }, [id]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
    apiClient
      .get<{ data: Fornecedor[] }>("/api/v1/suppliers")
      .then((c) => setFornecedores(c.data ?? []))
      .catch(() => undefined);
  }, [carregar]);

  async function executar(a: Acao) {
    setSubmetendo(true);
    try {
      if (a === "receber") {
        await apiClient.post<{ data: { itens_recebidos: number; completo: boolean } }>(
          `/api/v1/purchase-orders/${encodeURIComponent(id)}/receber`,
          {},
        );
        nexusToast.success("Recebimento registrado no estoque.");
      } else {
        await apiClient.patch(`/api/v1/purchase-orders/${encodeURIComponent(id)}`, {
          status: a === "enviar" ? "enviado" : "cancelado",
        });
        nexusToast.success(a === "enviar" ? "Pedido enviado." : "Pedido cancelado.");
      }
      setAcao(null);
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSubmetendo(false);
    }
  }

  if (estado === "loading") {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (estado === "nao") {
    return (
      <div className="p-6">
        <NexusEmptyState
          icon={Package}
          headline="Pedido de compra não encontrado"
          subcopy="Ele pode ter sido removido ou pertence a outra organização."
          primary={{ label: "Voltar para compras", href: "/app/compras" }}
        />
      </div>
    );
  }

  if (estado === "error" || !pedido) {
    return (
      <div className="p-6">
        <NexusEmptyState
          icon={Package}
          headline="Erro ao carregar o pedido"
          subcopy={erro}
          primary={{
            label: "Tentar de novo",
            onClick: () => {
              setEstado("loading");
              void carregar();
            },
          }}
        />
      </div>
    );
  }

  const fornecedor = fornecedores.find((f) => f.id === pedido.supplier_id)?.nome ?? null;
  const totalCents = pedido.itens.reduce((s, i) => s + i.subtotal_cents, 0);
  const podeAcoes = podeEscrever && ["rascunho", "enviado"].includes(pedido.status);
  const totalQtd = pedido.itens.reduce((s, i) => s + i.quantidade, 0);
  const totalRecebido = pedido.itens.reduce((s, i) => s + i.recebido_qtd, 0);

  return (
    <div className="space-y-6 p-6">
      <NexusPageHeader
        title={`Compra #${pedido.numero}`}
        subtitle={fornecedor ?? "Sem fornecedor"}
        navigation={
          <Link href="/app/compras" className="hover:text-text">
            ← Compras
          </Link>
        }
        actions={
          podeAcoes ? (
            <div className="flex flex-wrap gap-2">
              {pedido.status === "rascunho" ? (
                <Button onClick={() => setAcao("enviar")}>Enviar ao fornecedor</Button>
              ) : null}
              {pedido.status === "enviado" ? (
                <Button onClick={() => setAcao("receber")}>
                  <Package className="mr-2 h-4 w-4" /> Receber no estoque
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setAcao("cancelar")}>
                Cancelar pedido
              </Button>
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={VARIANTE[ehStatusCompra(pedido.status) ? tonalidadeStatusCompra(pedido.status) : "cinza"]}>
          {rotuloStatusCompra(pedido.status)}
        </Badge>
        <span className="text-sm text-text-muted">
          Criado em {new Date(pedido.created_at).toLocaleDateString(tagIdioma)}
        </span>
        {totalRecebido > 0 ? (
          <span className="text-sm text-text-muted">
            {totalRecebido}/{totalQtd} unidades recebidas
          </span>
        ) : null}
      </div>

      {pedido.observacoes ? (
        <p className="rounded-lg border border-border bg-surface-elevated p-4 text-sm text-text-muted">
          {pedido.observacoes}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Recebido</TableHead>
              <TableHead className="text-right">Custo unit.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedido.itens.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.produto_codigo || "—"}</TableCell>
                <TableCell>{i.produto_nome}</TableCell>
                <TableCell className="text-right">{i.quantidade}</TableCell>
                <TableCell className="text-right">
                  <span className={i.recebido_qtd >= i.quantidade ? "text-success-fg" : "text-text-muted"}>
                    {i.recebido_qtd}
                  </span>
                </TableCell>
                <TableCell className="text-right">{comoMoeda(i.custo_unit_cents, "BRL")}</TableCell>
                <TableCell className="text-right font-medium">{comoMoeda(i.subtotal_cents, "BRL")}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={5} className="text-right text-sm text-text-muted">
                Total
              </TableCell>
              <TableCell className="text-right font-semibold">{comoMoeda(totalCents, "BRL")}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Dialog open={acao !== null} onOpenChange={(v) => !v && setAcao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{acao ? CONFIRMA[acao].titulo : ""}</DialogTitle>
            <DialogDescription>{acao ? CONFIRMA[acao].descricao : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={submetendo}>
              Voltar
            </Button>
            <Button
              variant={acao === "cancelar" ? "destructive" : "default"}
              disabled={submetendo}
              onClick={() => acao && void executar(acao)}
            >
              {acao && submetendo ? "Aplicando…" : acao ? CONFIRMA[acao].botao : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
