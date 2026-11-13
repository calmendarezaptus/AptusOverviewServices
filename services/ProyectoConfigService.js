import PrebillApiClient from '../core/PrebillApiClient.js';

// Configuración de un proyecto en ReportesSandbox: datos (PATCH /proyectos/:id), tarifas del
// proyecto y responsables del proyecto. NO escribe en Books: crear el proyecto en Books y sincronizar
// tareas quedan fuera a propósito. Las tarifas y responsables que se tocan desde aquí siempre son
// del proyecto (nunca generales, de cliente o de otro proyecto).
export class ConfigError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

const orgId = value => typeof value === 'string' && /^\d+$/.test(value);
const localId = value => Number.isInteger(value) && value > 0;
const idParam = value => typeof value === 'string' && /^\d{1,12}$/.test(value);
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.round(value * 100) === value * 100;

export const MONEDAS = ['MXN', 'USD', 'EUR'];
export const TIPOS_COBRO = ['horas', 'fijo', 'iguala'];
export const ROLES = ['facturacion', 'cobranza'];

// Campos editables del proyecto. `cliente_id` no se edita (regla de la API) y `zoho_project_id`
// (enlace con Books) se deja fuera de esta pantalla.
export function validateProyectoPatch(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ConfigError('Se requiere un objeto JSON.');
    const payload = {};
    if (body.nombre !== undefined) {
        if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 200) throw new ConfigError('nombre debe ser texto de 1 a 200 caracteres.');
        payload.nombre = body.nombre.trim();
    }
    if (body.moneda !== undefined) {
        if (!MONEDAS.includes(body.moneda)) throw new ConfigError('moneda debe ser MXN, USD o EUR.');
        payload.moneda = body.moneda;
    }
    if (body.activo !== undefined) {
        if (typeof body.activo !== 'boolean') throw new ConfigError('activo debe ser booleano.');
        payload.activo = body.activo ? 1 : 0;
    }
    if (body.tipo_cobro !== undefined) {
        if (!TIPOS_COBRO.includes(body.tipo_cobro)) throw new ConfigError('tipo_cobro debe ser horas, fijo o iguala.');
        payload.tipo_cobro = body.tipo_cobro;
    }
    if (body.honorario_fijo !== undefined) {
        if (body.honorario_fijo !== null && !money(body.honorario_fijo)) throw new ConfigError('honorario_fijo debe ser un número ≥ 0 con máximo 2 decimales, o vacío.');
        payload.honorario_fijo = body.honorario_fijo;
    }
    if (payload.tipo_cobro === 'iguala' && !(payload.honorario_fijo > 0)) throw new ConfigError('Una iguala requiere el honorario mensual.');
    if (body.zoho_tax_id !== undefined) {
        if (typeof body.zoho_tax_id !== 'string' || (body.zoho_tax_id !== '' && !/^\d{1,25}$/.test(body.zoho_tax_id))) throw new ConfigError('zoho_tax_id debe ser el ID del impuesto en Books, o vacío para usar el del cliente.');
        payload.zoho_tax_id = body.zoho_tax_id;
    }
    if (!Object.keys(payload).length) throw new ConfigError('No hay cambios que guardar.');
    return payload;
}

// Tarifa del proyecto: proyecto + (abogado o nivel o ninguno = todo el proyecto) + moneda.
export function validateTarifa(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ConfigError('Se requiere un objeto JSON.');
    if (!localId(body.proyecto_id)) throw new ConfigError('proyecto_id debe ser el ID del proyecto en Aptus (entero).');
    if (!MONEDAS.includes(body.moneda)) throw new ConfigError('moneda debe ser MXN, USD o EUR.');
    if (!money(body.tarifa)) throw new ConfigError('tarifa debe ser un número ≥ 0 con máximo 2 decimales.');
    const payload = { proyecto_id: body.proyecto_id, moneda: body.moneda, tarifa: body.tarifa };
    const hasLawyer = body.abogado_id !== undefined && body.abogado_id !== null;
    const hasLevel = body.tipo_id !== undefined && body.tipo_id !== null;
    if (hasLawyer && hasLevel) throw new ConfigError('Una tarifa es por abogado o por nivel, no ambos.');
    if (hasLawyer) { if (!localId(body.abogado_id)) throw new ConfigError('abogado_id debe ser un entero.'); payload.abogado_id = body.abogado_id; }
    if (hasLevel) { if (!localId(body.tipo_id)) throw new ConfigError('tipo_id debe ser un entero.'); payload.tipo_id = body.tipo_id; }
    return payload;
}

export function validateResponsable(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ConfigError('Se requiere un objeto JSON.');
    if (!ROLES.includes(body.rol)) throw new ConfigError('rol debe ser facturacion o cobranza.');
    if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 120) throw new ConfigError('nombre debe ser texto de 1 a 120 caracteres.');
    if (!localId(body.proyecto_id)) throw new ConfigError('proyecto_id debe ser el ID del proyecto en Aptus (entero).');
    return { rol: body.rol, nombre: body.nombre.trim(), proyecto_id: body.proyecto_id };
}

