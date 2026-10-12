import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getValidStateCode, WC_STATES_MAP } from '../src/pages/api/create-order';

describe('Verificación de departamentos y estados WooCommerce Colombia', () => {
    it('debe mapear correctamente los códigos con diferencias entre formulario y WooCommerce', () => {
        // Diferencias críticas identificadas
        assert.strictEqual(getValidStateCode('AMA'), 'AMZ', 'Amazonas (AMA -> AMZ)');
        assert.strictEqual(getValidStateCode('ARA'), 'ARU', 'Arauca (ARA -> ARU)');
        assert.strictEqual(getValidStateCode('LAG'), 'GUJ', 'La Guajira (LAG -> GUJ)');
        assert.strictEqual(getValidStateCode('NSA'), 'NOR', 'Norte de Santander (NSA -> NOR)');
        assert.strictEqual(getValidStateCode('VID'), 'VIC', 'Vichada (VID -> VIC)');
        assert.strictEqual(getValidStateCode('BOG'), 'BOG', 'Bogotá D.C. (BOG -> BOG)');
        assert.strictEqual(getValidStateCode('VAC'), 'VAC', 'Valle del Cauca (VAC -> VAC)');
        assert.strictEqual(getValidStateCode('ANT'), 'ANT', 'Antioquia (ANT -> ANT)');
    });

    it('debe resolver la precedencia correcta para departamentos compuestos', () => {
        assert.strictEqual(getValidStateCode('Valle del Cauca'), 'VAC', 'Valle del Cauca no debe confundirse con Cauca');
        assert.strictEqual(getValidStateCode('Cauca'), 'CAU', 'Cauca debe ser CAU');
        assert.strictEqual(getValidStateCode('Norte de Santander'), 'NOR', 'Norte de Santander no debe ser SAN');
        assert.strictEqual(getValidStateCode('Santander'), 'SAN', 'Santander debe ser SAN');
    });

    it('NUNCA debe devolver BOG por defecto para departamentos inválidos o desconocidos', () => {
        assert.strictEqual(getValidStateCode('Inventado'), null);
        assert.strictEqual(getValidStateCode('Miami'), null);
        assert.strictEqual(getValidStateCode('XYZ'), null);
        assert.strictEqual(getValidStateCode(''), null);
    });

    it('todos los códigos registrados en WC_STATES_MAP deben corresponder a departamentos reales', () => {
        const expectedCodes = [
            'AMZ', 'ANT', 'ARU', 'ATL', 'BOG', 'BOL', 'BOY', 'CAL', 'CAQ', 'CAS',
            'CAU', 'CES', 'CHO', 'COR', 'CUN', 'GUA', 'GUV', 'HUI', 'GUJ', 'MAG',
            'MET', 'NAR', 'NOR', 'PUT', 'QUI', 'RIS', 'SAP', 'SAN', 'SUC', 'TOL',
            'VAC', 'VAU', 'VIC'
        ];
        for (const code of expectedCodes) {
            assert.ok(WC_STATES_MAP[code], `El código ${code} debe existir en WC_STATES_MAP`);
        }
    });
});
