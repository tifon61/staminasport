# STAMINA · Control de stock

Página web para el local **Stamina**: cargás las prendas que comprás (con foto), definís el % de ganancia, ves el stock con su valor de venta, cuánto tiempo hace que tenés cada prenda, y registrás las consultas de los clientes para saber qué comprar.

- **Frontend:** HTML + CSS + JavaScript puro (sin frameworks), publicado en GitHub Pages.
- **Base de datos:** una Google Sheet.
- **Backend / API:** Google Apps Script (código en `apps-script/Codigo.gs`).
- **Fotos:** se guardan en una carpeta de Google Drive.

```
Navegador (GitHub Pages)  ──fetch──▶  Apps Script (doGet / doPost)  ──▶  Google Sheet + Drive
```

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | La estructura de la página: pestañas Stock, Cargar prenda, Consultas. |
| `css/styles.css` | Los estilos. Los colores están en variables al principio (`--acento`, etc.). |
| `js/config.js` | URL por defecto del Apps Script (opcional). |
| `js/api.js` | Las funciones que hablan con Apps Script. |
| `js/app.js` | Toda la lógica: cálculos, tarjetas, formularios, ranking. |
| `apps-script/Codigo.gs` | El backend que pegás dentro de tu Google Sheet. |

## Puesta en marcha

### 1. Crear la Google Sheet y el Apps Script

1. Entrá a [sheets.new](https://sheets.new) y ponele de nombre **Stamina Stock**.
2. Menú **Extensiones → Apps Script**.
3. Borrá lo que haya en `Código.gs` y pegá todo el contenido de `apps-script/Codigo.gs`.
4. Cambiá la línea `const API_KEY = '...'` por una clave tuya (ej: `stamina-2026-xyz`). **Anotala.**
5. Guardá (💾). Arriba, en el selector de funciones, elegí **`configurarInicial`** y tocá **▶ Ejecutar**.
   Google te va a pedir permisos (para usar tu Sheet y tu Drive): aceptá. Si aparece "Google no verificó esta app", tocá *Configuración avanzada → Ir a (proyecto)*. Es normal: la app es tuya.
   Esto crea las hojas **Stock** y **Consultas** y la carpeta de fotos en Drive.

### 2. Publicar el Apps Script como aplicación web

1. Botón **Implementar → Nueva implementación**.
2. Tipo (⚙): **Aplicación web**.
3. *Ejecutar como:* **Yo**. *Quién tiene acceso:* **Cualquier usuario**.
4. **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).

> Cada vez que cambies el código de Apps Script tenés que ir a **Implementar → Administrar implementaciones → ✏ → Versión: Nueva versión → Implementar**. Si no, sigue corriendo la versión vieja.

### 3. Publicar la página en GitHub Pages

1. En GitHub: **Settings → Pages**.
2. *Source:* **Deploy from a branch**, *Branch:* `main` y carpeta `/ (root)` → **Save**.
3. En un par de minutos la página queda en `https://tifon61.github.io/staminasport/`.

### 4. Conectar la página con tu Sheet

Abrí la página, tocá **⚙** y pegá la URL `/exec` y tu clave. Se guardan en ese navegador (tenés que hacerlo una vez en cada dispositivo: celu, compu…).

Opcional: pegá la URL en `js/config.js` para que ya venga cargada. **La clave nunca la pongas en el código**: el repositorio es público.

## Cómo funciona (para aprender)

- **Precio de venta** = `costo × (1 + porcentaje / 100)`. Ej: costo $10.000 con 50% → $15.000. Está en `precioVenta()` de `js/app.js`.
- **Antigüedad**: se guarda la fecha de compra y la página calcula los días hasta hoy (`diasDesde()`). Verde < 30 días, amarillo < 90, rojo si hace más de 3 meses: son las prendas a liquidar.
- **Fotos**: antes de subirlas, la página las achica a 1000px con un `<canvas>` (`achicarFoto()`) para que el envío sea rápido. Apps Script las guarda en Drive y devuelve un link.
- **CORS**: la página y Apps Script están en dominios distintos. Por eso los POST se mandan como `text/plain` (ver comentario en `js/api.js`).
- **Qué comprar**: agrupa las consultas pendientes por nombre de producto, suma cuántas veces te lo pidieron y lo ordena de mayor a menor. También te avisa si ya tenés algo con ese nombre en stock.
- **Seguridad**: la `API_KEY` evita que cualquiera que encuentre la URL modifique tus datos. Es una protección básica, suficiente para un uso personal.

## Ideas para seguir

- Registrar ventas en una hoja aparte para ver ganancias reales por mes.
- Descuento automático sugerido para prendas con más de 90 días.
- Varios talles de una misma prenda en una sola tarjeta.
