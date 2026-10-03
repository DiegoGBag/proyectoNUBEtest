# Deploy de Events — Pruebas y Producción

Ruta más simple, sin servidores que administrar:

| Pieza | Servicio | Pruebas | Producción |
|-------|----------|---------|------------|
| Frontend (React/Vite) | **GitHub Pages** | `/test/` (rama `develop`) | raíz (rama `main`) |
| API (FastAPI + Docker) | **Render** | `events-api-test` | `events-api-prod` |
| Base de datos | **Azure SQL Database** | `EventsDB_Test` | `EventsDB_Prod` |

Cada entorno tiene su propia base, su propia API, su propio `JWT_SECRET` y su propio frontend: las pruebas nunca tocan datos reales.

> Las fotos de eventos (S3) todavía no están implementadas, así que este deploy no necesita AWS.

---

## 0. Antes de empezar

1. Sube el proyecto a **GitHub** (un solo repositorio con `src/`, `package.json` y `eventos-api/`).
2. Tu rama principal hoy se llama `master`. Renómbrala a **`main`** (producción) y crea **`develop`** (pruebas):
   ```
   git branch -m master main
   git add . && git commit -m "Conecta frontend con API y prepara deploy"
   git push -u origin main
   git checkout -b develop && git push -u origin develop
   ```
3. Comprueba que `.env` y `eventos-api/.env` **no** se suben (ya están en `.gitignore`).

## 1. Bases de datos (Azure SQL)

1. Entra a <https://portal.azure.com> → **Create a resource → SQL Database**.
2. Crea una base llamada `EventsDB_Test`. Activa **"Apply free offer"** (oferta gratuita de Azure SQL).
3. En *Server*, crea un servidor nuevo con **SQL authentication** (anota usuario y contraseña de administrador). Región: la más cercana a tu API de Render.
4. Repite para `EventsDB_Prod` **en el mismo servidor**.
5. **Networking** del servidor → agrega una regla de firewall para que Render pueda entrar:
   - Lo más seguro: las IPs de salida de cada servicio de Render (panel del servicio → *Connect → Outbound*).
   - Lo más rápido (solo para empezar): permitir `0.0.0.0 – 255.255.255.255`. Funciona porque aún se exige usuario y contraseña, pero conviene cerrarlo después.
6. Crea las tablas en **cada** base: abre tu `EventsDB_SQLServer.sql` en SSMS, conéctate al servidor de Azure, elige la base (`EventsDB_Test` / `EventsDB_Prod`) y ejecuta el script **sin** las líneas `CREATE DATABASE` y `USE EventsDB` (Azure SQL no las admite igual).
   - En **producción** borra del script el tenant de demostración (`Demo Events`).

Notas de la oferta gratuita: hasta 10 bases por suscripción, con un tope mensual de cómputo. Si lo agotas la base se pausa hasta el mes siguiente, salvo que elijas pagar el excedente. Además, la base serverless se **pausa sola** tras un rato sin uso y la primera conexión tarda; por eso la URL lleva `Connection+Timeout=60`.

Cadena de conexión (una por entorno):

```
mssql+pyodbc://USUARIO:PASSWORD@SERVIDOR.database.windows.net:1433/EventsDB_Test?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no&Connection+Timeout=60
```

Si la contraseña tiene símbolos, codifícalos: `@`→`%40`, `:`→`%3A`, `/`→`%2F`, `#`→`%23`, `%`→`%25`.

## 2. API en Render

1. <https://render.com> → **New → Blueprint** → conecta tu repositorio. Render lee `render.yaml` y propone **dos servicios**: `events-api-test` (rama `develop`) y `events-api-prod` (rama `main`).
2. Render te pedirá los valores secretos de cada uno:

| Variable | Pruebas | Producción |
|----------|---------|------------|
| `DATABASE_URL` | cadena de `EventsDB_Test` | cadena de `EventsDB_Prod` |
| `JWT_SECRET` | un valor aleatorio | **otro** valor aleatorio |
| `CORS_ORIGINS` | URL del frontend de pruebas (paso 3) | URL del frontend de producción |
| `APP_ENV` | `testing` (ya viene en el archivo) | `production` (ya viene) |

   Genera cada `JWT_SECRET` con:
   ```
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
   Si todavía no tienes la URL del frontend, pon cualquier valor provisional y corrígelo en el paso 4.
3. Cuando termine el primer build, abre `https://<tu-servicio>.onrender.com/api/health`: debe responder `{"status":"ok", ...}`. También puedes probar `/docs`.

