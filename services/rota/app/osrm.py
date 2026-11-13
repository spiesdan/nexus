"""Cliente HTTP do OSRM para matrizes rodoviarias e geometrias de rota."""

import httpx

PADRAO = "https://router.project-osrm.org"


async def matriz_rota(
    pontos: list[dict],
    base_url: str = PADRAO,
    timeout_s: float = 10.0,
) -> list[list[float]]:
    """Retorna matriz NxN de distancias em metros (Haversine como fallback)."""
    if len(pontos) < 2:
        return [[0.0] for _ in range(len(pontos))]

    coords = ";".join(f"{p['longitude']},{p['latitude']}" for p in pontos)
    url = f"{base_url}/matrix/v1/driving/{coords}?sources=all&destinations=all&overview=full"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise RuntimeError(f"osrm_matrix_falhou:{resp.status_code}")
        data = resp.json()
        distances = data.get("data") or []
        matriz: list[list[float]] = [[0.0] * len(pontos) for _ in range(len(pontos))]
        for i, row in enumerate(distances):
            for j, el in enumerate(row.get("distances") or []):
                matriz[i][j] = float(el or 0)
    return matriz


async def rota(
    pontos: list[dict],
    base_url: str = PADRAO,
    timeout_s: float = 20.0,
) -> dict:
    """Rota rodoviaria (geometria GeoJSON + distancia + duracao) para a sequencia.

    `pontos` = sequencia de paradas (deposito/origem primeiro quando houver).
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
        r = (data.get("routes") or [{}])[0]
        return {
            "distancia_m": float(r.get("distance") or 0),
            "duracao_s": float(r.get("duration") or 0),
            "geometria": (r.get("geometry") or {}).get("coordinates") or [],
            "provedor": "osrm",
        }
