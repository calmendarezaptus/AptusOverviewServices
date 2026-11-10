import axios from 'axios';
import DbConfigService from './DbConfigService.js';

// Cliente único hacia la API de ReportesSandbox. Usa la misma conexión que el catálogo genérico
// (APTUS_MIRROR_DB_ENDPOINT / APTUS_MIRROR_DB_TOKEN en cm_global_vars), que ya responde con la
// forma de ReportesSandbox (/clientes, /proyectos, /abogados, /tiempos).
export class PrebillApiError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

// Estos status traen un mensaje en español pensado para el usuario; se reenvían tal cual.
const PASS_THROUGH = new Set([400, 404, 409, 422]);
const WRITES = new Set(['post', 'patch', 'put', 'delete']);

function defaultConfig(organizationId, req) {
    return {
        async get() {
            const config = await new DbConfigService(organizationId, req).getDbConfig();
            return { endpoint: config.APTUS_MIRROR_DB_ENDPOINT, token: config.APTUS_MIRROR_DB_TOKEN };
        }
    };
}

export default class PrebillApiClient {
    constructor(organizationId, { http = axios, config = null, req = null } = {}) {
        this.organizationId = organizationId;
        this.http = http;
        this.config = config ?? defaultConfig(organizationId, req);
    }

    async request(method, path, { params = {}, data, stage = method + ' ' + path } = {}) {
        let connection;
        try {
            connection = await this.config.get();
        } catch {
            const error = new PrebillApiError('Faltan parámetros de conexión con el servicio de Aptus. Por favor contacte a un administrador.', 503);
            error.stage = 'connection'; error.outcome_unknown = false;
            throw error;
        }
        if (!connection?.endpoint || !connection?.token) {
            const error = new PrebillApiError('Faltan parámetros de conexión con el servicio de Aptus. Por favor contacte a un administrador.', 503);
            error.stage = 'connection'; error.outcome_unknown = false;
            throw error;
        }
        // Sin doble slash: el proxy de Apache lo interpreta como otro host.
        const url = String(connection.endpoint).replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
        try {
            // El token va en el query string: Apache no revisa headers.
            const response = await this.http.request({ method, url, data, params: { ...params, token: connection.token }, timeout: 30000 });
            if (typeof response.data !== 'object' || response.data === null) throw new Error('Respuesta no JSON.');
            return response.data;
        } catch (cause) {
            const status = cause.response?.status;
            const apiMessage = typeof cause.response?.data?.error === 'string' ? cause.response.data.error : null;
            const error = PASS_THROUGH.has(status) && apiMessage
                ? new PrebillApiError(apiMessage, status)
                : new PrebillApiError('No se pudo completar la operación en el servicio de Aptus.', 502);
            error.stage = stage;
            error.provider_status = status ?? null;
            error.outcome_unknown = WRITES.has(method) && !cause.response;
            // Nunca se propaga `cause`: su config trae la URL y el token.
            throw error;
        }
    }
}
