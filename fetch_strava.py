"""
Busca todas as atividades do Strava via API e salva em data/activities.json.

Requer 3 variaveis de ambiente (configuradas como Secrets no GitHub):
  STRAVA_CLIENT_ID
  STRAVA_CLIENT_SECRET
  STRAVA_REFRESH_TOKEN
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

# Campos que vao para o site.
KEEP = [
    "name",
    "sport_type",
    "start_date_local",
    "distance",                # metros
    "moving_time",             # segundos
    "elapsed_time",            # segundos
    "total_elevation_gain",    # metros
    "average_speed",           # m/s
    "max_speed",               # m/s
    "average_heartrate",
    "max_heartrate",
    "average_watts",
    "device_watts",            # true = potencia medida (medidor/smart trainer)
    "trainer",                 # 1 = rolo/virtual
    "polyline",                # rota codificada (preenchido abaixo)
]


def post_form(url, fields):
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=body)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def get_json(url, token):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main():
    # 1) Troca o refresh token por um access token valido
    tok = post_form(
        "https://www.strava.com/oauth/token",
        {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": REFRESH_TOKEN,
        },
    )
    access = tok["access_token"]

    # 2) Pagina por todas as atividades (200 por pagina, limite da API)
    activities = []
    page = 1
    while True:
        url = (
            "https://www.strava.com/api/v3/athlete/activities"
            f"?per_page=200&page={page}"
        )
        try:
            batch = get_json(url, access)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print("Rate limit da API atingido, aguardando 60s...")
                time.sleep(60)
                continue
            raise
        if not batch:
            break
        activities.extend(batch)
        print(f"Pagina {page}: {len(batch)} atividades")
        page += 1
        time.sleep(0.5)

    if not activities:
        print("Nenhuma atividade retornada — verifique as credenciais.")
        sys.exit(1)

    # 3) Mantem so os campos necessarios
    slim = []
    for a in activities:
        row = {k: a.get(k) for k in KEEP if k != "polyline"}
        # A rota vem aninhada em a["map"]["summary_polyline"]
        m = a.get("map") or {}
        row["polyline"] = m.get("summary_polyline") or None
        slim.append(row)
    slim.sort(key=lambda a: a["start_date_local"])

    os.makedirs("data", exist_ok=True)
    with open("data/activities.json", "w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Total: {len(slim)} atividades salvas em data/activities.json")


if __name__ == "__main__":
    main()
