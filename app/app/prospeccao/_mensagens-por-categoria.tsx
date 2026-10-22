"use client";

import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";

/**
 * MENSAGENS POR CATEGORIA — o texto deixa de ser reescrito a cada campanha.
 *
 * A pergunta que esta tela responde é operacional: "o que a gente manda para
 * oficina mecânica?". Antes, a resposta só existia dentro de uma campanha
 * antiga, e quem criava a nova começava de três caixas em branco.
 *
 * O que a configuração guarda é o PADRÃO. A campanha nasce com ele e continua
 * dona da própria cópia: editar a campanha não muda o padrão, e mudar o padrão
 * não reescreve o histórico do que já saiu. São coisas diferentes e a tela diz
 * isso em vez de deixar o operador descobrir.
 *
 * Só gerente escreve (a API devolve 403 para os demais) — quem não pode salvar
 * vê o texto e a razão, não um botão que falha.
 */

interface Preset {
  categoria: string;
  mensagens: string[];
  updated_at?: string;
}

/**
 * A biblioteca em lista plana: o que o operador reconhece é o rótulo.
 *
 * Deduplica por `busca`: "Ótica" existe em dois macros e virava duas opções
 * idênticas no seletor — e duas `key` iguais, que o React denuncia no console.
 */
function categoriasPlanas(categorias: MacroCategoria[]): Array<{ busca: string; rotulo: string }> {
  const porBusca = new Map<string, string>();
  for (const macro of categorias) {
    for (const sub of macro.subcategorias) {
      if (!porBusca.has(sub.busca)) porBusca.set(sub.busca, sub.rotulo);
    }
  }
  return [...porBusca].map(([busca, rotulo]) => ({ busca, rotulo }));
}

export function MensagensPorCategoria({
  categorias,
  podeEditar,
}: {
  categorias: MacroCategoria[];
  podeEditar: boolean;
}) {
  const t = useT();
  const planas = React.useMemo(() => categoriasPlanas(categorias), [categorias]);

  const [presets, setPresets] = React.useState<Preset[] | null>(null);
  const [erro, setErro] = React.useState(false);
  const [categoria, setCategoria] = React.useState<string>("");
  const [mensagens, setMensagens] = React.useState<string[]>(["", "", ""]);
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const resposta = await apiClient.get<{ data?: Preset[] }>(
        "/api/v1/prospecting/mensagens-por-categoria",
      );
      setPresets(resposta?.data ?? []);
      setErro(false);
    } catch (e) {
      setErro(true);
      showApiError(e);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const porCategoria = React.useMemo(
    () => new Map((presets ?? []).map((p) => [p.categoria, p])),
    [presets],
  );

  const rotuloDe = React.useCallback(
    (busca: string) => planas.find((p) => p.busca === busca)?.rotulo ?? busca,
    [planas],
  );

  function abrir(busca: string): void {
    setCategoria(busca);
    const atual = porCategoria.get(busca);
    const preenchidas = atual?.mensagens ?? [];
    setMensagens([preenchidas[0] ?? "", preenchidas[1] ?? "", preenchidas[2] ?? ""]);
  }

  async function salvar(): Promise<void> {
    if (categoria === "") {
      toast.error(t("Escolha a categoria antes de salvar."));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put("/api/v1/prospecting/mensagens-por-categoria", {
        categoria,
        mensagens,
      });
      toast.success(t("Mensagens salvas para esta categoria."));
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function limpar(): Promise<void> {
    if (categoria === "") return;
    setSalvando(true);
    try {
      await apiClient.put("/api/v1/prospecting/mensagens-por-categoria", {
        categoria,
        mensagens: [],
      });
      toast.success(t("Padrão removido. As campanhas novas voltam a pedir o texto."));
      setMensagens(["", "", ""]);
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  const configuradas = (presets ?? []).filter((p) => (p.mensagens ?? []).length > 0);
  const quantidadePreenchida = mensagens.filter((m) => m.trim() !== "").length;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="text-base font-semibold">{t("Mensagens por categoria")}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "Configure uma vez as variações que a campanha usa para cada categoria. A campanha nasce preenchida e guarda a própria cópia — mudar aqui não reescreve o que já foi enviado.",
          )}
        </p>
      </div>

      {erro && presets === null ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            {t("Não foi possível carregar as mensagens configuradas.")}
          </p>
          <Button size="sm" variant="outline" onClick={() => void carregar()}>
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : presets === null ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          {configuradas.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("Configuradas:")}</span>
              {configuradas.map((p) => (
                <button key={p.categoria} type="button" onClick={() => abrir(p.categoria)}>
                  <Badge variant={p.categoria === categoria ? "default" : "secondary"}>
                    {rotuloDe(p.categoria)} · {p.mensagens.length}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {t(
                "Nenhuma categoria configurada ainda. Escolha uma abaixo: as campanhas dessa categoria passam a nascer com este texto.",
              )}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="preset-categoria">{t("Categoria")}</Label>
            <select
              id="preset-categoria"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={categoria}
              onChange={(e) => abrir(e.target.value)}
            >
              <option value="">{t("Escolha a categoria…")}</option>
              {planas.map((p) => (
                <option key={p.busca} value={p.busca}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {mensagens.map((m, i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`preset-msg-${i}`}>{t(`Mensagem ${i + 1}`)}</Label>
                <textarea
                  id={`preset-msg-${i}`}
                  className="min-h-28 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  maxLength={4000}
                  value={m}
                  disabled={categoria === "" || !podeEditar}
                  placeholder={
                    i === 0
                      ? t("Olá {{primeiro_nome}}! Aqui é da …")
                      : t("Variação — o disparo alterna entre elas.")
                  }
                  onChange={(e) =>
                    setMensagens((atuais) => atuais.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void salvar()}
              disabled={!podeEditar || salvando || categoria === "" || quantidadePreenchida === 0}
            >
              {salvando ? t("Salvando…") : t("Salvar mensagens")}
            </Button>
            {porCategoria.get(categoria) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void limpar()}
                disabled={!podeEditar || salvando}
              >
                {t("Remover padrão")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {!podeEditar
                ? t("Só gerente ou superior altera o padrão — você pode consultar o texto.")
                : quantidadePreenchida === 0
                  ? t("Escreva ao menos a primeira mensagem.")
                  : t(`${quantidadePreenchida} de 3 variações preenchidas.`)}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
