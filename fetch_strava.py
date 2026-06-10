"""
Busca atividades do Strava e salva em data/activities.json.
Fase 2 (incremental): best efforts de corrida + streams de potencia do pedal,
com cache em cache/enrich.json (commitado no repo) para respeitar o rate limit.

Secrets necessarios: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CLIENT_ID = os.environ["STRAVA_CLIENT_ID"]
CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]
REFRESH_TOKEN = os.environ["STRAVA_REFRESH_TOKEN"]

UA = {"User-Agent": "Mozilla/5.0 (StravaStats; +https://github.com)"}
ENRICH_BUDGET = 70          # chamadas extras por execucao (margem p/ rate limit)
POWER_WINDOWS = [1, 5, 10, 30, 60, 300, 600, 1200, 1800, 3600, 5400]

KEEP = [
    "id", "name", "sport_type", "start_date_local",
    "distance", "moving_time", "elapsed_time", "total_elevation_gain",
    "average_speed", "max_speed", "average_heartrate", "max_heartrate",
    "average_watts", "device_watts", "trainer",
]


def post_form(url, fields):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), headers=UA)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def get_json(url, token):
    req = urllib.request.Request(url, headers={**UA, "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def get_with_retry(url, token):
    """GET com tratamento de rate limit. Devolve None se o limite estourar."""
    try:
        return get_json(url, token)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print("Rate limit atingido — parando o enriquecimento por hoje.")
            return None
        if e.code in (404, 403):
            return {}
        raise


def power_curve(watts, times):
    """Maior media de potencia em cada janela, assumindo amostras do stream."""
    if not watts:
        return {}
    # reamostra para 1 ponto por segundo usando o stream de tempo
    n = times[-1] + 1 if times else len(watts)
    sec = [0.0] * n
    for i, t in enumerate(times):
        if 0 <= t < n:
            sec[t] = watts[i] or 0
    prefix = [0.0]
    for v in sec:
        prefix.append(prefix[-1] + v)
    out = {}
    for w in POWER_WINDOWS:
        if w > n:
            continue
        best = max(prefix[i + w] - prefix[i] for i in range(n - w + 1)) / w
        out[str(w)] = round(best, 1)
    return out


def main():
    tok = post_form("https://www.strava.com/oauth/token", {
        "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token", "refresh_token": REFRESH_TOKEN,
    })
    access = tok["access_token"]

    # ---------- fase 1: lista de atividades ----------
    activities, page = [], 1
    while True:
        batch = get_json(
            f"https://www.strava.com/api/v3/athlete/activities?per_page=200&page={page}",
            access)
        if not batch:
            break
        activities.extend(batch)
        page += 1
        time.sleep(0.4)
    if not activities:
        print("Nenhuma atividade — verifique as credenciais.")
        sys.exit(1)

    slim = []
    for a in activities:
        row = {k: a.get(k) for k in KEEP}
        row["polyline"] = (a.get("map") or {}).get("summary_polyline") or None
        slim.append(row)
    slim.sort(key=lambda a: a["start_date_local"])

    # ---------- fase 2: enriquecimento incremental ----------
    os.makedirs("cache", exist_ok=True)
    cache_path = "cache/enrich.json"
    cache = {}
    if os.path.exists(cache_path):
        cache = json.load(open(cache_path, encoding="utf-8"))

    run_map = {"Run", "TrailRun"}  # corrida com GPS (VirtualRun/esteira fora)
    runs = [a for a in slim if a["sport_type"] in run_map and a["polyline"]
            and str(a["id"]) not in cache]
    rides = [a for a in slim if a["sport_type"] in
             ("Ride", "VirtualRide", "GravelRide", "MountainBikeRide")
             and a.get("device_watts") and a.get("average_watts")
             and str(a["id"]) not in cache]
    # prioridade: corridas mais rapidas e pedais mais recentes primeiro
    runs.sort(key=lambda a: -(a.get("average_speed") or 0))
    rides.sort(key=lambda a: a["start_date_local"], reverse=True)

    budget = ENRICH_BUDGET
    queue = runs + rides
    print(f"Enriquecimento: {len(queue)} pendentes, processando ate {budget} agora.")
    for a in queue:
        if budget <= 0:
            break
        aid = str(a["id"])
        if a["sport_type"] in run_map:
            det = get_with_retry(f"https://www.strava.com/api/v3/activities/{a['id']}", access)
            if det is None:
                break
            budget -= 1
            efforts = [
                {"n": e.get("name"), "t": e.get("elapsed_time"), "d": e.get("distance")}
                for e in (det.get("best_efforts") or [])
            ]
            cache[aid] = {"be": efforts}
        else:
            st = get_with_retry(
                f"https://www.strava.com/api/v3/activities/{a['id']}/streams"
                "?keys=watts,time&key_by_type=true", access)
            if st is None:
                break
            budget -= 1
            watts = (st.get("watts") or {}).get("data") or []
            times = (st.get("time") or {}).get("data") or []
            cache[aid] = {"pc": power_curve(watts, times)}
        time.sleep(0.8)

    json.dump(cache, open(cache_path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # ---------- agrega: PRs oficiais e curva de potencia global ----------
    by_id = {str(a["id"]): a for a in slim}
    best = {}   # nome do effort -> melhor tempo
    for aid, c in cache.items():
        a = by_id.get(aid)
        if not a:
            continue
        for e in c.get("be", []):
            if not e.get("t"):
                continue
            k = e["n"]
            if k not in best or e["t"] < best[k]["t"]:
                best[k] = {"t": e["t"], "d": e.get("d"), "id": aid,
                           "date": a["start_date_local"]}
    curve = {}  # janela(s) -> max watts
    for aid, c in cache.items():
        a = by_id.get(aid)
        if not a:
            continue
        for w, v in c.get("pc", {}).items():
            if w not in curve or v > curve[w]["w"]:
                curve[w] = {"w": v, "id": aid, "date": a["start_date_local"]}

    extra = {"best_efforts": best, "power_curve": curve,
             "enrich_pending": max(0, len(queue) - (ENRICH_BUDGET - budget))}

    os.makedirs("data", exist_ok=True)
    json.dump(slim, open("data/activities.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump(extra, open("data/extra.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"{len(slim)} atividades; {len(cache)} enriquecidas; "
          f"{extra['enrich_pending']} pendentes para as proximas execucoes.")


if __name__ == "__main__":
    main()
