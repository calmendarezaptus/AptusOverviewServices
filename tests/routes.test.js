import test from 'node:test';
import assert from 'node:assert/strict';
import app, { CATALOGS } from '../index.js';

// Sin red: sin contexto de Catalyst la conexión falla antes de salir, y debe responder 503 en JSON.
test('rutas: catálogos permitidos, el resto 404 y sin conexión 503', async () => {
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const original = console.error; console.error = () => {};
    try {
        let r = await fetch(`${base}/636939444/prebills`);
        assert.equal(r.status, 404);
        r = await fetch(`${base}/636939444/a/b/c`);
        assert.equal(r.status, 404); assert.equal((await r.json()).stage, undefined);
        r = await fetch(`${base}/abc/clientes`);
        assert.equal(r.status, 400);
        for (const catalog of Object.keys(CATALOGS)) {
            r = await fetch(`${base}/636939444/${catalog}`);
            assert.equal(r.status, 503, catalog);
            assert.equal((await r.json()).stage, 'connection');
        }
    } finally { server.close(); console.error = original; }
});

test('rutas de escritura: validan sin red; con datos válidos fallan en la conexión (503)', async () => {
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/636939444`;
    const send = (method, path, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const original = console.error; console.error = () => {};
    try {
        assert.equal((await send('POST', '/liberaciones', { desde: '2026-11-01', hasta: '2026-11-30' })).status, 400); // sin cliente ni todos
        assert.equal((await send('PATCH', '/proyectos/25', { cliente_id: '1' })).status, 400);
        assert.equal((await send('POST', '/tarifas', { moneda: 'MXN', tarifa: 1 })).status, 400);
        assert.equal((await send('POST', '/responsables', { rol: 'cobranza', nombre: 'Ana', cliente_id: '1' })).status, 400);
        assert.equal((await send('POST', '/proyectos/25/crear-en-books', {})).status, 404);
        assert.equal((await send('POST', '/proyectos/25/sincronizar-tareas', {})).status, 404);
        assert.equal((await send('GET', '/proyectos/abc')).status, 400);
        let r = await send('POST', '/liberaciones', { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: '446794000018976759' });
        assert.equal(r.status, 503); assert.equal((await r.json()).stage, 'connection');
        assert.equal((await send('PATCH', '/proyectos/25', { honorario_fijo: 26000 })).status, 503);
        assert.equal((await send('GET', '/impuestos')).status, 503);
    } finally { server.close(); console.error = original; }
});
