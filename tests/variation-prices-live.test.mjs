// node --test tests/variation-prices-live.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { getFromPrice, getDiscountPct } from '../src/lib/variationPricing.ts';

// Permite importar módulos TS de Astro con imports relativos sin extensión y JSON sin atributo type
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsCandidate = path.resolve(parentDir, specifier + '.ts');
      if (existsSync(tsCandidate)) {
        return { url: pathToFileURL(tsCandidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      const raw = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        source: `export default ${raw};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { resolveVariationPrices } = await import('../src/lib/woocommerce.ts');
const { addToCart, cartItems, clearCart, getCartLinePricing } = await import('../src/store/cart.ts');

const makeNormalizePriceStr = (minorUnit = 0) => {
  const divisor = Math.pow(10, minorUnit);
  return (val) => {
    if (!val || val === '0') return '0';
    const num = Number(val);
    if (Number.isNaN(num)) return '0';
    return Math.round(num / divisor).toString();
  };
};

// Datos reales de Barnet (id 24970): padre $336.000 / $560.000
const barnetParentPrices = {
  price: '336000',
  regular_price: '560000',
  sale_price: '',
  currency_code: 'COP',
  currency_symbol: '$',
  currency_minor_unit: 0,
  currency_prefix: '$',
};

// Variaciones REST v3 de Barnet (valores enteros COP sin minor unit)
const barnetV3Cafe39 = {
  id: 25010,
  price: '560000',
  regular_price: '560000',
  sale_price: '',
  stock_status: 'instock',
};

const barnetV3Negro41 = {
  id: 25003,
  price: '336000',
  regular_price: '560000',
  sale_price: '336000',
  stock_status: 'instock',
};

test('resolveVariationPrices: Store API sin precios por variación usa v3 (Barnet Café 39 y Negro 41)', () => {
  const normalize = makeNormalizePriceStr(2);

  // Store API no devuelve precios por variación (vPrices = {})
  const cafe39 = resolveVariationPrices({}, barnetV3Cafe39, barnetParentPrices, normalize);
  assert.deepEqual(cafe39, {
    price: '560000',
    regular_price: '560000',
    sale_price: '',
  });

  const negro41 = resolveVariationPrices({}, barnetV3Negro41, barnetParentPrices, normalize);
  assert.deepEqual(negro41, {
    price: '336000',
    regular_price: '560000',
    sale_price: '336000',
  });
});

test('resolveVariationPrices: respeta prioridad vPrices > vDetails > parentPrices e ignora vacíos/"0"', () => {
  const normalizeMinor2 = makeNormalizePriceStr(2);

  // a) vPrices con valores != 0 tiene prioridad sobre v3 y padre (normalizado con minorUnit=2)
  const fromStore = resolveVariationPrices(
    { price: '42000000', regular_price: '56000000', sale_price: '42000000' },
    barnetV3Cafe39,
    barnetParentPrices,
    normalizeMinor2
  );
  assert.deepEqual(fromStore, {
    price: '420000',
    regular_price: '560000',
    sale_price: '420000',
  });

  // vPrices con "0" y vacíos cae a v3 (redondeando enteros COP con Math.round)
  const storeZeroFallsToV3 = resolveVariationPrices(
    { price: '0', regular_price: '0', sale_price: '0' },
    { price: '560000.4', regular_price: '560000.4', sale_price: '0' },
    barnetParentPrices,
    normalizeMinor2
  );
  assert.deepEqual(storeZeroFallsToV3, {
    price: '560000',
    regular_price: '560000',
    sale_price: '',
  });

  // vDetails con price pero sin regular_price usa price como regular_price
  const v3WithoutRegular = resolveVariationPrices(
    {},
    { price: '560000', regular_price: '', sale_price: '' },
    barnetParentPrices,
    normalizeMinor2
  );
  assert.deepEqual(v3WithoutRegular, {
    price: '560000',
    regular_price: '560000',
    sale_price: '',
  });

  // c) Sin vPrices ni vDetails cae recién al padre (sale_price = "")
  const fallbackParent = resolveVariationPrices({}, undefined, barnetParentPrices, normalizeMinor2);
  assert.deepEqual(fallbackParent, {
    price: '336000',
    regular_price: '560000',
    sale_price: '',
  });
});

test('getFromPrice y getDiscountPct con variaciones resueltas de Barnet (instock)', () => {
  const normalize = makeNormalizePriceStr(0);
  const cafe39Prices = resolveVariationPrices({}, barnetV3Cafe39, barnetParentPrices, normalize);
  const negro41Prices = resolveVariationPrices({}, barnetV3Negro41, barnetParentPrices, normalize);

  const barnetLive = {
    id: 24970,
    name: 'Barnet',
    slug: 'barnet',
    type: 'variable',
    on_sale: true,
    stock_status: 'instock',
    prices: { ...barnetParentPrices },
    variations: [
      {
        id: 25010,
        stock_status: 'instock',
        ...cafe39Prices,
        attributes: [
          { name: 'Selecciona el Color', option: 'Café', value: 'Café' },
          { name: 'Selecciona una Talla', option: '39', value: '39' },
        ],
      },
      {
        id: 25003,
        stock_status: 'instock',
        ...negro41Prices,
        attributes: [
          { name: 'Selecciona el Color', option: 'Negro', value: 'Negro' },
          { name: 'Selecciona una Talla', option: '41', value: '41' },
        ],
      },
    ],
  };

  assert.deepEqual(getFromPrice(barnetLive), {
    price: 336000,
    regular: 560000,
    discountPct: 40,
    hasRange: true,
  });

  assert.equal(getDiscountPct(560000, 560000), 0);
  assert.equal(getDiscountPct(336000, 560000), 40);
});

test('getCartLinePricing: calcula precio, regular_price y on_sale por variación sin dividir dos veces', () => {
  const barnetProduct = {
    id: 24970,
    name: 'Barnet',
    slug: 'barnet',
    on_sale: true,
    prices: { ...barnetParentPrices },
  };

  const cafe39Pricing = getCartLinePricing(barnetProduct, {
    id: 25010,
    price: '560000',
    regular_price: '560000',
    sale_price: '',
  });
  assert.deepEqual(cafe39Pricing, {
    price: 560000,
    regular_price: 560000,
    on_sale: false,
  });

  const negro41Pricing = getCartLinePricing(barnetProduct, {
    id: 25003,
    price: '336000',
    regular_price: '560000',
    sale_price: '336000',
  });
  assert.deepEqual(negro41Pricing, {
    price: 336000,
    regular_price: 560000,
    on_sale: true,
  });

  // Si el padre tuviera currency_minor_unit=2, la variación ya viene en COP enteros y NO se divide dos veces
  const minorUnitProduct = {
    ...barnetProduct,
    prices: {
      ...barnetParentPrices,
      price: '33600000',
      regular_price: '56000000',
      currency_minor_unit: 2,
    },
  };
  assert.deepEqual(
    getCartLinePricing(minorUnitProduct, {
      id: 25010,
      price: '560000',
      regular_price: '560000',
    }),
    {
      price: 560000,
      regular_price: 560000,
      on_sale: false,
    }
  );

  // Sin variación (producto simple o sin match): respeta currency_minor_unit del padre
  assert.deepEqual(getCartLinePricing(minorUnitProduct, null), {
    price: 336000,
    regular_price: 560000,
    on_sale: true,
  });
});

test('addToCart: guarda 560000/on_sale=false para Café 39, 336000/on_sale=true para Negro 41 y actualiza si ya existe', () => {
  clearCart();

  const barnetProduct = {
    id: 24970,
    name: 'Barnet',
    slug: 'barnet',
    on_sale: true,
    tags: [],
    categories: [],
    prices: { ...barnetParentPrices },
    variations: [
      {
        id: 25010,
        stock_status: 'instock',
        price: '560000',
        regular_price: '560000',
        sale_price: '',
        attributes: [
          { name: 'Selecciona el Color', option: 'Café', value: 'Café' },
          { name: 'Selecciona una Talla', option: '39', value: '39' },
        ],
      },
      {
        id: 25003,
        stock_status: 'instock',
        price: '336000',
        regular_price: '560000',
        sale_price: '336000',
        attributes: [
          { name: 'Selecciona el Color', option: 'Negro', value: 'Negro' },
          { name: 'Selecciona una Talla', option: '41', value: '41' },
        ],
      },
    ],
  };

  addToCart(barnetProduct, 1, 'Café', '39', 'https://example.com/cafe.jpg');
  addToCart(barnetProduct, 1, 'Negro', '41', 'https://example.com/negro.jpg');

  const cart = cartItems.get();
  const cafeItem = JSON.parse(cart['24970-café-39']);
  const negroItem = JSON.parse(cart['24970-negro-41']);

  assert.equal(cafeItem.id, 25010);
  assert.equal(cafeItem.price, 560000);
  assert.equal(cafeItem.regular_price, 560000);
  assert.equal(cafeItem.on_sale, false);
  assert.equal(cafeItem.quantity, 1);

  assert.equal(negroItem.id, 25003);
  assert.equal(negroItem.price, 336000);
  assert.equal(negroItem.regular_price, 560000);
  assert.equal(negroItem.on_sale, true);
  assert.equal(negroItem.quantity, 1);

  // Si Café 39 ya existía con precio viejo erróneo (336000/on_sale=true), volver a agregarlo lo corrige
  cartItems.setKey(
    '24970-café-39',
    JSON.stringify({ ...cafeItem, price: 336000, regular_price: 560000, on_sale: true })
  );
  addToCart(barnetProduct, 1, 'Café', '39', 'https://example.com/cafe.jpg');
  const updatedCafe = JSON.parse(cartItems.get()['24970-café-39']);
  assert.equal(updatedCafe.quantity, 2);
  assert.equal(updatedCafe.price, 560000);
  assert.equal(updatedCafe.regular_price, 560000);
  assert.equal(updatedCafe.on_sale, false);

  clearCart();
});
