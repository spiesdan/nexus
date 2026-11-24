# 84 — Contingência de navegação na cabine

O "Navegar" calcula a rota no OSRM. Se o cálculo falhar, o motorista não fica parado: ao lado da ação aparecem **Abrir no Google Maps** (`https://www.google.com/maps/dir/?api=1&destination=...`) e **Abrir no Waze** (`https://waze.com/ul?ll=...&navigate=yes`), em nova aba com `rel="noopener noreferrer"`, sem chave de API. Link oficial de cada um; o endereço textual só vira `destination` do Maps quando é completo — senão vale a coordenada. Sem coordenada na parada, os links **não aparecem**. A sequência continua do Nexus: ao voltar, "Entregue" está na mesma tela.

Dos quatro itens da auditoria da cabine, entrou o **item 1 (contingência)**. Ficam para a próxima entrega: barra de estado GPS/conexão (item 2), hierarquia da manobra ativa (item 3) e captura de comprovante (item 4).
