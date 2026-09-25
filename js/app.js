/**
 * ============================================================
 *  app.js - Lógica de la página
 * ============================================================
 *  Estructura:
 *   1. Estado y utilidades (formato de plata, fechas, etc.)
 *   2. Navegación por pestañas
 *   3. Stock: resumen + tarjetas
 *   4. Formulario de carga/edición de prendas
 *   5. Consultas y ranking "Qué comprar"
 *   6. Configuración e inicio
 * ============================================================
 */

// ---------- 1. Estado y utilidades ----------

// "estado" guarda los datos que vinieron del Sheet.
const estado = { stock: [], consultas: [] };

const $ = (sel) => document.querySelector(sel);

const plata = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
});

/** Precio de venta = costo + porcentaje de ganancia. */
function precioVenta(costo, porcentaje) {
  return Number(costo) * (1 + Number(porcentaje) / 100);
}

/** Cuántos días pasaron desde una fecha 'yyyy-mm-dd'. */
function diasDesde(fechaTexto) {
  if (!fechaTexto) return 0;
  const [a, m, d] = String(fechaTexto).slice(0, 10).split('-').map(Number);
  const fecha = new Date(a, m - 1, d); // fecha local, sin problemas de zona horaria
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy - fecha) / 86400000));
}

/** Convierte días en texto amigable: "hace 3 días", "hace 2 meses"... */
function textoAntiguedad(dias) {
  if (dias === 0) return 'Ingresó hoy';
  if (dias === 1) return 'Hace 1 día';
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'} (${dias} días)`;
  const anios = (dias / 365).toFixed(1);
  return `Hace ${anios} años (${dias} días)`;
}

/** Color del badge según antigüedad: verde < 30 días, amarillo < 90, rojo más. */
function claseAntiguedad(dias) {
  if (dias < 30) return 'nuevo';
  if (dias < 90) return 'medio';
  return 'viejo';
}

function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Evita que un texto con "<" rompa el HTML (o inyecte código). */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function toast(msg, esError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (esError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => (t.hidden = true), 3500);
}

/** Envuelve una llamada a la API mostrando "Cargando…" y errores. */
async function conCarga(fn) {
  $('#cargando').hidden = false;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, true);
    // Si la clave está mal, volvemos a pedirla.
    if (err.message === 'Clave incorrecta') pedirClave();
    throw err;
  } finally {
    $('#cargando').hidden = true;
  }
}

// ---------- 2. Pestañas ----------

function irA(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === tab));
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => irA(b.dataset.tab)));

// ---------- 3. Stock ----------

async function cargarDatos() {
  if (!Api.configurado()) return pedirClave();
  let datos;
  try {
    datos = await conCarga(() => Api.listar());
  } catch {
    return; // conCarga ya mostró el error
  }
  estado.stock = datos.stock;
  estado.consultas = datos.consultas;
  renderTodo();
}

function renderTodo() {
  renderResumen();
  renderStock();
  renderConsultas();
  renderSugerencias();
}

function renderResumen() {
  let unidades = 0, invertido = 0, venta = 0;
  for (const p of estado.stock) {
    const cant = Number(p.cantidad) || 0;
    unidades += cant;
    invertido += cant * Number(p.costo);
    venta += cant * precioVenta(p.costo, p.porcentaje);
  }
  $('#r-unidades').textContent = unidades;
  $('#r-invertido').textContent = plata.format(invertido);
  $('#r-venta').textContent = plata.format(venta);
  $('#r-ganancia').textContent = plata.format(venta - invertido);
}

