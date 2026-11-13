"""VRPTW multi-veiculo via Google OR-Tools (servico Python independente).

Fronteira: este modulo recebe pontos de entrega + veiculos (capacidade e
jornada) e retorna a distribuicao de paradas por veiculo com a sequencia
rodoviaria. Nenhum detalhe de persistencia/DB vive aqui — o contrato e a API
Pydantic.

Entrada de distancias: matriz OSRM (`app.osrm.matrizes_rota`, Table API). Sem
OSRM no ar o solver falha — nao existe fallback euclidiano em producao.

Modelo:
- no 0 = deposito (a `origem`). Sem origem, a primeira entrega serve de base
  VIRTUAL (mesma coordenada) e continua na lista de entregas — o bug de
  "primeira parada vira deposito e desaparece" nao pode voltar.
- `retornar_origem=false` fecha a rota num no final virtual de custo zero
  (rota aberta), que nao entra na geometria.
- capacidade de PESO e VOLUME por veiculo via `AddDimensionWithVehicleCapacity`
  — dimensoes proprias, com callback de demanda. Nunca a dimensao de distancia.
- jornada por veiculo via dimensao de TEMPO (duracao OSRM + tempo de
  atendimento). Janelas de entrega entram quando o ponto as traz.
- O que falta de dado NAO e' ignorado em silencio: sai em
  `restricoes_nao_aplicadas`; inviabilidade sai em `motivo` + todas as
  entregas em `entregas_nao_alocadas`.
"""

import time
from typing import Optional

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.contract import PontoMissao, RotaDeVeiculo, SolverRequest, SolverResponse

VERSAO_ALGORITMO = "ortools-vrptw-1"
# Teto das dimensoes. Peso em gramas, volume em litros, tempo em segundos.
TETO_PESO_G = 10**12
TETO_VOLUME_L = 10**12
TETO_TEMPO_S = 48 * 3600
SLACK_TEMPO_S = 30 * 60


def _base_do_request(request: SolverRequest) -> PontoMissao:
    """Deposito do modelo: `origem` quando existe, senao copia da 1a entrega."""
    if request.origem is not None:
        return request.origem
    primeira = request.pontos[0]
    return PontoMissao(
        node_id="__base__",
        latitude=primeira.latitude,
        longitude=primeira.longitude,
    )


def _montar_nos(request: SolverRequest) -> tuple[list, list[PontoMissao], int]:
    """Devolve (nos do modelo, entregas, indice do no final virtual ou -1)."""
    base = _base_do_request(request)
    entregas = list(request.pontos)
    nos = [base, *entregas]
    final_virtual = -1
    if not request.retornar_origem:
        # No final de custo zero: rota aberta. Fica FORA da geometria.
        nos.append(
            PontoMissao(
                node_id="__fim__",
                latitude=base.latitude,
                longitude=base.longitude,
            )
        )
        final_virtual = len(nos) - 1
    return nos, entregas, final_virtual


def _servico_s(ponto: PontoMissao, padrao_min: int) -> int:
    minutos = ponto.tempo_servico_min if ponto.tempo_servico_min is not None else padrao_min
    return int(minutos) * 60


def _capacidades(veiculos: list, campo: str, escala: int, teto: int) -> list[int]:
    caps: list[int] = []
    for v in veiculos:
        valor = float(getattr(v, campo, 0) or 0)
        caps.append(int(round(valor * escala)) if valor > 0 else teto)
    return caps


def _extrair_sequencia(routing, manager, sol, veiculo: int) -> list[int]:
    """Nos na ordem real do trajeto, do inicio ao fim (inclusive deposito)."""
    indice = routing.Start(veiculo)
    sequencia = [manager.IndexToNode(indice)]
    while not routing.IsEnd(indice):
        indice = sol.Value(routing.NextVar(indice))
        sequencia.append(manager.IndexToNode(indice))
    return sequencia


def _diagnostico_viabilidade(
    entregas: list[PontoMissao],
    veiculos: list,
    caps_peso: list[int],
    caps_volume: list[int],
) -> str:
    """Motivo legivel para `sem_solucao` — o operador precisa saber o porquê."""
    demanda_kg = sum(int(round(p.peso_kg * 1000)) for p in entregas)
    demanda_l = sum(int(round(p.volume_m3 * 1000)) for p in entregas)
    if demanda_kg > 0 and caps_peso and demanda_kg > sum(caps_peso):
        return "capacidade_peso"
    if demanda_l > 0 and caps_volume and demanda_l > sum(caps_volume):
        return "capacidade_volume"
    if veiculos and all(v.tempo_jornada_min for v in veiculos):
        return "jornada"
    return "nenhuma_solucao_viavel"


