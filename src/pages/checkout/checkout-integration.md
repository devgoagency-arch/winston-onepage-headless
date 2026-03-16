# Checkout Headless — Winston & Harry
## Astro + WooCommerce v3 + Mercado Pago + Addi

---

## Arquitectura general

```
Usuario en winstonandharrystore.com (Astro / Vercel)
        │
        ▼
/carrito  →  CartPage.tsx        Lee Nanostores (localStorage)
        │
        ▼
/checkout →  CheckoutPage.tsx    Formulario + validación
        │
        ▼
/api/create-order.ts             Crea orden en WooCommerce v3
        │
        ▼
tienda.winstonandharrystore.com  Genera link de pago (Mercado Pago / Addi)
        │
        ▼
Pasarela de pago externa         Usuario paga
        │
        ▼
WooCommerce recibe webhook        Marca orden como pagada
        │
        ▼
/gracias  →  OrderConfirmation   Confirma al usuario
```

El usuario **nunca ve** `tienda.winstonandharrystore.com`.
Todo ocurre en `winstonandharrystore.com`.

---

## Archivos del sistema

| Archivo | Ruta | Descripción |
|---|---|---|
| `carrito.astro` | `src/pages/carrito.astro` | Página carrito |
| `CartPage.tsx` | `src/components/CartPage.tsx` | Componente carrito |
| `checkout.astro` | `src/pages/checkout.astro` | Página checkout |
| `CheckoutPage.tsx` | `src/components/CheckoutPage.tsx` | Formulario + resumen |
| `create-order.ts` | `src/pages/api/create-order.ts` | Endpoint crear orden |
| `gracias.astro` | `src/pages/gracias.astro` | Página confirmación |
| `OrderConfirmation.tsx` | `src/components/OrderConfirmation.tsx` | Componente confirmación |
| `cart.ts` | `src/store/cart.ts` | Store Nanostores (ya existía) |
| `checkout.ts` | `src/utils/checkout.ts` | Utilidad fill_cart (ya existía) |

---

## Flujo detallado

### 1. Carrito (`/carrito`)

- Lee `cartItems` de Nanostores (`persistentMap` en localStorage clave `wh_cart_v2`)
- Permite cambiar cantidades y eliminar items
- Muestra subtotal, envío gratuito, total
- Botón "Finalizar compra" → navega a `/checkout`
- Botón "Ver carrito" del SideCart ahora apunta a `/carrito` (no a `tienda./cart`)

### 2. Checkout (`/checkout`)

- Si el carrito está vacío redirige a `/carrito`
- Si el usuario está logueado pre-llena nombre y email desde `userSession`
- Valida campos requeridos antes de enviar
- Al enviar llama a `POST /api/create-order` con:
  - Datos de facturación y envío
  - Items del carrito con `product_id` y `variation_id`
  - Método de pago seleccionado
- Guarda `wh_last_order` en `sessionStorage` para la página de confirmación
- Limpia el carrito con `clearCart()`
- Redirige a `order.payment_url` (Mercado Pago o Addi)

### 3. Endpoint `/api/create-order`

- Recibe el payload del CheckoutPage
- Construye el objeto de orden para WooCommerce v3:
  ```json
  {
    "payment_method": "mercadopago",
    "billing": { ... },
    "shipping": { ... },
    "line_items": [
      { "product_id": 123, "variation_id": 456, "quantity": 1 }
    ]
  }
  ```
- Llama a `wcFetch('/orders', { method: 'POST', ... })`
- Devuelve `order_id`, `order_number`, `payment_url`

### 4. Confirmación (`/gracias`)

- WooCommerce/Mercado Pago redirige aquí tras el pago
- Lee `wh_last_order` de `sessionStorage`
- Muestra número de pedido y email de confirmación

---

## Variables de entorno necesarias

Estas ya deben estar en Vercel. Verificar que existan:

```bash
WC_URL=https://tienda.winstonandharrystore.com
WC_CONSUMER_KEY=ck_xxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxx
```

---

## Configuración en WordPress

### URL de retorno de Mercado Pago

En WooCommerce → Ajustes → Pagos → Mercado Pago, configurar:

- **URL de éxito**: `https://winstonandharrystore.com/gracias`
- **URL de fracaso**: `https://winstonandharrystore.com/checkout`
- **URL de cancelación**: `https://winstonandharrystore.com/carrito`

### URL de retorno de Addi

En WooCommerce → Ajustes → Pagos → Addi:

- **Callback URL**: `https://winstonandharrystore.com/gracias`

### Emails de WooCommerce

Los emails automáticos (confirmación, envío) los sigue manejando WooCommerce
sin cambios — funcionan igual porque la orden se crea en WooCommerce.

---

## Manejo de variaciones

Los productos variables en WooCommerce tienen un `product_id` (producto padre)
y un `variation_id` (combinación específica de atributos).

El store de Nanostores guarda el `variation_id` en `item.id` cuando se
selecciona una variación. El endpoint `create-order.ts` lo envía como:

```json
{
  "product_id": 24114,
  "variation_id": 24130,
  "quantity": 1
}
```

Si `variation_id` es 0 o igual a `product_id`, WooCommerce lo trata
como producto simple.

---

## Validaciones del formulario

| Campo | Regla |
|---|---|
| Nombre | Requerido |
| Apellidos | Requerido |
| Documento | Requerido |
| Email | Requerido, formato válido |
| Teléfono | Requerido |
| Dirección | Requerido |
| Ciudad | Requerido |
| Departamento | Opcional |
| Código postal | Opcional |
| Notas | Opcional |

---

## Errores comunes y soluciones

### La orden se crea pero el carrito no se limpia
El `clearCart()` se llama antes del redirect. Si el usuario presiona
"atrás" en el navegador el carrito ya está vacío. Es comportamiento
esperado — el pedido ya quedó en WooCommerce.

### `payment_url` está vacío
WooCommerce devuelve `payment_url` en órdenes con estado `pending`.
Si el plugin de Mercado Pago no está activo o mal configurado,
la URL puede estar vacía. Verificar que el plugin esté activo en
WooCommerce → Ajustes → Pagos.

### Error 401 en `/api/create-order`
Las credenciales `WC_CONSUMER_KEY` / `WC_CONSUMER_SECRET` en Vercel
no tienen permisos de escritura. Regenerar con permisos "Lectura/Escritura"
en WooCommerce → Ajustes → Avanzado → REST API.

### El usuario logueado no aparece asociado a la orden
Agregar `customer_id` al payload en `create-order.ts`:
```typescript
// Obtener el ID del cliente desde el token JWT si está disponible
const customer_id = body.customer_id || 0;
// En el payload:
{ ...orderPayload, customer_id }
```

---

## Próximos pasos sugeridos

1. **Asociar órdenes a usuarios logueados** — pasar `customer_id` al crear la orden
2. **Página `/mi-cuenta/pedidos`** — ya tiene el endpoint `/api/auth/orders`
3. **Guardar dirección** — después del primer checkout, guardar en el perfil del usuario
4. **Webhook de confirmación de pago** — WooCommerce ya lo maneja, pero agregar
   invalidación de caché cuando una orden cambia a `processing`
