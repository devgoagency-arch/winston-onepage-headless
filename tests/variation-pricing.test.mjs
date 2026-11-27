// node --test tests/variation-pricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getInStockVariations,
  getFromPrice,
  getDiscountPct,
  getSizesInStock,
  getColorsInStock,
} from '../src/lib/variationPricing.ts';
import {
  filterByTallas,
  filterByColors,
  pickMatchedTalla,
  isOnSale,
  isInStock,
} from '../src/lib/productFilters.ts';
import { toLightweightCatalogProduct } from '../scripts/prepare-from-snapshot.mjs';

const bogotaLike = {
  id: 25927,
  name: 'Tenis Bogotá',
  slug: 'bogota',
  type: 'variable',
  stock_status: 'instock',
  on_sale: true,
  price: '323400',
  regular_price: '539000',
  sale_price: '323400',
  prices: {
    price: '323400',
    regular_price: '539000',
    sale_price: '323400',
    currency_code: 'COP',
    currency_symbol: '$',
    currency_minor_unit: 0,
    currency_prefix: '$',
    price_range: null,
  },
  attributes: [
    {
      id: 3,
      name: 'Selecciona el Color',
      slug: 'pa_selecciona-el-color',
      terms: [
        { id: 1, name: 'Café', slug: 'cafe' },
        { id: 2, name: 'Miel', slug: 'miel' },
      ],
    },
    {
      id: 4,
      name: 'Selecciona una Talla',
      slug: 'pa_selecciona-una-talla',
      terms: [
        { id: 10, name: '37', slug: '37' },
        { id: 11, name: '45', slug: '45' },
      ],
    },
  ],
  variations: [
    {
      id: 25962,
      stock_status: 'outofstock',
      price: '323400',
      regular_price: '539000',
      sale_price: '323400',
      attributes: [
        { name: 'Selecciona el Color', option: 'Café' },
        { name: 'Selecciona una Talla', option: '45' },
      ],
    },
    {
      id: 25963,
      stock_status: 'outofstock',
      price: '161700',
      regular_price: '539000',
      sale_price: '161700',
      attributes: [
        { name: 'Selecciona el Color', option: 'Miel' },
        { name: 'Selecciona una Talla', option: '37' },
      ],
    },
    {
      id: 25954,
      stock_status: 'instock',
      price: '161700',
      regular_price: '539000',
      sale_price: '161700',
      attributes: [
        { name: 'Selecciona el Color', option: 'Café' },
        { name: 'Selecciona una Talla', option: '37' },
      ],
    },
  ],
};

test('Bogotá-like: solo talla 37 en stock ($161.700 vs $539.000 = -70%, sin rango)', () => {
  const inStock = getInStockVariations(bogotaLike);
  assert.equal(inStock.length, 1);
  assert.equal(inStock[0].id, 25954);

  const from = getFromPrice(bogotaLike);
  assert.deepEqual(from, {
    price: 161700,
    regular: 539000,
    discountPct: 70,
    hasRange: false,
  });
});

test('Bogotá-like con rango: 37 ($161.700) y 45 ($323.400) ambas en stock -> desde 161700, -70%, hasRange true', () => {
  const withRange = {
    ...bogotaLike,
    variations: bogotaLike.variations.map((v) =>
      v.id === 25962 ? { ...v, stock_status: 'instock' } : v
    ),
  };

  const from = getFromPrice(withRange);
  assert.deepEqual(from, {
    price: 161700,
    regular: 539000,
    discountPct: 70,
    hasRange: true,
  });
});

test('todas las variaciones con stock al mismo precio -> hasRange false (sin "Desde")', () => {
  const samePriceProduct = {
    type: 'variable',
    prices: { price: '420000', regular_price: '420000' },
    variations: [
      { id: 1, stock_status: 'instock', price: '420000', regular_price: '420000', attributes: [{ name: 'Talla', option: '39' }] },
      { id: 2, stock_status: 'instock', price: '420000', regular_price: '420000', attributes: [{ name: 'Talla', option: '40' }] },
      { id: 3, stock_status: 'outofstock', price: '299000', regular_price: '420000', attributes: [{ name: 'Talla', option: '41' }] },
    ],
  };

  const from = getFromPrice(samePriceProduct);
  assert.deepEqual(from, {
    price: 420000,
    regular: 420000,
    discountPct: 0,
    hasRange: false,
  });
});

