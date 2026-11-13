---
impacto: capacidade_nova
secao: adicionado
titulo: Recuperação de endereços com confiança auditável
---

A expedição ganha o **Address Recovery Engine**: quando o endereço de uma entrega não localiza, o sistema tenta recuperá-lo em cinco passos — endereço original, normalização (acento, abreviação, CEP), correção de digitação, busca por componentes e provedor alternativo (Photon, opcional) — e **mostra ao operador o que encontrou, com que confiança e por quê**.

O ponto central é a régua: **correção automática só acontece com confiança alta, componentes verificáveis do provedor e precisão de rua ou número**. UF, CEP ou município divergente são vetos duros que nunca corrigem sozinhos; centroide de bairro ou cidade nunca vira pino de entrega; e o Photon sugere, não decide. Quando a evidência não fecha, o destino fica **aguardando confirmação** em vez de receber um ponto inventado — a regra é preferir pedir confirmação humana a mandar o motorista ao endereço errado.

**Nada é sobrescrito.** O endereço que o vendedor digitou fica em `endereco_original`, imutável; o que o sistema encontrou vai para `endereco_recuperado`. Toda tentativa vira uma linha append-only em `shipment_destination_recoveries` (provedor, consulta, candidato, score, motivo, autor, data) — é o histórico auditável e a base da reversão. Desfazer uma correção volta ao original e registra mais uma linha; o histórico nunca é apagado.

**A otimização passa a exigir endereço resolvido.** Cargas com destino sem coordenada válida ou aguardando confirmação são recusadas com a lista dos pendentes, em vez de sair com um pino errado. O operador pode seguir mesmo assim por decisão explícita (`ignorar_pendentes`), e a tela pergunta antes. Cargas que já existiam não param: destino com pino válido é marcado como resolvido pelo backfill da migration.

**O planejador ganhou o painel de recuperação**: contadores por estado, botão para recuperar em lote, a lista com original e sugerido lado a lado, confiança, método e motivo, e as ações **confirmar**, **rejeitar** e **desfazer**. A sugestão continua disponível depois de recarregar a página — ela é lida do histórico, não da memória da tela.
