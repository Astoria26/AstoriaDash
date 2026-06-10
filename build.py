"""
Gera docs/index.html juntando template.html + app.js + data/activities.json.
"""

import pathlib

# ===== Personalize aqui =====
SITE_TITLE = "Edu · Treinos em números"
HERO_LINE1 = "EDU"          # primeira linha do título (cor escura)
HERO_LINE2 = "EM NÚMEROS"   # segunda linha (laranja)
# ============================

data = pathlib.Path("data/activities.json").read_text(encoding="utf-8")
extra_p = pathlib.Path("data/extra.json")
extra = extra_p.read_text(encoding="utf-8") if extra_p.exists() else "{}"
app_js = pathlib.Path("app.js").read_text(encoding="utf-8")
template = pathlib.Path("template.html").read_text(encoding="utf-8")

html = (template
        .replace("__SITE_TITLE__", SITE_TITLE)
        .replace("__HERO_LINE1__", HERO_LINE1)
        .replace("__HERO_LINE2__", HERO_LINE2)
        .replace("__APP_JS__", app_js)
        .replace("__EXTRA__", extra)
        .replace("__DATA__", data))

pathlib.Path("docs").mkdir(exist_ok=True)
pathlib.Path("docs/index.html").write_text(html, encoding="utf-8")
print(f"docs/index.html gerado ({len(html)/1024:.0f} KB)")
