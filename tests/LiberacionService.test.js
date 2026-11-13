import test from 'node:test';
import assert from 'node:assert/strict';
import LiberacionService, { validateLiberacion } from '../services/LiberacionService.js';

const CLIENTE = '446794000018976759';
const ok = { tiempos_liberados: 1, gastos_liberados: 1, cargos_fijos_liberados: 0 };

function fixture(response = ok) {
    const calls = [];
    const api = { async request(method, path, opts) { calls.push({ method, path, opts }); return response; } };
    return { service: new LiberacionService('636939444', { api }), calls };
}

test('valida antes de llamar a la API', async () => {
    for (const body of [{}, { desde: '2026-11-01' }, { desde: '2026-02-30', hasta: '2026-03-01', cliente_id: CLIENTE },
        { desde: '2026-11-30', hasta: '2026-11-01', cliente_id: CLIENTE }, { desde: '2025-01-01', hasta: '2026-11-30', cliente_id: CLIENTE },
        { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: 2 }, { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: 'abc' },
        { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: CLIENTE, todos: true }]) {
        const { service, calls } = fixture();
        await assert.rejects(service.liberar(body), e => e.status === 400, JSON.stringify(body));
        assert.equal(calls.length, 0);
    }
});

test('sin cliente exige todos: true (libera a todos los clientes)', async () => {
    assert.throws(() => validateLiberacion('1', { desde: '2026-11-01', hasta: '2026-11-30' }), /TODOS/);
    assert.throws(() => validateLiberacion('1', { desde: '2026-11-01', hasta: '2026-11-30', todos: 'true' }), /TODOS/);
    const { service, calls } = fixture();
    const result = await service.liberar({ desde: '2026-11-01', hasta: '2026-11-30', todos: true });
    assert.deepEqual(calls[0].opts.data, { desde: '2026-11-01', hasta: '2026-11-30' });
    assert.equal(result.todos, true);
});

test('por cliente: solo reenvía desde, hasta y cliente_id', async () => {
    const { service, calls } = fixture();
    const result = await service.liberar({ desde: '2026-11-01', hasta: '2026-11-30', cliente_id: CLIENTE, extra: 1, liberado: 0 });
    assert.deepEqual([calls[0].method, calls[0].path], ['post', '/liberaciones']);
    assert.deepEqual(calls[0].opts.data, { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: CLIENTE });
    assert.deepEqual(result, { desde: '2026-11-01', hasta: '2026-11-30', cliente_id: CLIENTE, todos: false, ...ok });
});

test('respuesta sin conteos se marca como incierta', async () => {
    const { service } = fixture({ ok: true });
    await assert.rejects(service.liberar({ desde: '2026-11-01', hasta: '2026-11-30', cliente_id: CLIENTE }), e => e.status === 502 && e.outcome_unknown === true);
});
