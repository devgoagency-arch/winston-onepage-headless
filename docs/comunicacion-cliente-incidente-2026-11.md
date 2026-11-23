# Comunicación al cliente — incidente tienda W&H (12 nov 2026)

Dos textos listos para pegar: (1) mensaje del incidente, (2) instrucciones de 2FA.
No incluyen la dirección privada de acceso: envíasela aparte, por un canal privado.

---

## 1. Mensaje del incidente

**Asunto: Incidente de seguridad en la tienda (12 nov) y qué hicimos**

Hola [nombre]:

Te cuento un incidente que detectamos en la tienda y cómo lo resolvimos.

**Qué pasó.** Entre el 4 y el 12 de noviembre, alguien adivinó la contraseña de la cuenta "Inventarios" (una contraseña vieja, sin cambiar desde 2021) probando miles de combinaciones. Con esa cuenta entró desde el 10 de noviembre y publicó 2 artículos de spam en el blog. Lo vimos gracias a que notaste esas publicaciones.

**Qué revisamos.** No creó cuentas de administrador y no modificó archivos del sitio (verificamos que el sistema y los plugins estén intactos).

**Qué hicimos el mismo día.**
- Cerramos todas las sesiones abiertas de esa cuenta y le cambiamos la contraseña.
- Eliminamos los 2 artículos y una clave de acceso que el atacante había creado.
- Cambiamos la dirección de entrada al panel: ahora es privada, y la anterior ya no responde.
- Ocultamos la lista de usuarios, que estaba visible públicamente y facilitaba el ataque.
- Cerramos otras vías por las que se podían probar contraseñas.
- Instalamos verificación en dos pasos (2FA), que se activa por persona.

**Qué necesitamos de tu equipo.**
- Que cada persona con acceso al panel active la verificación en dos pasos. Te enviamos las instrucciones.
- Que nos digas si las cuentas "pluginpress" y "camiloiregui" siguen haciendo falta; si no, las eliminamos.
- Que usen siempre contraseñas únicas y largas. Te enviamos la nueva dirección de acceso por un canal privado.

**Qué seguimos revisando.** [Escribe aquí lo que verifiques sobre pedidos y datos de clientes.] Te escribo apenas lo tengamos confirmado.

Quedo atento.

> Nota para ti (no la envíes): "Inventarios" es shop_manager y puede ver pedidos y datos de clientes.
> El atacante entró 23 veces con esa cuenta y NO se ha verificado si consultó esa información.
> No escribas "no se accedió a datos de clientes" sin comprobarlo. Si se consultaron datos
> personales, puede haber obligaciones de protección de datos en Colombia: conviene validarlo
> con alguien que sepa (esto no es asesoría legal).

---

## 2. Instrucciones para activar la verificación en dos pasos (2FA)

Hace falta una vez por persona y toma unos 5 minutos. Necesitas tu celular y una app autenticadora
(Google Authenticator, Microsoft Authenticator, Authy o 1Password).

**Antes de empezar**
- Instala la app autenticadora en tu celular, si no la tienes.
- Entra al panel con la dirección privada que te enviamos aparte, con tu usuario y contraseña de siempre.

**Pasos**
1. En el menú de la izquierda, ve a **Usuarios → Perfil** (o a tu nombre arriba a la derecha → Editar perfil).
2. Baja hasta la sección **Two-Factor Options**.
3. En **Authenticator App**, activa la casilla. Aparece un código QR.
4. Abre la app en tu celular, elige **Agregar cuenta** y escanea ese QR. La app mostrará un código de 6 dígitos que cambia cada 30 segundos.
5. Escribe ese código en el campo de la página para confirmar y guarda con **Actualizar perfil**.
6. En **Recovery Codes**, pulsa el botón para generarlos. Aparecen 10 códigos. **Guárdalos en un lugar seguro fuera del panel** (gestor de contraseñas o impresos). Sirven si pierdes el celular, y cada uno se usa una sola vez.
7. Guarda el perfil de nuevo.

**Para comprobar que quedó bien:** cierra sesión y vuelve a entrar. Después de la contraseña, el panel te pedirá el código de 6 dígitos de tu app.

**Importante**
- No compartas los códigos ni la pantalla del QR con nadie.
- Si cambias de celular, usa un código de recuperación para entrar y vuelve a configurar la app.
- Si pierdes el celular y los códigos de recuperación, escríbenos y te ayudamos a recuperar el acceso.
- Pedimos que lo hagan **antes del [fecha]**.

> Antes de enviar: haz tú estos pasos con tu cuenta y ajusta los nombres que difieran (no se probó el flujo con una cuenta real).
> Quién debe hacerlo: GoGerman, alemuguerza e Inventarios. newInstonandharry, pluginpress y camiloiregui
> están pendientes de decidir; si se eliminan, no lo necesitan.
> Hoy el 2FA no es obligatorio: la fecha límite es una petición, nada los bloquea.
