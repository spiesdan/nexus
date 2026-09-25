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
import { comoMoeda } from "@/lib/format/moeda";
import { FlowArrow, Lightbulb, Package, Plus } from "@/lib/ui/icons";

type ProdutoEstoque = {
  id: string;
  codigo: string;
  nome: string;
  quantidade: number;
  controla_estoque: boolean;
  custo_cents: number | null;
};

type Movimento = {
  id: string;
  product_id: string;
  tipo: "entrada" | "saida" | "ajuste";
  quantidade: number;
  origem: string;
  observacao: string | null;
  created_at: string;
};

type Sugestao = {
  product_id: string;
  media_diaria: number;
  cobertura_dias: number | null;
  qtd_sugerida: number;
  valor_sugerido_cents: number | null;
  metodo: string;
  codigo: string;
  nome: string;
  quantidade: number;
};

type RespostaSugestoes = {
  alvo_dias: number;
  janela_dias: number;
  sugestoes: Sugestao[];
  amostra_parcial: boolean;
};

const ROTULO_TIPO: Record<Movimento["tipo"], string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
};

const VARIANTE_TIPO: Record<
  Movimento["tipo"],
  React.ComponentProps<typeof Badge>["variant"]
> = {
  entrada: "success",
  saida: "info",
  ajuste: "neutral",
};

