# Sistema de Imágenes del Grid (ProductCard)

## Overview

El grid de productos en el home (`ProductGrid.tsx` + `ProductCard.tsx`) maneja imágenes de productos con múltiples niveles de fallback.

## Estructura de Datos

### 1. Imágenes del producto base
```typescript
product.images: { src: string, alt: string }[]
```

### 2. Mapa de imágenes de variaciones (API)
```typescript
product.variation_images_map: Record<string, Image[]>
// Ejemplo: { "negro": [img1, img2, img3], "cafe": [img1, img2, img3] }
```

**Importante:** El `variation_images_map` se genera en `/api/products.ts` para productos variables. Solo contiene las imágenes de las variaciones si:
- El producto es de tipo `variable`
- Las variaciones tienen atributos de color
- La API de WooCommerce retorna las imágenes de cada variación

## Flujo de Imágenes

### Cambio de Color (seleccionar color)
1. **Prioridad 1:** Usar `variation_images_map[colorSlug]` desde la API
2. **Fallback 2:** Buscar en `product.images` por nombre de archivo que contenga el color
3. **Fallback 3:** Predecir URL cambiando el color en el nombre del archivo

### Hover (imagen -2)
1. **Prioridad 1:** Segunda imagen del set actual (`displayImages[1]`)
2. **Fallback 2:** Predecir URL cambiando `-1` por `-2` en el nombre

## Patrones de URL Esperados

### Convenciones de Winston & Harry
- **Imagen principal:** `{nombre}-{color}-Winstonandharry-1.jpg`
- **Imagen hover:** `{nombre}-{color}-Winstonandharry-2.jpg`
- **Más imágenes:** `-3`, `-4`, etc.

### Transformaciones Automáticas

La API (`/api/products.ts`) aplica `optimizeImages()`:
1. Añade `.webp` a todas las URLs de WordPress
2. Limpia sufijos de edición de WordPress (`-e12345...`)

```typescript
// Ejemplo:
// Input: https://.../Cumberland-II-Cognac-Winstonandharry-2.jpg
// Output: https://.../Cumberland-II-Cognac-Winstonandharry-2.jpg.webp
```

## Fallbacks Implementados

### 1. Error de .webp en imagen
Si una imagen con `.webp` falla:
- Quitar `.webp` e intentar de nuevo
- Esto funciona tanto para imagen principal como hover

### 2. Imagen hover no encontrada
- Si `displayImages[1]` (segunda imagen) falla, intentar con `guessedHoverSrc`
- `guessedHoverSrc` predice la URL cambiando `-1` por `-2`

### 3. Predicción de color
Si no hay imágenes para un color específico:
- Busca el color en el nombre de archivo de la imagen base
- Reemplaza el color antiguo por el nuevo

## Diagnóstico de Problemas

### "El cambio de color no funciona"
1. Verificar que la API retorne `variation_images_map`:
   - Ir a `/api/products` en el navegador
   - Buscar `variation_images_map` en un producto variable
   - Si está vacío o no existe → problema en la API

2. Verificar que los `terms` del atributo color coincidan con los atributos de las variaciones:
   - `product.attributes` → términos de color (slugs como "negro", "cafe")
   - `product.variations[].attributes` → valores de cada variación

### "El hover muestra imagen rota"
1. Inspect element → buscar la URL de la imagen hover
2. Si termina en `.webp`, probar la URL sin `.webp` en otra pestaña
3. Si la imagen sin `.webp` funciona → el fallback debería haber actuado
4. Verificar que la imagen `-2` exista en el servidor

### "La imagen principal no carga"
1. Inspect element → ver la URL
2. Probar en el navegador directamente
3. Verificar si tiene `.webp` innecesario o sufijos `-e123...`

## Archivos Clave

| Archivo | Responsabilidad |
|---------|-----------------|
| `/api/products.ts` | Genera `variation_images_map` para la lista |
| `/src/components/ProductCard.tsx` | Lógica de displayImages, hover, fallbacks |
| `/src/components/ProductGrid.tsx` | Carga productos de la API |

## Variables de Estado Relevantes

```typescript
// En ProductCard.tsx
const [selectedColor, setSelectedColor]    // Color seleccionado click
const [hoveredColor, setHoveredColor]     // Color en hover (sin click)
const [activeColor] = hoveredColor || selectedColor  // Color activo
const [displayImages, setDisplayImages]   // Imágenes según color activo
const [isHoverImageValid, setIsHoverImageValid] // Si la hover carga bien
```

## Notas Importantes

1. **El cache de Vercel** puede servir datos antiguos. Si cambios en la API no se reflejan:
   - Hacer hard refresh (`Ctrl+Shift+R`)
   - Verificar headers de cache en la response

2. **La API solo retorna variaciones** para productos de la categoría 63 (configurado en `api/products.ts`)

3. **El hover requiere** que `isHoverActive` sea true Y que `effectiveHoverSrc` tenga valor
