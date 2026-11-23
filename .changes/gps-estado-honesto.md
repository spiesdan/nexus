---
impacto: nada_mudou
secao: corrigido
titulo: Painel diz quando o GPS do motorista está sem sinal, em vez de "online"
---

O mapa da expedição marcava a última posição do motorista sem dizer quando ela
foi recebida — posição antiga parecia presença confirmada. Agora o painel mostra
“Última posição às HH:MM” e, passado o limite, “sem sinal há N min”; sem posição,
diz explicitamente que não recebeu nenhuma. O limite vem de
`GPS_SEM_SINAL_MINUTOS` (padrão 15), e `PHOTON_URL` passa a ser declarado em
`lib/env.ts` e nos dois templates de ambiente.
