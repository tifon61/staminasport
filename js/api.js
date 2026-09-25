/**
 * ============================================================
 *  api.js - Comunicación con Google Apps Script
 * ============================================================
 *  Toda la charla con el backend pasa por acá.
 *
 *  Truco importante (CORS): Apps Script no acepta pedidos con
 *  "Content-Type: application/json" desde otra página, porque el
 *  navegador primero manda un pedido de verificación (preflight) que
 *  Apps Script no sabe responder. Por eso mandamos el JSON como
 *  "text/plain": es un "pedido simple" y no dispara el preflight.
 * ============================================================
 */
const Api = {
  // La URL es fija (config.js). La clave se guarda solo en este navegador.
  get url() { return CONFIG.API_URL; },
  get key() { return localStorage.getItem('stamina_key') || ''; },

  configurado() { return Boolean(this.key); },

  /** Trae todo: { stock: [...], consultas: [...] } */
  async listar() {
    const res = await this._fetch(`${this.url}?key=${encodeURIComponent(this.key)}`);
    return this._procesar(res);
  },

  /** Manda una acción al backend: addProduct, updateConsulta, etc. */
  async enviar(action, data) {
    const res = await this._fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: this.key, action, data }),
    });
    return this._procesar(res);
  },

  /**
   * fetch con un mensaje de error entendible. Si el navegador bloquea la
   * respuesta por CORS, casi siempre es porque Google devolvió una página de
   * login o de error en vez de nuestro JSON (implementación mal configurada).
   */
  async _fetch(url, opciones) {
    try {
      return await fetch(url, opciones);
    } catch {
      throw new Error('No se pudo conectar con el Apps Script. Revisá que esté implementado como ' +
        '"Aplicación web" con acceso "Cualquier usuario" (ver README).');
    }
  },

  async _procesar(res) {
    if (!res.ok) throw new Error(`Error de red (${res.status})`);
    const json = await res.json();
    if (json.ok === false) throw new Error(json.error);
    return json;
  },
};
