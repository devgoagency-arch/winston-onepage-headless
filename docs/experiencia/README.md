# Landing poscompra /experiencia

Destino del QR y del NFC de las cajas. Página estática (`src/pages/experiencia.astro`), noindex y fuera del sitemap,
con el header y el footer reales de la tienda. Todo lo editable está en `src/config/experiencia.ts`.

## Pendiente antes de publicar

### 1. HubSpot

La sección de suscripción usa el mismo formulario del footer (`0723b68c-0294-4e45-aa9f-4fa00a102f50`, portal 22727126),
con los mismos campos: `email`, `mobilephone`, `firstname`, `lastname`. No requiere propiedades nuevas. El origen
QR/NFC queda en la URL de envío (`pageUri`). Hacer un envío real de prueba al publicar.

### 2. GTM / GA4 (GTM-NRK6FQ5N)

La página solo escribe en `dataLayer`; GTM ya carga en el Layout. Crear en GTM una etiqueta de evento GA4 con
activador de evento personalizado `^postpurchase_` (regex) y estos parámetros como variables de capa de datos:
`origen`, `tienda_origen`, `canal`, `tienda`, `articulo`, `destino`. Registrarlos como dimensiones personalizadas en GA4.

| Evento | Parámetros |
| --- | --- |
| `postpurchase_page_view` | `origen` |
| `postpurchase_registration` (suscripción exitosa) | `origen` |
| `postpurchase_marketing_optin` | `origen` |
| `postpurchase_store_selected` | `origen`, `canal`, `tienda` |
| `postpurchase_blog_click` | `origen`, `articulo`, `destino` |
| `postpurchase_review_click` | `origen`, `canal`, `tienda`, `destino` |

`origen` es `qr`, `nfc` o `directo`; se conserva durante la sesión. Nunca se envían nombre ni correo.

Todos los eventos llevan además `tienda_origen`: la tienda del QR/NFC (`?tienda=`), uno de `unicentro`, `retiro`, `santa_barbara`, `palatino`, o `ninguna`. También se conserva durante la sesión. No confundir con `tienda`, que es la tienda que el cliente toca en la página.

### 3. Reseñas

- Resumen de Google: nota y total por tienda se copian a mano de cada ficha de Maps a `TIENDAS` en
  `src/config/experiencia.ts` (revisión mensual, como en 562). El promedio se calcula ponderado.

- Tiendas: enlaces de Google tomados de los redirects `/review-*` de `astro.config.mjs`. Abrir cada uno con sesión de
  Google iniciada y confirmar que corresponde a su tienda.
- Página web: el sitio solo lee reseñas de WooCommerce, no tiene formulario para escribirlas. Por eso ese canal lleva a
  `info@winstonandharrystore.com`. Si se activa una solución, cambiar `Resenas.astro`.

### 4. Fotos

El hero usa la imagen entregada para la landing. Para cambiarlo, reemplazar con el mismo nombre en
`public/images/experiencia/`:

| Archivo | Medida | Nota |
| --- | --- | --- |
| `hero-mobile.webp` | 1080 × 864 px (5:4) | Producto centrado, máx. 200 KB |
| `hero-desktop.webp` | 2000 × 1347 px | Lado a lado; producto a la derecha, izquierda limpia para el texto; máx. 300 KB |

### 5. QR (pendiente de validación final)

En `docs/experiencia/qr/`: SVG, PNG 3038×3038, PDF vectorial de 40 mm y TXT con la URL NFC. Versión 6, corrección H,
zona de seguridad de 4 módulos, negro sobre blanco, con el símbolo del logo al centro. El script comprueba la lectura del PNG con un decodificador; **falta
leerlo con un celular real, ya publicada la página, antes de enviarlo a imprenta**. Tamaño mínimo sugerido: 25 mm. Hay un QR general para las cajas y uno por tienda en `tiendas/<id>/` (unicentro, retiro, santa_barbara, palatino), con `&tienda=<id>` en la URL (versión 8, módulo de 0,70 mm a 40 mm). Cada carpeta trae también su TXT con la URL NFC. Los eventos la envían como `tienda_origen` (ver sección 2).

```bash
cd scripts/experiencia-qr
npm install
npm run generar
```

## Pruebas

```bash
node --test tests/experiencia.test.mjs
```

Local: `npm run dev` y abrir `http://localhost:4321/experiencia?origen=qr`.
