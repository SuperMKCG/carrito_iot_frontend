/* ============================================
   monitoreo.js - Solo GET + WSS (lectura)
   - Últimos 10 movimientos
   - Últimos 10 obstáculos
   - Últimas 20 secuencias DEMO
   - Último movimiento / obstáculo
   - Feed en tiempo real vía WSS
   ============================================ */
const API_URL = 'https://silencesuzuka.duckdns.org/api';
const WS_URL  = 'wss://silencesuzuka.duckdns.org/ws';
const DISPOSITIVO_ID = 1;

// Mapeo de nombres (por si el backend devuelve distintos casing)
const OPS = {
  1:'Adelante',2:'Atrás',3:'Detener',
  4:'Vuelta adelante derecha',5:'Vuelta adelante izquierda',
  6:'Vuelta atrás derecha',7:'Vuelta atrás izquierda',
  8:'Giro 90° derecha',9:'Giro 90° izquierda',
  10:'Giro 360° derecha',11:'Giro 360° izquierda'
};

// Helpers
function fmtDate(v){
  if(!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

// Obtiene el primer registro sin importar si viene como array, objeto o envuelto en {data:[]}
function pickFirst(rec){
  if (!rec) return null;
  if (Array.isArray(rec)) return rec[0] || null;
  if (rec.data){
    if (Array.isArray(rec.data)) return rec.data[0] || null;
    return rec.data; // por si viene como {data:{...}}
  }
  return rec;
}

function el(id){ return document.getElementById(id); }
function setText(id, txt){ const e = el(id); if(e) e.textContent = txt ?? '-'; }

// --------- Último Movimiento ----------
async function cargarUltimoMovimiento(){
  try{
    const res = await fetch(`${API_URL}/movimiento/ultimo/${DISPOSITIVO_ID}`);
    const data = await res.json();
    const r = Array.isArray(data) ? data[0] : data;
    const idEvento = r?.id_evento ?? r?.ID_EVENTO ?? '-';
    const opId     = r?.id_operacion ?? r?.ID_OPERACION ?? r?.operacion ?? '-';
    const opNom    = OPS[opId] ?? r?.operacion ?? '-';
    const velocidad = r?.velocidad ?? r?.VELOCIDAD ?? '-';
    const fecha    = r?.creado_en ?? r?.CREADO_EN ?? r?.fecha ?? '-';
    setText('um-id', idEvento);
    setText('um-op-id', opId);
    setText('um-op-nombre', opNom);
    setText('um-velocidad', velocidad);
    setText('um-fecha', fmtDate(fecha));
  }catch(_){
    setText('um-id','-'); setText('um-op-id','-'); setText('um-op-nombre','-'); setText('um-velocidad','-'); setText('um-fecha','-');
  }
}

// --------- Últimos 10 Movimientos ----------
async function cargarUltimos10Movimientos(){
  try{
    const tb = el('tabla-movimientos');
    if(!tb) return;
    const res = await fetch(`${API_URL}/movimiento/ultimos10/${DISPOSITIVO_ID}`);
    const data = await res.json();
    tb.innerHTML = '';
    (data || []).forEach(r => {
      const idEvento = r?.id_evento ?? r?.ID_EVENTO ?? '-';
      const opId     = r?.id_operacion ?? r?.ID_OPERACION ?? r?.operacion ?? '-';
      const opNom    = OPS[opId] ?? r?.operacion ?? '-';
      const velocidad = r?.velocidad ?? r?.VELOCIDAD ?? '-';
      const fecha    = r?.creado_en ?? r?.CREADO_EN ?? r?.fecha ?? '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idEvento}</td>
        <td>${opId}</td>
        <td>${opNom}</td>
        <td>${velocidad}</td>
        <td>${fmtDate(fecha)}</td>
      `;
      tb.appendChild(tr);
    });
    if(tb.children.length === 0){
      tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin datos</td></tr>`;
    }
  }catch(_){
    const tb = el('tabla-movimientos');
    if(tb) tb.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar</td></tr>`;
  }
}

// --------- Último Obstáculo ----------
async function cargarUltimoObstaculo(){
  try{
    const json = await (await fetch(`${API_URL}/obstaculo/ultimo/${DISPOSITIVO_ID}`)).json();
    const r = Array.isArray(json) ? json[0] : json;
    setText('uo-id',     r?.id_evento_obstaculo ?? '-');
    setText('uo-obs-id', r?.id_obstaculo ?? '-');
    setText('uo-desc',   r?.descripcion ?? '-');
    setText('uo-modo',   r?.modo ?? '-');
    setText('uo-fecha',  fmtDate(r?.creado_en));
  }catch(_){
    ['uo-id','uo-obs-id','uo-desc','uo-modo','uo-fecha'].forEach(id => setText(id,'-'));
  }
}

// --------- Últimos 10 Obstáculos ----------
async function cargarUltimos10Obstaculos(){
  try{
    const tb = el('tabla-obstaculos');
    if(!tb) return;
    const res = await fetch(`${API_URL}/obstaculo/ultimos10/${DISPOSITIVO_ID}`);
    const json = await res.json();
    const data = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
    tb.innerHTML = '';
    data.forEach(r => {
      const id    = r.id_evento_obstaculo ?? r.ID_EVENTO_OBSTACULO ?? '-';
      const obsId = r.id_obstaculo        ?? r.ID_OBSTACULO        ?? '-';
      const desc  = r.descripcion         ?? r.DESCRIPCION         ?? '-';
      const modo  = r.modo                ?? r.MODO                ?? '-';
      const fecha = r.creado_en           ?? r.CREADO_EN           ?? r.fecha ?? '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${id}</td>
        <td>${obsId}</td>
        <td>${desc}</td>
        <td>${modo}</td>
        <td>${fmtDate(fecha)}</td>
      `;
      tb.appendChild(tr);
    });
    if(tb.children.length === 0){
      tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin datos</td></tr>`;
    }
  }catch(_){
    const tb = el('tabla-obstaculos');
    if(tb) tb.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar</td></tr>`;
  }
}

// --------- Últimas 20 Secuencias DEMO ----------
async function cargarUltimas20Secuencias(){
  try{
    const tb = el('tabla-secuencias');
    if(!tb) return;
    const res = await fetch(`${API_URL}/secuencia/demo/ultimas20/${DISPOSITIVO_ID}`);
    const data = await res.json();
    tb.innerHTML = '';
    (data || []).forEach(r => {
      const id     = r?.id_secuencia ?? r?.ID_SECUENCIA ?? '-';
      const disp   = r?.id_dispositivo ?? r?.ID_DISPOSITIVO ?? '-';
      const nombre = r?.nombre ?? r?.NOMBRE ?? '-';
      const origen = r?.modo ?? r?.origen ?? r?.ORIGEN ?? 'AUTO';
      const fecha  = r?.creado_en ?? r?.CREADO_EN ?? '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${id}</td>
        <td>${disp}</td>
        <td>${nombre}</td>
        <td>${origen}</td>
        <td>${fmtDate(fecha)}</td>
      `;
      tb.appendChild(tr);
    });
    if(tb.children.length === 0){
      tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin datos</td></tr>`;
    }
  }catch(_){
    const tb = el('tabla-secuencias');
    if(tb) tb.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar</td></tr>`;
  }
}

// --------- WebSocket (lectura) ----------
function openWS(){
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type:'identify', dispositivo: DISPOSITIVO_ID }));
    // puedes mostrar estado si quieres
  };
  ws.onmessage = (e) => {
    try{
      const msg = JSON.parse(e.data || '{}');
      if(msg.type !== 'event') return;
      const ev = msg.event;
      // Ante eventos relevantes, refrescamos datasets
      if(ev === 'comando_carrito' || ev === 'secuencia_iniciada' || ev === 'secuencia_finalizada'){
        // actualizar último movimiento y tabla de 10
        cargarUltimoMovimiento();
        cargarUltimos10Movimientos();
      }
      if(ev === 'obstaculo_detectado'){
        cargarUltimoObstaculo();
        cargarUltimos10Obstaculos();
      }
    }catch(_){}
  };
  ws.onclose = () => setTimeout(openWS, 2000);
}

// --------- Init ----------
async function init(){
  openWS();
  await Promise.all([
    cargarUltimoMovimiento(),
    cargarUltimos10Movimientos(),
    cargarUltimoObstaculo(),
    cargarUltimos10Obstaculos(),
    cargarUltimas20Secuencias()
  ]);
}

document.addEventListener('DOMContentLoaded', init);
