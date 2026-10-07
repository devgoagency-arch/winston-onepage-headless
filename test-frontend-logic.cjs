const fs = require('fs');

const currentProduct = JSON.parse(fs.readFileSync('public/data/products/cumbria.json', 'utf8'));

const normalizeAttr = (str) => {
  if (!str) return '';
  return str.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n');
};

const isCombinationAvailable = (color, size) => {
    const variations = (Array.isArray(currentProduct.variations) && typeof currentProduct.variations[0] === 'object') 
      ? currentProduct.variations 
      : (currentProduct.variations_data || []);
      
    if (!variations || variations.length === 0) {
      return currentProduct.stock_status !== 'outofstock';
    }

    const targetColor = normalizeAttr(color);
    const targetSize = normalizeAttr(size);

    return variations.some(variation => {
      const vColorAttr = variation.attributes.find(a => {
        const n = (a.name || "").toLowerCase();
        const sid = (a.id || "").toString().toLowerCase();
        return n.includes('color') || n.includes('pa_color') ||
          n.includes('selecciona-el-color') || sid.includes('color');
      });
      const vSizeAttr = variation.attributes.find(a => {
        const n = (a.name || "").toLowerCase();
        const sid = (a.id || "").toString().toLowerCase();
        return n.includes('talla') || n.includes('size') || n.includes('tamano') ||
          n.includes('tamaño') || n.includes('pa_talla') ||
          n.includes('selecciona-una-talla') || sid.includes('talla') || sid.includes('size');
      });

      const vColorRaw = vColorAttr?.value || vColorAttr?.option || '';
      const vSizeRaw = vSizeAttr?.value || vSizeAttr?.option || '';

      const vColor = normalizeAttr(vColorRaw);
      const vSize = normalizeAttr(vSizeRaw);

      const matchesColor = !color || vColor === targetColor || vColorRaw === '';
      const matchesSize = !size || vSize === targetSize || vSizeRaw === '';

      const isVariationInStock = variation.stock_status === 'instock' ||
        (variation.manage_stock && variation.stock_quantity && variation.stock_quantity > 0);

      if (matchesColor && matchesSize && isVariationInStock) {
        console.log("MATCH FOUND!", { id: variation.id, vColorRaw, vSizeRaw, matchesColor, matchesSize, isVariationInStock });
      }

      return matchesColor && matchesSize && isVariationInStock;
    });
};

isCombinationAvailable('cafe', '42');
