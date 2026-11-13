import PrebillApiClient from '../core/PrebillApiClient.js';

// Liberaciones (POST /liberaciones): marca tiempos, gastos y honorarios fijos de un rango como
// listos para Prebill. No se puede deshacer (la API no tiene "quitar liberación"). Los tiempos no
// facturables nunca se liberan. Sin cliente libera a TODOS los clientes: se exige `todos: true`.
export class LiberacionError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

const orgId = value => typeof value === 'string' && /^\d+$/.test(value);
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const MAX_DIAS = 366;

export function validateLiberacion(organizationId, body) {
    if (!orgId(organizationId)) throw new LiberacionError('Organización inválida.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LiberacionError('Se requiere un objeto JSON.');
    if (!isDate(body.desde) || !isDate(body.hasta)) throw new LiberacionError('desde y hasta deben ser fechas válidas YYYY-MM-DD.');
    if (body.desde > body.hasta) throw new LiberacionError('La fecha inicial no puede ser posterior a la final.');
    if ((Date.parse(body.hasta) - Date.parse(body.desde)) / 86400000 > MAX_DIAS) throw new LiberacionError(`El rango no puede pasar de ${MAX_DIAS} días.`);
    const payload = { desde: body.desde, hasta: body.hasta };
    const hasClient = body.cliente_id !== undefined && body.cliente_id !== null && body.cliente_id !== '';
    if (hasClient) {
        if (typeof body.cliente_id !== 'string' || !/^\d{1,25}$/.test(body.cliente_id)) throw new LiberacionError('cliente_id debe ser el ID del cliente en Books (texto numérico).');
        if (body.todos === true) throw new LiberacionError('Indica un cliente o todos los clientes, no ambos.');
        payload.cliente_id = body.cliente_id;
    } else if (body.todos !== true) {
        throw new LiberacionError('Sin cliente se liberan TODOS los clientes: confirma con todos: true.');
    }
    return payload;
}

export default class LiberacionService {
    constructor(organizationId, { api = null, req = null } = {}) {
        this.organizationId = organizationId;
        this.api = api ?? new PrebillApiClient(organizationId, { req });
    }

    async liberar(body) {
        const payload = validateLiberacion(this.organizationId, body);
        const data = await this.api.request('post', '/liberaciones', { data: payload, stage: 'liberar' });
        const counts = ['tiempos_liberados', 'gastos_liberados', 'cargos_fijos_liberados'];
        if (!data || !counts.every(k => Number.isInteger(data[k]))) {
            const error = new LiberacionError('El servicio de Aptus devolvió una respuesta inesperada al liberar.', 502);
            error.stage = 'response'; error.outcome_unknown = true;
            throw error;
        }
        return { ...payload, todos: !payload.cliente_id, ...Object.fromEntries(counts.map(k => [k, data[k]])) };
    }
}
