"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { substituirQueryDaUrl } from "@/lib/navigation/shallow";

import { CanalOficialClient } from "./CanalOficialClient";
import { CanalParceiroClient } from "./CanalParceiroClient";
import { ConnectionsClient } from "./ConnectionsClient";
import { TemplatesClient } from "./TemplatesClient";
import { TemplatesParceiroClient } from "./TemplatesParceiroClient";
import { useT } from "@/hooks/i18n/useT";

/**
 * Conexões — TODOS os canais em um lugar só.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 * Conectar o número por QR ficava aqui; conectar o número OFICIAL ficava em
 * Configurações; os templates, que só existem por causa do canal oficial, ficavam
 * numa terceira tela. Três lugares para uma coisa só — e o usuário precisava saber
 * de antemão que a resposta para "conectar meu WhatsApp" dependia de QUAL WhatsApp.
 *
 * A pergunta que a tela responde é "por onde meu negócio fala com o cliente". A
 * resposta é uma lista de canais, não um mapa do nosso código: quem instala não
 * sabe (nem deve saber) que um passa por QR e o outro por credencial da Meta.
 *
 * Templates entram como sub-aba do canal oficial, e não como item de topo, porque
 * eles NÃO existem fora dele: num canal por QR não há template a aprovar. Promovê-los
 * a item de primeiro nível sugeriria uma escolha que não existe.
 *
 * ─── A aba vive na URL ──────────────────────────────────────────────────────
 * `?aba=` e `?sub=` seguem na URL: as rotas antigas
 * (`/app/settings/canal-oficial`, `/app/settings/templates`) redirecionam para cá
 * apontando a aba certa, e um link colado no chat abre onde deveria. O que mudou
 * em 2026-09-30 (auditoria de performance) é COMO o clique atualiza essa URL:
 * era `router.replace`, que re-renderizava o RSC do /app inteiro (~1–2s em
 * produção) para o servidor devolver o mesmo HTML; agora é
 * `history.replaceState` (`lib/navigation/shallow.ts`) — a URL continua
 * compartilhável e o deep-link continua honrado, porque o valor inicial é lido
 * de `useSearchParams` na montagem. A aba em si virou `useState`.
 */
export function ConexoesShell({ wahaConfigured }: { wahaConfigured: boolean }) {
  const t = useT();
  const params = useSearchParams();
  const [aba, setAba] = useState(() => {
    const p = params.get("aba");
    return p === "oficial" ? "oficial" : p === "parceiro" ? "parceiro" : "numeros";
  });
  const [sub, setSub] = useState(() => (params.get("sub") === "templates" ? "templates" : "conexao"));

  const irPara = (proximaAba: string, proximaSub?: string): void => {
    setAba(proximaAba);
    setSub(proximaSub ?? sub);
    const q = new URLSearchParams();
    if (proximaAba !== "numeros") q.set("aba", proximaAba);
    const subFinal = proximaSub ?? sub;
    if (subFinal && subFinal !== "conexao") q.set("sub", subFinal);
    substituirQueryDaUrl(q.toString());
  };

  return (
    <Tabs value={aba} onValueChange={(v) => irPara(v, sub)} className="flex flex-col gap-4">
      <TabsList>
        {/* Rótulos pelo que o usuário RECONHECE, não pelo nome técnico do motor por
            trás: ele sabe se leu um QR ou se tem conta na Meta; a sigla do provedor
            não diz nada a quem instalou o sistema para vender.

            Este comentário já citou a sigla como exemplo — e o `lint:channels`
            reprovou, porque o regex da doutrina não distingue prosa de código
            (limitação registrada no próprio `scripts/lint-channels.ts`). Reescrever
            a frase custou menos que abrir exceção no gate, e o gate continua
            estrito: o dia em que alguém escrever o nome do provider aqui DE VERDADE,
            ele reprova igual. */}
        <TabsTrigger value="numeros">{t("Números por QR")}</TabsTrigger>
        <TabsTrigger value="oficial">{t("API Oficial (Meta)")}</TabsTrigger>
        {/* "Provedor parceiro" e não a marca: o rótulo da marca vem do servidor
            (`lib/channels/connect`), porque a tela não pode nomear provider — e
            porque no dia em que houver um segundo parceiro esta aba não muda.
            Aqui fica o CONCEITO; lá dentro o cartão diz de quem se trata. */}
        <TabsTrigger value="parceiro">{t("Provedor parceiro")}</TabsTrigger>
      </TabsList>

      <TabsContent value="numeros" className="mt-0">
        <ConnectionsClient wahaConfigured={wahaConfigured} />
      </TabsContent>

      <TabsContent value="parceiro" className="mt-0">
        {/* Sub-abas como no canal oficial, e pelo mesmo motivo: conectar e
            gerenciar definições são tarefas diferentes, e empilhá-las numa tela
            só faz a segunda sumir abaixo da dobra. O rótulo diz "do parceiro"
            para não colidir com "Templates" da barra lateral, que significa
            OUTRA coisa (respostas rápidas do atendente). */}
        <Tabs value={sub} onValueChange={(v) => irPara("parceiro", v)} className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
            <TabsTrigger value="templates">{t("Modelos do parceiro")}</TabsTrigger>
          </TabsList>
          <TabsContent value="conexao" className="mt-0">
            <CanalParceiroClient />
          </TabsContent>
          <TabsContent value="templates" className="mt-0">
            <TemplatesParceiroClient />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="oficial" className="mt-0">
        <Tabs value={sub} onValueChange={(v) => irPara("oficial", v)} className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
            {/* "Templates da Meta", não "Templates": a barra lateral já tem um item
                com esse nome que significa OUTRA coisa — respostas rápidas salvas
                pelo atendente (`/app/templates`). Dois conceitos com o mesmo rótulo
                fazem o operador clicar no errado e concluir que a tela está quebrada.
                A colisão é anterior a esta mudança; o que dá para fazer aqui é não
                agravá-la. */}
            <TabsTrigger value="templates">{t("Templates da Meta")}</TabsTrigger>
          </TabsList>
          <TabsContent value="conexao" className="mt-0">
            <CanalOficialClient />
          </TabsContent>
          <TabsContent value="templates" className="mt-0">
            <TemplatesClient />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
