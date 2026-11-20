"use client";
import { useState, useTransition } from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { RodapeDeSalvamento, useAvisoDeSaida } from "@/components/nexus-ui/forms/rodape-de-salvamento";
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
import { primeiraMensagemDeCampo } from "@/lib/forms/mensagem-de-validacao";
import { profileSchema, SEM_PREFERENCIA_DE_IDIOMA, type Locale } from "@/lib/schemas/settings";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Recife",
  "America/Fortaleza",
  "UTC",
];

/** Os quatro campos numa string comparável — a régua do "sujo". */
function instantaneo(valores: {
  fullName: string;
  locale: string;
  timezone: string;
  avatarUrl: string;
}): string {
  return JSON.stringify(valores);
}

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
  const [salvo, setSalvo] = useState(() =>
    instantaneo({ fullName: initialFullName ?? "", locale: initialLocale, timezone: initialTimezone, avatarUrl: initialAvatarUrl ?? "" }),
  );
  const [isPending, startTransition] = useTransition();
  const sujo =
    instantaneo({ fullName, locale, timezone, avatarUrl }) !== salvo;
  useAvisoDeSaida(sujo && !isPending);
  const rotulos: Record<string, string> = {
    full_name: t("Nome completo"),
    locale: t("Idioma"),
    timezone: t("Fuso horário"),
    avatar_url: t("Avatar"),
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({
      full_name: fullName || null,
      locale,
      timezone,
      avatar_url: avatarUrl || null,
    });
    if (!parsed.success) {
      toast.error(primeiraMensagemDeCampo(parsed.error.flatten(), rotulos, t("Dados inválidos.")));
      return;
    }
    startTransition(async () => {
      const r = await updateProfile(parsed.data);
      if (r.ok) {
        setSalvo(
          instantaneo({
            fullName: parsed.data.full_name ?? "",
            locale: parsed.data.locale,
            timezone: parsed.data.timezone,
            avatarUrl: parsed.data.avatar_url ?? "",
          }),
        );
        toast.success(t("Perfil atualizado."));
      }
      else {
        const padrao = `${t("Erro")}: ${r.error}`;
        toast.error(
          r.details
            ? primeiraMensagemDeCampo(r.details, rotulos, padrao)
            : padrao,
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <Card className="hover-raise space-y-4 p-6">
        <FormField label={t("Email")} id="email" hint={t("O email não pode ser alterado por aqui.")}>
          <Input value={email} disabled />
        </FormField>
        <FormField label={t("Nome completo")} id="full_name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
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
          hint={t("O upload ainda não está disponível: cole a URL pública de uma imagem.")}
        >
          <Input
            type="url"
            placeholder="https://…"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </FormField>
        <RodapeDeSalvamento sujo={sujo} salvando={isPending} />
      </Card>
    </form>
  );
}
