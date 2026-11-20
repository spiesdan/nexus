"use client";

import { useT } from "@/hooks/i18n/useT";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNotificationPermission } from "@/hooks/notifications/useNotificationPermission";
import {
  NOTIFY_UI_CATEGORIES,
  canalLigado,
  gravarCanal,
  lerPrefs,
  prefsIniciais,
  type NotifyCategory,
  type NotifyChannelPref,
  type NotifyPrefs,
} from "@/lib/notifications/prefs";

const LABELS: Record<NotifyCategory, string> = {
  message: "Nova mensagem",
  lead_assigned: "Lead atribuído a você",
  lead_won: "Lead ganho",
  lead_lost: "Lead perdido",
  mention: "Você foi mencionado",
};

export function NotificationPrefsClient() {
  const t = useT();
  const { permission, request } = useNotificationPermission();
  // O primeiro render (SSR + hidratação) usa o padrão SEM storage; o valor
  // gravado entra num efeito, depois de o HTML casar. Ler `lerPrefs()` aqui
  // fazia o cliente discordar do servidor quando `alerts.enabled` estava "0".
  const [prefs, setPrefs] = useState<NotifyPrefs>(prefsIniciais);
  useEffect(() => {
    setPrefs(lerPrefs());
  }, []);
  const denied = permission === "denied";
  const unsupported = permission === "unsupported";

  async function onToggle(category: NotifyCategory, channel: NotifyChannelPref, on: boolean) {
    if (channel === "push" && on) {
      if (permission !== "granted") {
        const next = await request();
        if (next !== "granted") return;
      }
    }
    setPrefs(gravarCanal(category, channel, on));
  }

  return (
    <Card className="hover-raise p-0">
      {/* última tabela crua do produto (medição §100): a primitiva canônica
          de `ui/table` já traz a mesma assinatura de cabeçalho — caixa alta,
          tracking largo, `text-[10px]` — então a troca é de moldura, não de
          visual; copy, `aria-label` e testids intactos */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">{t("Categoria")}</TableHead>
            {/*
              Email fica FORA do celular: ele é o único canal ainda sem envio
              (o switch abaixo é `disabled` desde sempre), e no 390 a quarta
              coluna empurrava "Push" para fora da tela — medido na captura de
              20/11/2026. Esconder um controle que não funciona devolve a
              coluna que a pessoa usa; o aviso do topo continua dizendo que
              email não está disponível.
            */}
            <TableHead className="hidden px-4 py-3 text-center sm:table-cell">Email</TableHead>
            <TableHead className="px-4 py-3 text-center">In-app</TableHead>
            <TableHead className="px-4 py-3 text-center">Push</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {NOTIFY_UI_CATEGORIES.map((cat) => (
            <TableRow key={cat} className="last:border-0">
              <TableCell className="px-4 py-3">
                {t(LABELS[cat])}
                {cat === "message" && denied ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "O navegador bloqueou as notificações. Libere-as nas configurações do site e recarregue.",
                    )}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-center sm:table-cell">
                <Switch checked={false} disabled aria-label={`${t(LABELS[cat])} via email`} />
              </TableCell>
              <TableCell className="px-4 py-3 text-center">
                <Switch
                  checked={prefs[cat].in_app}
                  onCheckedChange={(on) => void onToggle(cat, "in_app", on)}
                  aria-label={`${t(LABELS[cat])} via in_app`}
                />
              </TableCell>
              <TableCell className="px-4 py-3 text-center">
                <Switch
                  checked={prefs[cat].push}
                  disabled={denied || unsupported}
                  onCheckedChange={(on) => void onToggle(cat, "push", on)}
                  aria-label={`${t(LABELS[cat])} via push`}
                  data-testid={cat === "message" ? (canalLigado("message", "push") ? "alerts-toggle" : "alerts-enable") : undefined}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
