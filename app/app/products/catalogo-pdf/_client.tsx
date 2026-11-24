"use client";

/**
 * Prévia e download do catálogo — a prévia é o PDF REAL servido pela rota
 * `/preview`, exibido num iframe. Nenhum mockup em HTML.
 *
 * A tela completa de etapas (seleção, revisão de sem-categoria, ordem, logo)
 * vem na fatia seguinte; aqui ela já mostra as pendências e os atalhos para
 * corrigir pelo fluxo existente de produtos.
 */
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";

interface Pendencias {
  semCategoria: Array<{ produtoId: string; nome: string; categoria: string }>;
  semDados: Array<{ produtoId: string; motivos: string[] }>;
}

interface Resposta {
  config: { nome: string; logo_path: string | null; produto_ids: string[] };
  elegiveis: Array<{ id: string; nome: string | null; codigo: string | null; categoria: string | null }>;
  categorias: Array<{ id: string; nome: string }>;
  pendencias: Pendencias;
  pode_gerar: boolean;
  contracapa_disponivel: boolean;
}

export function CatalogoPdfClient() {
  const t = useT();
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/v1/products/catalogo-pdf")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { data: Resposta };
      })
      .then((corpo) => {
        if (vivo) {
          setDados(corpo.data);
          setErro(null);
        }
      })
      .catch(() => {
        if (vivo) setErro(t("Não foi possível carregar o catálogo."));
      });
    return () => {
      vivo = false;
    };
  }, [t, versao]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium text-text">{t("Prévia do catálogo")}</h2>
          {dados ? (
            <Badge variant={dados.pode_gerar ? "outline" : "destructive"}>
              {dados.pode_gerar ? t("pronto para gerar") : t("pendências")}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Gasto zero: o PDF não contém preços. O gasto de mídia e do catálogo são coisas diferentes.")}
        </p>

        {erro ? <p className="text-sm text-error-fg">{erro}</p> : null}
        {dados && !dados.pode_gerar ? (
          <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm" role="alert">
            <p className="font-medium">
              {dados.pendencias.semCategoria.length} {t("sem categoria válida")} ·{" "}
              {dados.pendencias.semDados.length} {t("sem foto, nome ou código")}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {dados.pendencias.semCategoria.slice(0, 10).map((p) => (
                <li key={p.produtoId}>
                  {p.nome} — {p.categoria}
                </li>
              ))}
              {dados.pendencias.semDados.slice(0, 10).map((p) => (
                <li key={p.produtoId}>
                  {p.produtoId}: {p.motivos.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => setVersao((v) => v + 1)}
          >
            {t("Recarregar")}
          </Button>
          <a href="/api/v1/products/catalogo-pdf/download" download>
            <Button className="min-h-11" disabled={!dados?.pode_gerar}>
              {t("Baixar PDF")}
            </Button>
          </a>
        </div>
      </Card>

      {dados?.pode_gerar ? (
        <Card className="space-y-2 p-4 sm:p-5">
          <h3 className="text-sm font-medium">{t("Prévia (PDF real)")}</h3>
          <iframe
            key={versao}
            src="/api/v1/products/catalogo-pdf/preview"
            title={t("Prévia do catálogo em PDF")}
            className="h-[70vh] w-full rounded-lg border bg-white"
          />
        </Card>
      ) : null}
    </div>
  );
}
