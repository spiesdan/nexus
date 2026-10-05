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
import { updateTenant } from "@/app/actions/settings/updateTenant";
import { useT } from "@/hooks/i18n/useT";
import { tenantSchema, type Locale, type TenantInput } from "@/lib/schemas/settings";

interface Props {
  initial: TenantInput;
}

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Recife",
  "America/Fortaleza",
  "UTC",
];

export function TenantForm({ initial }: Props) {
  const t = useT();
  const [form, setForm] = useState<TenantInput>(initial);
  const [reasonsText, setReasonsText] = useState((initial.lost_reasons_extra ?? []).join(", "));
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof TenantInput>(key: K, value: TenantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reasons = reasonsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const candidate = { ...form, lost_reasons_extra: reasons };
    const parsed = tenantSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(t("Dados inválidos."));
      return;
    }
    startTransition(async () => {
      const r = await updateTenant(parsed.data);
      if (r.ok) toast.success(t("Organização atualizada."));
      else toast.error(`${t("Erro")}: ${r.error}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Card className="hover-raise space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t("Nome de exibição")} id="display_name">
            <Input
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              required
            />
          </FormField>
          <FormField label={t("Razão social")} id="legal_name">
            <Input
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              required
            />
          </FormField>
          <FormField label="CNPJ" id="cnpj">
            <Input
              value={form.cnpj ?? ""}
              onChange={(e) => set("cnpj", e.target.value || null)}
            />
          </FormField>
          <FormField label={t("Telefone")} id="phone">
            <Input
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value || null)}
              placeholder="(47) 98496-0797"
            />
          </FormField>
          <FormField label="DPO email" id="dpo_email">
            <Input
              type="email"
              value={form.dpo_email ?? ""}
              onChange={(e) => set("dpo_email", e.target.value || null)}
            />
          </FormField>
          <FormField label={t("Fuso horário")} id="timezone">
            <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
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
          <FormField label={t("Idioma")} id="locale">
            <Select value={form.locale} onValueChange={(v) => set("locale", v as Locale)}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (BR)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("Retenção de mídia (dias)")} id="media_retention_days">
            <Input
              type="number"
              min={30}
              max={3650}
              value={form.media_retention_days}
              onChange={(e) => set("media_retention_days", Number(e.target.value))}
            />
          </FormField>
          <FormField label={t("URL política de privacidade")} id="privacy_policy_url">
            <Input
              type="url"
              value={form.privacy_policy_url ?? ""}
              onChange={(e) => set("privacy_policy_url", e.target.value || null)}
            />
          </FormField>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <div>
            <h2 className="text-sm font-medium text-text">{t("Endereço da empresa")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("Impresso no cabeçalho do pedido, ao lado do telefone. Vazio não imprime.")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("Logradouro")} id="logradouro" className="col-span-2">
              <Input
                value={form.logradouro ?? ""}
                onChange={(e) => set("logradouro", e.target.value || null)}
                placeholder={t("Rua, avenida…")}
              />
            </FormField>
            <FormField label={t("Número")} id="numero_end">
              <Input
                value={form.numero_end ?? ""}
                onChange={(e) => set("numero_end", e.target.value || null)}
              />
            </FormField>
            <FormField label={t("Complemento")} id="complemento">
              <Input
                value={form.complemento ?? ""}
                onChange={(e) => set("complemento", e.target.value || null)}
              />
            </FormField>
            <FormField label={t("Bairro")} id="bairro">
              <Input
                value={form.bairro ?? ""}
                onChange={(e) => set("bairro", e.target.value || null)}
              />
            </FormField>
            <FormField label={t("CEP")} id="cep">
              <Input
                value={form.cep ?? ""}
                onChange={(e) => set("cep", e.target.value || null)}
                placeholder="00000-000"
              />
            </FormField>
            <FormField label={t("Cidade")} id="cidade">
              <Input
                value={form.cidade ?? ""}
                onChange={(e) => set("cidade", e.target.value || null)}
              />
            </FormField>
            <FormField label="UF" id="uf">
              <Input
                maxLength={2}
                value={form.uf ?? ""}
                onChange={(e) => set("uf", e.target.value.toUpperCase())}
              />
            </FormField>
          </div>
        </div>

        <FormField
          label={t("Motivos de perda extras (separados por vírgula)")}
          id="lost_reasons"
          hint={t("Adicionados ao set padrão. Cada pipeline pode ter seus próprios motivos.")}
        >
          <Input
            value={reasonsText}
            onChange={(e) => setReasonsText(e.target.value)}
            placeholder={t("ex: Sem orçamento, Concorrente")}
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