export function EstoqueClient({ podeEscrever }: { podeEscrever: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const aba = ["movimentos", "sugestoes"].includes(params.get("aba") ?? "")
    ? (params.get("aba") as string)
    : "saldos";

  const trocarAba = (prox: string) => {
    const q = new URLSearchParams(params.toString());
    if (prox === "saldos") q.delete("aba");
    else q.set("aba", prox);
    router.replace(`/app/estoque${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };

  return (
    <div className="space-y-6 p-6">
      <NexusPageHeader
        title="Estoque"
        subtitle="Saldo dos produtos, o razão das movimentações e o que recompor."
        navigation={
          <nav className="flex gap-4">
            <button
              type="button"
              onClick={() => trocarAba("saldos")}
              className={aba === "saldos" ? "font-medium text-text" : "hover:text-text"}
            >
              Saldos
            </button>
            <button
              type="button"
              onClick={() => trocarAba("movimentos")}
              className={aba === "movimentos" ? "font-medium text-text" : "hover:text-text"}
            >
              Movimentos
            </button>
            <button
              type="button"
              onClick={() => trocarAba("sugestoes")}
              className={aba === "sugestoes" ? "font-medium text-text" : "hover:text-text"}
            >
              Sugestões
            </button>
          </nav>
        }
      />
      {aba === "saldos" ? (
        <AbaSaldos podeEscrever={podeEscrever} />
      ) : aba === "movimentos" ? (
        <AbaMovimentos podeEscrever={podeEscrever} />
      ) : (
        <AbaSugestoes />
      )}
    </div>
  );
}

function AbaSaldos({ podeEscrever }: { podeEscrever: boolean }) {
  const [produtos, setProdutos] = React.useState<ProdutoEstoque[]>([]);
  const [busca, setBusca] = React.useState("");
  const [estado, setEstado] = React.useState<"loading" | "error" | "ready" | "empty">("loading");
  const [erro, setErro] = React.useState("");
  const [dialogo, setDialogo] = React.useState<{ produto: string | null; seq: number }>({
    produto: null,
    seq: 0,
  });
  const [aberto, setAberto] = React.useState(false);

  const carregar = React.useCallback(async (termo: string) => {
    try {
      const qs = termo ? `?busca=${encodeURIComponent(termo)}` : "";
      const corpo = await apiClient.get<{ data: ProdutoEstoque[] }>(`/api/v1/products${qs}`);
      // Só o que tem controle de estoque: o resto não tem saldo a mostrar.
      const lista = (corpo.data ?? []).filter((p) => p.controla_estoque);
      lista.sort((a, b) => a.quantidade - b.quantidade);
      setProdutos(lista);
      setErro("");
      setEstado(lista.length === 0 ? "empty" : "ready");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o estoque.");
      setEstado("error");
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar(busca);
  }, [busca, carregar]);

  const abrirMovimento = (produto: string | null) => {
    setDialogo((d) => ({ produto, seq: d.seq + 1 }));
    setAberto(true);
  };

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Produto</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {produtos.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="text-text-muted">{p.codigo || "—"}</TableCell>
            <TableCell className="font-medium">{p.nome}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {p.quantidade}
            </TableCell>
            <TableCell className="text-right">
              {podeEscrever ? (
                <Button variant="ghost" size="sm" onClick={() => abrirMovimento(p.id)}>
                  Movimento
                </Button>
              ) : null}
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
          placeholder="Buscar produto pelo nome ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {podeEscrever ? (
          <Button onClick={() => abrirMovimento(null)}>
            <Plus className="mr-2 h-4 w-4" /> Novo movimento
          </Button>
        ) : null}
      </div>

      <NexusDataTable
        state={estado}
        table={tabela}
        empty={
          <NexusEmptyState
            icon={Package}
            headline="Nenhum produto com controle de estoque"
            subcopy="Os produtos com controle de estoque aparecem aqui, do menor saldo para o maior."
            primary={
              podeEscrever
                ? { label: "Novo movimento", onClick: () => abrirMovimento(null) }
                : undefined
            }
          />
        }
        errorTitle="Erro ao carregar o estoque"
        errorDescription={erro}
        onRetry={() => carregar(busca)}
        items={produtos}
        keyOf={(p) => p.id}
        renderCard={(p) => (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">{p.nome}</p>
              <p className="text-sm text-text-muted">{p.codigo || "Sem código"}</p>
            </div>
            <span className="font-medium tabular-nums">{p.quantidade}</span>
          </div>
        )}
      />

      {aberto ? (
        <DialogNovoMovimento
          key={dialogo.seq}
          aberto={aberto}
          onOpenChange={setAberto}
          produtos={produtos}
          produtoPrefill={dialogo.produto}
          aoRegistrar={() => void carregar(busca)}
        />
      ) : null}
    </div>
  );
}

function AbaMovimentos({ podeEscrever }: { podeEscrever: boolean }) {
  const tagIdioma = useTagDeIdioma();
  const [movimentos, setMovimentos] = React.useState<Movimento[]>([]);
  const [produtos, setProdutos] = React.useState<ProdutoEstoque[]>([]);
  const [tipo, setTipo] = React.useState("");
  const [estado, setEstado] = React.useState<"loading" | "error" | "ready" | "empty">("loading");
  const [erro, setErro] = React.useState("");
  const [dialogo, setDialogo] = React.useState<{ produto: string | null; seq: number }>({
    produto: null,
    seq: 0,
  });
  const [aberto, setAberto] = React.useState(false);

  const carregar = React.useCallback(async (t: string) => {
    try {
      const qs = t ? `?tipo=${t}` : "";
      const corpo = await apiClient.get<{ data: Movimento[] }>(
        `/api/v1/inventory/movements${qs}`,
      );
      setMovimentos(corpo.data ?? []);
      setErro("");
      setEstado((corpo.data ?? []).length === 0 ? "empty" : "ready");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar movimentos.");
      setEstado("error");
    }
  }, []);

  React.useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar(tipo);
    // Nomes dos produtos junto: o razão devolve só o product_id.
    apiClient
      .get<{ data: ProdutoEstoque[] }>("/api/v1/products")
      .then((c) => {
        if (vivo) setProdutos(c.data ?? []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [tipo, carregar]);

  const produtoDe = React.useCallback(
    (id: string) => produtos.find((p) => p.id === id) ?? null,
    [produtos],
  );

  const abrirMovimento = (produto: string | null) => {
    setDialogo((d) => ({ produto, seq: d.seq + 1 }));
    setAberto(true);
  };

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Produto</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Quantidade</TableHead>
          <TableHead>Observação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movimentos.map((m) => {
          const produto = produtoDe(m.product_id);
          const sinal = m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "-" : "";
          return (
            <TableRow key={m.id}>
              <TableCell className="text-text-muted">
                {new Date(m.created_at).toLocaleString(tagIdioma)}
              </TableCell>
              <TableCell>
                <span className="font-medium">{produto?.nome ?? "—"}</span>
                {produto?.codigo ? (
                  <span className="ml-2 text-xs text-text-muted">{produto.codigo}</span>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={VARIANTE_TIPO[m.tipo]}>{ROTULO_TIPO[m.tipo]}</Badge>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {sinal}
                {m.quantidade}
              </TableCell>
              <TableCell className="text-text-muted">{m.observacao ?? "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={tipo || "todos"} onValueChange={(v) => setTipo(v === "todos" ? "" : v)}>
            <SelectTrigger aria-label="Filtrar por tipo">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="ajuste">Ajuste</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {podeEscrever ? (
          <Button onClick={() => abrirMovimento(null)}>
            <Plus className="mr-2 h-4 w-4" /> Novo movimento
          </Button>
        ) : null}
      </div>

      <NexusDataTable
        state={estado}
        table={tabela}
        empty={
          <NexusEmptyState
            icon={FlowArrow}
            headline="Nenhum movimento ainda"
            subcopy="Entradas, saídas e ajustes registrados à mão ficam aqui — o razão do estoque."
            primary={
              podeEscrever
                ? { label: "Novo movimento", onClick: () => abrirMovimento(null) }
                : undefined
            }
          />
        }
        errorTitle="Erro ao carregar movimentos"
        errorDescription={erro}
        onRetry={() => carregar(tipo)}
        items={movimentos}
        keyOf={(m) => m.id}
        renderCard={(m) => {
          const produto = produtoDe(m.product_id);
          const sinal = m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "-" : "";
          return (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{produto?.nome ?? "Produto removido"}</p>
                <p className="text-sm text-text-muted">
                  {new Date(m.created_at).toLocaleString(tagIdioma)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={VARIANTE_TIPO[m.tipo]}>{ROTULO_TIPO[m.tipo]}</Badge>
                <span className="font-medium tabular-nums">
                  {sinal}
                  {m.quantidade}
                </span>
              </div>
            </div>
          );
        }}
      />

      {aberto ? (
        <DialogNovoMovimento
          key={dialogo.seq}
          aberto={aberto}
          onOpenChange={setAberto}
          produtos={produtos.filter((p) => p.controla_estoque)}
          produtoPrefill={dialogo.produto}
          aoRegistrar={() => void carregar(tipo)}
        />
      ) : null}
    </div>
  );
}

function AbaSugestoes() {
  const [resposta, setResposta] = React.useState<RespostaSugestoes | null>(null);
  const [estado, setEstado] = React.useState<"loading" | "error" | "ready" | "empty">("loading");
  const [erro, setErro] = React.useState("");

  const carregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: RespostaSugestoes }>(
        "/api/v1/inventory/sugestoes",
      );
      setResposta(corpo.data);
      setErro("");
      setEstado((corpo.data?.sugestoes ?? []).length === 0 ? "empty" : "ready");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar sugestões.");
      setEstado("error");
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const sugestoes = resposta?.sugestoes ?? [];

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Produto</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="text-right">Média/dia</TableHead>
          <TableHead className="text-right">Cobertura</TableHead>
          <TableHead className="text-right">Sugerido</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sugestoes.map((s) => (
          <TableRow key={s.product_id}>
            <TableCell className="text-text-muted">{s.codigo || "—"}</TableCell>
            <TableCell className="font-medium">{s.nome}</TableCell>
            <TableCell className="text-right tabular-nums">{s.quantidade}</TableCell>
            <TableCell className="text-right tabular-nums">{s.media_diaria}</TableCell>
            <TableCell className="text-right tabular-nums">
              {s.cobertura_dias != null ? `${s.cobertura_dias} d` : "—"}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {s.qtd_sugerida}
            </TableCell>
            <TableCell className="text-right">
              {s.valor_sugerido_cents != null
                ? comoMoeda(s.valor_sugerido_cents, "BRL")
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link
                  href={`/app/compras?novo=1&produto=${s.product_id}&qtd=${s.qtd_sugerida}`}
                >
                  Criar compra
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Sugestão por cobertura: recompor até o alvo de {resposta?.alvo_dias ?? 14} dias,
        medido sobre as saídas dos últimos {resposta?.janela_dias ?? 30} dias.
        {resposta?.amostra_parcial
          ? " Amostra parcial: há mais itens do que a análise lê por vez."
          : ""}
      </p>

      <NexusDataTable
        state={estado}
        table={tabela}
        empty={
          <NexusEmptyState
            icon={Lightbulb}
            headline="Nada precisando recompor"
            subcopy={`Quando a cobertura de um produto com giro medido cai abaixo do alvo de ${resposta?.alvo_dias ?? 14} dias, ele aparece aqui.`}
          />
        }
        errorTitle="Erro ao carregar sugestões"
        errorDescription={erro}
        onRetry={() => void carregar()}
        items={sugestoes}
        keyOf={(s) => s.product_id}
        renderCard={(s) => (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">{s.nome}</p>
              <p className="text-sm text-text-muted">
                Cobertura {s.cobertura_dias != null ? `${s.cobertura_dias} d` : "—"} ·
                sugerido {s.qtd_sugerida}
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/compras?novo=1&produto=${s.product_id}&qtd=${s.qtd_sugerida}`}>
                Criar compra
              </Link>
            </Button>
          </div>
        )}
      />
    </div>
  );
}

