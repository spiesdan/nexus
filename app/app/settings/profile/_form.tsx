"use client";
import { useState, useTransition } from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/nexus-ui/forms/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "@/app/actions/settings/updateProfile";
import { useT } from "@/hooks/i18n/useT";
import { profileSchema, SEM_PREFERENCIA_DE_IDIOMA, type Locale } from "@/lib/schemas/settings";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Recife",
  "America/Fortaleza",
  "UTC",
];

interface Props {
  email: string;
  initialFullName: string | null;
  initialAvatarUrl: string | null;
  initialLocale: Locale | typeof SEM_PREFERENCIA_DE_IDIOMA;
  initialTimezone: string;
}

export function ProfileForm({
  email,
  initialFullName,
  initialAvatarUrl,
  initialLocale,
  initialTimezone,
}: Props) {
  const t = useT();
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [locale, setLocale] = useState<Locale | typeof SEM_PREFERENCIA_DE_IDIOMA>(initialLocale);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({
      full_name: fullName || null,
      locale,
      timezone,
      avatar_url: avatarUrl || null,
    });
    if (!parsed.success) {
      toast.error(t("Dados inválidos."));
      return;
    }
    startTransition(async () => {
      const r = await updateProfile(parsed.data);
      if (r.ok) toast.success(t("Perfil atualizado."));
      else toast.error(`${t("Erro")}: ${r.error}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <Card className="hover-raise space-y-4 p-6">
        <FormField label={t("Email")} id="email" hint={t("Trocar email — em breve.")}>
          <Input value={email} disabled />
        </FormField>
        <FormField label={t("Nome completo")} id="full_name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t("Idioma")} id="locale">
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PREFERENCIA_DE_IDIOMA}>
                  {t("Seguir o idioma da empresa")}
                </SelectItem>
                <SelectItem value="pt-BR">Português (BR)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("Fuso horário")} id="timezone">
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField
          label="Avatar URL"
          id="avatar_url"
          hint={t("Upload de arquivo — em breve. Cole uma URL pública.")}
        >
          <Input
            type="url"
            placeholder="https://…"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </FormField>
        <div className="flex sm:justify-end">
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
