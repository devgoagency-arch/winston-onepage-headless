---
name: "Safe Deploy / Push a Main Validado"
description: "Se activa antes de hacer commit, git push o deploy a main. Permite push directo sin confirmación extra cuando build y tests pasan, cuidando costos de Vercel y reglas de seguridad."
---

# Reglas de Despliegue Seguro a `main`

Cuando vayas a subir cambios a producción (`git push origin main`), sigue estas reglas:

1. **Validación obligatoria antes del push**:
   - Ejecuta `node --test tests/*.mjs` y `npm run build`.
   - Si ambos pasan, puedes hacer `git push origin main` directamente sin pedir confirmación adicional.
   - Si el build o los tests fallan, **NO hagas push** y reporta el error a Nestor.
2. **Restricciones de Git**:
   - Prohibido usar `--force` o `--no-verify`.
   - No cambiar de rama; trabajar siempre en `main`.
3. **Control de costos en Vercel**:
   - Cada deploy de producción en Vercel cuesta dinero. Evita deploys especulativos o repetidos: agrupa los cambios y sube una sola vez cuando estén listos y probados.
4. **Seguridad y alcance**:
   - Nunca escribas claves, contraseñas ni secretos en el repositorio o en el chat.
   - No cambies variables de entorno de Vercel.
   - No modifiques ni refactorices archivos, configuraciones o lógica que no hayan sido pedidos.
