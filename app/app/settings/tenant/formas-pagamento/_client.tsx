"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { FORMAS_DE_PAGAMENTO, ROTULO_DA_FORMA_DE_PAGAMENTO } from "@/lib/schemas/fiscal";

export interface MetodoRow {
  id: string;
  tipo: "forma" | "prazo";
  codigo: string;
  nome: string;
  tpag: string | null;
  dias_prazo: number | null;
  ativo: boolean;
}

type NovoMetodo = {
  tipo: "forma" | "prazo";
  codigo: string;
  nome: string;
  tpag: string;
  dias_prazo: string;
};

const VAZIO: NovoMetodo = { tipo: "forma", codigo: "", nome: "", tpag: "", dias_prazo: "" };

/**
 * As opções de tPag vêm da tabela oficial do leiaute da NF-e (NT 2020.006),
 * já versionada em `lib/schemas/fiscal.ts` — não é palpite redigitado aqui.
 * Linha sem código confirmado fica com `tpag` vazio e é sinalizada.
 */
function secao(tipo: "forma" | "prazo", metodos: MetodoRow[], podeEditar: boolean, aoAlternar: (m: MetodoRow) => void) {
  const daSecao = metodos.filter((m) => m.tipo === tipo);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-text">
        {tipo === "forma" ? "Formas de pagamento" : "Prazos de vencimento"}
      </h3>
      {daSecao.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {daSecao.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-text">{m.nome}</span>
                <span className="text-xs text-muted-foreground">({m.codigo})</span>
                {tipo === "forma" ? (
                  m.tpag ? (
                    <Badge variant="outline">tPag {m.tpag}</Badge>
                  ) : (
                    <Badge variant="destructive">tPag pendente</Badge>
                  )
                ) : (
                  <Badge variant="outline">{m.dias_prazo === 0 ? "à vista" : `${m.dias_prazo} dias`}</Badge>
                )}
                {!m.ativo ? <Badge variant="secondary">inativo</Badge> : null}
              </div>
              {podeEditar ? (
                <Button variant="outline" size="sm" className="min-h-11" onClick={() => aoAlternar(m)}>
                  {m.ativo ? "Desativar" : "Ativar"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FormasDePagamentoClient({
  metodosIniciais,
  podeEditar,
}: {
  metodosIniciais: MetodoRow[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [metodos, setMetodos] = React.useState(metodosIniciais);
  const [novo, setNovo] = React.useState<NovoMetodo>(VAZIO);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => setMetodos(metodosIniciais), [metodosIniciais]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const corpo = {
        tipo: novo.tipo,
        codigo: novo.codigo.trim().toLowerCase().replace(/\s+/g, "_"),
        nome: novo.nome.trim(),
        ...(novo.tipo === "forma"
          ? { tpag: novo.tpag || null, dias_prazo: null }
          : { tpag: null, dias_prazo: Number(novo.dias_prazo) }),
      };
      await apiClient.post("/api/v1/payment-methods", corpo);
      toast.success("Forma de pagamento adicionada");
      setNovo(VAZIO);
      router.refresh();
    } catch (erro) {
      showApiError(erro);
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(m: MetodoRow) {
    try {
      await apiClient.patch(`/api/v1/payment-methods/${m.id}`, { ativo: !m.ativo });
      setMetodos((atual) =>
        atual.map((x) => (x.id === m.id ? { ...x, ativo: !x.ativo } : x)),
      );
      router.refresh();
    } catch (erro) {
      showApiError(erro);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4 sm:p-5">
        {secao("forma", metodos, podeEditar, alternar)}
        {secao("prazo", metodos, podeEditar, alternar)}
        <p className="text-xs text-muted-foreground">
          Códigos tPag: tabela oficial do leiaute da NF-e (NT 2020.006, XSD
          PL_009_V4). Sem código confirmado, o campo fica vazio e sinalizado —
          nada é inventado.
        </p>
      </Card>

      {podeEditar ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-text">Adicionar</h3>
          <form onSubmit={(e) => void criar(e)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pm-tipo">Tipo</Label>
              <select
                id="pm-tipo"
                className="min-h-11 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={novo.tipo}
                onChange={(e) => setNovo({ ...novo, tipo: e.target.value as "forma" | "prazo", tpag: "", dias_prazo: "" })}
              >
                <option value="forma">Forma de pagamento</option>
                <option value="prazo">Prazo de vencimento</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-nome">Nome</Label>
              <Input id="pm-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-codigo">Código interno</Label>
              <Input id="pm-codigo" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
            </div>
            {novo.tipo === "forma" ? (
              <div className="space-y-1.5">
                <Label htmlFor="pm-tpag">Código fiscal (tPag)</Label>
                <select
                  id="pm-tpag"
                  className="min-h-11 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={novo.tpag}
                  onChange={(e) => setNovo({ ...novo, tpag: e.target.value })}
                >
                  <option value="">Não confirmado — pendência</option>
                  {FORMAS_DE_PAGAMENTO.map((codigo) => (
                    <option key={codigo} value={codigo}>
                      {codigo} — {ROTULO_DA_FORMA_DE_PAGAMENTO[codigo]}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pm-dias">Dias até o vencimento</Label>
                <Input
                  id="pm-dias"
                  type="number"
                  min={0}
                  value={novo.dias_prazo}
                  onChange={(e) => setNovo({ ...novo, dias_prazo: e.target.value })}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={salvando} className="min-h-11">
                {salvando ? "Salvando…" : "Adicionar"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
