#!/usr/bin/env tsx
/**
 * ESTUDO DO CATÁLOGO — classifica TODOS os produtos de uma organização e
 * escreve o SQL que preenche a descrição que falta.
 *
 * ═══ POR QUE ISTO EXISTE ═══
 *
 * Medido em 2026-10-16 na org da VPS: **1137 produtos ativos, 1137 sem
 * descrição**. O assistente não tinha com o que responder "me manda foto /
 * o que é isso / tem isso?" além do nome em caixa alta — e nome de catálogo é
 * escrito para o olho humano. Daí a vassoura que voltou como cabo avulso e a
 * pá com coletor que voltou como vassoura.
 *
 * ═══ O QUE ESTE SCRIPT FAZ, E O QUE NÃO FAZ ═══
 *
 * - Lê a ficha determinística de cada produto (`lib/catalogo/ficha-do-produto`):
 *   tipo (simples/kit/acessório), itens do conjunto, medida, concentração,
 *   quantidade por embalagem. NADA é inventado — tudo sai do nome, categoria,
 *   marca e descrição que a LOJA cadastrou.
 * - Gera o SQL que preenche `descricao` APENAS onde está vazia. Produto com
 *   texto da loja não é tocado: a loja é dona da palavra do produto.
 * - Imprime o ESTUDO completo (os 1137, com tipo e descrição proposta) em
 *   arquivo, para leitura humana. Nada de produto de fora: a saída lista
 *   todos, e a contagem no fim confere.
 *
 * ═══ INÉRCIA ═══
 *
 * Por padrão SÓ escreve os arquivos (SQL e estudo) e NÃO toca no banco: quem
 * aplica é o operador, com o SQL na mão. `--aplicar` grava direto, e é o
 * caminho de quem já leu o estudo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { fichaDoProduto } from '@/lib/catalogo/ficha-do-produto';
import { env } from '@/lib/env';

function arg(nome: string): string | null {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
}

function escapa(valor: string): string {
  return valor.replace(/'/g, "''");
}

async function main(): Promise<void> {
  const organizationId = arg('org');
  const aplicar = process.argv.includes('--aplicar');
  const destino = arg('saida') ?? 'docs/auditorias/catalogo';
  if (!organizationId) {
    throw new Error(
      'informe a organização: `--org=<uuid>`. Sem ela o script não sabe de qual loja falar.',
    );
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('catalog_products')
    .select('id, codigo, nome, descricao, categoria, marca, ativo')
    .eq('organization_id', organizationId)
    .order('nome');
  if (error) throw new Error(`ler_catalogo_falhou: ${error.message}`);

  const produtos = data ?? [];
  const linhas: string[] = [];
  const contagem = { simples: 0, kit: 0, acessorio: 0, sem_mudanca: 0 } as Record<string, number>;
  const atualizacoes: Array<{ id: string; codigo: string; nome: string; descricao: string }> = [];

  for (const p of produtos) {
    const ficha = fichaDoProduto({
      nome: p.nome ?? '',
      descricao: p.descricao,
      categoria: p.categoria,
      marca: p.marca,
    });
    contagem[ficha.tipo] = (contagem[ficha.tipo] ?? 0) + 1;
    const proposta = (p.descricao ?? '').trim() || ficha.descricao;
    if (!proposta || (p.descricao ?? '').trim().length > 0) {
      contagem.sem_mudanca = (contagem.sem_mudanca ?? 0) + 1;
    } else {
      atualizacoes.push({ id: p.id, codigo: p.codigo, nome: p.nome, descricao: proposta });
    }
    linhas.push(
      [
        `- **${p.codigo}** — ${p.nome}`,
        `  - tipo: \`${ficha.tipo}\``,
        ficha.itens.length > 0 ? `  - itens: ${ficha.itens.join(' + ')}` : null,
        ficha.medida ? `  - medida: ${ficha.medida}` : null,
        ficha.concentracao ? `  - concentração: ${ficha.concentracao}` : null,
        ficha.quantidadeEmbalagem !== null
          ? `  - embalagem: ${ficha.quantidadeEmbalagem} unidades`
          : null,
        `  - descrição: ${(p.descricao ?? '').trim() || proposta || '_(sem dado no cadastro)_'}`,
        p.ativo === false ? '  - inativo' : null,
      ]
        .filter((l) => l !== null)
        .join('\n'),
    );
  }

  mkdirSync(destino, { recursive: true });
  const carimbo = new Date().toISOString().slice(0, 10);
  const sql = [
    `-- Estudo do catálogo ${organizationId} — ${carimbo}`,
    `-- ${atualizacoes.length} de ${produtos.length} produtos recebem descrição;`,
    `-- o resto já tem texto da loja e NÃO é tocado.`,
    `-- Gerado por scripts/estudar-catalogo.ts. Revise antes de aplicar.`,
    'begin;',
    ...atualizacoes.map(
      (a) => `update catalog_products set descricao = '${escapa(a.descricao)}' where id = '${a.id}';`,
    ),
    'commit;',
    '',
  ].join('\n');
  writeFileSync(path.join(destino, `preencher-descricoes-${carimbo}.sql`), sql, 'utf8');

  const estudo = [
    `# Estudo do catálogo — ${organizationId} (${carimbo})`,
    '',
    `Produtos: **${produtos.length}**. Sem descrição cadastrada: **${
      produtos.length - contagem.sem_mudanca!
    }**.`,
    `Tipos: ${contagem.simples} produto único, ${contagem.kit} kit/conjunto, ${contagem.acessorio} peça de reposição.`,
    '',
    '> Descrição em CAIXA ALTA é a que o cliente recebe; a proposta aqui é o que o',
    '> assistente passa a saber sobre cada produto. Todo item aparece — nenhum foi',
    '> pulado, e a contagem no fim confere com o total.',
    '',
    ...linhas,
    '',
    `**Conferência:** ${contagem.simples + contagem.kit + contagem.acessorio} produtos classificados = ${produtos.length} lidos.`,
    '',
  ].join('\n');
  writeFileSync(path.join(destino, `estudo-catalogo-${carimbo}.md`), estudo, 'utf8');

  loggerResumo(organizationId, produtos.length, contagem, atualizacoes.length, destino);

  if (aplicar) {
    for (const a of atualizacoes) {
      const { error: errAtual } = await supabase
        .from('catalog_products')
        .update({ descricao: a.descricao })
        .eq('id', a.id);
      if (errAtual) throw new Error(`atualizar_${a.codigo}_falhou: ${errAtual.message}`);
    }
    process.stdout.write(`\n✔ ${atualizacoes.length} descrições gravadas.\n`);
  } else {
    process.stdout.write(
      `\nNada foi gravado no banco. Revise o SQL e aplique, ou rode com --aplicar.\n`,
    );
  }
}

function loggerResumo(
  org: string,
  total: number,
  contagem: Record<string, number>,
  aGravar: number,
  destino: string,
): void {
  process.stdout.write(
    [
      `Organização: ${org}`,
      `Produtos lidos: ${total} (todos, nenhum pulado)`,
      `  produto único: ${contagem.simples}`,
      `  kit/conjunto:  ${contagem.kit}`,
      `  acessório:     ${contagem.acessorio}`,
      `Sem mudança (descrição da loja preservada): ${contagem.sem_mudanca}`,
      `Descrições a gravar: ${aGravar}`,
      `Arquivos: ${destino}/`,
      '',
    ].join('\n'),
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`\nERRO: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
