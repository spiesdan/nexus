"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusDataTable } from "@/components/nexus-ui/data/NexusDataTable";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import {
  ehStatusCompra,
  rotuloStatusCompra,
  tonalidadeStatusCompra,
} from "@/lib/comercial/rotulo-status-compra";
import { Package, Plus, Storefront, Trash } from "@/lib/ui/icons";

type CompraLinha = {
  id: string;
  numero: number;
  supplier_id: string | null;
  status: string;
  created_at: string;
};

type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
};

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  custo_cents: number | null;
};

type ItemForm = { product_id: string; quantidade: string; custo_reais: string };

const VARIANTE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  cinza: "neutral",
  azul: "info",
  verde: "success",
  vermelho: "error",
};

export function ComprasClient({ podeEscrever }: { podeEscrever: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const aba = params.get("aba") === "fornecedores" ? "fornecedores" : "pedidos";

  const trocarAba = (prox: string) => {
    const q = new URLSearchParams(params.toString());
    if (prox === "pedidos") q.delete("aba");
    else q.set("aba", prox);
    router.replace(`/app/compras${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };

  return (
    <div className="space-y-6 p-6">
      <NexusPageHeader
        title="Compras"
        subtitle="Pedidos de compra aos fornecedores e quem os fornece."
        navigation={
          <nav className="flex gap-4">
            <button
              type="button"
              onClick={() => trocarAba("pedidos")}
              className={aba === "pedidos" ? "font-medium text-text" : "hover:text-text"}
            >
              Pedidos
            </button>
            <button
              type="button"
              onClick={() => trocarAba("fornecedores")}
              className={aba === "fornecedores" ? "font-medium text-text" : "hover:text-text"}
            >
              Fornecedores
            </button>
          </nav>
        }
      />
      {aba === "pedidos" ? (
        <AbaPedidos podeEscrever={podeEscrever} />
      ) : (
        <AbaFornecedores podeEscrever={podeEscrever} />
      )}
    </div>
  );
}

function AbaPedidos({ podeEscrever }: { podeEscrever: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const tagIdioma = useTagDeIdioma();
  // Prefill vem da Estoque (sugestão de compra): `?novo=1&produto=&qtd=`.
  const prefillProduto = params.get("produto");
  const prefillQtd = params.get("qtd");
  const abrirNovo = prefillProduto !== null && params.get("novo") === "1";
  const [linhas, setLinhas] = React.useState<CompraLinha[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [status, setStatus] = React.useState("");
  const [estado, setEstado] = React.useState<"loading" | "error" | "ready" | "empty">("loading");
  const [erro, setErro] = React.useState("");
  const [dialogoAberto, setDialogoAberto] = React.useState(abrirNovo && podeEscrever);

  const nomeFornecedor = React.useCallback(
    (id: string | null) => fornecedores.find((f) => f.id === id)?.nome ?? null,
    [fornecedores],
  );

  const carregar = React.useCallback(async (s: string) => {
    try {
      const qs = s ? `?status=${s}` : "";
      const corpo = await apiClient.get<{ data: CompraLinha[] }>(
        `/api/v1/purchase-orders${qs}`,
      );
      setLinhas(corpo.data ?? []);
      setErro("");
      setEstado((corpo.data ?? []).length === 0 ? "empty" : "ready");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar compras.");
      setEstado("error");
    }
  }, []);

  React.useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar(status);
    apiClient
      .get<{ data: Fornecedor[] }>("/api/v1/suppliers")
      .then((c) => {
        if (vivo) setFornecedores(c.data ?? []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [status, carregar]);

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pedido</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Criado em</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="font-medium">#{l.numero}</TableCell>
            <TableCell>{nomeFornecedor(l.supplier_id) ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={VARIANTE[ehStatusCompra(l.status) ? tonalidadeStatusCompra(l.status) : "cinza"]}>
                {rotuloStatusCompra(l.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-text-muted">
              {new Date(l.created_at).toLocaleDateString(tagIdioma)}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/app/compras/${l.id}`}>Abrir</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={status || "todos"} onValueChange={(v) => setStatus(v === "todos" ? "" : v)}>
            <SelectTrigger aria-label="Filtrar por status">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="recebido">Recebido</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {podeEscrever ? (
          <Button onClick={() => setDialogoAberto(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova compra
          </Button>
        ) : null}
      </div>

      <NexusDataTable
        state={estado}
        table={tabela}
        empty={
          <NexusEmptyState
            icon={Package}
            headline="Nenhum pedido de compra ainda"
            subcopy="Crie o primeiro pedido para comprar de um fornecedor e receber no estoque."
            primary={
              podeEscrever
                ? { label: "Nova compra", onClick: () => setDialogoAberto(true) }
                : undefined
            }
          />
        }
        errorTitle="Erro ao carregar compras"
        errorDescription={erro}
        onRetry={() => carregar(status)}
        items={linhas}
        keyOf={(l) => l.id}
        renderCard={(l) => (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">#{l.numero}</p>
              <p className="text-sm text-text-muted">
                {nomeFornecedor(l.supplier_id) ?? "Sem fornecedor"}
              </p>
            </div>
            <Badge variant={VARIANTE[ehStatusCompra(l.status) ? tonalidadeStatusCompra(l.status) : "cinza"]}>
              {rotuloStatusCompra(l.status)}
            </Badge>
          </div>
        )}
      />

      <DialogNovaCompra
        aberto={dialogoAberto}
        onOpenChange={(v) => {
          setDialogoAberto(v);
          if (!v && (params.get("novo") ?? "") === "1") {
            const q = new URLSearchParams(params.toString());
            q.delete("novo");
            q.delete("produto");
            q.delete("qtd");
            router.replace(`/app/compras${q.toString() ? `?${q}` : ""}`, { scroll: false });
          }
        }}
        fornecedores={fornecedores}
        produtoPrefill={prefillProduto}
        qtdPrefill={prefillQtd}
        aoCriar={(id) => router.push(`/app/compras/${id}`)}
      />
    </div>
  );
}

function AbaFornecedores({ podeEscrever }: { podeEscrever: boolean }) {
  const [linhas, setLinhas] = React.useState<Fornecedor[]>([]);
  const [busca, setBusca] = React.useState("");
  const [estado, setEstado] = React.useState<"loading" | "error" | "ready" | "empty">("loading");
  const [erro, setErro] = React.useState("");
  const [dialogoAberto, setDialogoAberto] = React.useState(false);

  const carregar = React.useCallback(async (b: string) => {
    try {
      const qs = b ? `?busca=${encodeURIComponent(b)}` : "";
      const corpo = await apiClient.get<{ data: Fornecedor[] }>(`/api/v1/suppliers${qs}`);
      setLinhas(corpo.data ?? []);
      setErro("");
      setEstado((corpo.data ?? []).length === 0 ? "empty" : "ready");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar fornecedores.");
      setEstado("error");
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar(busca);
  }, [busca, carregar]);

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((f) => (
          <TableRow key={f.id}>
            <TableCell className="font-medium">{f.nome}</TableCell>
            <TableCell className="text-text-muted">{f.cnpj ?? "—"}</TableCell>
            <TableCell className="text-text-muted">{f.email ?? "—"}</TableCell>
            <TableCell className="text-text-muted">{f.telefone ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={f.ativo ? "success" : "neutral"}>
                {f.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Buscar fornecedor pelo nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {podeEscrever ? (
          <Button onClick={() => setDialogoAberto(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo fornecedor
          </Button>
        ) : null}
      </div>

      <NexusDataTable
        state={estado}
        table={tabela}
        empty={
          <NexusEmptyState
            icon={Storefront}
            headline="Nenhum fornecedor"
            subcopy="Cadastre quem fornece os produtos que você compra."
            primary={
              podeEscrever
                ? { label: "Novo fornecedor", onClick: () => setDialogoAberto(true) }
                : undefined
            }
          />
        }
        errorTitle="Erro ao carregar fornecedores"
        errorDescription={erro}
        onRetry={() => carregar(busca)}
        items={linhas}
        keyOf={(f) => f.id}
        renderCard={(f) => (
          <div>
            <p className="font-medium">{f.nome}</p>
            <p className="text-sm text-text-muted">{f.cnpj ?? f.email ?? "—"}</p>
          </div>
        )}
      />

      <DialogNovoFornecedor aberto={dialogoAberto} onOpenChange={setDialogoAberto} />
    </div>
  );
}

function DialogNovaCompra({
  aberto,
  onOpenChange,
  fornecedores,
  produtoPrefill,
  qtdPrefill,
  aoCriar,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  fornecedores: Fornecedor[];
  produtoPrefill: string | null;
  qtdPrefill: string | null;
  aoCriar: (id: string) => void;
}) {
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [supplierId, setSupplierId] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [itens, setItens] = React.useState<ItemForm[]>([
    { product_id: produtoPrefill ?? "", quantidade: qtdPrefill ?? "1", custo_reais: "" },
  ]);
  const [submetendo, setSubmetendo] = React.useState(false);
  const [erroServidor, setErroServidor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    apiClient
      .get<{ data: Produto[] }>("/api/v1/products")
      .then((c) => setProdutos(c.data ?? []))
      .catch(() => setProdutos([]));
  }, [aberto]);

  const trocarItem = (i: number, patch: Partial<ItemForm>) =>
    setItens((ant) => ant.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  async function submeter() {
    setSubmetendo(true);
    setErroServidor(null);
    try {
      const corpo = {
        supplier_id: supplierId || null,
        observacoes: observacoes.trim() || undefined,
        itens: itens
          .filter((i) => i.product_id)
          .map((i) => ({
            product_id: i.product_id,
            quantidade: Math.max(1, Math.trunc(Number(i.quantidade.replace(",", ".")) || 0)),
            custo_unit_cents: Math.max(
              0,
              Math.round(Number(i.custo_reais.replace(",", ".")) * 100) || 0,
            ),
          })),
      };
      if (corpo.itens.length === 0) throw new Error("Adicione ao menos um item.");
      const resp = await apiClient.post<{ data: { id: string } }>(
        "/api/v1/purchase-orders",
        corpo,
      );
      nexusToast.success("Pedido de compra criado.");
      aoCriar(resp.data.id);
      onOpenChange(false);
      setItens([{ product_id: "", quantidade: "1", custo_reais: "" }]);
      setObservacoes("");
      setSupplierId("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar o pedido.";
      setErroServidor(msg);
    } finally {
      setSubmetendo(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova compra</DialogTitle>
          <DialogDescription>
            O pedido nasce como rascunho; enviar ao fornecedor é a próxima etapa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fornecedor (opcional)</Label>
            <Select value={supplierId || "sem"} onValueChange={(v) => setSupplierId(v === "sem" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sem fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem">Sem fornecedor</SelectItem>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Itens</Label>
            {itens.map((item, i) => {
              const produto = produtos.find((p) => p.id === item.product_id);
              return (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_6rem_7rem_2rem]">
                  <Select value={item.product_id || "nada"} onValueChange={(v) => trocarItem(i, { product_id: v === "nada" ? "" : v })}>
                    <SelectTrigger aria-label="Produto">
                      <SelectValue placeholder="Produto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nada">Produto…</SelectItem>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.codigo ? `${p.codigo} · ` : ""}
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="numeric"
                    aria-label="Quantidade"
                    placeholder="Qtd"
                    value={item.quantidade}
                    onChange={(e) => trocarItem(i, { quantidade: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    aria-label="Custo unitário"
                    placeholder="Custo (R$)"
                    value={item.custo_reais}
                    onChange={(e) => trocarItem(i, { custo_reais: e.target.value })}
                    onBlur={() => {
                      if (!item.custo_reais && produto?.custo_cents != null) {
                        trocarItem(i, { custo_reais: (produto.custo_cents / 100).toFixed(2) });
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover item"
                    disabled={itens.length === 1}
                    onClick={() => setItens((ant) => ant.filter((_, idx) => idx !== i))}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setItens((ant) => [...ant, { product_id: "", quantidade: "1", custo_reais: "" }])}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar item
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="obs-compra">Observações</Label>
            <Input
              id="obs-compra"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Condição de pagamento, prazo, pedido do fornecedor…"
            />
          </div>

          {erroServidor ? <p className="text-sm text-error-fg">{erroServidor}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={submetendo}>
            <Package className="mr-2 h-4 w-4" />
            {submetendo ? "Criando…" : "Criar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogNovoFornecedor({
  aberto,
  onOpenChange,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [nome, setNome] = React.useState("");
  const [cnpj, setCnpj] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [submetendo, setSubmetendo] = React.useState(false);
  const [erroServidor, setErroServidor] = React.useState<string | null>(null);

  async function submeter() {
    setSubmetendo(true);
    setErroServidor(null);
    try {
      await apiClient.post("/api/v1/suppliers", {
        nome: nome.trim(),
        cnpj: cnpj.trim() || undefined,
        email: email.trim() || undefined,
        telefone: telefone.trim() || undefined,
      });
      nexusToast.success("Fornecedor cadastrado.");
      onOpenChange(false);
      setNome("");
      setCnpj("");
      setEmail("");
      setTelefone("");
    } catch (e) {
      setErroServidor(e instanceof Error ? e.message : "Erro ao cadastrar fornecedor.");
    } finally {
      setSubmetendo(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo fornecedor</DialogTitle>
          <DialogDescription>Quem vende para você. CNPJ e contato são opcionais.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forn-nome">Nome *</Label>
            <Input id="forn-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="forn-cnpj">CNPJ</Label>
              <Input id="forn-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="forn-tel">Telefone</Label>
              <Input id="forn-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="forn-email">E-mail</Label>
            <Input
              id="forn-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {erroServidor ? <p className="text-sm text-error-fg">{erroServidor}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={submetendo || nome.trim().length < 2}>
            {submetendo ? "Salvando…" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
