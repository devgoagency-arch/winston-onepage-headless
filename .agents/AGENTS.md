# Reglas del Proyecto

- **Alcance estricto**: Queda ESTRICTAMENTE PROHIBIDO modificar o refactorizar archivos, configuraciones o lógica de código que no hayan sido explícitamente solicitados por el usuario. Limítate a resolver exactamente lo que se te pide sin tocar otras cosas "para mejorar".
- **Deploy y push a `main`**: Se puede hacer `git push origin main` directo sin pedir confirmación adicional siempre que `npm run build` y los tests (`node --test tests/*.mjs`) pasen. Si el build o los tests fallan, NO hacer push y reportar el error a Nestor.
- **Integridad de Git**: Prohibido usar `--force` y `--no-verify`. No cambiar de rama (trabajar en `main`).
- **Cuidar costos de Vercel**: Evitar deploys especulativos o repetidos porque cada deploy de producción en Vercel cuesta dinero. Agrupar los cambios y subir una sola vez cuando estén listos y probados.
- **Seguridad y entorno**: Nunca escribir claves, contraseñas ni secretos en el repositorio ni en el chat. No cambiar variables de entorno de Vercel.
