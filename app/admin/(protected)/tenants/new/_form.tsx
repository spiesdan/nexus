"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/nexus-ui/forms/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTenant } from "@/hooks/useCreateTenant";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { ApiError } from "@/lib/api/types";
import { useT } from "@/hooks/i18n/useT";

// ---------------------------------------------------------------------------
// Schema (mirrors server Zod; client keeps it in sync)
// ---------------------------------------------------------------------------

const formSchema = z.object({
  display_name: z.string().min(2, "Mínimo 2 caracteres").max(120, "Máximo 120 caracteres"),
  slug: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(40, "Máximo 40 caracteres")
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  legal_name: z.string().min(2).max(255).optional().or(z.literal("")),
  cnpj: z.string().optional().or(z.literal("")),
  plan: z.enum(["standard", "pro", "enterprise"]),
  owner_email: z.string().email("E-mail inválido"),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// CNPJ mask
// ---------------------------------------------------------------------------

function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

export function NewTenantForm() {
  const t = useT();
  const router = useRouter();
  const createTenant = useCreateTenant();
  const [slugLocked, setSlugLocked] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      display_name: "",
      slug: "",
      legal_name: "",
      cnpj: "",
      plan: "standard",
      owner_email: "",
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  // Auto-generate slug from display_name until user edits slug manually
  const handleDisplayNameChange = (value: string) => {
    setValue("display_name", value);
    if (!slugLocked) {
      setValue("slug", slugify(value), { shouldValidate: true });
    }
  };

  const handleSlugChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setValue("slug", clean, { shouldValidate: true });
    setSlugLocked(clean.length > 0);
  };

  const handleCnpjChange = (value: string) => {
    setValue("cnpj", maskCnpj(value));
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await createTenant.mutateAsync({
        display_name: values.display_name,
        slug: values.slug,
        legal_name: values.legal_name || undefined,
        cnpj: values.cnpj || undefined,
        plan: values.plan,
        owner_email: values.owner_email,
      });

      toast.success(t("Tenant criado com sucesso!"));
      router.push(`/admin/tenants/${result.data.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "conflict") {
          form.setError("slug", { message: t("Este slug já está em uso") });
          return;
        }
        toast.error(`${t("Erro ao criar tenant:")} ${err.message}`);
      } else {
        toast.error(t("Erro inesperado ao criar tenant"));
      }
    }
  });

  const planValue = watch("plan");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <NexusPageHeader
        title={t("Novo Tenant")}
        subtitle={`${t("Cria um novo tenant com status")} onboarding.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Dados do tenant")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {/* display_name */}
            <FormField
              label={t("Nome de exibição")}
              id="display_name"
              obrigatorio
              erro={errors.display_name ? t(errors.display_name.message ?? "") : undefined}
            >
              <Input
                placeholder={t("Loja da Maria")}
                {...register("display_name")}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
              />
            </FormField>

            {/* slug */}
            <FormField
              label="Slug"
              id="slug"
              obrigatorio
              hint={t("Apenas letras minúsculas, números e hífens. Gerado automaticamente.")}
              erro={errors.slug ? t(errors.slug.message ?? "") : undefined}
            >
              <Input
                placeholder="tienda-de-maria"
                {...register("slug")}
                onChange={(e) => handleSlugChange(e.target.value)}
                className="font-mono"
              />
            </FormField>

            {/* legal_name */}
            <FormField
              label={t("Razão social")}
              id="legal_name"
              erro={errors.legal_name ? t(errors.legal_name.message ?? "") : undefined}
            >
              <Input placeholder={t("Maria da Silva LTDA")} {...register("legal_name")} />
            </FormField>

            {/* cnpj */}
            <FormField
              label="CNPJ"
              id="cnpj"
              erro={errors.cnpj ? t(errors.cnpj.message ?? "") : undefined}
            >
              <Input
                placeholder="00.000.000/0000-00"
                {...register("cnpj")}
                onChange={(e) => handleCnpjChange(e.target.value)}
                inputMode="numeric"
                maxLength={18}
                className="font-mono"
              />
            </FormField>

            {/* plan */}
            <FormField
              label={t("Plano")}
              id="plan"
              erro={errors.plan ? t(errors.plan.message ?? "") : undefined}
            >
              <Select
                value={planValue}
                onValueChange={(v) =>
                  setValue("plan", v as "standard" | "pro" | "enterprise")
                }
              >
                <SelectTrigger id="plan" aria-label={t("Plano")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {/* owner_email */}
            <FormField
              label={t("E-mail do responsável")}
              id="owner_email"
              obrigatorio
              erro={errors.owner_email ? t(errors.owner_email.message ?? "") : undefined}
            >
              <Input
                type="email"
                placeholder="responsable@empresa.com"
                {...register("owner_email")}
              />
            </FormField>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("Criando...") : t("Criar tenant")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                {t("Cancelar")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
