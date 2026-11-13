// Qué abogados pueden ser responsables y de qué: facturación, cobranza o general (ambos).
// La marca vive en ReportesSandbox (campo `responsable` de /abogados, desde 2026-11-13); esta
// función solo la lee (se cambia en Configuración de abogados, aptus_settings_services). No toca Books.
export const TIPOS = ['facturacion', 'cobranza', 'general'];

export class ElegibilidadError extends Error {
    constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

// ¿Este tipo de responsable puede cubrir ese rol? "general" cubre facturación y cobranza.
export const puedeRol = (tipo, rol) => tipo === 'general' || (TIPOS.includes(tipo) && tipo === rol);

const unexpected = what => new ElegibilidadError(`El servicio de Aptus devolvió ${what} con formato inesperado.`, 502, { stage: 'response', outcome_unknown: true });

export default class ElegibilidadService {
    constructor(organizationId, { api }) {
        this.organizationId = organizationId;
        this.api = api;
    }

    // [{ abogado_id, tipo }] de los abogados marcados.
    async list() {
        const abogados = await this.api.request('get', '/abogados', { stage: 'list_abogados' });
        if (!Array.isArray(abogados)) throw unexpected('los abogados');
        if (abogados.length && !abogados.some(a => 'responsable' in a)) throw unexpected('los abogados (sin el campo responsable)');
        return abogados.filter(a => Number.isInteger(a.id) && TIPOS.includes(a.responsable)).map(a => ({ abogado_id: a.id, tipo: a.responsable }));
    }

}
