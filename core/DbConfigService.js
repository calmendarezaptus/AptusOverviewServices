import catalyst from 'zcatalyst-sdk-node';
import axios from 'axios';
import AuthService from './AuthService.js';

class DbConfigService {
    constructor(organizationId, req) {
        this.organizationId = organizationId;
        this.catalystApp = catalyst.initialize(req);
    }

    async getDbConfig() {
        const cacheSegment = this.catalystApp.cache().segment('APTUS_MIRROR_CONN_DATA');
        const tokenKey = `${this.organizationId}_APTUS_MIRROR_DB_TOKEN`;
        const endpointKey = `${this.organizationId}_APTUS_MIRROR_DB_ENDPOINT`;

        let tokenValue = null;
        let endpointValue = null;

        try {
            // Validamos si existen en caché
            tokenValue = await cacheSegment.getValue(tokenKey);
            endpointValue = await cacheSegment.getValue(endpointKey);
        } catch (error) {
            // Error o caché expirado (Catalyst tira error si no encuentra la llave)
            console.log(`Cache miss para ${this.organizationId}`);
        }

        if (tokenValue && endpointValue) {
            return {
                APTUS_MIRROR_DB_TOKEN: tokenValue,
                APTUS_MIRROR_DB_ENDPOINT: endpointValue
            };
        }

        // Si no existen, obtenemos de AuthService y Zoho API
        const authService = new AuthService(this.organizationId);
        const accessToken = await authService.getAccessToken();

        const response = await axios.get(`https://www.zohoapis.com/books/v3/cm_global_vars?organization_id=${this.organizationId}`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
            }
        });

        const records = response.data.module_records || [];

        let tokenRecordId = null;
        let endpointRecordId = null;

        records.forEach(record => {
            if (record.record_name === 'APTUS_MIRROR_DB_TOKEN') {
                tokenRecordId = record.module_record_id;
            }
            if (record.record_name === 'APTUS_MIRROR_DB_ENDPOINT') {
                endpointRecordId = record.module_record_id;
            }
        });

        const missingKeys = [];
        if (!tokenRecordId) missingKeys.push('APTUS_MIRROR_DB_TOKEN');
        if (!endpointRecordId) missingKeys.push('APTUS_MIRROR_DB_ENDPOINT');

        if (missingKeys.length > 0) {
            throw new Error(`Faltan parámetros de conexión con el servicio de Aptus. Por favor contacte a un administrador. Llaves faltantes: ${missingKeys.join(', ')}`);
        }

        // Si existen, consultamos por su ID para obtener el cf_value
        const fetchRecordValue = async (recordId) => {
            const res = await axios.get(`https://www.zohoapis.com/books/v3/cm_global_vars/${recordId}?organization_id=${this.organizationId}`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`
                }
            });
            return res.data.module_record_hash.cf_value;
        };

        tokenValue = await fetchRecordValue(tokenRecordId);
        endpointValue = await fetchRecordValue(endpointRecordId);

        if (tokenValue && endpointValue) {
            // Guardamos en caché por un límite de 6 horas (parámetro de expiración)
            try {
                await cacheSegment.put(tokenKey, tokenValue, 6);
                await cacheSegment.put(endpointKey, endpointValue, 6);
            } catch (error) {
                console.error("Error al guardar en caché: ", error.message);
            }

            return {
                APTUS_MIRROR_DB_TOKEN: tokenValue,
                APTUS_MIRROR_DB_ENDPOINT: endpointValue
            };
        }

        throw new Error("No se pudo obtener APTUS_MIRROR_DB_TOKEN o APTUS_MIRROR_DB_ENDPOINT desde Zoho.");
    }
}

export default DbConfigService;
