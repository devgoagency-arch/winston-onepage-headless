Este archivo resume los últimos cambios realizados para mantener la sincronía entre diferentes estaciones de trabajo.

## Últimos Cambios (3 de Marzo, 2026)

### 1. Integración de Instagram Reels
- **Nuevo Componente:** Se creó `InstagramReels.tsx` para mostrar los últimos 3 reels/videos de la marca usando el feed de Behold.
- **Ubicación Estratégica:** Insertado en el footer, exactamente entre la sección de Reviews y el banner de Suscripción (Newsletter).
- **Estética Pulida:** 
    - Uso explícito de fuente **Helvetica** en gris suave para descripciones, manteniendo la jerarquía visual frente a los títulos en verde.
    - Micro-animaciones de hover (elevación suave) y overlays dinámicos con iconos de "engagement" (vistas, pines).
    - Implementación de Skeleton Loaders para una carga premium sin saltos visuales.

### 2. Restauración de Sugerencias en Detalle de Producto (`[slug].astro`)
- **Secciones Recuperadas:** Se restauraron "Completa tu look" (Relacionados) y "El Complemento Ideal" (FBT) que se habían perdido en versiones anteriores.
- **Lógica de Recomendación Inteligente:**
    - Se priorizan los IDs definidos manualmente en WooCommerce (related/upsell).
    - **Sugerencias Cruzadas:** Si no hay definidos, el sistema sugiere automáticamente ropa para zapatos y viceversa, usando un mapeo actualizado de categorías (Botas, Mocasines, Suéteres, etc.).
- **Optimización en Cascada:** Se mejoró la optimización de imágenes recursiva para que todos los productos sugeridos carguen miniaturas `.webp`, reduciendo el tiempo de carga de la página de producto.

## Últimos Cambios (27 de Febrero, 2026)

### 1. Parallax de Hero y Estructura de Capas
- **Efecto Sticky:** Se perfeccionó el efecto parallax haciendo que la sección Hero sea `sticky`.
- **Sincronización de Header:** Se ajustaron los valores de `top` y `margin-top` (90px desktop / 65px mobile) para que el video empiece exactamente donde termina el header, eliminando el "hueco gris" anterior.
- **Content Wrapper:** Se envolvió todo el contenido inferior en una clase `.content-wrapper` con `z-index: 10` y `position: relative` para asegurar que las secciones suban y cubran el video de fondo suavemente.

### 2. Rediseño Crítico de "Look de la Semana" (LookSection)
- **Grid Móvil 2x2:** Se eliminó el slider horizontal por uno de cuadrícula de 2 columnas, igualando la estética de la tienda principal.
- **Nivelación Inteligente:** Implementación de `grid-auto-rows: 1fr` y flexbox para que todas las tarjetas de una fila midan lo mismo, sin importar la longitud del nombre del producto.
- **Compactación Visual:**
    - Nombres de productos alineados a la izquierda.
    - Colores movidos a la derecha del precio para ahorrar espacio vertical.
    - Gap de colores reducido a `2px` y padding de info a `0.5rem`.
    - Eliminación de elementos distractores (icono +) en vistas móviles.
- **Precio Magnético:** El precio ahora se ancla siempre al borde inferior de la tarjeta (`margin-top: auto`), creando una línea visual limpia en todo el grid.

### 3. Sincronización Post-Pull
- **Recuperación de Componentes:** Se reinstalaron y configuraron los componentes `FeaturesBanner` (iconos de confianza) y `CategoryGrid` (Ropa, Zapatos, etc.) que se habían perdido en una sincronización de Git incompleta.

## Últimos Cambios (26 de Febrero, 2026)

### 1. Corrección de Espacio en Blanco en Hero (Scroll Bug)
- **Problema:** Al hacer scroll hacia abajo, el menú se ocultaba pero la sección Hero mantenía un desplazamiento superior de 90px, dejando un hueco blanco visible.
- **Solución:** 
    - Se actualizó `Header.astro` para inyectar la clase `is-header-hidden` al `body` cuando el menú se oculta.
    - Se modificó `Hero.astro` para que su posición `sticky` cambie de `top: 90px` a `top: 0` dinámicamente mediante una transición fluida.
    - Esto permite que el video de fondo ocupe el 100% de la pantalla útil tan pronto como el menú desaparece.

### 2. Nueva Sección de Categorías (CategoryGrid)
- **Implementación:** Se creó el componente `CategoryGrid.astro` con 4 bloques principales: Ropa, Zapatos, Maletas y Accesorios.
- **Estética premium:** 
    - Títulos y etiquetas en estilo Louis Vuitton (`Verde #155338`, `Bold 700`, `Antonio`).
    - Subtítulos alineados con la nueva visión: "Todo lo que necesita el hombre colombiano que viste con criterio".
    - Efectos de hover con zoom en imágenes y cambio de color a beige Winston.
- **Ajustes de Diseño:** Se redujo el padding excesivo para mejorar la compresión vertical y se ajustó el tamaño de los títulos a `1.5rem` para mayor elegancia.

## Últimos 5 Commits

