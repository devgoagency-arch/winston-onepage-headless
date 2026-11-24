// node --test tests/api-products-snapshot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REQUIRED_SNAPSHOT_FILES,
  validateSnapshot,
  validateSnapshotData,
  filterProductsForCategory,
} from '../src/lib/snapshotGuard.mjs';

const SNAPSHOT_DIR = path.join(process.cwd(), 'src', 'data', 'snapshot');

function loadSnapshotFiles(dir) {
  const loaded = {};
  for (const fileName of REQUIRED_SNAPSHOT_FILES) {
    const raw = fs.readFileSync(path.join(dir, fileName), 'utf-8');
    loaded[fileName] = JSON.parse(raw);
  }
  return loaded;
}

test('validateSnapshotData devuelve los mismos conteos que validateSnapshot con el snapshot commiteado', () => {
  const fromDisk = validateSnapshot(SNAPSHOT_DIR);
  const fromData = validateSnapshotData(loadSnapshotFiles(SNAPSHOT_DIR));

  assert.equal(fromData.products.length, fromDisk.products.length);
  assert.equal(fromData.inStockProducts.length, fromDisk.inStockProducts.length);
  assert.equal(fromData.categories.length, fromDisk.categories.length);
  assert.equal(fromData.attributes.length, fromDisk.attributes.length);
  assert.equal(fromData.categoryProductCounts.size, fromDisk.categoryProductCounts.size);

  for (const [catId, count] of fromDisk.categoryProductCounts.entries()) {
    assert.equal(
      fromData.categoryProductCounts.get(catId),
      count,
      `Conteo distinto para categoría ${catId}`
    );
  }
});

test('filterProductsForCategory para la categoría 63 devuelve >0 productos en stock', () => {
  const { inStockProducts, parentMap } = validateSnapshotData(loadSnapshotFiles(SNAPSHOT_DIR));
  const category63Products = filterProductsForCategory(inStockProducts, 63, parentMap);

  assert.ok(
    category63Products.length > 0,
    `Se esperaban productos en stock para categoría 63, encontrados: ${category63Products.length}`
  );
});
