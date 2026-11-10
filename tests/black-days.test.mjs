// node --test tests/black-days.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { allocateArmaTuBlack, calculateArmaTuBlack, getArmaTuBlackHint, isBlackDaysActive, isBlackDaysPreviewBuild, EXTRA_UNITS_DISCOUNT } from '../src/lib/blackDays.ts';
const prices = [100000, 80000, 60000, 40000, 20000];
const discounts = [0, 15000, 40000, 42000, 62000, 62000];
const rates = [[], [15], [0, 50], [0, 15, 50], [0, 15, 50, 50], [0, 15, 50, 50, 0]];
for (let n = 0; n <= 5; n++) {
    test(`N=${n}: tasas, importe y progreso`, () => {
        const input = prices.slice(0, n).reverse().map(price => ({ price }));
        const snapshot = structuredClone(input);
        const result = calculateArmaTuBlack(input);
        assert.equal(result.discount, discounts[n]);
        assert.equal(result.eligibleCount, n);
        assert.deepEqual(result.lines.map(l => l.pct), rates[n]);
        assert.deepEqual(result.lines.map(l => l.price), prices.slice(0, n));
        assert.equal(result.tier, Math.min(n, 4));
        assert.deepEqual(result.next, { missing: n < 4 ? 1 : 0, message: getArmaTuBlackHint(n) });
        assert.deepEqual(input, snapshot);
    });
}
test('empates, cantidades y redondeo por unidad', () => {
    const result = calculateArmaTuBlack([{ price: 101, quantity: 4 }]);
    assert.deepEqual(result.lines.map(l => l.amount), [0, 15, 51, 51]);
    assert.equal(result.discount, 117);
    assert.equal(EXTRA_UNITS_DISCOUNT, 0);
    assert.equal(calculateArmaTuBlack([{ price: 100, quantity: 8 }]).discount, 115);
});
test('excluye ofertas, Escalera y tag 937; admite carritos antiguos', () => {
    const result = calculateArmaTuBlack([
        { price: 100, on_sale: true, quantity: 3 },
        { price: 100, regular_price: 200 },
        { price: 100, name: 'Suéter Tejido Escalera' },
        { price: 100, slug: 'sueter-escalera' },
        { price: 100, tags: [{ id: 937 }] },
        { price: 100 }, { price: 100, regular_price: 100, on_sale: false },
    ]);
    assert.equal(result.eligibleCount, 2);
    assert.equal(result.discount, 50);
});
test('ventana Colombia, incluyendo los dos límites', () => {
    for (const [date, active] of [
        ['2026-11-23T04:59:59.999Z', false],
        ['2026-11-23T05:00:00Z', true],
        ['2026-11-26T12:00:00-05:00', true],
        ['2026-12-01T04:59:59Z', true],
        ['2026-12-01T04:59:59.999Z', true],
        ['2026-12-01T05:00:00Z', false],
    ]) assert.equal(isBlackDaysActive(new Date(date)), active, date);
});

test('build de vista previa: antes, en y después del límite Bogotá', () => {
    assert.equal(isBlackDaysPreviewBuild(Date.parse('2026-11-23T03:59:59.999Z')), true);
    assert.equal(isBlackDaysPreviewBuild(Date.parse('2026-11-23T04:00:00Z')), false);
    assert.equal(isBlackDaysPreviewBuild(Date.parse('2026-11-22T23:30:00-05:00')), false);
    assert.equal(isBlackDaysActive(new Date('2026-11-22T23:30:00-05:00')), false);
});

test('cintillo: rutas de preview, reloj de campaña, DEV y View Transitions', () => {
    const source = readFileSync(new URL('../src/components/GlobalBanner.astro', import.meta.url), 'utf8');
    const script = source.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)[1];
    const start = Date.parse('2026-11-23T00:00:00-05:00');
    const end = Date.parse('2026-12-01T00:00:00-05:00');
    for (const [preview, dev, now, path, expected] of [
        [true, false, start - 1000, '/black-days', true],
        [true, false, end, '/black-days/', true],
        [true, false, start, '/', false],
        [false, false, start - 1, '/', false],
        [false, false, start, '/', true],
        [false, false, end - 1, '/', true],
        [false, false, end, '/', false],
        [true, true, end, '/', true],
    ]) {
        let active;
        const events = {};
        const location = { pathname: path };
        runInNewContext(script, {
            start, end, preview, dev, enabled: true, location,
            Date: { now: () => now }, clearTimeout() {}, setTimeout() {},
            window: { addEventListener() {} },
            document: {
                documentElement: { classList: { toggle: (_, value) => { active = value; } } },
                addEventListener: (name, callback) => { events[name] = callback; },
            },
        });
        assert.equal(active, expected);
        if (preview && !dev) {
            for (const pathname of ['/black-days', '/']) {
                let incoming;
                events['astro:before-swap']({ to: { pathname }, newDocument: {
                    documentElement: { classList: { toggle: (_, value) => { incoming = value; } } },
                } });
                assert.equal(incoming, pathname === '/black-days');
                location.pathname = pathname;
                events['astro:page-load']();
                assert.equal(active, pathname === '/black-days');
            }
        }
    }
});

test('reparto por línea del carrito (el del ejemplo: 825k, 979k, 825k)', () => {
    const items = [{ price: 825000 }, { price: 979000 }, { price: 825000 }];
    const lines = allocateArmaTuBlack(items);
    assert.deepEqual(lines.map(l => l.pcts), [[15], [0], [50]]);
    assert.deepEqual(lines.map(l => l.discount), [123750, 0, 412500]);
    assert.equal(lines.reduce((s, l) => s + l.discount, 0), calculateArmaTuBlack(items).discount);
});
test('reparto: con descuento propio queda fuera y una línea con cantidad mezcla tasas', () => {
    const items = [{ price: 500000, on_sale: true }, { price: 100000, quantity: 3 }];
    const lines = allocateArmaTuBlack(items);
    assert.deepEqual(lines.map(l => l.eligible), [false, true]);
    assert.deepEqual(lines[0].pcts, []);
    assert.deepEqual(lines[1].pcts, [0, 15, 50]);
    assert.equal(lines[1].discount, 65000);
});
