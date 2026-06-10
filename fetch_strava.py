"""
Gera docs/index.html injetando os dados de data/activities.json no template.
Mesmo padrao do build.py do IronStats.
"""

import pathlib

# Personalize aqui:
SITE_TITLE = "Edu · Treinos em números"

data = pathlib.Path("data/activities.json").read_text(encoding="utf-8")
template = pathlib.Path("template.html").read_text(encoding="utf-8")

html = template.replace("__SITE_TITLE__", SITE_TITLE).replace("__DATA__", data)

pathlib.Path("docs").mkdir(exist_ok=True)
pathlib.Path("docs/index.html").write_text(html, encoding="utf-8")
print(f"docs/index.html gerado ({len(html) / 1024:.0f} KB)")
