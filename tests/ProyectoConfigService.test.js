import test from 'node:test';
import assert from 'node:assert/strict';
import ProyectoConfigService, { validateProyectoPatch, validateTarifa, validateResponsable } from '../services/ProyectoConfigService.js';

function fixture(responses = {}) {
    const calls = [];
    const api = {
        async request(method, path, opts) {
            calls.push({ method, path, opts });
            const key = `${method} ${path}`;
            if (key in responses) return typeof responses[key] === 'function' ? responses[key]() : responses[key];
            return { id: 1 };
        },
    };
    return { service: new ProyectoConfigService('636939444', { api }), calls };
}
const writes = calls => calls.filter(c => c.method !== 'get');

test('datos del proyecto: solo campos permitidos, sin cliente ni enlace a Books', () => {
    assert.deepEqual(validateProyectoPatch({ tipo_cobro: 'iguala', honorario_fijo: 25000, activo: true, zoho_tax_id: '', cliente_id: 'x', zoho_project_id: '1', extra: 1 }),
        { tipo_cobro: 'iguala', honorario_fijo: 25000, activo: 1, zoho_tax_id: '' });
    for (const body of [{}, { moneda: 'COP' }, { tipo_cobro: 'mensual' }, { honorario_fijo: -1 }, { honorario_fijo: 1.234 }, { activo: 1 },
        { tipo_cobro: 'iguala', honorario_fijo: null }, { zoho_tax_id: 'IVA' }, { nombre: '  ' }]) {
        assert.throws(() => validateProyectoPatch(body), undefined, JSON.stringify(body));
    }
});

test('PATCH /proyectos/:id con el cuerpo validado', async () => {
    const { service, calls } = fixture();
    await service.updateProyecto('25', { honorario_fijo: 26000 });
    assert.deepEqual([calls[0].method, calls[0].path, calls[0].opts.data], ['patch', '/proyectos/25', { honorario_fijo: 26000 }]);
    await assert.rejects(service.updateProyecto('25/../tarifas', { activo: true }), e => e.status === 400);
    assert.throws(() => new ProyectoConfigService('abc', { api: {} }), e => e.status === 400);
});

test('tarifas: siempre del proyecto; abogado o nivel, no ambos', () => {
    assert.deepEqual(validateTarifa({ proyecto_id: 18, moneda: 'MXN', tarifa: 1000, tipo_id: 13, cliente_id: '1' }), { proyecto_id: 18, moneda: 'MXN', tarifa: 1000, tipo_id: 13 });
    for (const body of [{ moneda: 'MXN', tarifa: 1 }, { proyecto_id: 18, moneda: 'MXN', tarifa: -5 }, { proyecto_id: 18, moneda: 'XXX', tarifa: 5 },
        { proyecto_id: 18, moneda: 'MXN', tarifa: 5, abogado_id: 2, tipo_id: 3 }]) {
        assert.throws(() => validateTarifa(body), undefined, JSON.stringify(body));
    }
});

test('editar o borrar una tarifa que no es de proyecto se rechaza sin escribir', async () => {
    let f = fixture({ 'get /tarifas/9': { id: 9, proyecto_id: null, nivel: 'general' } });
    await assert.rejects(f.service.deleteTarifa('9'), e => e.status === 403);
    await assert.rejects(f.service.updateTarifa('9', { tarifa: 10 }), e => e.status === 403);
    assert.equal(writes(f.calls).length, 0);
    f = fixture({ 'get /tarifas/26': { id: 26, proyecto_id: 18 }, 'patch /tarifas/26': { id: 26, tarifa: 1100 } });
    await f.service.updateTarifa('26', { tarifa: 1100, moneda: 'USD' });
    assert.deepEqual(writes(f.calls)[0].opts.data, { tarifa: 1100 });
    await f.service.deleteTarifa('26');
    assert.deepEqual(writes(f.calls).map(c => `${c.method} ${c.path}`), ['patch /tarifas/26', 'delete /tarifas/26']);
});

