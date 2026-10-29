"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { ROTULO_NIVEL, type LinhaRadar, type NivelRadar } from "@/lib/comercial/radar-score";

import { useRadarDados } from "../_dados";

/**
 * O RECORTE — busca, vendedor, cidade, período, nível, dias e ticket.
 *
 * Fica na mesma barra nas três telas que leem a carteira (visão geral,
 * categorias, oportunidades) porque é o MESMO recorte: mudar de tela não pode
 * trocar o universo dos números. Um filtro que vale só numa aba é um filtro
 * que a pessoa aprende a não confiar.
 */
export function FiltrosDoRadar({
  linhas,
  vendedores,
  onAtualizar,
}: {
  linhas: LinhaRadar[];
  vendedores: { user_id: string; full_name: string | null }[];
  /** Refaz a leitura da base — o `Atualizar` não é enfeite: o radar agrega pedidos. */
  onAtualizar: () => void;
}) {
  const t = useT();
  const { filtros, mudar, limpar } = useRadarDados();

  const nomesVendedores = React.useMemo(
    () => new Map(vendedores.map((v) => [v.user_id, v.full_name ?? v.user_id.slice(0, 8)])),
    [vendedores],
  );
  const vendedoresPresentes = React.useMemo(() => {
    const ids = new Set(linhas.map((l) => l.vendedor_user_id).filter((v): v is string => !!v));
    return [...ids]
      .map((id) => ({ id, nome: nomesVendedores.get(id) ?? id.slice(0, 8) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas, nomesVendedores]);
  const cidades = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const l of linhas) {
      if (!l.cidade) continue;
      const chave = l.uf ? `${l.cidade}/${l.uf}` : l.cidade;
      if (!mapa.has(chave.toLowerCase())) mapa.set(chave.toLowerCase(), chave);
    }
    return [...mapa.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas]);

  return (
    <Card className="hover-raise space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="radar-busca">{t("Buscar cliente")}</Label>
          <Input
            id="radar-busca"
            value={filtros.busca}
            onChange={(e) => mudar({ busca: e.target.value })}
            placeholder={t("nome ou telefone…")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="radar-vendedor">{t("Vendedor")}</Label>
          <select
            id="radar-vendedor"
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            value={filtros.vendedor}
            onChange={(e) => mudar({ vendedor: e.target.value })}
          >
            <option value="">{t("Todos")}</option>
            {vendedoresPresentes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="radar-cidade">{t("Cidade")}</Label>
          <Input
            id="radar-cidade"
            value={filtros.cidade}
            onChange={(e) => mudar({ cidade: e.target.value })}
            placeholder="Joinville"
            list="radar-cidades"
          />
          <datalist id="radar-cidades">
            {cidades.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="radar-periodo">{t("Sem compra há até")}</Label>
          <select
            id="radar-periodo"
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            value={filtros.periodoDias == null ? "" : String(filtros.periodoDias)}
            onChange={(e) =>
              mudar({ periodoDias: e.target.value === "" ? null : Number(e.target.value) })
            }
          >
            <option value="">{t("Qualquer período")}</option>
            <option value="30">30 {t("dias")}</option>
            <option value="60">60 {t("dias")}</option>
            <option value="90">90 {t("dias")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("Nível")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ROTULO_NIVEL) as NivelRadar[]).map((n) => {
              const ativo = filtros.niveis.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() =>
                    mudar({
                      niveis: ativo
                        ? filtros.niveis.filter((x) => x !== n)
                        : [...filtros.niveis, n],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${ativo ? "border-transparent bg-accent text-accent-foreground" : "hover:border-accent"}`}
                >
                  {ROTULO_NIVEL[n]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="radar-diasmin">{t("Parados há ao menos (dias)")}</Label>
          <Input
            id="radar-diasmin"
            type="number"
            min={0}
            value={filtros.diasMin === 0 ? "" : filtros.diasMin}
            onChange={(e) => mudar({ diasMin: Math.max(0, Number(e.target.value) || 0) })}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="radar-ticketmin">{t("Ticket a partir de (R$)")}</Label>
          <Input
            id="radar-ticketmin"
            type="number"
            min={0}
            value={filtros.ticketMinCents === 0 ? "" : Math.round(filtros.ticketMinCents / 100)}
            onChange={(e) =>
              mudar({
                ticketMinCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)),
              })
            }
            placeholder="0"
          />
        </div>
        {/* flex-wrap: em 390 esta célula tem ~155px e os DOIS botões não cabem
            juntos — sem quebrar, "Limpar filtros" vazava pra fora da viewport
            (medido na auditoria §60, evidence/fase6-mobile/5). */}
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={onAtualizar}>
            {t("Atualizar")}
          </Button>
          <Button variant="ghost" onClick={limpar}>
            {t("Limpar filtros")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
