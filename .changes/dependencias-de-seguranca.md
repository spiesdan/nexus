---
impacto: nada_mudou
secao: corrigido
titulo: Uma falha crítica em dependência foi fechada, junto de seis altas
---
A auditoria de dependências encontrou uma vulnerabilidade **crítica** no SDK de
monitoramento: com a rota de túnel ativa, uma versão do `@sentry/nextjs` permitia
contornar o middleware — e é o middleware que aplica a checagem de sessão na
borda. A versão foi atualizada para a corrigida.

Junto dela subiram as correções de severidade alta e média que já tinham versão
publicada: `zod`, `undici`, `body-parser`, `hono`, `fast-uri`, `seroval`, `qs`,
`minimatch`, `glob` e `@hono/node-server`. O Next.js também foi atualizado para a
última correção da mesma série 16.4.

Continua em aberto uma severidade alta em `picomatch` (não há versão corrigida
publicada) e uma média em `uuid` que vem da CLI do Capacitor, usada em build.
Nenhuma das duas está no caminho de execução do servidor.

Para conferir na sua instalação: `pnpm audit --prod`.