test('responsables: solo de proyecto; borrar busca la asignación y rechaza las de cliente', async () => {
    assert.deepEqual(validateResponsable({ rol: 'cobranza', abogado_id: 3, nombre: 'X', proyecto_id: 8, cliente_id: '1' }), { rol: 'cobranza', abogado_id: 3, proyecto_id: 8 });
    for (const body of [{ rol: 'otro', abogado_id: 3, proyecto_id: 8 }, { rol: 'cobranza', nombre: 'Ana', proyecto_id: 8 }, { rol: 'cobranza', abogado_id: 3, cliente_id: '1' }]) {
        assert.throws(() => validateResponsable(body))
    }
    const list = [{ id: 4, proyecto_id: null, cliente_id: '1' }, { id: 5, proyecto_id: 8 }]
    let f = fixture({ 'get /responsables': list });
    await assert.rejects(f.service.deleteResponsable('4'), e => e.status === 403);
    await assert.rejects(f.service.deleteResponsable('77'), e => e.status === 404 && e.stage === 'delete_responsable');
    assert.equal(writes(f.calls).length, 0);
    await f.service.deleteResponsable('5');
    assert.deepEqual(writes(f.calls).map(c => `${c.method} ${c.path}`), ['delete /responsables/5']);
});

test('lecturas auxiliares validan parámetros', async () => {
    const { service, calls } = fixture({ 'get /zoho/impuestos': [{ zoho_id: '1', nombre: 'IVA' }] });
    await assert.rejects(service.resolverTarifa({ abogado_id: '6' }), e => e.status === 400);
    await service.resolverTarifa({ abogado_id: '6', proyecto_id: '8', extra: 'x' });
    assert.deepEqual(calls[0].opts.params, { abogado_id: '6', proyecto_id: '8' });
    assert.equal((await service.impuestos()).length, 1);
    await assert.rejects(service.clienteConfig('abc'), e => e.status === 400);
});

// La marca vive en ReportesSandbox (campo `responsable` de /abogados).
const ANA = { id: 3, nombre: 'Ana Ruiz QA', zoho_user_nombre: 'Carolina Litter', activo: 1, status: 'activo' };

test('abogados responsables: se leen de /abogados (solo lectura)', async () => {
    const f = fixture({ 'get /abogados': [{ ...ANA, responsable: 'cobranza' }, { id: 5, responsable: null }, { id: 6, responsable: 'general' }] });
    assert.deepEqual(await f.service.listElegibles(), [{ abogado_id: 3, tipo: 'cobranza' }, { abogado_id: 6, tipo: 'general' }]);
    assert.equal(writes(f.calls).length, 0);
    assert.equal(f.service.setElegible, undefined);
    await assert.rejects(fixture({ 'get /abogados': [{ id: 3 }] }).service.listElegibles(), e => e.status === 502);
});

test('asignar responsable: revisa la marca antes de escribir y manda abogado_id', async () => {
    const f = fixture({
        'get /abogados/3': { ...ANA, responsable: 'cobranza' }, 'get /abogados/9': { id: 9, responsable: null },
        'get /abogados/5': { id: 5, nombre: 'Luis', activo: 1, responsable: 'general' }, 'get /abogados/6': { id: 6, activo: 0, status: 'inactivo', responsable: 'general' },
        'post /responsables': () => (f.calls.at(-1).opts.data.rol === 'ambos'
            ? { rol: 'ambos', asignaciones: [{ id: 40, ya_existia: true }, { id: 41, ya_existia: false }] } : { id: 39, rol: 'cobranza' }),
    });
    await assert.rejects(f.service.createResponsable({ rol: 'cobranza', abogado_id: 9, proyecto_id: 8 }), e => e.status === 403);
    await assert.rejects(f.service.createResponsable({ rol: 'facturacion', abogado_id: 3, proyecto_id: 8 }), e => e.status === 403 && /cobranza/.test(e.message));
    await assert.rejects(f.service.createResponsable({ rol: 'ambos', abogado_id: 3, proyecto_id: 8 }), e => e.status === 403);
    await assert.rejects(f.service.createResponsable({ rol: 'ambos', abogado_id: 6, proyecto_id: 8 }), e => e.status === 422);
    assert.equal(writes(f.calls).length, 0);
    assert.deepEqual(await f.service.createResponsable({ rol: 'cobranza', abogado_id: 3, proyecto_id: 8, nombre: 'X' }), { id: 39, asignados: [{ id: 39, rol: 'cobranza' }] });
    assert.deepEqual(writes(f.calls).at(-1).opts.data, { rol: 'cobranza', abogado_id: 3, proyecto_id: 8 });
    const r = await f.service.createResponsable({ rol: 'ambos', abogado_id: 5, proyecto_id: 8 });
    assert.deepEqual(r.asignados.map(a => a.id), [40, 41]);
});
