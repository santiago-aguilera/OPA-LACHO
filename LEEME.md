# Opa Lacho — versión local

La página se ve igual que la original; solo cambió el "back". Ya **no necesita Node, Bun, Supabase ni Lovable**.
Solo necesita **Python 3.9 o superior** (sin instalar librerías).

## Cómo iniciarla

- **Windows:** doble clic en `iniciar.bat` (o en una terminal: `python server.py`)
- **Mac / Linux:** `./iniciar.sh` (o `python3 server.py`)

Luego abra **http://localhost:3000** en el navegador. Para detener: `Ctrl + C`.

## Qué hay en cada carpeta

| Archivo / carpeta | Para qué sirve |
|---|---|
| `server.py` | El servidor (el nuevo "back"). Guarda datos, genera el plan, sirve la página. |
| `public/index.html` | La página (HTML). |
| `public/css/styles.css` | Los estilos (los mismos de la original, ya compilados). |
| `public/js/app.js` | El comportamiento: plan, formulario, copiar llave, etc. |
| `public/img/` | Imágenes. |
| `datos/opalacho.db` | Base de datos SQLite (se crea sola): registros (`leads`), lista de espera y eventos. |
| `public/feria.html`, `public/admin.html` | Página de feria / modo stand y panel de administración. |
| `.env.example` | Opciones (puerto, clave de IA, clave de administración). |

## Lo que cambió respecto a la original

| Antes | Ahora |
|---|---|
| Supabase (lista de espera y analítica) | SQLite local en `datos/opalacho.db` |
| IA de Lovable para el plan | Se **retiró** el generador de plan: quien se suscribe deja sus objetivos y quedan guardados en el registro |
| TanStack Start / React / Vite / Tailwind en vivo | HTML + CSS compilado + JS simple |

## Datos del cliente ya cargados (tomados de sus volantes)

- **Precios:** Cosecha #1 (arándanos + fresas + champiñones + agraz) **$82.000**; Cosecha #2 (arándanos + fresas + champiñones) **$62.000**. Por producto (500 g): arándanos $35.000, fresas $12.000, champiñones $18.000, agraz $25.000. El «ahorro» ($8.000 y $3.000) es la resta contra comprarlos por separado.
- **Pago:** QR Bre-B (recortado del volante, `public/img/qr-nu.jpg`), llave `@HRV025` y efectivo.
- **Contacto:** WhatsApp 313 265 9789 · Instagram `@opalacho_vidabuena` · sitio `www.opalachovidabuena.com`.
- Si cambia un precio, edítelo en `public/index.html` (sección «Precios»), `public/feria.html`, `public/js/app.js` (`COSECHAS`) y `server.py` (`COSECHAS`).

> **Confirme con el cliente:** que el envío está incluido y que «sin permanencia / pausa o cancela» sigue vigente (venía en la página original, no en el volante). Si no es así, hay que quitarlo de la página principal.

## Activar WhatsApp, gramos y testimonios — `public/contenido.json`

Abra ese archivo con el Bloc de notas, edite y recargue la página:

- `"whatsapp": "573132659789"` (ya cargado) → aparece el botón flotante de WhatsApp (con código de país, sin + ni espacios) y un enlace en la sección de reserva.
- `"gramos": {"arandanos": "250 g", ...}` → muestra el peso de cada producto en «Qué recibe».
- `"testimonios": [{"texto": "...", "nombre": "Ana R.", "ciudad": "Bogotá", "foto": "/img/ana.jpg"}]` → aparece la sección «Lo que dicen». Use solo testimonios reales y con permiso. Con la lista vacía, la sección no se muestra.

## Mejoras de diseño incluidas

- Sección de **Suscripciones** (Comunidad 10 %, Semanal 8 %, Quincenal 4 %) con formulario de nombre, correo, dirección y objetivos.
- Nueva portada: titular claro + precio visible («Desde $88.200 COP · envío incluido»).
- Secciones nuevas: «Qué recibe» (con gramos opcionales) y «Quiénes somos» (con el logo).
- Flujo de reserva en 3 pasos (reserve → confirmamos → pague por Bre-B) y botón «Reservar mi cupo».
- Barra fija «Reservar mi cupo» en celular y botón flotante de WhatsApp.
- Preguntas frecuentes desplegables (7 preguntas) y datos estructurados para Google.
- Textos sin promesas de salud (no se habla de prevenir enfermedades): ver nota abajo.
- Mejor contraste de color, imágenes WebP más livianas, animación suave al hacer scroll y vista previa al compartir (`og:image`).

