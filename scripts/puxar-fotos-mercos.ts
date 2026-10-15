/**
 * Puxa fotos do Mercos para produtos que não têm nenhuma (fase 2).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/puxar-fotos-mercos.ts <pull.json> [--apply]
 *
 * `<pull.json>`: { [codigo: string]: { via: "codigo"|"nome", foto: string, product_id: string } }
 * - `via: codigo` = o código do CRM existe no Mercos com foto;
 * - `via: nome` = o código NÃO existe no Mercos; a foto veio de linha SEM
 *   código cujo nome normalizado é IDÊNTICO ao do produto (não é fuzzy —
 *   igualdade exata após lower + sem acento).
 *
 * Sem `--apply`, só baixa e valida (dry-run). Com `--apply`, sobe para o
 * bucket `product-images` e registra em `product_images` (posicao 0) —
 * as MESMAS convenções de `docs/legacy/mercos-scrape/importar-fotos.ts`
 * (`{orgId}/{productId}/{uuid}.{ext}`, teto de 2 MB, só jpg/png/webp por
 * magic bytes). Pula produto que já tem foto: rerun é seguro.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const MAX_BYTES = 2 * 1024 * 1024;

const PullSchema = z.record(
  z.string(),
  z.object({
    via: z.enum(["codigo", "nome"]),
    foto: z.string().url(),
    product_id: z.string().uuid(),
  }),
);

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function tipoDe(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  return null;
}

async function baixar(url: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    const ext = tipoDe(buf);
    return ext ? { bytes: buf, ext } : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const arquivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!arquivo) {
    log("uso: tsx scripts/puxar-fotos-mercos.ts <pull.json> [--apply]");
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no env");
  const admin = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

  const pull = PullSchema.parse(JSON.parse(readFileSync(arquivo, "utf8")));
  const orgId = (
    await admin.from("organizations").select("id").eq("slug", "bill-higiene-limpeza").maybeSingle()
  ).data?.id as string | undefined;
  if (!orgId) throw new Error('organização "bill-higiene-limpeza" não encontrada');

  // Só quem SEGUE sem foto: rerun não duplica. Duas varreduras paginadas
  // em vez de N+1 (uma por produto) — com 1139 produtos a diferença é de
  // segundos para minutos.
  const comFoto = new Set<string>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("product_images")
      .select("product_id")
      .eq("organization_id", orgId)
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data as { product_id: string }[]) comFoto.add(r.product_id);
    if (data.length < 1000) break;
  }

  const fila = Object.entries(pull).filter(([, v]) => !comFoto.has(v.product_id));
  log(`alvos no pull: ${Object.keys(pull).length} | ainda sem foto: ${fila.length}`);

  let baixadas = 0;
  const prontas: { codigo: string; productId: string; bytes: Uint8Array; ext: string }[] = [];
  for (const [codigo, v] of fila) {
    const dl = await baixar(v.foto);
    if (!dl) {
      log(`  pula ${codigo}: download falhou`);
      continue;
    }
    baixadas++;
    prontas.push({ codigo, productId: v.product_id, bytes: dl.bytes, ext: dl.ext });
  }
  log(`baixadas e válidas: ${prontas.length}/${fila.length}`);

  if (!apply) {
    log("SEM GRAVAR. rode de novo com --apply para subir e registrar.");
    return;
  }
  let gravadas = 0;
  for (const p of prontas) {
    const caminho = `${orgId}/${p.productId}/${randomUUID()}.${p.ext}`;
    const { error: eUp } = await admin.storage.from("product-images").upload(caminho, p.bytes, {
      contentType:
        p.ext === "jpg" ? "image/jpeg" : p.ext === "png" ? "image/png" : "image/webp",
      upsert: false,
    });
    if (eUp) {
      log(`  erro upload ${p.codigo}: ${eUp.message.slice(0, 80)}`);
      continue;
    }
    const { error: eIns } = await admin.from("product_images").insert({
      organization_id: orgId,
      product_id: p.productId,
      storage_path: caminho,
      posicao: 0,
    });
    if (eIns) {
      await admin.storage.from("product-images").remove([caminho]);
      log(`  erro insert ${p.codigo}: ${eIns.message.slice(0, 80)}`);
      continue;
    }
    gravadas++;
  }
  log(`gravadas: ${gravadas}/${prontas.length}`);
}

main().catch((e: unknown) => {
  log(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
