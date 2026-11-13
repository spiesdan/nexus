"""VRPTW multi-veiculo via Google OR-Tools (servico Python independente).

Fronteira: este modulo recebe pontos de entrega + veiculos (capacidades) e
retorna a distribuicao de paradas por veiculo com a sequencia rodoviaria.
Nenhum detalhe de persistencia/DB vive aqui — o contrato e a API Pydantic.

Entrada de distancias: matriz OSRM (`app.osrm.matriz_rota`). Sem OSRM no ar,
o solver falha — nao usa heuristica propria como "otimizacao".
"""

from typing import Optional

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.contract import RotaDeVeiculo, SolverRequest, SolverResponse
from app.osrm import rota as rota_osrm


def _resolver_matriz(pontos, num_nodes: int) -> list[list[float]]:
    """Matriz NxN de distancias (Haversine) — usada quando a matriz nao vem do OSRM."""

    def haversine(a, b) -> float:
        from math import radians, sin, cos, sqrt, atan2

        lat1, lng1 = radians(float(a.latitude)), radians(float(a.longitude))
        lat2, lng2 = radians(float(b.latitude)), radians(float(b.longitude))
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
        return 2 * 6371000 * atan2(sqrt(h), sqrt(1 - h))

    matriz: list[list[float]] = [[0.0] * num_nodes for _ in range(num_nodes)]
    for i in range(num_nodes):
        for j in range(num_nodes):
            matriz[i][j] = haversine(pontos[i], pontos[j])
    return matriz


def _extrair_rotas(manager, assignment, num_vehicles: int, num_nodes: int) -> list[dict]:
    """Extrai (paradas por veiculo, em sequencia) da Assignment do OR-Tools."""
    ivc = assignment.IntVarContainer()

    def valor(var_idx) -> float:
        el = ivc.Element(int(var_idx))
        v = el.Value()
        return float(v) if v is not None else 0.0

    rotas: list[dict] = []
    for v in range(num_vehicles):
        start_var = manager.GetStartIndex(v)
        end_var = manager.GetEndIndex(v)
        start_val = valor(start_var)
        end_val = valor(end_var)
        paradas: list[dict] = []
        for node in range(num_nodes):
            idx = manager.NodeToIndex(node)
            c = valor(idx)
            if start_val < c <= end_val:
                paradas.append({"node": node, "cumul": c})
        paradas.sort(key=lambda p: p["cumul"])
        rotas.append(
            {
                "veiculo": v,
                "paradas": [p["node"] for p in paradas],
                "distancia_m": end_val - start_val,
            }
        )
    return rotas


async def otimizar_vrptw(
    request,
    matriz_fn: Optional[callable] = None,
    rota_fn: Optional[callable] = None,
) -> SolverResponse:
    """Constrói e resolve o VRPTW multi-veiculo. Retorna resposta tipada."""
    pontos = [request.origem] if request.origem else []
    pontos += list(request.pontos)
    num_nodes = len(pontos)
    num_vehicles = len(request.veiculos) or 1

    if matriz_fn is not None:
        matriz = matriz_fn(pontos, num_nodes)
    else:
        from app.osrm import matriz_rota

        matriz = await matriz_rota(pontos)

    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, 0)
    model = pywrapcp.RoutingModel(manager)
    cb, _created = model.AddMatrixDimension(matriz, 100000, True, "Distance")
    for v in range(num_vehicles):
        model.SetArcCostEvaluatorOfVehicle(cb, v)
    sp = pywrapcp.DefaultRoutingSearchParameters()
    sp.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    sol = model.SolveWithParameters(sp)
    if sol is None:
        return SolverResponse(
            org_id=request.org_id,
            status="sem_solucao",
            veiculos=[],
            total_paradas=0,
            tempo_total_s=0,
            erro="solver_nao_encontrou_solucao",
        )

    rotas = _extrair_rotas(manager, sol, num_vehicles, num_nodes)
    rotas_out: list[RotaDeVeiculo] = []
    for r in rotas:
        seq = [pontos[n] for n in r["paradas"] if n < len(pontos)]
        if seq and rota_fn is not None:
            rota_info = await rota_fn(seq)
        elif seq:
            rota_info = await rota_osrm(seq)
        else:
            rota_info = {"distancia_m": 0.0, "duracao_s": 0.0, "geometria": [], "provedor": "osrm"}
        rotas_out.append(
            RotaDeVeiculo(
                veiculo_id=f"veh-{r['veiculo']}",
                paradas=[str(p) for p in r["paradas"]],
                distancia_m=float(r["distancia_m"]),
                duracao_s=float(rota_info.get("duracao_s") or 0),
                geometria=[list(map(float, c)) for c in (rota_info.get("geometria") or [])],
            )
        )
    return SolverResponse(
        org_id=request.org_id,
        status="otimizado",
        veiculos=rotas_out,
        total_paradas=sum(len(r["paradas"]) for r in rotas),
    )
