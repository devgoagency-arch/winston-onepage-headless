// node --test tests/snapshot-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateSnapshot } from '../src/lib/snapshotGuard.mjs';

function makeTempSnapshot(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-snap-test-'));
  const base = {
    'manifest.json': { version: 1, generatedAt: '2026-11-23T00:00:00Z', counts: { products: 1, categories: 2 } },
    'products.json': [
      {
        id: 101,
        slug: 'zapato-oxford-prueba',
        name: 'Oxford Prueba',
        type: 'variable',
        stock_status: 'instock',
        prices: { price: '450000', regular_price: '450000', sale_price: '' },
        categories: [{ id: 193, name: 'Zapatos de Cordón', slug: 'zapatos-cordon-hombre' }],
        variations: [{ id: 102, stock_status: 'instock', price: '450000', regular_price: '450000' }],
      },
    ],
    'categories.json': [
      { id: 63, name: 'Zapatos', slug: 'zapatos-cuero-hombre', parent: 0, count: 1 },
      { id: 193, name: 'Zapatos de Cordón', slug: 'zapatos-cordon-hombre', parent: 63, count: 1 },
      { id: 957, name: 'Trajes y Blazers', slug: 'trajes-blazers-hombre', parent: 0, count: 0 },
    ],
    'menus.json': {
      'menu-principal': [{ id: 1, title: 'Zapatos', url: '/categoria/zapatos-cuero-hombre', parent: 0 }],
      'atencion-al-cliente': [{ id: 2, title: 'Contacto', url: '/contacto', parent: 0 }],
      nosotros: [{ id: 3, title: 'Nosotros', url: '/contacto', parent: 0 }],
      legal: [{ id: 4, title: 'Privacidad', url: '/politica-privacidad-proteccion-datos', parent: 0 }],
    },
    'attributes.json': [],
    'cms.json': { homePage: null, homeBannerRaw: null, pages: {} },
    ...overrides,
  };

  for (const [name, data] of Object.entries(base)) {
    if (data === null) continue; // permite omitir un archivo para probar faltantes
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data), 'utf-8');
  }
  return dir;
}

test('falla con mensaje claro si falta el directorio del snapshot', () => {
  assert.throws(
    () => validateSnapshot(path.join(os.tmpdir(), 'wh-snap-no-existe-' + Date.now())),
    /No existe el directorio de snapshot/
  );
});

test('falla si falta un archivo obligatorio (menus.json)', () => {
  const dir = makeTempSnapshot({ 'menus.json': null });
  try {
    assert.throws(() => validateSnapshot(dir), /Falta el archivo obligatorio del snapshot: menus\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('falla si products.json está vacío', () => {
  const dir = makeTempSnapshot({ 'products.json': [] });
  try {
    assert.throws(() => validateSnapshot(dir), /products\.json está vacío/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('falla si un menú obligatorio está vacío', () => {
  const dir = makeTempSnapshot({
    'menus.json': {
      'menu-principal': [],
      'atencion-al-cliente': [{ id: 1 }],
      nosotros: [{ id: 2 }],
      legal: [{ id: 3 }],
    },
  });
  try {
    assert.throws(() => validateSnapshot(dir), /menú obligatorio "menu-principal" está vacío/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('falla si una categoría obligatoria queda sin productos en stock', () => {
  const dir = makeTempSnapshot();
  try {
    assert.throws(
      () =>
        validateSnapshot(dir, {
          coreCategorySlugs: ['zapatos-cuero-hombre', 'trajes-blazers-hombre'],
          allowedEmptySlugs: [],
        }),
      /trajes-blazers-hombre/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pasa cuando las categorías núcleo tienen productos (incluyendo subcategorías) y las vacías están en la allowlist', () => {
  const dir = makeTempSnapshot();
  try {
    const res = validateSnapshot(dir, {
      coreCategorySlugs: ['zapatos-cuero-hombre', 'zapatos-cordon-hombre', 'trajes-blazers-hombre'],
      allowedEmptySlugs: ['trajes-blazers-hombre'],
    });
    assert.equal(res.inStockProducts.length, 1);
    assert.equal(res.categoryProductCounts.get(63), 1);
    assert.equal(res.categoryProductCounts.get(193), 1);
    assert.equal(res.categoryProductCounts.get(957), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('el snapshot real commiteado en src/data/snapshot pasa la guardia completa', () => {
  const realDir = path.join(process.cwd(), 'src', 'data', 'snapshot');
  const res = validateSnapshot(realDir);
  assert.ok(res.products.length > 0);
  assert.ok(res.inStockProducts.length > 0);
  assert.ok(res.categories.length > 0);
  assert.ok(res.menus['menu-principal'].length > 0);
});