Notas: el plan **free** de Render duerme el servicio tras 15 min sin tráfico y la primera petición tarda cerca de 1 minuto; por eso `events-api-prod` viene con plan `starter` (de paga). Si prefieres no pagar todavía, cambia `plan: starter` a `plan: free` en `render.yaml`.

## 3. Frontend en GitHub Pages

Pages solo permite **un sitio por repositorio**, así que pruebas y producción conviven en el mismo sitio, en rutas distintas. El workflow `.github/workflows/deploy-pages.yml` compila `main` y `develop` juntos y publica:

| Entorno | URL | Rama | API que usa |
|---------|-----|------|-------------|
| Producción | `https://DiegoBag.github.io/proyectoNUBE/` | `main` | `PROD_API_URL` |
| Pruebas | `https://DiegoBag.github.io/proyectoNUBE/test/` | `develop` | `TEST_API_URL` |

Configuración (una sola vez), en el repo de GitHub:

1. **Settings → Pages → Source = GitHub Actions**.
2. **Settings → Secrets and variables → Actions → pestaña *Variables* → New repository variable**:
   - `PROD_API_URL` = `https://events-api-prod.onrender.com` (URL real, sin `/` final)
   - `TEST_API_URL` = `https://events-api-test.onrender.com`
   (Son *variables*, no secretos: las URLs de la API son públicas de todos modos.)
3. Haz push a `main` (o **Actions → Deploy a GitHub Pages → Run workflow**). Si falta una variable, el workflow falla con un mensaje claro.

Notas:
- Las variables `VITE_*` se incrustan al compilar: si cambias una URL, hay que volver a correr el workflow.
- El sitio de pruebas muestra la cinta naranja "Entorno: PRUEBAS" y `[PRUEBAS]` en la pestaña.
- Los dos sitios comparten dominio (`github.io`), por eso el token de sesión se guarda con una llave distinta por entorno (`events_token_test` / `events_token_production`).
- Si `develop` todavía no existe, el workflow publica solo producción.
- GitHub Pages en repositorios **privados** requiere plan de pago (Pro/Team); en repos públicos es gratis.

## 4. Cerrar el círculo (CORS)

El navegador envía como origen solo el dominio, **sin la ruta**: pruebas y producción llegan con el mismo origen, `https://DiegoBag.github.io`. Pon exactamente eso en `CORS_ORIGINS` de **ambos** servicios de Render (sin `/` final y respetando mayúsculas tal como lo muestra el navegador; para dev local agrega `,http://localhost:5173`). Guarda y deja que redespliegue.

## 5. Probar

1. Abre el frontend de **pruebas** → crea una cuenta → crea un evento. Debe verse en `EventsDB_Test` y **no** en `EventsDB_Prod`.
2. Repite en producción con una cuenta propia.
3. Si algo falla: consola del navegador (F12) → pestaña *Network*. Un error de CORS apunta al paso 4; un 500 en la API, a los *Logs* del servicio en Render (normalmente una cadena de conexión o el firewall de Azure).

## 6. Flujo de trabajo diario

```
git checkout develop → cambios → git push   →  se despliega a PRUEBAS
(se prueba y se valida)
git checkout main → git merge develop → git push   →  se despliega a PRODUCCIÓN
```

## Pendientes conocidos

- `POST /api/auth/register` está abierto: cualquiera puede crear una organización. Para producción conviene restringirlo (invitación o desactivarlo después de crear tu cuenta).
- Subida de fotos a S3 y dominio propio (GitHub Pages y Render dan HTTPS automático en sus URLs).

## Alternativa: frontend en Vercel

El frontend también se puede publicar en Vercel (en vez de GitHub Pages). La API sigue en Render.

1. <https://vercel.com> → **Add New → Project** → importa el repositorio. Vercel detecta Vite con `vercel.json`
   (build `npm run build`, salida `dist`). Deja el *Root Directory* en la raíz del repo (no `eventos-api`).
2. **Settings → Environment Variables**: agrega `VITE_API_URL` = `https://events-api-prod.onrender.com`
   (sin `/` final) para *Production*. Para *Preview* puedes usar la URL de la API de pruebas.
3. **Deploy**. Cada push a `main` publica producción; las demás ramas generan URLs de preview.
4. CORS: en Render, agrega la URL de Vercel a `CORS_ORIGINS` (separadas por coma), por ejemplo
   `https://mi-proyecto.vercel.app,http://localhost:5173`, y deja que redespliegue.
   Las URLs de preview cambian en cada deploy; para probarlas añade ese origen concreto.
5. Si cambias `VITE_API_URL`, hay que hacer *Redeploy* (la variable se incrusta al compilar).