test('sin stock en variaciones -> fallback al precio del padre y sin rango', () => {
  const allOut = {
    type: 'variable',
    prices: { price: '250000', regular_price: '500000' },
    variations: [
      { id: 1, stock_status: 'outofstock', price: '300000', regular_price: '500000', attributes: [{ name: 'Talla', option: '40' }] },
      { id: 2, is_in_stock: false, price: '350000', regular_price: '500000', attributes: [{ name: 'Talla', option: '41' }] },
    ],
  };

  assert.deepEqual(getInStockVariations(allOut), []);
  assert.deepEqual(getFromPrice(allOut), {
    price: 250000,
    regular: 500000,
    discountPct: 50,
    hasRange: false,
  });
});

test('variaciones sin dato de stock -> se consideran todas', () => {
  const noStockMeta = {
    type: 'variable',
    prices: { price: '400000', regular_price: '400000' },
    variations: [
      { id: 1, price: '300000', regular_price: '400000', attributes: [{ name: 'Talla', option: '38' }] },
      { id: 2, price: '350000', regular_price: '400000', attributes: [{ name: 'Talla', option: '39' }] },
    ],
  };

  assert.equal(getInStockVariations(noStockMeta).length, 2);
  assert.deepEqual(getFromPrice(noStockMeta), {
    price: 300000,
    regular: 400000,
    discountPct: 25,
    hasRange: true,
  });
});

test('producto simple -> usa prices del padre, hasRange false', () => {
  const simple = {
    id: 100,
    type: 'simple',
    stock_status: 'instock',
    prices: { price: '180000', regular_price: '240000', sale_price: '180000' },
  };

  assert.deepEqual(getFromPrice(simple), {
    price: 180000,
    regular: 240000,
    discountPct: 25,
    hasRange: false,
  });
  assert.equal(getDiscountPct(161700, 539000), 70);
  assert.equal(getDiscountPct(539000, 539000), 0);
  assert.equal(getDiscountPct(0, 539000), 0);
});

test('getSizesInStock y getColorsInStock devuelven slugs normalizados solo con stock', () => {
  assert.deepEqual(getSizesInStock(bogotaLike), ['37']);
  assert.deepEqual(getColorsInStock(bogotaLike), ['cafe']);

  const multi = {
    type: 'variable',
    variations: [
      {
        id: 1,
        is_in_stock: true,
        attributes: [
          { name: 'Selecciona el Color', value: 'Azul Oscuro' },
          { name: 'Selecciona una Talla', value: 'XL' },
        ],
      },
      {
        id: 2,
        stock_status: 'instock',
        attributes: [
          { name: 'Selecciona el Color', option: 'Café' },
          { name: 'Selecciona una Talla', option: 'M' },
        ],
      },
      {
        id: 3,
        stock_status: 'outofstock',
        attributes: [
          { name: 'Selecciona el Color', option: 'Negro' },
          { name: 'Selecciona una Talla', option: 'S' },
        ],
      },
    ],
  };

  assert.deepEqual(getSizesInStock(multi), ['xl', 'm']);
  assert.deepEqual(getColorsInStock(multi), ['azul-oscuro', 'cafe']);
});

