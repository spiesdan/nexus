#!/usr/bin/env tsx
/**
 * PLAYBOOK DE PLATAFORMA — aplica o arquivo versionado na instância.
 *
 * ═══ O DEFEITO QUE ESTE SCRIPT EXISTE PARA CONSERTAR ═══
 *
 * `lib/agent-engine/playbooks/platform.md` é a fonte canônica, copiada para o
 * container. O worker só a LÊ no primeiro boot de uma instalação limpa
 * (`seedPlatformPlaybook`), e a regra dura nº 10 manda não mexer em ponteiro
 * existente — certo, e por isso mesmo. Efeito medido em 2026-10-16: a seção
 * "Oferta de produtos" estava no arquivo desde a v1.26.x e **não existia no
 * banco** (1711 caracteres, sem a seção). Ou seja: a instrução que separava
 * vassoura de cabo de vassoura foi escrita, versionada, testada — e nunca
 * chegou a nenhum agente. O sintoma (a IA confundindo pá com vassoura) foi
 * então attributed ao modelo, quando o defeito era de entrega.
 *
 * ═══ POR QUE UM SCRIPT E NÃO UM SEED ═══
 *
 * Mover ponteiro de camada é ato deliberado — por isso ele não pode rodar
 * sozinho a cada boot. Aqui ele é: (1) explícito, (2) mostra o diff antes de
 * gravar, (3) grava uma NOVA versão (histórico preservado — versão publicada
 * é imutável, mesmo para playbook), (4) reversível pela versão anterior.
 *
 * Sem `--aplicar`, nada é gravado: o script só mostra a diferença.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { validatePlaybookLayerContent } from '@/lib/agent-engine/agent/playbook';

const ARQUIVO = path.join(process.cwd(), 'lib', 'agent-engine', 'playbooks', 'platform.md');

function conexao(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'sem DATABASE_URL: este script fala com o Postgres da própria instância, não com o Supabase gerenciado.',
    );
  }
  return url;
}

/** Linhas que existem no arquivo e não na versão em uso (ou o contrário). */
function diferenca(atual: string, novo: string): string[] {
  const linhasAtuais = new Set(atual.split('\n').map((l) => l.trimEnd()));
  return novo
    .split('\n')
    .filter((l) => l.trim().length > 0 && !linhasAtuais.has(l.trimEnd()));
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const conteudo = readFileSync(ARQUIVO, 'utf8');
  validatePlaybookLayerContent(conteudo);

  const pool = new pg.Pool({ connectionString: conexao() });
  try {
    const { rows } = await pool.query<{ conteudo: string; versao: string }>(
      `select pv.content as conteudo, pv.id as versao
         from playbook_pointers pp
         join playbook_versions pv on pv.id = pp.version_id
        where pp.organization_id is null and pp.layer = 'platform'`,
    );
    const emUso = rows[0];

    if (!emUso) {
      process.stdout.write(
        'A instância ainda não tem playbook de plataforma — o worker faz o seed no primeiro boot.\n' +
          'Nada a fazer aqui.\n',
      );
      return;
    }

    if (emUso.conteudo === conteudo) {
      process.stdout.write('O playbook da instância já é igual ao arquivo. Nada a fazer.\n');
      return;
    }

    const novas = diferenca(emUso.conteudo, conteudo);
    process.stdout.write(
      [
        `Playbook de plataforma em uso: versão ${emUso.versao} (${emUso.conteudo.length} caracteres)`,
        `Arquivo versionado:            ${conteudo.length} caracteres`,
        '',
        `Linhas que a instância NÃO tem (${novas.length}):`,
        ...novas.map((l) => `  + ${l}`),
        '',
        aplicar ? 'Gravando nova versão e movendo o ponteiro…' : 'Nada foi gravado ( rode com --aplicar ).',
        '',
      ].join('\n'),
    );
    if (!aplicar) return;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('playbook_platform_apply'))");
      const { rows: criada } = await client.query<{ id: string }>(
        `insert into playbook_versions (organization_id, layer, content)
         values (null, 'platform', $1) returning id`,
        [conteudo],
      );
      const novaVersao = criada[0]?.id;
      if (!novaVersao) throw new Error('insert não devolveu versão');
      const { rows: ponteiro } = await client.query<{ organization_id: string | null }>(
        `update playbook_pointers
            set version_id = $1
          where organization_id is null and layer = 'platform'
        returning organization_id`,
        [novaVersao],
      );
      if (ponteiro.length === 0) throw new Error('ponteiro de plataforma não existe');
      await client.query('commit');
      process.stdout.write(
        `✔ nova versão ${novaVersao} no ar (a anterior ${emUso.versao} continua no histórico).\n`,
      );
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`\nERRO: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
