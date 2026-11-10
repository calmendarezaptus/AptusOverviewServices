# aptus_overview_services

Función de Catalyst (Node 24, Express 5, Advanced I/O) del proyecto **Consolidado**.
Documento del proyecto (configuración, despliegue, pendientes): `04-consolidado/PROYECTO.md` en el
repositorio de trabajo `AptusWidgets`.

## Estructura

| Carpeta | Qué contiene |
|---|---|
| `index.js` | Rutas |
| `services/` | Servicios propios de esta función |
| `core/` | **No editar.** Copia de `shared/catalyst-core/src` (auth Donatello, conexión, cliente de ReportesSandbox, catálogos, errores). Se actualiza con `node shared/catalyst-core/sync.mjs` desde el repositorio de trabajo |
| `tests/` | `npm test` (sin red; nunca escriben) |

## Secretos

`AUTH_TOKEN` (token del broker Donatello): variable de entorno de la función en Catalyst, o `.env`
local (ver `.env.example`). `.env` no se versiona.

## Comandos

```bash
npm install
npm test
```
