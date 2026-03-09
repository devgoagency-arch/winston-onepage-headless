# Solución a Errores de WooCommerce: Precios en $0 y Caída de la Grilla

Este documento explica las causas técnicas y las soluciones implementadas para resolver dos problemas críticos en la tienda:

1. Los productos (especialmente zapatos) aparecían con precio **$0**.
2. La grilla de productos **desaparecía** repentinamente después de cargar por 1 segundo.

---

## 🛑 Error 1: Productos con Precio $0

### ¿Por qué sucedía?
El problema se originaba en la fuente de datos que se estaba usando para obtener la lista de productos: la **Store API pública** de WooCommerce (`/wc/store/v1/products`). 

1. **Limitación con productos variables:** La Store API pública está diseñada para integraciones simples y por defecto **no renderiza los precios base de los productos variables** (aquellos que tienen opciones como Talla o Color). En su lugar, reporta el `price` general como `"0"`.
2. **Problema de formato (Centavos):** Cuando la Store API sí enviaba precios (como en los rangos de precios o precios regulares), WooCommerce los enviaba en **unidades menores (centavos)** para la moneda Colombiana (COP), donde indica que el `currency_minor_unit` es `2`. Esto significa que $199.000 se recibía como `"19900000"`. Si el frontend no maneja bien este divisor, los cálculos internos se rompen.

### ¿Cómo se solucionó?
Para tener información totalmente predecible y veraz, modificamos la capa de servicios (`src/lib/woocommerce.ts`):

1. **Cambio a la API Privada V3:** Reemplazamos las peticiones para la obtención de productos a la API oficial autenticada de WooCommerce (`/wp-json/wc/v3/products`). Al usar tus credenciales (`Consumer Key` y `Consumer Secret`), WooCommerce nos devuelve la estructura completa y real del producto, incluyendo sus precios base definitivos.
2. **Carga Profunda de Variaciones:** Añadimos lógica para que, si un producto es variable, el sistema haga una segunda petición a sus variaciones exactas para extraer el precio mínimo real y las fotos de cada color (evitando depender de la inestable Store API).
3. **Normalización de Monedas:** Actualizamos la función de formateo (`mapV3ToStore`) para asegurar que todo precio entrante, venga en centavos o en enteros diviendo por `10^currency_minor_unit`, sea re-estructurado garantizando siempre `currency_minor_unit = 0` para todas las tarjetas.

---

## 🛑 Error 2: La Grilla Desaparecía a los 1 Segundo (Crash)

### ¿Por qué sucedía?
Lo que veías durante 1 segundo era el HTML estático que el servidor enviaba al principio (Server-Side Rendering de Astro), lo cual está perfecto. El problema ocurría cuando ese "esqueleto" se convertía en código interactivo de React (a esto se le llama **Hidratación**).

Al cambiar de la *Store API* a la *API V3*, los objetos JSON tienen diferencias en cómo se nombran las variables:
- En la **Store API**, el nombre del color seleccionado en una variación venía bajo la propiedad `value` (Ej. `colorData.value`).
- En la **API V3**, ese mismo dato viene bajo la propiedad `option` (Ej. `colorData.option`).

Dado que los componentes React (`ProductCard` y `ProductDetail`) intentaban procesar los colores buscando específicamente la propiedad `.value`, se encontraban con un dato `undefined` (nulo). A continuación, el código intentaba ejecutar `toLowerCase()` sobre esa nada, lo que provocaba una **Excepción de Javascript (Crash)**. En React moderno, cuando un componente colapsa por un error no capturado, todo el árbol de HTML del componente se desmonta (desaparece).

### ¿Cómo se solucionó?
Editamos directamente la lógica de los componentes `.tsx` responsables del renderizado:

* **Componentes Afectados:** `src/components/ProductCard.tsx` y `src/components/ProductDetail.tsx`.
* **Solución de Fallback:** Modificamos las condiciones de lectura para incluir ambas alternativas. Ahora el código dice básicamente: "Intenta leer `value`, si eso está vacío, intenta leer `option`". Específicamente, cambiamos:

**De esto (Antiguo - Causaba el Crash):**
```javascript
const vColor = variation.attributes.find(a => 
  a.name.toLowerCase().includes('color')
)?.value.toLowerCase();
```

**A esto (Nuevo - Tolerante a Fallos):**
```javascript
const colorAttribute = variation.attributes.find(a => 
  a.name.toLowerCase().includes('color')
);
const vColor = (colorAttribute?.value || colorAttribute?.option || '').toLowerCase();
```

De este modo el componente nunca falla al hidratarse, las tarjetas procesan perfectamente los colores de las variaciones y la grilla se mantiene visible permanentemente.
