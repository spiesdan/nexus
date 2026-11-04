---
impacto: nada_mudou
secao: corrigido
titulo: NF-e passa a sair com IBS/CBS, IPI e os mesmos indicadores do emissor anterior
---

Comparado com um XML **autorizado** do Odivix (nNF 4575, produção), o nosso
saía diferente em pontos que a SEFAZ confere:

- **sem o grupo `IBSCBS`** — o `Make` do `sped-nfe` só injeta IBS/CBS quando é
  construído com o schema **PL_010**; com o padrão (`PL_009`) a tag é
  **descartada em silêncio**, sem erro. Agora vai CST 000, `cClassTrib` 000001,
  IBS-UF 0,10% e CBS 0,90% por item, mais o `IBSCBSTot` e o `vNFTot`;
- **sem IPI** — o emissor anterior manda `IPINT` CST 53 em toda venda;
- **`indPres` 9** contra 0, e `indIntermed` que o XML autorizado não tem;
- **`indFinal`**: passa a ser 0 para CNPJ e 1 para CPF, como no XML autorizado
  (a regra anterior olhava o `indicador_ie` e mandava 1 para isento);
- **`modFrete` 9** contra 0 (por conta do emitente).

O número da série também veio de lá: o Odivix está na **sequência 4576** com a
última nota 4575 autorizada, e é esse valor que ficou no campo de numeração.
