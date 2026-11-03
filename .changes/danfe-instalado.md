---
impacto: nada_mudou
secao: corrigido
titulo: DANFE passa a existir — o pacote estava como "sugestão" e nunca foi instalado
---

O endpoint do DANFE respondia **422 "DANFE_INDISPONIVEL"** para toda nota. Não
era falta de código: o `fiscal/sidecar` chamava `NFePHP\DA\NFe\Danfe` desde o
começo, mas o pacote `nfephp-org/sped-da` estava em **`suggest`** no
`composer.json` — e `suggest` não é instalado. A imagem saía sem ele, e a rota
nunca conseguia gerar um PDF.

Agora o pacote está em `require` e entra no build. O layout é o 4.00 padrão
(canhoto, código de barras, chave, duplicatas, impostos), medido com um
`nfeProc` real: 65 KB de PDF, uma página. `tests/unit/fiscal-danfe.test.ts`
passa a reprovar a volta para `suggest`.

O que o DANFE **ainda não** mostra, e depende de dado que não existe na
instalação:

- **valor aproximado dos tributos** (Lei da Transparência): o XML não leva
  `vTotTrib` e a tabela `fiscal_ibpt` está vazia — o bloco sai zerado;
- **IBS/CBS** da reforma: o leiaute renderizado é o anterior a esses campos.
