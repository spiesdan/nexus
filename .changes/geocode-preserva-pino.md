---
impacto: nada_mudou
secao: corrigido
titulo: Falha do geocodificador não apaga mais o pino do endereço
---

Na regeocodificação, quando o provedor devolvia `estado: "erro"`, o patch
gravava `latitude: null`/`longitude: null` e o pino válido que já estava no mapa
desaparecia — falha de rede virava perda de dado. Agora a falha grava só o aviso
(`geo_status`, `geo_em`, `geo_fonte`); a coordenada anterior fica intacta até uma
regeocodificação bem-sucedida.
