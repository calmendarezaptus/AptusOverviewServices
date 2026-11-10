// Generado por shared/catalyst-core/sync.mjs — verifica que core/ sea idéntico a la versión compartida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Se ignora CRLF/LF: git en Windows puede convertir los saltos de línea al hacer checkout.
const hash = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

test('core/ no fue editado a mano (usar shared/catalyst-core/sync.mjs)', () => {
    const dir = new URL('../core/', import.meta.url);
    const manifest = JSON.parse(fs.readFileSync(new URL('MANIFEST.json', dir), 'utf8'));
    const present = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    assert.deepEqual(present, Object.keys(manifest.files).sort());
    for (const [file, sha] of Object.entries(manifest.files)) {
        assert.equal(hash(fs.readFileSync(new URL(file, dir), 'utf8')), sha, `core/${file} difiere`);
    }
});
