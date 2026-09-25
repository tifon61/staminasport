/**
 * ============================================================
 *  STAMINE - Backend en Google Apps Script
 * ============================================================
 *  Este archivo vive dentro de tu Google Sheet (Extensiones > Apps Script).
 *  Funciona como una pequeña "API": la página web le manda pedidos
 *  y este código lee/escribe en las hojas del Sheet.
 *
 *  - doGet(e):  se ejecuta cuando la página CONSULTA datos (GET).
 *  - doPost(e): se ejecuta cuando la página ENVÍA datos (POST).
 *
 *  Hojas que usa (se crean solas la primera vez):
 *  - "Stock":     las prendas que compraste.
 *  - "Consultas": lo que te preguntan los clientes.
 *  - "Ventas":    cada venta, con fecha y precio (para el historial).
 *  Las fotos se guardan en una carpeta de Google Drive.
 * ============================================================
 */

// ⚠️ Cambiá esta clave por una tuya. La vas a escribir también en la página
// (en "Configuración"). Sirve para que nadie más pueda modificar tus datos.
const API_KEY = 'cambiame-por-una-clave-secreta';

// Nombre de la carpeta de Drive donde se guardan las fotos.
const CARPETA_FOTOS = 'Stamine - Fotos';

// Columnas de cada hoja. El orden define el orden en el Sheet.
const HOJAS = {
  Stock: ['id', 'fecha_ingreso', 'nombre', 'categoria', 'talle', 'color',
          'cantidad', 'costo', 'porcentaje', 'foto_url', 'notas'],
  Consultas: ['id', 'fecha', 'producto', 'talle', 'cantidad', 'notas', 'estado'],
  // En cada venta copiamos nombre, categoría y costo de la prenda: así el
  // historial no cambia aunque después edites o borres la prenda del stock.
  Ventas: ['id', 'fecha', 'producto_id', 'nombre', 'categoria', 'talle',
           'cantidad', 'precio_unitario', 'costo_unitario', 'notas'],
};

// ------------------------------------------------------------
//  Puntos de entrada (lo que llama la página web)
// ------------------------------------------------------------

function doGet(e) {
  return manejar(() => {
    verificarClave(e.parameter.key);
    return {
      stock: leerHoja('Stock'),
      consultas: leerHoja('Consultas'),
      ventas: leerHoja('Ventas'),
      // La dirección de este Sheet, para el botón "📊 Hoja" de la página.
      sheet_url: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    };
  });
}

function doPost(e) {
  return manejar(() => {
    // La página manda el cuerpo como texto JSON.
    const body = JSON.parse(e.postData.contents);
    verificarClave(body.key);
    const d = body.data || {};

    switch (body.action) {
      case 'addProduct':
        if (d.foto_base64) d.foto_url = guardarFoto(d.foto_base64, d.nombre);
        d.fecha_ingreso = d.fecha_ingreso || hoy();
        return agregarFila('Stock', d);

      case 'updateProduct':
        if (d.foto_base64) d.foto_url = guardarFoto(d.foto_base64, d.nombre);
        return actualizarFila('Stock', d.id, d);

      case 'deleteProduct':
        return borrarFila('Stock', d.id);

      case 'addConsulta':
        d.fecha = d.fecha || hoy();
        d.estado = d.estado || 'pendiente';
        return agregarFila('Consultas', d);

      case 'updateConsulta':
        return actualizarFila('Consultas', d.id, d);

      case 'deleteConsulta':
        return borrarFila('Consultas', d.id);

      case 'registrarVenta':
        return registrarVenta(d);

      case 'deleteVenta':
        return anularVenta(d.id);

      default:
        throw new Error('Acción desconocida: ' + body.action);
    }
  });
}

// ------------------------------------------------------------
//  Helpers de hojas
// ------------------------------------------------------------

/** Devuelve la hoja, creándola con encabezados si no existe. */
function obtenerHoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.appendRow(HOJAS[nombre]);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, HOJAS[nombre].length).setFontWeight('bold');
  }
  return hoja;
}

/** Lee todas las filas y las convierte en objetos {columna: valor}. */
function leerHoja(nombre) {
  const valores = obtenerHoja(nombre).getDataRange().getValues();
  const encabezados = valores.shift();
  const tz = Session.getScriptTimeZone();

  return valores
    .filter(fila => fila[0] !== '') // ignora filas vacías
    .map(fila => {
      const obj = {};
      encabezados.forEach((col, i) => {
        let v = fila[i];
        // Sheets convierte las fechas en objetos Date: las pasamos a texto.
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        obj[col] = v;
      });
      return obj;
    });
}

function agregarFila(nombre, datos) {
  const hoja = obtenerHoja(nombre);
  datos.id = Utilities.getUuid();
  const fila = HOJAS[nombre].map(col => datos[col] ?? '');
  hoja.appendRow(fila);
  return { ok: true, id: datos.id };
}