function DialogNovoMovimento({
  aberto,
  onOpenChange,
  produtos,
  produtoPrefill,
  aoRegistrar,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  produtos: ProdutoEstoque[];
  produtoPrefill: string | null;
  aoRegistrar: () => void;
}) {
  const [produtoId, setProdutoId] = React.useState(produtoPrefill ?? "");
  const [tipo, setTipo] = React.useState<Movimento["tipo"]>("entrada");
  const [quantidade, setQuantidade] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [submetendo, setSubmetendo] = React.useState(false);
  const [erroServidor, setErroServidor] = React.useState<string | null>(null);

  const produtoSel = produtos.find((p) => p.id === produtoId) ?? null;
  const qtdNumerica = Number(quantidade.replace(",", "."));
  const saidaAcimaDoSaldo =
    tipo === "saida" && produtoSel != null && Number.isInteger(qtdNumerica) &&
    qtdNumerica > produtoSel.quantidade;

  async function submeter() {
    setSubmetendo(true);
    setErroServidor(null);
    try {
      if (!produtoId) throw new Error("Escolha o produto.");
      if (!Number.isInteger(qtdNumerica) || qtdNumerica === 0) {
        throw new Error("Quantidade inteira diferente de zero.");
      }
      if (tipo !== "ajuste" && qtdNumerica < 0) {
        throw new Error("Entrada e saída pedem quantidade positiva.");
      }
      await apiClient.post("/api/v1/inventory/movements", {
        product_id: produtoId,
        tipo,
        quantidade: qtdNumerica,
        observacao: observacao.trim() || undefined,
      });
      nexusToast.success("Movimento registrado.");
      aoRegistrar();
      onOpenChange(false);
      setProdutoId("");
      setTipo("entrada");
      setQuantidade("");
      setObservacao("");
    } catch (e) {
      setErroServidor(e instanceof Error ? e.message : "Erro ao registrar o movimento.");
    } finally {
      setSubmetendo(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo movimento</DialogTitle>
          <DialogDescription>
            Entrada soma, saída subtrai; ajuste é o delta com sinal, para corrigir saldo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select value={produtoId || "nada"} onValueChange={(v) => setProdutoId(v === "nada" ? "" : v)}>
              <SelectTrigger aria-label="Produto">
                <SelectValue placeholder="Produto com controle de estoque" />
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
            {produtoSel ? (
              <p className="text-sm text-text-muted">Saldo atual: {produtoSel.quantidade}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Movimento["tipo"])}>
              <SelectTrigger aria-label="Tipo do movimento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mov-qtd">{tipo === "ajuste" ? "Delta (com sinal) *" : "Quantidade *"}</Label>
            <Input
              id="mov-qtd"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder={tipo === "ajuste" ? "Ex.: -3 ou 5" : "Ex.: 10"}
            />
            {saidaAcimaDoSaldo ? (
              <p className="text-sm text-error-fg">
                Estoque insuficiente (saldo {produtoSel?.quantidade}).
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mov-obs">Observação</Label>
            <Input
              id="mov-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Nota fiscal, contagem de inventário, motivo do ajuste…"
              maxLength={500}
            />
          </div>

          {erroServidor ? <p className="text-sm text-error-fg">{erroServidor}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={submetendo}>
            <Plus className="mr-2 h-4 w-4" />
            {submetendo ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
