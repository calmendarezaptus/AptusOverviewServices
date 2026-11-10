import PrebillApiClient from './PrebillApiClient.js';
import { isValidOrganizationId, sendError } from './http.js';

// Lecturas de ReportesSandbox que una función expone tal cual: GET /:organizationId/:catalogo.
// Solo los catálogos de la lista blanca; cualquier otro responde 404. Esto sustituye a la ruta
// genérica del time entry, que reenviaba cualquier ruta a la API.
//
// catalogs: { clientes: [], 'categorias-gasto': ['todos'], gastos: ['proyecto_id', ...] }
//           llave = ruta de la API; valor = parámetros de query que se reenvían.
const PARAM_VALUE = /^[\w.,:-]{0,64}$/; // vacío permitido: banderas como ?todos

export function registerCatalogRoutes(app, catalogs, { createClient = (org, req) => new PrebillApiClient(org, { req }) } = {}) {
    const allowed = new Map(Object.entries(catalogs));
    app.get('/:organizationId/:catalog', async (req, res) => {
        const { organizationId, catalog } = req.params;
        if (!allowed.has(catalog)) {
            return res.status(404).json({ error: 'Recurso no disponible.', stage: 'catalog', outcome_unknown: false });
        }
        if (!isValidOrganizationId(organizationId)) {
            return res.status(400).json({ error: 'Organización inválida.', stage: 'validation', outcome_unknown: false });
        }
        const params = {};
        for (const name of allowed.get(catalog)) {
            const value = req.query[name];
            if (value === undefined) continue;
            if (typeof value !== 'string' || !PARAM_VALUE.test(value)) {
                return res.status(400).json({ error: `Filtro inválido: ${name}.`, stage: 'validation', outcome_unknown: false });
            }
            params[name] = value;
        }
        try {
            return res.json(await createClient(organizationId, req).request('get', '/' + catalog, { params, stage: 'catalog_' + catalog }));
        } catch (error) {
            return sendError(res, error, `Error interno consultando ${catalog}.`);
        }
    });
}
