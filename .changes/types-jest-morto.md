---
impacto: nada_mudou
secao: alterado
titulo: "@types/jest sai do projeto — o repositório usa vitest"
---

O Dependabot propôs bumpar `@types/jest` de 29 para 30 (PR #3), e a resposta
certa era remover o pacote. Este repositório roda **vitest**: não existe um
único `import` de `@jest/globals` ou `jest.` em `app/`, `lib/`, `components/` ou
`tests/`, e nenhum `tsconfig` referencia o pacote.

Bumpar dependência morta é manutenção de nada — e deixa o Dependabot com um PR
aberto para sempre, porque a próxima major chega do mesmo jeito. Removendo, o
PR se fecha na raiz: não havendo pacote, não há bump a propor.

A remoção é segura porque os testes importam do vitest explicitamente.
`describe`, `it` e `expect` vêm de `import { ... } from "vitest"` em cada
arquivo, e não de globais injetadas pelos types do jest. Se algum teste
dependesse das globais, o typecheck DIRIA o arquivo inteiro — e é por isso que
`tsc` limpo aqui é a prova, e não um detalhe.

Medido depois da remoção: `tsc --noEmit` limpo, `pnpm lint` com 0 erros,
`pnpm test:unit` com **792 arquivos e 8.398 testes verdes** — os mesmos números
de antes, com um pacote a menos instalado.

O que o Dependabot ainda propõe por aqui é legítimo e fica para o próximo ciclo:
o PR #134, com 52 bumps incluindo o minor do próprio `next` (16.3.3 → 16.4.0) e
do `react` (19.2.8 → 19.3.0). Esse precisou de conserto antes de passar, e o
conserto está na seção de correções desta versão.