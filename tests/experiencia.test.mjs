// node --test tests/experiencia.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarEnvioHubspot, errorHubspot, normalizarOrigen, normalizarTiendaOrigen, validarSuscripcion } from '../src/lib/experiencia.ts';

const base = {
    correo: 'ana@correo.co',
    telefono: '+57 310 000 0000',
    nombre: 'Ana',
    apellido: 'Pérez',
    datos: true,
};

test('origen solo admite qr y nfc', () => {
    assert.equal(normalizarOrigen('QR'), 'qr');
    assert.equal(normalizarOrigen(' nfc '), 'nfc');
    assert.equal(normalizarOrigen('<script>'), 'directo');
    assert.equal(normalizarOrigen(null), 'directo');
});

test('tienda_origen solo admite ids de tiendas', () => {
    const ids = ['unicentro', 'retiro', 'santa_barbara', 'palatino'];
    assert.equal(normalizarTiendaOrigen(' Retiro ', ids), 'retiro');
    assert.equal(normalizarTiendaOrigen('santa_barbara', ids), 'santa_barbara');
    assert.equal(normalizarTiendaOrigen('andino', ids), 'ninguna');
    assert.equal(normalizarTiendaOrigen(null, ids), 'ninguna');
});

test('validación exige todos los campos y la autorización de datos', () => {
    assert.deepEqual(validarSuscripcion(base), {});
    assert.deepEqual(
        Object.keys(validarSuscripcion({ correo: 'x@y', telefono: 'abc', nombre: ' ', apellido: '', datos: false })),
        ['correo', 'telefono', 'nombre', 'apellido', 'datos'],
    );
});

test('envía los mismos campos que el footer', () => {
    const envio = armarEnvioHubspot(base, { textoDatos: 'texto', pageUri: 'u', pageName: 'p' });
    assert.deepEqual(
        envio.fields.map((f) => f.name),
        ['email', 'mobilephone', 'firstname', 'lastname'],
    );
    assert.equal(envio.legalConsentOptions.consent.consentToProcess, true);
});

test('errores de HubSpot', () => {
    assert.equal(errorHubspot({ errors: [{ errorType: 'INVALID_EMAIL' }] }).campo, 'correo');
    assert.equal(errorHubspot(null).campo, undefined);
});