function actualizarFila(nombre, id, datos) {
  const hoja = obtenerHoja(nombre);
  const numFila = buscarFila(hoja, id);
  const actual = hoja.getRange(numFila, 1, 1, HOJAS[nombre].length).getValues()[0];
  // Solo pisamos las columnas que vinieron en "datos".
  const nueva = HOJAS[nombre].map((col, i) => (col in datos ? datos[col] : actual[i]));
  hoja.getRange(numFila, 1, 1, nueva.length).setValues([nueva]);
  return { ok: true, id };
}

function borrarFila(nombre, id) {
  const hoja = obtenerHoja(nombre);
  hoja.deleteRow(buscarFila(hoja, id));
  return { ok: true, id };
}

/** Busca el número de fila (1-based) cuyo id coincide. */
function buscarFila(hoja, id) {
  const ids = hoja.getRange(1, 1, hoja.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 1;
  }
  throw new Error('No se encontró el registro ' + id);
}

/** Devuelve { numFila, obj } de un registro buscado por id. */
function leerRegistro(nombre, id) {
  const hoja = obtenerHoja(nombre);
  const numFila = buscarFila(hoja, id);
  const fila = hoja.getRange(numFila, 1, 1, HOJAS[nombre].length).getValues()[0];
  const obj = {};
  HOJAS[nombre].forEach((col, i) => (obj[col] = fila[i]));
  return { numFila, obj };
}

// ------------------------------------------------------------
//  Ventas
// ------------------------------------------------------------

/**
 * Registra una venta y descuenta el stock, las dos cosas juntas.
 * LockService evita que dos ventas simultáneas (ej: desde el celu y la compu)
 * lean el mismo stock y se pisen entre sí.
 */
function registrarVenta(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const prenda = leerRegistro('Stock', d.producto_id).obj;
    const cantidad = Number(d.cantidad) || 1;
    if (Number(prenda.cantidad) < cantidad) {
      throw new Error('No hay stock suficiente de "' + prenda.nombre + '" (quedan ' + prenda.cantidad + ')');
    }
    actualizarFila('Stock', prenda.id, { cantidad: Number(prenda.cantidad) - cantidad });
    return agregarFila('Ventas', {
      fecha: d.fecha || hoy(),
      producto_id: prenda.id,
      nombre: prenda.nombre,
      categoria: prenda.categoria,
      talle: prenda.talle,
      cantidad: cantidad,
      precio_unitario: Number(d.precio_unitario),
      costo_unitario: Number(prenda.costo),
      notas: d.notas || '',
    });
  } finally {
    lock.releaseLock();
  }
}

/** Borra una venta cargada por error y devuelve las unidades al stock. */
function anularVenta(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const venta = leerRegistro('Ventas', id).obj;
    try {
      const prenda = leerRegistro('Stock', venta.producto_id).obj;
      actualizarFila('Stock', prenda.id, { cantidad: Number(prenda.cantidad) + Number(venta.cantidad) });
    } catch (e) {
      // La prenda ya no existe en el stock: solo borramos la venta.
    }
    return borrarFila('Ventas', id);
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
//  Fotos en Google Drive
// ------------------------------------------------------------

/**
 * Recibe una imagen en base64 ("data:image/jpeg;base64,....."),
 * la guarda en Drive y devuelve una URL que se puede mostrar en <img>.
 */
function guardarFoto(dataUrl, nombre) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*);base64/)[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime,
                                 (nombre || 'prenda') + '-' + Date.now() + '.jpg');

  const carpetas = DriveApp.getFoldersByName(CARPETA_FOTOS);
  const carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(CARPETA_FOTOS);

  const archivo = carpeta.createFile(blob);
  // "Cualquiera con el enlace puede ver" → necesario para mostrarla en la página.
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + archivo.getId() + '&sz=w800';
}

// ------------------------------------------------------------
//  Utilidades
// ------------------------------------------------------------

function verificarClave(key) {
  if (key !== API_KEY) throw new Error('Clave incorrecta');
}

function hoy() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Ejecuta la función y siempre responde JSON, incluso si hay error. */
function manejar(fn) {
  let respuesta;
  try {
    respuesta = fn();
  } catch (err) {
    respuesta = { ok: false, error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(respuesta))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecutá esta función UNA vez a mano desde el editor (botón ▶ Ejecutar)
 * para crear las hojas y darle permisos al script (Sheets + Drive).
 */
function configurarInicial() {
  Object.keys(HOJAS).forEach(obtenerHoja);
  const carpetas = DriveApp.getFoldersByName(CARPETA_FOTOS);
  if (!carpetas.hasNext()) DriveApp.createFolder(CARPETA_FOTOS);
  Logger.log('Listo: hojas y carpeta creadas.');
}
