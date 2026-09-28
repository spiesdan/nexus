"use client";

import * as React from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { mapearExportMaps, type ArquivoMapsPronto } from "@/lib/prospeccao/importacao-maps";
import { UploadSimple } from "@/lib/ui/icons";

/**
 * Ponte do Google Maps Scraper: o usuário coleta no Firefox (Tampermonkey) e
 * envia aqui o Export JSON. A tela mapeia para o contrato e a rota cai no
 * mesmo dedup/score/insert das buscas — arquivo nunca duplica a base.
 */
export function ImportarArquivoDialog({
  aberto,
  onFechar,
  onImportado,
}: {
  aberto: boolean;
  onFechar: () => void;
  onImportado: () => void;
}) {
  const t = useT();
  const [categoria, setCategoria] = React.useState("");
  const [pronto, setPronto] = React.useState<ArquivoMapsPronto | null>(null);
  const [nomeArquivo, setNomeArquivo] = React.useState("");
  const [lendo, setLendo] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  function fechar() {
    setCategoria("");
    setPronto(null);
    setNomeArquivo("");
    onFechar();
  }

  async function lerArquivo(file: File) {
    setLendo(true);
    try {
      const json = JSON.parse(await file.text());
      setNomeArquivo(file.name);
      setPronto(mapearExportMaps(json));
    } catch {
      setNomeArquivo("");
      setPronto(null);
      toast.error(t("Nenhum negócio válido no arquivo."));
    } finally {
      setLendo(false);
    }
  }

  async function enviar() {
    if (!pronto || pronto.negocios.length === 0) {
      toast.error(t("Nenhum negócio válido no arquivo."));
      return;
    }
    if (categoria.trim().length < 2) {
      toast.error(t("Categoria da importação"));
      return;
    }
    setEnviando(true);
    try {
      const corpo = await apiClient.post<{
        data: { novas: number; duplicadas: number; recusadas: number; total: number } | null;
      }>("/api/v1/prospecting/prospects/import-arquivo", {
        categoria: categoria.trim(),
        negocios: pronto.negocios.slice(0, 500),
      });
      const r = corpo?.data ?? { novas: 0, duplicadas: 0, recusadas: 0, total: 0 };
      toast.success(t(`Arquivo: ${r.novas} novas, ${r.duplicadas} duplicadas, ${r.recusadas} recusadas`));
      onImportado();
      fechar();
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="flex-row items-center gap-2 space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base font-medium text-text">
            <UploadSimple size={18} className="text-muted-foreground" />
            {t("Importar arquivo")}
          </DialogTitle>
        </DialogHeader>

        <DialogDescription className="text-xs text-muted-foreground">
          {t("Exporte o JSON no userscript (Export Data → Export JSON) e envie aqui.")}
        </DialogDescription>

        <div className="space-y-1.5">
          <Label htmlFor="arq-categoria">{t("Categoria da importação")}</Label>
          <Input
            id="arq-categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder={t("Categoria")}
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="arq-json">{t("Arquivo JSON do Google Maps Scraper")}</Label>
          <Input
            id="arq-json"
            type="file"
            accept=".json,application/json"
            disabled={lendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lerArquivo(f);
              e.target.value = "";
            }}
          />
        </div>

        {pronto && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm" aria-live="polite">
            <p className="tabular-nums">
              {nomeArquivo !== "" ? `${nomeArquivo} · ` : ""}
              {pronto.negocios.length} {t("prontas")}, {pronto.recusadas.length} {t("recusadas")}
            </p>
            {pronto.recusadas.length > 0 && (
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {pronto.recusadas.slice(0, 5).map((r, i) => (
                  <li key={i}>
                    {r.linha > 0 ? `#${r.linha}: ` : ""}{r.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("Use dados públicos com responsabilidade (LGPD).")}</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={fechar}>
            {t("Fechar")}
          </Button>
          <Button onClick={() => void enviar()} disabled={enviando || !pronto || pronto.negocios.length === 0}>
            {enviando ? t("Enviando…") : t("Enviar")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
