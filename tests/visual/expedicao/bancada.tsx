/**
 * A BANCADA VISUAL DA EXPEDIÇÃO — a tela real, com dado sintético.
 *
 * O que é montado aqui é o componente de PRODUÇÃO, não uma maquete: o mesmo
 * `Roteirizador` que roda em `/app/expedicao/[id]`, com o mesmo `MapaRota`
 * (MapLibre) e o mesmo `PainelRecuperacao`. A única coisa falsa é a borda HTTP
 * (ver `fetch-falso.ts`) — logo, o que a foto mostra é o que o operador vê.
 *
 * Como rodar (o build NÃO é versionado; só os PNGs são):
 *
 *     node tests/visual/expedicao/build.mjs /caminho/de/saida
 *     python3 -m http.server --directory /caminho/de/saida 8000
 *
 * E abrir `http://localhost:8000`. O passo a passo completo, com o tamanho de
 * viewport de cada print, está em `docs/evidence/2026-11-13-expedicao/README.md`.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";

import { Roteirizador } from "@/app/app/expedicao/[id]/_roteirizador";
import { ConfirmacaoProvider } from "@/components/nexus-ui/forms/ConfirmacaoProvider";

import { instalarFetchFalso } from "./fetch-falso";

instalarFetchFalso();

/**
 * INSTRUMENTAÇÃO DA BANCADA (só aqui, nunca no produto).
 *
 * A foto mostra o que o mapa PINTOU; quando uma camada some, o pixel não diz
 * se ela não foi criada ou se foi criada e não apareceu. Isto guarda os ids de
 * fonte/camada e o erro de qualquer chamada que tenha falhado, para a
 * inspeção no console do navegador responder "criou?" com fato.
 */
import * as maplibregl from "maplibre-gl";

// O MapLibre resolve o worker a partir de `import.meta.url` do bundle. Na
// bancada (esbuild IIFE servido por http.server simples) isso aponta para um
// caminho que não existe e o servidor devolve HTML — "non-JavaScript MIME
// type". Forçamos a URL do worker para um arquivo que copiamos ao lado do
// bundle (ver build.mjs). Sem o worker, fontes GeoJSON (rotas) não indexam e
// não pintam, mesmo com `addLayer`/`addSource` criados corretamente.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const registro = {
  camadas: [] as string[],
  fontes: [] as string[],
  erros: [] as string[],
  mapa: null as unknown,
  dados: {} as Record<string, unknown>,
};
(globalThis as unknown as { __bancada: typeof registro }).__bancada = registro;
const proto = maplibregl.Map.prototype as unknown as {
  addLayer: (l: { id: string }, before?: string) => unknown;
  addSource: (id: string, s: { data?: unknown }) => unknown;
};
const addLayerOriginal = proto.addLayer;
const addSourceOriginal = proto.addSource;
proto.addLayer = function (this: unknown, camada: { id: string }, before?: string) {
  registro.camadas.push(camada.id);
  registro.mapa = this;
  try {
    return addLayerOriginal.call(this, camada, before);
  } catch (e) {
    registro.erros.push(`addLayer ${camada.id}: ${String(e)}`);
    throw e;
  }
};
proto.addSource = function (this: unknown, id: string, fonte: { data?: unknown }) {
  registro.fontes.push(id);
  registro.dados[id] = fonte?.data;
  registro.mapa = this;
  try {
    return addSourceOriginal.call(this, id, fonte);
  } catch (e) {
    registro.erros.push(`addSource ${id}: ${String(e)}`);
    throw e;
  }
};

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("bancada: #raiz ausente no index.html");

createRoot(raiz).render(
  // `ConfirmacaoProvider` é dependência real do roteirizador (`useConfirmar`
  // lança fora dele) — e é o mesmo provider que envolve o /app em produção.
  <ConfirmacaoProvider>
    <div className="mx-auto w-full max-w-[1680px] p-4">
      <Roteirizador cargaId="carga-bancada" podeOperar aoMudar={() => undefined} />
    </div>
  </ConfirmacaoProvider>,
);
