# ScrollRevealBanner Component

## Descripción
Componente inspirado en el efecto de Louis Vuitton Gift Guide que muestra una imagen a pantalla completa con un overlay de texto que aparece gradualmente al hacer scroll.

## Características
- ✨ Imagen full-screen responsive
- 🎨 Overlay con efecto fade controlado por scroll
- 📱 Totalmente responsive
- 🎯 Texto centrado con animación suave
- 🌊 Gradiente sin borde superior (efecto fade natural)

## Uso

```astro
---
import ScrollRevealBanner from "../components/ScrollRevealBanner.astro";
---

<ScrollRevealBanner 
  imageUrl="/ruta/a/tu/imagen.jpg"
  title="Tu Título Aquí"
  description="Tu descripción aquí. Puede ser un texto más largo que explique la colección o promoción."
  pretitle="Texto Opcional Superior"
/>
```

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `imageUrl` | `string` | ✅ | URL de la imagen de fondo |
| `title` | `string` | ✅ | Título principal del banner |
| `description` | `string` | ✅ | Descripción o texto secundario |
| `pretitle` | `string` | ❌ | Texto pequeño que aparece sobre el título |
| `imageAlt` | `string` | ❌ | Texto alternativo para la imagen |

## Cómo Funciona

### 1. Efecto de Scroll
- El overlay comienza invisible (opacity: 0)
- A medida que haces scroll hacia abajo, la opacidad aumenta gradualmente
- El texto aparece con una animación de traducción (translateY)

### 2. Gradiente
El overlay usa un gradiente CSS que va de transparente a oscuro:
```css
background: linear-gradient(
  to bottom,
  rgba(0, 0, 0, 0) 0%,      /* Transparente arriba */
  rgba(0, 0, 0, 0.3) 30%,
  rgba(0, 0, 0, 0.6) 60%,
  rgba(0, 0, 0, 0.8) 100%   /* Oscuro abajo */
);
```

### 3. JavaScript
- Usa `IntersectionObserver` para detectar cuando el banner está visible
- Calcula el progreso del scroll basado en la posición del banner
- Actualiza la opacidad del overlay dinámicamente

## Personalización

### Cambiar Colores del Texto
Edita las variables CSS en el componente:

```css
.scroll-reveal-banner__pretitle {
  color: #B1915F; /* Color dorado de Winston & Harry */
}

.scroll-reveal-banner__content {
  color: #EFEFEF; /* Color del texto principal */
}
```

### Ajustar el Gradiente
Modifica el gradiente en `.scroll-reveal-banner__overlay`:

```css
background: linear-gradient(
  to bottom,
  rgba(0, 0, 0, 0) 0%,
  rgba(21, 83, 56, 0.8) 100% /* Verde de Winston & Harry */
);
```

### Cambiar la Altura
Por defecto es `100vh` (pantalla completa):

```css
.scroll-reveal-banner {
  height: 80vh; /* Cambia a 80% de la altura de la pantalla */
  min-height: 500px; /* Altura mínima */
}
```

## Ejemplos de Uso

### Banner de Colección
```astro
<ScrollRevealBanner 
  imageUrl="/collections/spring-2024.jpg"
  pretitle="Nueva Colección"
  title="Primavera 2024"
  description="Descubre nuestra nueva línea de calzado artesanal con diseños frescos y elegantes."
/>
```

### Banner de Promoción
```astro
<ScrollRevealBanner 
  imageUrl="/promotions/valentines-day.jpg"
  title="San Valentín"
  description="Encuentra el regalo perfecto para esa persona especial."
/>
```

### Banner de Producto Destacado
```astro
<ScrollRevealBanner 
  imageUrl="/products/featured-shoe.jpg"
  pretitle="Producto Destacado"
  title="Modelo Bogotá"
  description="Elegancia y confort en cada paso. Hecho a mano con los mejores materiales."
/>
```

## Tips de Diseño

1. **Imágenes**: Usa imágenes de alta calidad (mínimo 1920x1080px)
2. **Contraste**: Asegúrate de que el texto sea legible sobre la imagen
3. **Texto**: Mantén el título corto (2-4 palabras) y la descripción concisa
4. **Posición**: Funciona mejor después del Hero y antes del ProductGrid

## Compatibilidad
- ✅ Chrome, Firefox, Safari, Edge (últimas versiones)
- ✅ Mobile y Desktop
- ✅ Astro 4.x
- ✅ Compatible con View Transitions de Astro
