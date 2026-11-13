import catalyst from 'zcatalyst-sdk-node';

// Qué abogados pueden ser responsables y de qué: facturación, cobranza o general (ambos).
// ReportesSandbox no tiene ese dato, así que se guarda en el Data Store de este proyecto de
// Catalyst (tabla AbogadosResponsables), una fila por organización y abogado. No toca Books.
export const TABLE = 'AbogadosResponsables';
export const TIPOS = ['facturacion', 'cobranza', 'general'];

export class ElegibilidadError extends Error {
    constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

// ¿Este tipo de responsable puede cubrir ese rol? "general" cubre facturación y cobranza.
export const puedeRol = (tipo, rol) => tipo === 'general' || (TIPOS.includes(tipo) && tipo === rol);

// Data Store real. Los valores que entran al ZCQL ya vienen validados (solo dígitos).
export function createDataStore(req) {
    let app = null;
    const ds = () => (app ??= catalyst.initialize(req));
    const wrap = (stage, write) => async fn => {
        try { return await fn(); } catch (cause) {
            // Sin propagar `cause`. Solo el código, para distinguir "falta la tabla".
            const code = String(cause?.code ?? cause?.errorCode ?? '');
            const missing = /INVALID_TABLE|NO_SUCH_TABLE|TABLE_NOT_FOUND|INVALID_ID/i.test(code) || /table/i.test(String(cause?.message ?? '')) && /not|invalid|exist/i.test(String(cause?.message ?? ''));
            console.error('Error en el Data Store', { stage, code: code || null });
            throw new ElegibilidadError(missing
                ? `Falta la tabla ${TABLE} en el Data Store de OverviewForAptusFinancials.`
                : 'No se pudo consultar quién puede ser responsable. Intenta de nuevo.', 503, { stage, outcome_unknown: write });
        }
    };
    return {
        list: org => wrap('datastore_list', false)(async () => {
            const rows = await ds().zcql().executeZCQLQuery(`SELECT ROWID, abogado_id, tipo FROM ${TABLE} WHERE organization_id = '${org}'`);
            return (rows || []).map(r => r[TABLE] ?? r).map(r => ({ rowid: String(r.ROWID), abogado_id: Number(r.abogado_id), tipo: r.tipo }));
        }),
        insert: (org, abogadoId, tipo) => wrap('datastore_insert', true)(() => ds().datastore().table(TABLE).insertRow({ organization_id: org, abogado_id: abogadoId, tipo })),
        update: (rowid, tipo) => wrap('datastore_update', true)(() => ds().datastore().table(TABLE).updateRow({ ROWID: rowid, tipo })),
        remove: rowid => wrap('datastore_delete', true)(() => ds().datastore().table(TABLE).deleteRow(rowid)),
    };
}

export default class ElegibilidadService {
    constructor(organizationId, { store = null, req = null } = {}) {
        this.organizationId = organizationId;
        this.store = store ?? createDataStore(req);
    }

    // [{ abogado_id, tipo }], una por abogado (si hubiera duplicadas gana la primera).
    async list() {
        const seen = new Set();
        return (await this.store.list(this.organizationId))
            .filter(r => Number.isInteger(r.abogado_id) && TIPOS.includes(r.tipo) && !seen.has(r.abogado_id) && seen.add(r.abogado_id))
            .map(({ abogado_id, tipo }) => ({ abogado_id, tipo }));
    }

    async tipoDe(abogadoId) {
        return (await this.list()).find(r => r.abogado_id === abogadoId)?.tipo ?? null;
    }

    // tipo null = ya no puede ser responsable. Las asignaciones que ya tenga en proyectos no se tocan.
    async set(abogadoId, tipo) {
        if (tipo !== null && !TIPOS.includes(tipo)) throw new ElegibilidadError('tipo debe ser facturacion, cobranza, general o null.');
        const rows = (await this.store.list(this.organizationId)).filter(r => r.abogado_id === abogadoId);
        const [first, ...dups] = rows;
        if (tipo === null) { for (const r of rows) await this.store.remove(r.rowid); }
        else if (!first) await this.store.insert(this.organizationId, abogadoId, tipo);
        else {
            if (first.tipo !== tipo) await this.store.update(first.rowid, tipo);
            for (const r of dups) await this.store.remove(r.rowid);
        }
        return { abogado_id: abogadoId, tipo };
    }
}
