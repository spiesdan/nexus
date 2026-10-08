"use client";

import * as React from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { LightboxDeFotos } from "@/components/fotos/LightboxDeFotos";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";

export interface Foto {
  id: string;
  url: string;
  posicao: number;
}

/**
 * As fotos de um produto na lista: capa (primeira) + gerência.
 *
 * Carrega sob demanda por produto (a lista traz 500; trazer foto de todos
 * seria 500 consultas). Upload imediato no file input; apagar com ×.
 */
export function FotosDoProduto({
  productId,
  podeEditar,
  fotosIniciais,
  aoMudar,
}: {
  productId: string;
  podeEditar: boolean;
  /**
   * Fotos que chegam PRONTAS no HTML inicial, montadas pelo servidor
   * (`fotosDosProdutos`). Quando presentes, este componente não busca sozinho
   * — nem por produto (eram 640 requisições na lista; medido: 104 s) nem em
   * lote depois que a página já estava na tela (a coluna ficava vazia e só
   * preenchia segundos depois).
   */
  fotosIniciais?: Foto[];
  /**
   * Avisa o pai depois de enviar/apagar, para o MAPA INTEIRO da lista ficar
   * certo — não só esta linha. Sem isto, enviar uma foto atualizava a célula e
   * voltar para a aba de produtos mostrava o vazio de novo.
   */
  aoMudar?: (productId: string) => void | Promise<void>;
}) {
  const t = useT();
  const [fotos, setFotos] = React.useState<Foto[] | null>(fotosIniciais ?? null);
  const [ampliada, setAmpliada] = React.useState<number | null>(null);

  const recarregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: Foto[] }>(`/api/v1/products/${productId}/images`);
      setFotos(Array.isArray(corpo?.data) ? corpo.data : []);
      // O pai é dono do mapa; avisar aqui evita o Next ler duas vezes a mesma
      // linha depois de um upload.
      if (aoMudar) void aoMudar(productId);
    } catch (e) {
      showApiError(e);
    }
  }, [productId, aoMudar]);

  // O lote chega DEPOIS da montagem. `useState(fotosIniciais)` congela o valor
  // do primeiro render, e a linha da lista tem `key={p.id}` — ou seja, o
  // componente não remonta quando `fotosIniciais` muda. Resultado medido: o
  // lote devolvia 3 produtos com foto e a tela renderizava ZERO <img>.
  //
  // Aqui o lote tem a precedência sobre o estado local, mas não o apaga: quem
  // acabou de enviar ou apagar uma foto vê a mudança na hora, sem esperar o
  // próximo lote (que só volta a rodar quando a lista muda).
  React.useEffect(() => {
    if (fotosIniciais === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFotos(fotosIniciais);
  }, [fotosIniciais]);

  React.useEffect(() => {
    if (fotosIniciais !== undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar, fotosIniciais]);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch(`/api/v1/products/${productId}/images`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast.error(corpo?.error?.message ?? t("Não consegui enviar a foto."));
        return;
      }
      toast.success(t("Foto adicionada"));
      await recarregar();
    } catch {
      toast.error(t("Não consegui enviar a foto."));
    }
  }

  async function apagar(fotoId: string) {
    try {
      await apiClient.delete(`/api/v1/products/${productId}/images/${fotoId}`);
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  if (fotos === null || fotos.length === 0) {
    return podeEditar ? (
      <label className="cursor-pointer text-xs text-muted-foreground underline">
        {t("＋ foto")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            void enviar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    ) : null;
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setAmpliada(0)}
        aria-label={t("Ampliar foto")}
        title={t("Ampliar foto")}
        className="rounded-lg transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primary"
      >
        {/* A URL vem pronta da rota: quem decide o caminho é o servidor, porque só
            ele sabe se a instalação tem o redimensionador de imagem. Ver
            `lib/storage/foto.ts` — no self-host esse caminho não existe e o
            `<img>` recebia 404 (coluna vazia, API toda em 200). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotos[0]!.url}
          alt=""
          className="h-10 w-10 rounded-lg border object-cover"
          loading="lazy"
          sizes="40px"
        />
      </button>
      {fotos.length > 1 && (
        <button
          type="button"
          onClick={() => setAmpliada(0)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          aria-label={t("Ver todas as fotos")}
        >
          +{fotos.length - 1}
        </button>
      )}
      {podeEditar && (
        <>
          <label className="cursor-pointer text-xs text-muted-foreground underline">
            {t("＋")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void enviar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1 text-xs"
            onClick={() => void apagar(fotos[0]!.id)}
            aria-label={t("Apagar foto")}
          >
            ×
          </Button>
        </>
      )}
      <LightboxDeFotos
        fotos={fotos.map((f) => ({ url: f.url }))}
        indiceInicial={ampliada ?? 0}
        aberto={ampliada !== null}
        onFechar={() => setAmpliada(null)}
      />
    </span>
  );
}
