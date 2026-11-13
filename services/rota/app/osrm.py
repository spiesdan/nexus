"""Cliente HTTP do OSRM — matriz rodoviaria e geometria de rota.

A matriz vem da Table API (`/table/v1/driving`) com `annotations=distance,duration`:
distancia em metros e duracao em segundos PELAS RUAS. E' o insumo do solver; o
servico nao calcula distancia euclidiana entre coordenadas em producao.

O host e' configuravel por `OSRM_URL` (instancia propria recomendada — ver
`docs/doctrine/packaging.md` e o README do servico). O padrao e' o demo publico,
que e' conveniente e NAO tem SLA.
"""

import os

import httpx

PADRAO = os.environ.get("OSRM_URL", "https://router.project-osrm.org").rstrip("/")


async def matrizes_rota(
    pontos: list,
    base_url: str = PADRAO,
    timeout_s: float = 15.0,
) -> dict:
    """Matriz NxN de distancias (m) e duracoes (s) rodoviarias via OSRM Table."""
    n = len(pontos)
    if n < 2:
        return {"distancias": [[0.0] * n for _ in range(n)], "duracoes": [[0.0] * n for _ in range(n)]}

    coords = ";".join(f"{float(p.longitude)},{float(p.latitude)}" for p in pontos)
    url = f"{base_url}/table/v1/driving/{coords}?annotations=distance,duration"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise RuntimeError(f"osrm_matrix_falhou:{resp.status_code}")
        data = resp.json()
        if data.get("code") != "Ok":
            raise RuntimeError(f"osrm_matrix_falhou:{data.get('code')}")

        dist = data.get("distances") or []
        dur = data.get("durations") or []
        if len(dist) != n or len(dur) != n:
            # Matriz incompleta nao vira distancia 0 (0 m = "na mesma porta").
            raise RuntimeError("osrm_matrix_incompleta")

        distancias = [[float(v if v is not None else 0) for v in linha] for linha in dist]
        duracoes = [[float(v if v is not None else 0) for v in linha] for linha in dur]
        return {"distancias": distancias, "duracoes": duracoes}


async def rota(
    pontos: list,
    base_url: str = PADRAO,
    timeout_s: float = 20.0,
) -> dict:
    """Rota rodoviaria (geometria GeoJSON + distancia + duracao) para a sequencia.

    `pontos` = sequencia completa do trajeto (base -> entregas -> base quando
    `retornar_origem`), exatamente a ordem que o mapa vai desenhar.
    """
    if len(pontos) < 2:
        return {"distancia_m": 0.0, "duracao_s": 0.0, "geometria": [], "provedor": "osrm"}

    coords = ";".join(f"{float(p.longitude)},{float(p.latitude)}" for p in pontos)
    url = f"{base_url}/route/v1/driving/{coords}?overview=full&geometries=geojson"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise RuntimeError(f"osrm_rota_falhou:{resp.status_code}")
        data = resp.json()
        if data.get("code") != "Ok":
            raise RuntimeError(f"osrm_rota_falhou:{data.get('code')}")
        r = (data.get("routes") or [{}])[0]
        geometria = (r.get("geometry") or {}).get("coordinates") or []
        if len(geometria) < 2:
            # Geometria vazia/truncada nao e' "rota desenhada".
            raise RuntimeError("osrm_rota_sem_geometria")
        return {
            "distancia_m": float(r.get("distance") or 0),
            "duracao_s": float(r.get("duration") or 0),
            "geometria": geometria,
            "provedor": "osrm",
        }
