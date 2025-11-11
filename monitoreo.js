const API_URL = 'https://silencesuzuka.duckdns.org/api';
const WS_URL  = 'wss://silencesuzuka.duckdns.org/ws';
const DISPOSITIVO_ID = 1;

let websocket = null;
let reconnectTimer = null;

const tablaMovimientos = document.getElementById('tabla-movimientos');
const tablaObstaculos = document.getElementById('tabla-obstaculos');
const tablaSecuencias = document.getElementById('tabla-secuencias');

const umId = document.getElementById('um-id');
const umOpId = document.getElementById('um-op-id');
const umOpNombre = document.getElementById('um-op-nombre');
const umFecha = document.getElementById('um-fecha');

const uoId = document.getElementById('uo-id');
const uoObsId = document.getElementById('uo-obs-id');
const uoDesc = document.getElementById('uo-desc');
const uoModo = document.getElementById('uo-modo');
const uoSec = document.getElementById('uo-sec');
const uoFecha = document.getElementById('uo-fecha');

async function actualizarMovimientos() {
  try {
    const response = await fetch(`${API_URL}/movimiento/ultimos10/${DISPOSITIVO_ID}`);
    const data = await response.json();

    if (!data || data.length === 0) {
      tablaMovimientos.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay movimientos registrados</td></tr>';
      return;
    }

    tablaMovimientos.innerHTML = data.map(mov => `
      <tr>
        <td>${mov.id_evento}</td>
        <td>${mov.id_operacion}</td>
        <td><span class="badge bg-primary">${mov.operacion}</span></td>
        <td>${new Date(mov.creado_en).toLocaleString('es-MX')}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error al actualizar movimientos:', error);
  }
}

async function actualizarObstaculos() {
  try {
    const response = await fetch(`${API_URL}/obstaculo/ultimos10/${DISPOSITIVO_ID}`);
    const data = await response.json();

    if (!data || data.length === 0) {
      tablaObstaculos.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay obstáculos registrados</td></tr>';
      return;
    }

    tablaObstaculos.innerHTML = data.map(obs => `
      <tr>
        <td>${obs.id_evento_obstaculo}</td>
        <td>${obs.id_obstaculo}</td>
        <td><span class="badge bg-warning text-dark">${obs.descripcion}</span></td>
        <td><span class="badge ${obs.modo === 'AUTO' ? 'bg-info' : 'bg-secondary'}">${obs.modo}</span></td>
        <td>${obs.id_secuencia_evasion ?? '-'}</td>
        <td>${new Date(obs.creado_en).toLocaleString('es-MX')}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error al actualizar obstáculos:', error);
  }
}

async function actualizarSecuencias() {
  try {
    const response = await fetch(`${API_URL}/secuencia/demo/ultimas20/${DISPOSITIVO_ID}`);
    const data = await response.json();

    if (!data || data.length === 0) {
      tablaSecuencias.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay secuencias registradas</td></tr>';
      return;
    }

    tablaSecuencias.innerHTML = data.map(sec => `
      <tr>
        <td>${sec.id_secuencia}</td>
        <td>${sec.id_dispositivo}</td>
        <td><strong>${sec.nombre}</strong></td>
        <td><span class="badge bg-success">${sec.origen}</span></td>
        <td>${new Date(sec.creado_en).toLocaleString('es-MX')}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error al actualizar secuencias:', error);
  }
}

async function actualizarUltimoMovimiento() {
  try {
    const response = await fetch(`${API_URL}/movimiento/ultimo/${DISPOSITIVO_ID}`);
    const data = await response.json();

    if (data && data.length > 0) {
      const mov = data[0];
      umId.textContent = mov.id_evento;
      umOpId.textContent = mov.id_operacion;
      umOpNombre.textContent = mov.operacion;
      umFecha.textContent = new Date(mov.creado_en).toLocaleString('es-MX');
    }
  } catch (error) {
    console.error('Error al actualizar último movimiento:', error);
  }
}

async function actualizarUltimoObstaculo() {
  try {
    const response = await fetch(`${API_URL}/obstaculo/ultimo/${DISPOSITIVO_ID}`);
    const data = await response.json();

    if (data && data.length > 0) {
      const obs = data[0];
      uoId.textContent = obs.id_evento_obstaculo;
      uoObsId.textContent = obs.id_obstaculo;
      uoDesc.textContent = obs.descripcion;
      uoModo.textContent = obs.modo;
      uoSec.textContent = obs.id_secuencia_evasion ?? '-';
      uoFecha.textContent = new Date(obs.creado_en).toLocaleString('es-MX');
    }
  } catch (error) {
    console.error('Error al actualizar último obstáculo:', error);
  }
}

async function actualizarTodo() {
  await Promise.all([
    actualizarMovimientos(),
    actualizarObstaculos(),
    actualizarSecuencias(),
    actualizarUltimoMovimiento(),
    actualizarUltimoObstaculo()
  ]);
}

function connectWebSocket() {
  if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  websocket = new WebSocket(WS_URL);

  websocket.addEventListener('open', async () => {
    clearTimeout(reconnectTimer);
    websocket.send(JSON.stringify({
      type: 'identify',
      role: 'monitor',
      dispositivo: DISPOSITIVO_ID,
      channels: ['broadcast']
    }));
    await actualizarTodo();
  });

  websocket.addEventListener('close', () => {
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  });

  websocket.addEventListener('message', async (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type !== 'event') {
        return;
      }

      switch (message.event) {
        case 'movimiento_manual':
        case 'carrito_movimiento_ok':
          await Promise.all([actualizarMovimientos(), actualizarUltimoMovimiento()]);
          break;

        case 'obstaculo_detectado':
        case 'obstaculo_real':
          await Promise.all([actualizarObstaculos(), actualizarUltimoObstaculo()]);
          break;

        case 'movimiento_secuencia':
          await actualizarSecuencias();
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Error al procesar mensaje WebSocket:', error);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
});
