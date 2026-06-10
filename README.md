# StravaStats — seus treinos em números

Dashboard estático com seus dados do Strava, atualizado automaticamente todos os
dias via GitHub Actions. Mesmo padrão do IronStats: `fetch_strava.py` busca os
dados, `build.py` gera `docs/index.html`, GitHub Pages publica.

---

## Passo 1 — Criar seu app na API do Strava (5 min)

1. Acesse **https://www.strava.com/settings/api** (logado na sua conta)
2. Preencha:
   - **Application Name**: `stravastats` (qualquer nome)
   - **Category**: Data Importer
   - **Website**: `https://astoria26.github.io`
   - **Authorization Callback Domain**: `localhost`
3. Salve. Anote o **Client ID** e o **Client Secret**.

## Passo 2 — Autorizar e pegar o código (2 min)

1. Cole esta URL no navegador, **trocando `SEU_CLIENT_ID`** pelo número do passo 1:

```
https://www.strava.com/oauth/authorize?client_id=SEU_CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=activity:read_all
```

2. Clique em **Autorizar**. O navegador vai tentar abrir `localhost` e dar erro
   de página — **isso é esperado**. Olhe a barra de endereço: ela terá algo como

```
http://localhost/?state=&code=abc123def456...&scope=read,activity:read_all
```

3. Copie o valor de `code=` (a parte entre `code=` e `&scope`).

## Passo 3 — Trocar o código pelo refresh token (1 min)

Abra o terminal (**PowerShell** no Windows, **Terminal** no Mac) e rode o
comando abaixo, trocando os três valores em maiúsculas:

**Mac / Linux:**
```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=SEU_CLIENT_ID \
  -d client_secret=SEU_CLIENT_SECRET \
  -d code=SEU_CODE \
  -d grant_type=authorization_code
```

**Windows (PowerShell)** — atenção ao `.exe`:
```powershell
curl.exe -X POST https://www.strava.com/oauth/token -d client_id=SEU_CLIENT_ID -d client_secret=SEU_CLIENT_SECRET -d code=SEU_CODE -d grant_type=authorization_code
```

A resposta é um JSON. Copie o valor de **`refresh_token`**.

> O `code` do passo 2 expira rápido e só funciona uma vez. Se der erro
> "invalid code", repita o passo 2 e rode o comando de novo.

## Passo 4 — Criar o repositório no GitHub

1. Crie um repositório novo (ex.: `stravastats`) e suba todos estes arquivos
   (mantendo a pasta `.github/workflows/`).
2. Em **Settings → Secrets and variables → Actions → New repository secret**,
   crie 3 secrets:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_REFRESH_TOKEN`
3. Em **Settings → Pages**, configure: *Deploy from a branch* → branch
   `main`, pasta `/docs`.

## Passo 5 — Primeira execução

1. Vá na aba **Actions** → workflow **"Atualizar dados do Strava"** →
   **Run workflow**.
2. Aguarde ficar verde (1–2 min). O site estará em
   `https://astoria26.github.io/stravastats/`.
3. A partir daí, ele roda sozinho todo dia às 6h.

---

## Privacidade

- O site é público. O `fetch_strava.py` **não baixa GPS nem rotas** — só
  números agregáveis (distância, tempo, pace, FC, elevação).
- Os **nomes das atividades** aparecem na tabela e nos recordes. Se algum nome
  revelar onde você treina, renomeie no Strava ou me peça para remover a coluna.

## Personalização

- O título do site fica no topo do `build.py` (`SITE_TITLE`).
- Cores, fontes e seções ficam no `template.html`.