function renderStock() {
  const texto = $('#buscar').value.trim().toLowerCase();
  const verSinStock = $('#ver-sin-stock').checked;
  const orden = $('#orden').value;
  const categoria = $('#filtro-categoria').value;

  // filter → quedarnos con las que coinciden
  let lista = estado.stock.filter((p) => {
    if (!verSinStock && Number(p.cantidad) <= 0) return false;
    if (categoria && p.categoria !== categoria) return false;
    const blob = `${p.nombre} ${p.categoria} ${p.color} ${p.talle}`.toLowerCase();
    return blob.includes(texto);
  });

  // sort → ordenar según lo elegido
  const criterios = {
    antiguas: (a, b) => diasDesde(b.fecha_ingreso) - diasDesde(a.fecha_ingreso),
    recientes: (a, b) => diasDesde(a.fecha_ingreso) - diasDesde(b.fecha_ingreso),
    precio: (a, b) => precioVenta(b.costo, b.porcentaje) - precioVenta(a.costo, a.porcentaje),
    cantidad: (a, b) => b.cantidad - a.cantidad,
  };
  lista.sort(criterios[orden]);

  // map → convertir cada prenda en HTML
  $('#lista-stock').innerHTML = lista.length
    ? lista.map(tarjetaPrenda).join('')
    : '<p class="vacio">No hay prendas para mostrar. Cargá una en "Cargar prenda".</p>';
}

function tarjetaPrenda(p) {
  const dias = diasDesde(p.fecha_ingreso);
  const precio = precioVenta(p.costo, p.porcentaje);
  const cant = Number(p.cantidad) || 0;
  const foto = p.foto_url
    ? `<img class="prenda-foto" src="${esc(p.foto_url)}" alt="${esc(p.nombre)}" loading="lazy">`
    : '<div class="prenda-foto">👕</div>';
  const meta = [p.categoria, p.talle && `Talle ${p.talle}`, p.color].filter(Boolean).map(esc).join(' · ');

  return `
    <article class="prenda ${cant <= 0 ? 'sin-stock' : ''}">
      ${foto}
      <div class="prenda-cuerpo">
        <span class="prenda-nombre">${esc(p.nombre)}</span>
        <span class="prenda-meta">${meta}</span>
        <span class="precio">${plata.format(precio)}</span>
        <div class="detalle">
          <span>Stock</span><b>${cant} u.</b>
          <span>Costo</span><b>${plata.format(p.costo)}</b>
          <span>Ganancia</span><b>${Number(p.porcentaje)}% · ${plata.format(precio - p.costo)}</b>
          <span>Valor total</span><b>${plata.format(precio * cant)}</b>
        </div>
        <span class="badge ${claseAntiguedad(dias)}" title="Ingresó el ${esc(p.fecha_ingreso)}">⏱ ${textoAntiguedad(dias)}</span>
      </div>
      <div class="acciones">
        <button class="btn chico" data-accion="vender" data-id="${p.id}" ${cant <= 0 ? 'disabled' : ''}>Vendí 1</button>
        <button class="btn chico secundario" data-accion="editar" data-id="${p.id}">Editar</button>
        <button class="btn chico secundario peligro" data-accion="borrar" data-id="${p.id}">Borrar</button>
      </div>
    </article>`;
}

// Un solo listener para todos los botones de las tarjetas ("delegación de eventos").
$('#lista-stock').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  const prenda = estado.stock.find((p) => p.id === btn.dataset.id);

  if (btn.dataset.accion === 'editar') return editarPrenda(prenda);

  if (btn.dataset.accion === 'vender') {
    btn.disabled = true;
    await conCarga(() => Api.enviar('updateProduct', { id: prenda.id, cantidad: Number(prenda.cantidad) - 1 }));
    toast(`Vendiste 1 "${prenda.nombre}"`);
  }

  if (btn.dataset.accion === 'borrar') {
    if (!confirm(`¿Borrar "${prenda.nombre}"?`)) return;
    await conCarga(() => Api.enviar('deleteProduct', { id: prenda.id }));
    toast('Prenda borrada');
  }
  cargarDatos();
});

['#buscar', '#orden', '#ver-sin-stock', '#filtro-categoria'].forEach((s) => $(s).addEventListener('input', renderStock));
$('#btn-recargar').addEventListener('click', cargarDatos);

// ---------- 4. Formulario de prendas ----------

const form = $('#form-prenda');

/** Muestra en vivo el precio de venta mientras escribís. */
function actualizarCalculo() {
  const costo = Number(form.costo.value) || 0;
  const precio = precioVenta(costo, form.porcentaje.value || 0);
  $('#calc-precio').textContent = plata.format(precio);
  $('#calc-ganancia').textContent = plata.format(precio - costo);
}
form.costo.addEventListener('input', actualizarCalculo);
form.porcentaje.addEventListener('input', actualizarCalculo);

