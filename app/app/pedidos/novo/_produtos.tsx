"use client";

import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Produto } from "@/lib/schemas/produtos";
import { precoEfetivo } from "@/lib/schemas/precos";
import { comoMoeda } from "@/lib/format/moeda";

export interface PrecoDeTabela {
  desconto_pct: number;
  overrides: Map<string, number | null>;
}

export interface UltimoPreco {
  preco_cents: number;
  em: string;
}

/**
 * Busca de produto (§7–9): nome/SKU/código/EAN, parcial, com debounce.
 *
 * - EAN/SKU exato (código igual ao digitado) pula para o topo: bip de
 *   scanner vira Enter sem olhar a tela;
 * - Enter adiciona o destacado (qtd 1); ↑↓ navegam; Esc limpa;
 * - mostra preço efetivo da tabela aplicada + estoque + último preço do
 *   cliente (§19) quando houver histórico.
 */
export function ProductSearch({
  produtos,
  tabela,
  ultimosPrecos,
  inputRef,
  aoAdicionar,
  textos,
}: {
  produtos: Produto[];
  tabela: PrecoDeTabela | null;
  ultimosPrecos: Map<string, UltimoPreco>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  aoAdicionar: (produto: Produto, quantidade: number) => void;
  textos: { produtos: string; buscarProduto: string };
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [destaque, setDestaque] = React.useState(0);
  // Acima do lote carregado (2.000), o produto existe no banco e não existe na
  // tela. A busca remota é o que impede "o produto não existe" numa carteira
  // grande — a lista local continua valendo e responde primeiro.
  const [remotos, setRemotos] = React.useState<Produto[]>([]);
  const [buscandoRemoto, setBuscandoRemoto] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(busca);
      setDestaque(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [busca]);

  React.useEffect(() => {
    const b = debounced.trim();
    if (b.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemotos([]);
      return;
    }
    let vivo = true;
    setBuscandoRemoto(true);
    apiClient
      .get<{ data: Produto[] }>(`/api/v1/products?busca=${encodeURIComponent(b)}&limite=12`)
      .then((r) => {
        if (vivo) setRemotos(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        // Busca remota é reforço: sem rede, a lista local continua valendo.
        if (vivo) setRemotos([]);
      })
      .finally(() => {
        if (vivo) setBuscandoRemoto(false);
      });
    return () => {
      vivo = false;
    };
  }, [debounced]);

  const filtrados = React.useMemo(() => {
    const b = debounced.trim().toLowerCase();
    if (!b) return [];
    // O endpoint devolve inativos também (a tela de catálogo os mostra); o
    // pedido só aceita ativo.
    const porId = new Map(produtos.map((p) => [p.id, p]));
    for (const p of remotos) if (p.ativo !== false) porId.set(p.id, p);
    const universo = [...porId.values()];
    const exato = universo.filter((p) => p.codigo.toLowerCase() === b);
    const resto = universo.filter(
      (p) =>
        p.codigo.toLowerCase() !== b &&
        (p.nome.toLowerCase().includes(b) ||
          p.codigo.toLowerCase().includes(b) ||
          (p.marca ?? "").toLowerCase().includes(b)),
    );
    return [...exato, ...resto].slice(0, 8);
  }, [debounced, produtos, remotos]);

  function efetivo(p: Produto): { valor: number; origem: string } {
    if (!tabela) return { valor: p.preco_cents, origem: t("Base") };
    const v = precoEfetivo(p.preco_cents, tabela.desconto_pct, tabela.overrides.get(p.id) ?? null);
    if (v !== p.preco_cents) return { valor: v, origem: t("Tabela") };
    return { valor: v, origem: t("Base") };
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      const alvo = filtrados[destaque];
      if (alvo) {
        e.preventDefault();
        aoAdicionar(alvo, 1);
        setBusca("");
      }
    } else if (e.key === "Escape") {
      setBusca("");
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="busca-produto">{textos.produtos}</Label>
      <Input
        id="busca-produto"
        ref={inputRef}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={aoTeclar}
        placeholder={textos.buscarProduto}
        autoComplete="off"
      />
      {filtrados.length > 0 && (
        <ul className="rounded-lg border bg-background shadow-sm">
          {filtrados.map((p, i) => {            const ef = efetivo(p);
            const ultimo = ultimosPrecos.get(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    i === destaque ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => {
                    aoAdicionar(p, 1);
                    setBusca("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.codigo}
                      {p.controla_estoque ? ` · ${t("estoque")}: ${p.quantidade}` : ""}
                      {` · ${ef.origem}`}
                    </span>
                    {ultimo && (
                      <span className="block text-xs text-muted-foreground">
                        {t("Último")}: {comoMoeda(ultimo.preco_cents, p.moeda)}
                        {ultimo.preco_cents !== ef.valor && (
                          <> ({ef.valor > ultimo.preco_cents ? "↑" : "↓"})</>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-medium">{comoMoeda(ef.valor, p.moeda)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Busca sem resultado não é catálogo vazio: sem esta linha, o operador
          não distingue "não existe produto com esse termo" de "a lista ainda
          não carregou" — e digita de novo achando que errou. */}
      {filtrados.length === 0 && busca.trim() !== "" && !buscandoRemoto && (
        <p className="px-1 text-xs text-muted-foreground">{t("Nenhum produto encontrado.")}</p>
      )}
    </div>
  );
}