1. **4978d4e** - *Adicion de la seccion el complemento ideal* (Hoy)
2. **50331fa** - *adicion de sugerencias en slug.astro* (Hoy)
3. **7a9ba73** - *arreglo de grid del home (mas parecido a LV)* (Hace 6 días)
4. **41ad9f3** - *Error al cargar las fotos dentro del modal* (Hace 6 días)
5. **48dcd16** - *arreglo de fotos despues de intentar meter los puntos otra vez* (Hace 6 días)

## Archivos Editados Recientemente y su Propósito

- **src/components/ProductGrid.tsx**:
    - **Filtros Dinámicos de Categoría:** Se implementó una barra de navegación tipo "Categoría" con botones para Zapatos (ID 63), Ropa (ID 249) y Maletas (ID 190).
    - **Barra Sticky Inteligente:** La sección de filtros ahora es fija (`sticky`) y sincronizada con el Header; se ajusta dinámicamente (`top: 80px` o `top: 0`) según la visibilidad del menú para evitar huecos visuales.
    - **Carga Progresiva (12 -> 24 -> Enlace):** Se optimizó el renderizado inicial mostrando primero 12 productos (4x3), cargando 24 tras el primer clic en "Ver más", y redirigiendo a la página de categoría completa en el siguiente paso. Esto mejora el rendimiento del DOM y la experiencia de navegación profunda.
- **src/pages/api/products.ts**:
    - **Parámetro de Categoría:** Se actualizó el endpoint para aceptar un parámetro `category`, permitiendo el filtrado desde el frontend.
    - **Optimización de Velocidad:** Se eliminó la carga pesada de variaciones en el listado masivo para evitar *timeouts* en categorías grandes (como Ropa), delegando la visualización de colores a la lógica de predicción del cliente.
- **src/components/Header.astro**:
    - **Fix de Logo:** Se reemplazó el componente `<Image />` por una etiqueta `<img>` estándar para evitar bloqueos por parte del servicio de optimización de imágenes ante ráfagas de tráfico, asegurando que el branding sea siempre visible.

## Estado Actual
- **Navegación por Categorías:** Totalmente funcional en el Home con transición suave.
- **Optimización de Grid:** Sistema de carga por etapas (12/24/Enlace) activo.
- **Header y Filtros Sincronizados:** El comportamiento sticky del grid responde a la visibilidad del Header.
- **API Optimizada:** Capaz de manejar categorías con altos volúmenes de productos sin errores de servidor.
- El sistema de venta cruzada ("El Complemento Ideal") sigue activo y funcional.
- La galería móvil es 100% dinámica y soporta "adivinación" de imágenes.
- El diseño general mantiene la estética de alta gama Winston & Harry (basada en LV) con enfoque en conversión.
- **Look of the Week:** Ahora es 100% consistente con el grid de la tienda en móviles.

## Sistema de Diseño y Línea Gráfica (Winston & Harry)

Para mantener la consistencia premium en todo el sitio, se deben seguir estos lineamientos obligatorios:

- **Colores Principales (Brand Colors):**
  - **Dorado/Beige Winston:** `#B1915F` (Usado en hovers, íconos de favoritos y estados "sale").
  - **Verde Profundo:** `#155338` (Identidad de marca, botones principales, títulos de secciones).
  - **Blanco de Lujo:** `#EFEFEF` (Color de fondo de página para suavizar el contraste).
- **Tipografía y Estética:**
  - **Títulos (H1-H4):** Fuente `Antonio`, siempre en Uppercase, con `letter-spacing: 2px`.
  - **Grid de Productos:** Estilo minimalista tipo "Louis Vuitton". Imágenes con `aspect-ratio: 3/4` o `1/1` dependiendo de la sección, con bordes rectos y sombras muy sutiles.
  - **Interactividad:** Botones con transición de `0.4s`, elevación en hover (`translateY(-3px)`) y cambio de color de verde a dorado.

## Notas de Arquitectura y Errores Conocidos

### Optimización de Imágenes (.webp) - "Estrategia Optimista"
Se ha descubierto que el servidor de imágenes de WordPress no genera archivos `.webp` para la totalidad de la librería, lo que causa errores 404 selectivos.

- **Hallazgo:** Imágenes como `Chaleco-Unifondo-Vino...jpg` pueden no tener su contraparte `.webp` disponible, incluso si otras imágenes del mismo producto sí la tienen.
- **Problema de Sufijos:** WordPress añade timestamps de edición (`-e175...`) que deben ser eliminados antes de intentar cargar el `.webp` base.
- **Estrategia Actual ("Estrategia de Fallback Obligatorio"):**
  1. El servidor (`SSR`) intenta cargar la versión `.webp` por defecto (limpiando sufijos de edición).
  2. El cliente (`React`) DEBE implementar un manejador `onError` en cada etiqueta `<img>`.
  3. Si la imagen `.webp` falla (404), el `onError` detecta la extensión y la elimina de la URL para cargar automáticamente el original (`.jpg` / `.png`).
- **Configuración en Código:** Esta lógica está centralizada en la función `optimizeImages` para la parte de datos y en el atributo `onError` de los componentes `ProductCard` y `ProductDetail`.

