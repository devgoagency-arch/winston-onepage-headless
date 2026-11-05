# BLACK DAYS 2026

Ventana única: 23 de noviembre 00:00:00 a 30 de noviembre 23:59:59, America/Bogota (UTC−5).

## Instalación

1. Instalar `wp-arma-tu-black.php` como plugin propio en `wp-content/plugins/wh-black-days/` y activarlo, o pegarlo sin `<?php` en Code Snippets. Elegir solo una vía para evitar duplicados.
2. El hook `woocommerce_cart_calculate_fees` añade un fee negativo **Arma tu Black**, sin impuestos. El checkout headless reconstruye el carrito mediante Store API: ese flujo también ejecuta el hook.
3. Probar en staging el carrito, checkout y total de la orden antes de habilitar pagos reales. El front y WordPress deben dar el mismo total (incluidos envío, cupones y promociones existentes).
4. Crear un Deploy Hook en Vercel para el proyecto y rama de producción; guardar su URL únicamente en el secret de GitHub `VERCEL_DEPLOY_HOOK_URL`. Activar el workflow. No publicar la URL.

## Qué carga el cliente en WooCommerce

Zapato con banda = zapato con precio de oferta 30/50/70 %.

Los precios de oferta de zapatos de las bandas 30/50/70 % se cargan en `sale_price`, sin tablas de precios en el repositorio. Si se programan, usar `date_on_sale_from` 2026-11-23 00:00:00 y `date_on_sale_to` 2026-11-30 23:59:59, con la tienda configurada en America/Bogota. Verificar que WooCommerce/WP-Cron active y cierre las ofertas a tiempo.

## Vista previa para el cliente vs. modo campaña

`/black-days` siempre se genera y puede compartirse en producción. Mantiene `noindex, nofollow` mediante Layout y está excluida del sitemap. No se bloquea en robots.txt, para permitir que el buscador lea el noindex.

Cualquier build anterior a `BLACK_DAYS_PREVIEW_START` (22 de noviembre de 2026, 23:00 Bogotá) es vista previa: el cintillo aparece solo en rutas que empiezan por `/black-days`, sin depender del reloj. La ruta se reevalúa con View Transitions antes del intercambio y en `astro:page-load`.

El deploy automático programado para las **23:30 del 22 de noviembre** genera el modo campaña sin cambiar código: el cintillo queda disponible en todas las páginas y el reloj del cliente lo muestra del 23 a las 00:00 al 30 a las 23:59:59 Bogotá. GitHub puede retrasar cron; comprobar su ejecución. Un build de vista previa conserva ese modo hasta ser reemplazado por el nuevo deploy.

La vista previa del cintillo no habilita Arma tu Black en carrito/checkout: fuera de la ventana, el descuento sigue en cero y el progreso permanece oculto. DEV mantiene la activación forzada en todo el sitio.


**Catálogo estético:** si las ofertas empiezan a medianoche, el build de las 23:30 puede capturar precios anteriores. La landing refresca sus pestañas mediante `/api/products` al cargar (zapatos con `on_sale=true`), sin preferir los JSON estáticos. Es necesario regenerar el catálogo y desplegar después de que Woo active las ofertas, y al cierre para retirar precios vencidos. Comprobar JSON de `/data/catalog/` y precios de producto: el reloj del cintillo no actualiza esos archivos. El hero usa el fondo del home mientras `BLACK_DAYS_HERO_IMAGE` esté vacío; las tarjetas usan las fotos locales de zapatos, ropa, maletas y accesorios.

## Reglas y pruebas

Se expanden las cantidades, se excluyen rebajados (`on_sale` o precio menor al regular), tag 937 (también en padre de variaciones) y Escalera identificado por nombre/slug. Se ordena de mayor a menor precio y se redondea cada descuento por unidad al peso más cercano.

| N | Precios ordenados | Tasas por posición | Descuento |
|---|---|---|---:|
| 0 | — | — | $0 |
| 1 | 100000 | 15 % | $15000 |
| 2 | 100000, 80000 | 0 %, 50 % | $40000 |
| 3 | 100000, 80000, 60000 | 0 %, 15 %, 50 % | $42000 |
| 4 | 100000, 80000, 60000, 40000 | 0 %, 15 %, 50 %, 50 % | $62000 |
| 5 | 100000, 80000, 60000, 40000, 20000 | 0 %, 15 %, 50 %, 50 %, 0 % | $62000 |

Ejecutar `node --test tests/black-days.test.mjs`. Repetir casos en Woo, incluyendo variaciones, cantidades, empate, redondeo, zapatos en oferta y suéteres con tag 937. Verificar límites de fecha y carrito abierto al cambio de ventana.

## Supuestos y pendientes de negocio

- Desde la quinta unidad: `EXTRA_UNITS_DISCOUNT = 0`, por confirmar con negocio. Las cuatro primeras son las de mayor precio, no se reinician grupos.
- El combo jean + camisa + cinturón permanece sin cambios y puede apilarse con Arma tu Black. Confirmar el apilado con negocio y revisar también cupones/envío.
- Carritos antiguos sin `regular_price`/`on_sale` se consideran elegibles en el front por compatibilidad. WordPress usa datos actuales; vaciar y volver a agregar productos si los importes difieren. La paridad de precios requiere catálogo vigente.
- Instalar y probar el snippet, cargar ofertas, aprobar arte, configurar hook/secret y publicar los cambios son tareas externas pendientes. Este cambio no realiza deploy.