test('filterByTallas: con sizes_in_stock excluye talla agotada e incluye talla en stock; fallback a atributos sin sizes_in_stock', () => {
  const withStockField = {
    id: 1,
    sizes_in_stock: ['37'],
    attributes: [
      {
        name: 'Selecciona una Talla',
        slug: 'pa_selecciona-una-talla',
        terms: [
          { name: '37', slug: '37' },
          { name: '42', slug: '42' },
        ],
      },
    ],
  };
  const legacyNoStockField = {
    id: 2,
    attributes: [
      {
        name: 'Selecciona una Talla',
        slug: 'pa_selecciona-una-talla',
        terms: [
          { name: '42', slug: '42' },
        ],
      },
    ],
  };

  // Filtrar por 42: excluye producto 1 (agotada en 42) e incluye producto 2 (fallback por atributos)
  assert.deepEqual(
    filterByTallas([withStockField, legacyNoStockField], ['42']).map((p) => p.id),
    [2]
  );

  // Filtrar por 37: incluye producto 1 (tiene stock en 37)
  assert.deepEqual(
    filterByTallas([withStockField, legacyNoStockField], ['37']).map((p) => p.id),
    [1]
  );

  // pickMatchedTalla devuelve la primera talla elegida que el producto tiene con stock
  assert.equal(pickMatchedTalla(withStockField, ['42', '37']), '37');
  assert.equal(pickMatchedTalla(withStockField, ['42']), undefined);
  assert.equal(pickMatchedTalla(legacyNoStockField, ['42', '37']), '42');
});

test('filterByColors: usa colors_in_stock si existe y hace fallback a atributos si no existe', () => {
  const withColors = {
    id: 10,
    colors_in_stock: ['cafe'],
    attributes: [
      { name: 'Selecciona el Color', slug: 'pa_color', terms: [{ name: 'Café', slug: 'cafe' }, { name: 'Miel', slug: 'miel' }] },
    ],
  };
  const withoutColors = {
    id: 11,
    attributes: [
      { name: 'Selecciona el Color', slug: 'pa_color', terms: [{ name: 'Miel', slug: 'miel' }] },
    ],
  };

  assert.deepEqual(filterByColors([withColors, withoutColors], ['miel']).map((p) => p.id), [11]);
  assert.deepEqual(filterByColors([withColors, withoutColors], ['Café']).map((p) => p.id), [10]);
});

test('toLightweightCatalogProduct ajusta precio al más barato con stock, agrega sizes_in_stock/colors_in_stock y omite variations', () => {
  const light = toLightweightCatalogProduct(bogotaLike);

  assert.equal(light.price, '161700');
  assert.equal(light.regular_price, '539000');
  assert.equal(light.sale_price, '161700');
  assert.equal(light.prices.price, '161700');
  assert.equal(light.prices.regular_price, '539000');
  assert.equal(light.prices.sale_price, '161700');
  assert.deepEqual(light.sizes_in_stock, ['37']);
  assert.deepEqual(light.colors_in_stock, ['cafe']);
  assert.equal('variations' in light, false);
  assert.equal(isOnSale(light), true);
  assert.equal(isInStock(light), true);

  // Caso: única variación en descuento agotada -> las con stock están a precio normal
  const onlyOutOfStockOnSale = {
    ...bogotaLike,
    variations: [
      { id: 1, stock_status: 'outofstock', price: '161700', regular_price: '539000', attributes: [{ name: 'Color', option: 'Café' }, { name: 'Talla', option: '37' }] },
      { id: 2, stock_status: 'instock', price: '539000', regular_price: '539000', attributes: [{ name: 'Color', option: 'Miel' }, { name: 'Talla', option: '40' }] },
    ],
  };
  const lightFullPrice = toLightweightCatalogProduct(onlyOutOfStockOnSale);
  assert.equal(lightFullPrice.price, '539000');
  assert.equal(lightFullPrice.regular_price, '539000');
  assert.equal(lightFullPrice.sale_price, '');
  assert.equal(lightFullPrice.on_sale, false);
  assert.equal(isOnSale(lightFullPrice), false);
  assert.equal(isInStock(lightFullPrice), true);
  assert.deepEqual(lightFullPrice.sizes_in_stock, ['40']);
  assert.deepEqual(lightFullPrice.colors_in_stock, ['miel']);
});