async def otimizar_vrptw(
    request: SolverRequest,
    matriz_fn: Optional[callable] = None,
    rota_fn: Optional[callable] = None,
) -> SolverResponse:
    """Constroi e resolve o VRPTW multi-veiculo. Retorna resposta tipada."""
    inicio = time.perf_counter()
    nos, entregas, final_virtual = _montar_nos(request)
    num_nodes = len(nos)
    veiculos = list(request.veiculos)
    num_veiculos = request.max_veiculos or len(veiculos) or 1
    num_veiculos = max(1, min(num_veiculos, max(1, len(veiculos) or 1)))

    if matriz_fn is not None:
        matriz = matriz_fn(nos)
        provedor_matriz = "injetada"
    else:
        from app.osrm import matrizes_rota

        matriz = await matrizes_rota(nos)
        provedor_matriz = "osrm"

    dist = [[int(round(v)) for v in linha] for linha in matriz["distancias"]]
    dur = [[int(round(v)) for v in linha] for linha in matriz["duracoes"]]
    if not request.retornar_origem and final_virtual >= 0:
        # Rota aberta: chegar ao no final nao custa deslocamento.
        for i in range(num_nodes):
            dist[i][final_virtual] = 0
            dur[i][final_virtual] = 0
            dist[final_virtual][i] = 0
            dur[final_virtual][i] = 0

    starts = [0] * num_veiculos
    ends = [final_virtual if final_virtual >= 0 else 0] * num_veiculos
    manager = pywrapcp.RoutingIndexManager(num_nodes, num_veiculos, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    def _no(indice: int) -> int:
        return manager.IndexToNode(indice)

    # --- Distancia: funcao objetivo principal ---
    dist_cb = routing.RegisterTransitCallback(lambda de, para: dist[_no(de)][_no(para)])
    routing.SetArcCostEvaluatorOfAllVehicles(dist_cb)
    routing.AddDimension(dist_cb, 0, 10**9, True, "Distancia")

    # --- Tempo: jornada + janelas + tempo de atendimento ---
    servicos = [_servico_s(nos[i], request.tempo_parada_min) for i in range(num_nodes)]
    servicos[0] = 0
    if final_virtual >= 0:
        servicos[final_virtual] = 0

    def _tempo(de: int, para: int) -> int:
        return dur[_no(de)][_no(para)] + servicos[_no(de)]

    tempo_cb = routing.RegisterTransitCallback(_tempo)
    jornadas = []
    for i in range(num_veiculos):
        minutos = getattr(veiculos[i], "tempo_jornada_min", None) if i < len(veiculos) else None
        jornadas.append(int(minutos) * 60 if minutos else TETO_TEMPO_S)
    routing.AddDimensionWithVehicleCapacity(tempo_cb, SLACK_TEMPO_S, jornadas, True, "Tempo")
    dimensao_tempo = routing.GetDimensionOrDie("Tempo")
    for i in range(num_veiculos):
        dimensao_tempo.CumulVar(routing.Start(i)).SetRange(0, 0)
    for deslocamento, ponto in enumerate(entregas, start=1):
        if ponto.janela_inicio_min is None or ponto.janela_fim_min is None:
            continue
        indice = manager.NodeToIndex(deslocamento)
        if indice >= 0:
            dimensao_tempo.CumulVar(indice).SetRange(
                int(ponto.janela_inicio_min) * 60, int(ponto.janela_fim_min) * 60
            )

    restricoes_nao_aplicadas: list[str] = []
    if not veiculos:
        restricoes_nao_aplicadas.append("frota_nao_informada")

    # --- Capacidade de peso: dimensao PROPRIA (gramas) ---
    demandas_peso = [int(round(nos[i].peso_kg * 1000)) for i in range(num_nodes)]
    demandas_peso[0] = 0
    if final_virtual >= 0:
        demandas_peso[final_virtual] = 0
    caps_peso = _capacidades(veiculos, "capacidade_kg", 1000, TETO_PESO_G)
    while len(caps_peso) < num_veiculos:
        caps_peso.append(TETO_PESO_G)
    if sum(demandas_peso) > 0 and any(c < TETO_PESO_G for c in caps_peso):
        peso_cb = routing.RegisterUnaryTransitCallback(lambda de: demandas_peso[_no(de)])
        routing.AddDimensionWithVehicleCapacity(peso_cb, 0, caps_peso, True, "Peso")
    else:
        restricoes_nao_aplicadas.append(
            "capacidade_peso_sem_dados" if sum(demandas_peso) == 0 else "capacidade_peso_sem_dado_do_veiculo"
        )

    # --- Capacidade de volume: dimensao PROPRIA (litros) ---
    demandas_volume = [int(round(nos[i].volume_m3 * 1000)) for i in range(num_nodes)]
    demandas_volume[0] = 0
    if final_virtual >= 0:
        demandas_volume[final_virtual] = 0
    caps_volume = _capacidades(veiculos, "capacidade_m3", 1000, TETO_VOLUME_L)
    while len(caps_volume) < num_veiculos:
        caps_volume.append(TETO_VOLUME_L)
    if sum(demandas_volume) > 0 and any(c < TETO_VOLUME_L for c in caps_volume):
        volume_cb = routing.RegisterUnaryTransitCallback(lambda de: demandas_volume[_no(de)])
        routing.AddDimensionWithVehicleCapacity(volume_cb, 0, caps_volume, True, "Volume")
    else:
        restricoes_nao_aplicadas.append(
            "capacidade_volume_sem_dados"
            if sum(demandas_volume) == 0
            else "capacidade_volume_sem_dado_do_veiculo"
        )

    if not any(v.tempo_jornada_min for v in veiculos):
        restricoes_nao_aplicadas.append("jornada_sem_dados")
    if not any(p.janela_inicio_min is not None for p in entregas):
        restricoes_nao_aplicadas.append("janelas_de_entrega_sem_dados")

    # Balanceia o tempo entre veiculos (soft) sem perder o custo por distancia.
    dimensao_tempo.SetGlobalSpanCostCoefficient(5)

    parametros = pywrapcp.DefaultRoutingSearchParameters()
    parametros.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    parametros.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    parametros.time_limit.FromSeconds(int(request.limite_busca_s))

    solucao = routing.SolveWithParameters(parametros)
    execucao_ms = int((time.perf_counter() - inicio) * 1000)

    if solucao is None:
        motivo = _diagnostico_viabilidade(entregas, veiculos, caps_peso, caps_volume)
        return SolverResponse(
            org_id=request.org_id,
            status="sem_solucao",
            veiculos=[],
            total_paradas=0,
            entregas_nao_alocadas=[p.node_id for p in entregas],
            restricoes_nao_aplicadas=restricoes_nao_aplicadas,
            tempo_execucao_ms=execucao_ms,
            versao_algoritmo=VERSAO_ALGORITMO,
            matriz_provedor=provedor_matriz,
            motivo=motivo,
            erro="solver_nao_encontrou_solucao",
        )

    rotas: list[RotaDeVeiculo] = []
    visitadas: set[str] = set()
    for v in range(num_veiculos):
        sequencia = _extrair_sequencia(routing, manager, solucao, v)
        if final_virtual >= 0:
            sequencia = [n for n in sequencia if n != final_virtual]
        paradas_idx = [n for n in sequencia if n != 0]
        veiculo = veiculos[v] if v < len(veiculos) else None
        if not paradas_idx:
            rotas.append(
                RotaDeVeiculo(
                    veiculo_id=veiculo.veiculo_id if veiculo else f"veiculo-{v + 1}",
                    motorista_id=veiculo.motorista_id if veiculo else None,
                )
            )
            continue

        distancia_m = sum(dist[a][b] for a, b in zip(sequencia, sequencia[1:]))
        dirigindo_s = sum(dur[a][b] for a, b in zip(sequencia, sequencia[1:]))
        atendimento_s = sum(servicos[n] for n in paradas_idx)
        ids = [nos[n].node_id for n in paradas_idx]
        visitadas.update(ids)

        pontos_geometria = [nos[n] for n in sequencia]
        if rota_fn is not None:
            info = await rota_fn(pontos_geometria)
        else:
            from app.osrm import rota as rota_osrm

            info = await rota_osrm(pontos_geometria)

        rotas.append(
            RotaDeVeiculo(
                veiculo_id=veiculo.veiculo_id if veiculo else f"veiculo-{v + 1}",
                motorista_id=veiculo.motorista_id if veiculo else None,
                paradas=ids,
                distancia_m=float(distancia_m),
                duracao_s=float(dirigindo_s),
                duracao_com_paradas_s=float(dirigindo_s + atendimento_s),
                carga_kg=float(sum(nos[n].peso_kg for n in paradas_idx)),
                carga_m3=float(sum(nos[n].volume_m3 for n in paradas_idx)),
                geometria=[list(map(float, c)) for c in (info.get("geometria") or [])],
            )
        )

    nao_alocadas = [p.node_id for p in entregas if p.node_id not in visitadas]
    return SolverResponse(
        org_id=request.org_id,
        status="otimizado",
        veiculos=rotas,
        total_paradas=sum(len(r.paradas) for r in rotas),
        entregas_nao_alocadas=nao_alocadas,
        restricoes_nao_aplicadas=sorted(set(restricoes_nao_aplicadas)),
        tempo_total_s=sum(r.duracao_com_paradas_s for r in rotas),
        tempo_execucao_ms=execucao_ms,
        versao_algoritmo=VERSAO_ALGORITMO,
        matriz_provedor=provedor_matriz,
    )