/**
 * Achica la foto antes de subirla (las fotos del celular pesan varios MB).
 * Usa un <canvas> para redibujarla a máx. 1000px y la devuelve en base64.
 */
function achicarFoto(archivo, maximo = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}

// La foto puede venir de la cámara o de la galería: guardamos la última elegida.
let fotoElegida = null;
for (const input of [$('#foto-camara'), $('#foto-galeria')]) {
  input.addEventListener('change', () => {
    if (!input.files[0]) return;
    fotoElegida = input.files[0];
    $('#preview-foto').src = URL.createObjectURL(fotoElegida);
    $('#preview-foto').hidden = false;
    input.value = ''; // permite volver a elegir la misma foto si hace falta
  });
}

function resetForm() {
  form.reset();
  fotoElegida = null;
  form.elements.id.value = '';
  form.fecha_ingreso.value = hoyISO();
  $('#preview-foto').hidden = true;
  $('#form-titulo').textContent = 'Nueva prenda';
  $('#btn-cancelar').hidden = true;
  actualizarCalculo();
}

function editarPrenda(p) {
  resetForm();
  for (const campo of ['id', 'nombre', 'categoria', 'talle', 'color', 'cantidad', 'costo', 'porcentaje', 'fecha_ingreso', 'notas']) {
    form.elements[campo].value = p[campo] ?? '';
  }
  if (p.foto_url) { $('#preview-foto').src = p.foto_url; $('#preview-foto').hidden = false; }
  $('#form-titulo').textContent = `Editando: ${p.nombre}`;
  $('#btn-cancelar').hidden = false;
  actualizarCalculo();
  irA('cargar');
}
$('#btn-cancelar').addEventListener('click', () => { resetForm(); irA('stock'); });

form.addEventListener('submit', async (e) => {
  e.preventDefault(); // evita que la página se recargue
  const boton = form.querySelector('button[type=submit]');
  boton.disabled = true;

  try {
    // FormData lee todos los campos del form; lo pasamos a objeto común.
    const datos = Object.fromEntries(new FormData(form));
    datos.cantidad = Number(datos.cantidad);
    datos.costo = Number(datos.costo);
    datos.porcentaje = Number(datos.porcentaje);
    if (fotoElegida) datos.foto_base64 = await achicarFoto(fotoElegida);

    const editando = Boolean(datos.id);
    if (!editando) delete datos.id;
    await conCarga(() => Api.enviar(editando ? 'updateProduct' : 'addProduct', datos));

    toast(editando ? 'Prenda actualizada ✔' : 'Prenda cargada ✔');
    resetForm();
    irA('stock');
    cargarDatos();
  } finally {
    boton.disabled = false;
  }
});

// ---------- 5. Consultas ----------

const formConsulta = $('#form-consulta');

/** Normaliza el nombre para agrupar "Calza Negra" y "calza negra " juntas. */
const clave = (t) => String(t).trim().toLowerCase();

function renderConsultas() {
  // Las más nuevas arriba
  const lista = [...estado.consultas].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  $('#lista-consultas').innerHTML = lista.length ? lista.map((c) => `
    <li class="${c.estado === 'comprado' ? 'comprado' : ''}">
      <span class="lista-texto">
        <strong>${esc(c.producto)}</strong> ${c.talle ? `(talle ${esc(c.talle)})` : ''} — ${Number(c.cantidad)} consulta(s)
        <small>${esc(c.fecha)} ${c.notas ? '· ' + esc(c.notas) : ''}</small>
      </span>
      <button class="btn chico secundario" data-accion="sumar" data-id="${c.id}">+1</button>
      <button class="btn chico secundario" data-accion="estado" data-id="${c.id}">
        ${c.estado === 'comprado' ? 'Reabrir' : 'Ya lo compré'}
      </button>
      <button class="btn chico secundario peligro" data-accion="borrar" data-id="${c.id}">✕</button>
    </li>`).join('') : '<li class="vacio">Todavía no registraste consultas.</li>';

  renderRanking();
}

