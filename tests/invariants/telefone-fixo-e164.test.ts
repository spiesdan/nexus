import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * Telefone FIXO (e qualquer não-celular) também tem de virar E.164.
 *
 * O envio passa para `fn_upsert_wa_contact` o telefone só com dígitos — é o
 * `chat_id` do WAHA. A função só colocava o `+` quando o número casava com a
 * regex de CELULAR BR; fixo ia como dígitos e o INSERT em `contacts` estourava
 * `contacts_phone_e164_format` (`^\+\d{8,15}$`). A campanha registrava erro e
 * queimava a cota do dia sem mandar nada (medido em 16/11/2026: 25 das 100
 * tentativas do dia).
 *
 * Fixo COM WhatsApp existe, então a correção NÃO é pular fixo: é normalizar.
 * O celular continua igual, inclusive a promoção 12→13 — é o que a suíte
 * `nono-digito-canonico.test.ts` já vigia; aqui só entra o caso que faltava.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});

const ORG = "c0169000-0000-4000-8000-000000000312";

async function upsert(phone: string, chatId = phone): Promise<string> {
  const { rows } = await pool.query<{ fn_upsert_wa_contact: string }>(
    "select public.fn_upsert_wa_contact($1, $2, $3, $4, $5, $6)",
    [ORG, "phone", phone, null, chatId, null],
  );
  return rows[0]!.fn_upsert_wa_contact;
}

async function telefone(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ phone_number: string | null }>(
    "select phone_number from contacts where id = $1",
    [id],
  );
  return rows[0]?.phone_number ?? null;
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'org-fixo-e164', 'Fixo LTDA', 'Fixo') on conflict (id) do nothing`,
    [ORG],
  );
});

afterAll(async () => {
  await pool.query("delete from organizations where id = $1", [ORG]);
  await pool.end();
});

describe("fn_upsert_wa_contact — telefone fixo em E.164", () => {
  it("grava fixo passado só com dígitos com o +", async () => {
    const id = await upsert("554136231262");
    expect(await telefone(id)).toBe("+554136231262");
  });

  it("reencontra o fixo já cadastrado em E.164, sem duplicar", async () => {
    const primeiro = await upsert("554136231262");
    const segundo = await upsert("554136231262");
    expect(segundo).toBe(primeiro);
    const { rows } = await pool.query<{ n: string }>(
      "select count(*)::text as n from contacts where organization_id = $1 and is_merged_into is null and phone_number = '+554136231262'",
      [ORG],
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("não reescreve o fixo que já chegou em E.164", async () => {
    const id = await upsert("+554136231264");
    expect(await telefone(id)).toBe("+554136231264");
  });

  it("celular continua ganhando o nono (a regra antiga não mudou)", async () => {
    const id = await upsert("553284793301");
    expect(await telefone(id)).toBe("+5532984793301");
  });
});