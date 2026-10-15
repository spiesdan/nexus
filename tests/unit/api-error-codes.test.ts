/**
 * Gate do catálogo de códigos de erro da API (`lib/api/errors.ts`).
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══════════════════════════════════════════
 *
 * `fail()` aceita `ApiErrorCode | (string & {})` — o segundo ramo aceita
 * QUALQUER string, então um código inventado no call site vira contrato de
 * wire sem passar por lista nenhuma (medido: 52 códigos fora do catálogo em
 * 2026-10-15). Renomear os existentes é quebra de contrato (ex.: `conflict`
 * é comparado programaticamente em `commercial-orders/route.ts:124`), então
 * o caminho seguro é CONGELAR: nenhum código NOVO fora do catálogo.
 *
 * A allowlist abaixo só ENCOLHE: para adicionar um código, declare-o em
 * `lib/api/errors.ts` e REMOVA-O daqui no mesmo commit. Adicionar aqui é
 * proibido — o teste lista os intrusos pelo nome.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ApiErrorCodes } from "@/lib/api/errors";

const RAIZ = process.cwd();

/** Códigos fora do catálogo herdados em 2026-10-15. Só encolhe, nunca cresce. */
const FORA_DO_CATALOGO_HERDADO = new Set([
  "activity_write_failed",
  "ai_indisponivel",
  "already_terminal",
  "bad_gateway",
  "bulk_too_large",
  "channel_session_not_found",
  "conflict",
  "credencial_de_outro_provedor",
  "credencial_invalida",
  "credential_in_use",
  "credential_inactive",
  "credential_required",
  "cron_failed",
  "db_error",
  "decrypt_failed",
  "duplicate_intent_name",
  "encryption_unavailable",
  "failed_precondition",
  "internal",
  "invalid_body",
  "invalid_query",
  "knowledge_source_name_in_use",
  "label_already_used",
  "lead_stage_changed_concurrent",
  "lost_reason_required",
  "missing_idempotency_key",
  "no_active_org",
  "not_implemented",
  "owner_validation_unavailable",
  "pipeline_immutable_use_clone",
  "ponto_desconhecido",
  "proposal_not_pending",
  "query_failed",
  "reactivation_not_pending",
  "read_failed",
  "resource_not_found",
  "router_already_exists",
  "save_failed",
  "service_unavailable",
  "session_not_found",
  "skill_upload_too_large",
  "tenant_not_found",
  "tool_id_invalid",
  "trigger_stage_archived",
  "trigger_stage_missing",
  "trigger_stage_not_found",
  "unprocessable",
  "upstream_error",
  "validation_error",
  "version_immutable",
  "version_not_found",
  "waha_not_configured",
]);

function rotasDaApi(): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of fs.readdirSync(dir)) {
      const caminho = path.join(dir, nome);
      const stat = fs.statSync(caminho);
      if (stat.isDirectory()) andar(caminho);
      else if (nome === "route.ts") achados.push(caminho);
    }
  };
  andar(path.join(RAIZ, "app/api"));
  return achados;
}

describe("catálogo de códigos de erro da API", () => {
  it("nenhum fail() usa código novo fora do catálogo", () => {
    const catalogo: Set<string> = new Set(Object.values(ApiErrorCodes));
    const novos: string[] = [];
    for (const rota of rotasDaApi()) {
      const fonte = fs.readFileSync(rota, "utf8");
      for (const m of fonte.matchAll(/fail\(\s*["']([a-z_0-9]+)["']/g)) {
        const codigo = m[1] as string;
        if (!catalogo.has(codigo) && !FORA_DO_CATALOGO_HERDADO.has(codigo)) {
          novos.push(`${codigo} (em ${path.relative(RAIZ, rota)})`);
        }
      }
    }
    expect(novos, "código novo fora de lib/api/errors.ts — declare lá e remova da allowlist").toEqual(
      [],
    );
  });

  it("a allowlist só encolhe: código herdado que sumiu das rotas sai da lista", () => {
    const emUso = new Set<string>();
    for (const rota of rotasDaApi()) {
      const fonte = fs.readFileSync(rota, "utf8");
      for (const m of fonte.matchAll(/fail\(\s*["']([a-z_0-9]+)["']/g)) {
        emUso.add(m[1] as string);
      }
    }
    const sobrando = [...FORA_DO_CATALOGO_HERDADO].filter((c) => !emUso.has(c));
    expect(sobrando, "código herdado sem uso — remova da allowlist").toEqual([]);
  });
});