/** Agrupa las consultas pendientes por producto y las ordena de más a menos pedidas. */
function renderRanking() {
  const grupos = new Map();
  for (const c of estado.consultas) {
    if (c.estado === 'comprado') continue;
    const k = clave(c.producto);
    const g = grupos.get(k) || { nombre: c.producto, total: 0, talles: new Set() };
    g.total += Number(c.cantidad) || 0;
    if (c.talle) g.talles.add(String(c.talle));
    grupos.set(k, g);
  }
  const ranking = [...grupos.values()].sort((a, b) => b.total - a.total);
  const max = ranking[0]?.total || 1;

  // ¿Ya tengo algo parecido en stock? Busca el nombre consultado dentro del stock.
  const enStock = (nombre) => estado.stock
    .filter((p) => Number(p.cantidad) > 0 && clave(p.nombre).includes(clave(nombre)))
    .reduce((s, p) => s + Number(p.cantidad), 0);

  $('#ranking').innerHTML = ranking.length ? ranking.map((g) => {
    const stock = enStock(g.nombre);
    return `
      <li>
        <div style="flex:1">
          <strong>${esc(g.nombre)}</strong>
          <small class="prenda-meta">${g.talles.size ? ' · Talles: ' + esc([...g.talles].join(', ')) : ''}
            ${stock ? ` · Tenés ${stock} en stock` : ' · Sin stock'}</small>
          <div class="barra" style="width:${(g.total / max) * 100}%"></div>
        </div>
        <span class="num">${g.total}</span>
      </li>`;
  }).join('') : '<li class="vacio" style="display:block">Sin consultas pendientes 🎉</li>';
}

/** Sugerencias de autocompletado con productos ya consultados y categorías usadas. */
function renderSugerencias() {
  const productos = new Set(estado.consultas.map((c) => c.producto));
  $('#productos-consultados').innerHTML = [...productos].map((p) => `<option value="${esc(p)}">`).join('');
  // Categorías: las de config.js + las que ya estén usadas en el Sheet
  // (así una prenda vieja con otra categoría no la pierde al editarla).
  const categorias = [...new Set([
    ...CONFIG.CATEGORIAS,
    ...estado.stock.map((p) => p.categoria).filter(Boolean),
  ])];
  llenarSelect(form.categoria, categorias, 'Elegí una categoría');
  llenarSelect($('#filtro-categoria'), categorias, 'Todas las categorías');
}

/** Rellena un <select> con opciones, sin perder lo que estaba elegido. */
function llenarSelect(select, opciones, textoVacio) {
  const elegido = select.value;
  select.innerHTML = `<option value="">${textoVacio}</option>` +
    opciones.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  select.value = elegido;
}

formConsulta.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formConsulta));
  datos.cantidad = Number(datos.cantidad) || 1;
  datos.fecha = hoyISO();
  await conCarga(() => Api.enviar('addConsulta', datos));
  toast('Consulta registrada ✔');
  formConsulta.reset();
  cargarDatos();
});

$('#lista-consultas').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  const c = estado.consultas.find((x) => x.id === btn.dataset.id);
  const acciones = {
    sumar: () => Api.enviar('updateConsulta', { id: c.id, cantidad: Number(c.cantidad) + 1 }),
    estado: () => Api.enviar('updateConsulta', { id: c.id, estado: c.estado === 'comprado' ? 'pendiente' : 'comprado' }),
    borrar: () => confirm('¿Borrar esta consulta?') && Api.enviar('deleteConsulta', { id: c.id }),
  };
  btn.disabled = true;
  await conCarga(acciones[btn.dataset.accion]);
  cargarDatos();
});

// ---------- 6. Configuración e inicio ----------

function pedirClave() {
  if ($('#dlg-config').open) return;
  $('#form-config').key.value = Api.key;
  $('#dlg-config').showModal();
}
$('#btn-config').addEventListener('click', pedirClave);

$('#dlg-config').addEventListener('close', () => {
  if ($('#dlg-config').returnValue !== 'ok') return;
  localStorage.setItem('stamina_key', $('#form-config').key.value.trim());
  cargarDatos();
});

renderSugerencias(); // llena los selectores de categoría antes de que lleguen los datos
resetForm();
cargarDatos();