const unexpected = what => Object.assign(new ConfigError(`El servicio de Aptus devolvió ${what} con formato inesperado.`, 502), { stage: 'response', outcome_unknown: true });

export default class ProyectoConfigService {
    constructor(organizationId, { api = null, req = null } = {}) {
        if (!orgId(organizationId)) throw new ConfigError('Organización inválida.');
        this.organizationId = organizationId;
        this.api = api ?? new PrebillApiClient(organizationId, { req });
    }

    check(id, what) { if (!idParam(id)) throw new ConfigError(`ID de ${what} inválido.`); }

    async getProyecto(id) {
        this.check(id, 'proyecto');
        const data = await this.api.request('get', '/proyectos/' + id, { stage: 'get_proyecto' });
        if (!data || !Number.isInteger(data.id)) throw unexpected('un proyecto');
        return data;
    }

    async updateProyecto(id, body) {
        this.check(id, 'proyecto');
        const payload = validateProyectoPatch(body);
        const data = await this.api.request('patch', '/proyectos/' + id, { data: payload, stage: 'update_proyecto' });
        if (!data || !Number.isInteger(data.id)) throw unexpected('un proyecto');
        return data;
    }

    async createTarifa(body) {
        const payload = validateTarifa(body);
        const data = await this.api.request('post', '/tarifas', { data: payload, stage: 'create_tarifa' });
        if (!data || !Number.isInteger(data.id)) throw unexpected('una tarifa');
        return data;
    }

    // Antes de editar o borrar se confirma que la tarifa es de un proyecto: desde aquí no se tocan
    // tarifas generales, de cliente, de abogado ni de nivel.
    async projectTarifa(id) {
        this.check(id, 'tarifa');
        const tarifa = await this.api.request('get', '/tarifas/' + id, { stage: 'get_tarifa' });
        if (!tarifa || !Number.isInteger(tarifa.id)) throw unexpected('una tarifa');
        if (tarifa.proyecto_id == null) throw new ConfigError('Esta tarifa no es de un proyecto; edítala desde Tarifas en Aptus.', 403);
        return tarifa;
    }

    async updateTarifa(id, body) {
        if (!body || !money(body.tarifa)) throw new ConfigError('tarifa debe ser un número ≥ 0 con máximo 2 decimales.');
        await this.projectTarifa(id);
        const data = await this.api.request('patch', '/tarifas/' + id, { data: { tarifa: body.tarifa }, stage: 'update_tarifa' });
        if (!data || !Number.isInteger(data.id)) throw unexpected('una tarifa');
        return data;
    }

    async deleteTarifa(id) {
        await this.projectTarifa(id);
        return this.api.request('delete', '/tarifas/' + id, { stage: 'delete_tarifa' });
    }

    async resolverTarifa(query) {
        if (!idParam(query?.abogado_id) || !idParam(query?.proyecto_id)) throw new ConfigError('Indica abogado_id y proyecto_id.');
        return this.api.request('get', '/tarifas/resolver', { params: { abogado_id: query.abogado_id, proyecto_id: query.proyecto_id }, stage: 'resolver_tarifa' });
    }

    async resolverResponsables(query) {
        if (!idParam(query?.proyecto_id)) throw new ConfigError('Indica proyecto_id.');
        return this.api.request('get', '/responsables/resolver', { params: { proyecto_id: query.proyecto_id }, stage: 'resolver_responsables' });
    }

    async createResponsable(body) {
        const payload = validateResponsable(body);
        const data = await this.api.request('post', '/responsables', { data: payload, stage: 'create_responsable' });
        if (!data || !Number.isInteger(data.id)) throw unexpected('un responsable');
        return data;
    }

    // Solo se borran asignaciones de proyecto (la lista no tiene GET por id: se busca en el listado).
    async deleteResponsable(id) {
        this.check(id, 'responsable');
        const list = await this.api.request('get', '/responsables', { stage: 'list_responsables' });
        const item = Array.isArray(list) ? list.find(r => String(r.id) === id) : null;
        if (!item) throw Object.assign(new ConfigError('Responsable no encontrado', 404), { stage: 'delete_responsable' });
        if (item.proyecto_id == null) throw new ConfigError('Esta asignación es del cliente, no del proyecto; quítala desde Aptus.', 403);
        return this.api.request('delete', '/responsables/' + id, { stage: 'delete_responsable' });
    }

    async impuestos() {
        const data = await this.api.request('get', '/zoho/impuestos', { stage: 'impuestos' });
        if (!Array.isArray(data)) throw unexpected('los impuestos');
        return data;
    }

    async clienteConfig(clienteId) {
        if (typeof clienteId !== 'string' || !/^\d{1,25}$/.test(clienteId)) throw new ConfigError('ID de cliente inválido.');
        return this.api.request('get', '/clientes/' + clienteId + '/config', { stage: 'cliente_config' });
    }
}