> **Revise estos textos**: los de «¿Qué pasa si no voy a estar…?» y «Quiénes somos» los redacté con lo que dice la página original; ajústelos a su operación real.
> Para que la imagen de vista previa funcione en WhatsApp/Instagram, al publicar la página cambie `/img/og.jpg` en `public/index.html` por la dirección completa (ej. `https://sudominio.com/img/og.jpg`).

## Para la feria

Hay tres direcciones nuevas:

| Dirección | Para qué |
|---|---|
| `/feria` | Página corta para los visitantes (celular): ofertas + registro en 1 minuto |
| `/feria?modo=stand` | **Modo tablet** para el stand: campos grandes, sin textos de venta y se limpia solo tras cada registro (cuenta cuántos lleva) |
| `/admin` | **Panel**: ver registros, cambiar estado (nuevo → contactado → confirmado → pagado), notas, botón de WhatsApp con mensaje listo, descargar Excel (CSV) y generar los QR |

Cada QR lleva el nombre de la feria (`?feria=expo-bogota-2026`), así el panel le dice cuál feria rindió más.

**Clave del panel:** aparece en la ventana del servidor al iniciarlo y queda guardada en `datos/clave_admin.txt`. Para ponerle la suya, agregue `ADMIN_KEY=su-clave` en `.env`.

### Personalizar la oferta de feria (sin tocar código)

En `public/contenido.json`, sección `"feria"`:
- `"banner"`: una frase destacada (ej. «Cupo de lanzamiento: primeros 50 registros»). Vacío = no se muestra.
- `"ofertas"`: título, detalle, precio y ahorro de cada tarjeta (`cosecha1`, `cosecha2`, `oficina`). Vacío = texto por defecto.

### Cómo tenerla en línea (el QR necesita una dirección pública)

1. **Solo en el stand, sin internet:** deje el servidor corriendo en el portátil y abra `http://localhost:3000/feria?modo=stand` en ese mismo equipo. Los visitantes no pueden escanear, pero usted los registra.
2. **Pública por unos días (lo más rápido):** con el servidor corriendo, ejecute en otra ventana `cloudflared tunnel --url http://localhost:3000` (gratis, [guía](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)). Le da una dirección `https://….trycloudflare.com`. **Cambia cada vez que lo ejecuta** y el portátil debe quedar prendido y con internet: genere los QR *después* de arrancar el túnel y no cierre la ventana.
3. **Estable (recomendado después):** un servidor con dominio propio y disco persistente (un VPS pequeño, Railway o Fly con volumen). Ojo: en hostings con disco temporal (ej. plan gratis de Render) **se pierden los registros**.

### Antes de la feria (lista rápida)

- [ ] Escanear con un celular el QR de pago de la página y confirmar que aparece la llave `@HRV025`.
- [ ] Generar y descargar los QR en `/admin` → Códigos QR (con la dirección pública final).
- [ ] Escanear el QR impreso con 2 celulares distintos y hacer un registro de prueba; luego borre las pruebas cambiando su estado a «descartado».
- [ ] Copia de seguridad: guarde `datos/opalacho.db` al terminar cada día, o baje el Excel desde el panel.

## Opciones (archivo `.env`)

Copie `.env.example` como `.env` y quite el `#` de lo que quiera usar:

- `ADMIN_KEY`: permite descargar la lista de espera en Excel/CSV en
  `http://localhost:3000/admin/lista-espera.csv?clave=SU_CLAVE`
- `PORT`: cambie el puerto si el 3000 está ocupado.
- `HOST=0.0.0.0`: para abrirla desde el celular en su misma red wifi (`http://IP-DE-SU-PC:3000`).

## Ver los datos guardados sin código

Abra `datos/opalacho.db` con [DB Browser for SQLite](https://sqlitebrowser.org/) (gratis), tablas
`waitlist_submissions` y `analytics_events`.

## Notas

- Las tipografías (Fraunces e Instrument Sans) se cargan desde Google Fonts, como en la original; sin internet se verán con una letra de reemplazo.
- Si cambia clases de diseño en `index.html`, recompile los estilos con `tools/compilar-css.sh` (requiere Node). Cambiar textos o imágenes no lo necesita.
