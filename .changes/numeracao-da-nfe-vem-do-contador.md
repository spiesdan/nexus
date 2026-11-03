---
impacto: nada_mudou
secao: corrigido
titulo: O número da NF-e vem de um contador, e não do número do pedido
---

O `nNF` da nota era o número do **pedido**. Os dois andam juntos só enquanto
todo pedido vira nota — e nem todo vira: cancelado, bonificação, amostra, ou
simplesmente um que ninguém faturou. Cada um desses abre um buraco na sequência
da série, e a SEFAZ cobra inutilização por cada buraco.

Agora existe um contador por emitente, em **Notas → Configuração fiscal →
"Próximo número da NF-e"**. Quem vem de outro sistema informa o último número
emitido **+ 1** e a sequência continua de lá. A reserva é atômica no banco
(`update ... returning`), então duas emissões simultâneas nunca recebem o mesmo
número.

Decisões que o código toma, todas visíveis:

- **sem número configurado, a nota não sai** — a recusa nomeia o campo. Adivinhar
  aqui queima faixa fiscal de verdade, e não há como desfazer;
- **falha antes da SEFAZ devolve o número** (certificado, validação, XML): a
  sequência continua de onde parou em vez de abrir buraco;
- **rejeição da SEFAZ e tempo esgotado consomem o número**: depois de enviar,
  reusar pode duplicar nota. O número fica no relatório de puladas para
  inutilização.

A tela mostra o número em uso na nota **antes** da transmissão, para ninguém
ficar com "sem número" enquanto uma faixa já foi consumida.
