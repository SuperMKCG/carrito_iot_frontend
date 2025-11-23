const API_URL = 'https://silencesuzuka.duckdns.org/api';
const WS_URL  = 'wss://silencesuzuka.duckdns.org/ws';
const DISPOSITIVO_ID = 1;

let websocket = null;
let reconnectTimer = null;

let isRecording = false;
let recordedSequence = [];
let modoManual = true;
let secuenciaEnEjecucion = null;
let secuenciaActual = [];
let pasoActualIndex = 0;
let secuenciaPausada = false;
let ejecutandoSecuencia = false;

const statusMovimiento = document.getElementById('status-movimiento');
const statusObstaculo = document.getElementById('status-obstaculo');
const statusSecuencia = document.getElementById('status-secuencia');
const statusEvasion = document.getElementById('status-evasion');
const btnGrabar = document.getElementById('btn-grabar');
const btnGuardar = document.getElementById('btn-guardar');
const btnEjecutarGrabada = document.getElementById('btn-ejecutar-grabada');
const btnRepetir = document.getElementById('btn-repetir');
const selectSecuencia = document.getElementById('select-secuencia');
const nombreSecuencia = document.getElementById('nombre-secuencia');
const recordingInfo = document.getElementById('recording-info');
const pasoCount = document.getElementById('paso-count');
const overlayGrabacion = document.getElementById('overlay-grabacion');
const overlayCount = document.getElementById('overlay-count');
const overlayMovimientos = document.getElementById('overlay-movimientos');

const operaciones = {
  1: 'Adelante',
  2: 'Atrás',
  3: 'Detener',
  4: 'Vuelta adelante derecha',
  5: 'Vuelta adelante izquierda',
  6: 'Vuelta atrás derecha',
  7: 'Vuelta atrás izquierda',
  8: 'Giro 90° derecha',
  9: 'Giro 90° izquierda',
  10: 'Giro 360° derecha',
  11: 'Giro 360° izquierda'
};

const obstaculos = {
  1: 'Adelante',
  2: 'Adelante-Izquierda',
  3: 'Adelante-Derecha',
  4: 'Adelante-Izquierda-Derecha',
  5: 'Retrocede'
};

const tiemposOperacion = {
  1: 1500,
  2: 1500,
  3: 500,
  4: 1200,
  5: 1200,
  6: 1200,
  7: 1200,
  8: 800,
  9: 800,
  10: 1100,
  11: 1100
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarPaso(paso) {
  const operacion = paso?.operacion ?? paso?.id_operacion ?? paso?.ID_OPERACION ?? null;
  if (operacion === null || operacion === undefined) {
    return null;
  }
  const ms =
    paso?.ms ??
    paso?.duracion_ms ??
    paso?.DURACION_MS ??
    tiemposOperacion[operacion] ??
    0;

  return { operacion, ms };
}

function connectWebSocket() {
  if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  websocket = new WebSocket(WS_URL);

  websocket.addEventListener('open', () => {
    clearTimeout(reconnectTimer);
    websocket.send(JSON.stringify({
      type: 'identify',
      role: 'frontend',
      dispositivo: DISPOSITIVO_ID,
      channels: ['broadcast']
    }));
    statusMovimiento.textContent = 'Conectado al servidor WebSocket';
  });

  websocket.addEventListener('close', () => {
    statusMovimiento.textContent = 'Reconectando WebSocket...';
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  });

  websocket.addEventListener('message', handleWebSocketMessage);
}

function handleWebSocketMessage(event) {
  try {
    const message = JSON.parse(event.data);
    if (message.type !== 'event') {
      return;
    }

    switch (message.event) {
      case 'carrito_online':
        statusMovimiento.textContent = `✅ Carrito ${message.data.dispositivo} conectado`;
        break;

      case 'movimiento_manual':
        statusMovimiento.textContent = `Movimiento: ${operaciones[message.data.operacion] || 'Desconocido'}`;
        break;

      case 'movimiento_secuencia':
        secuenciaEnEjecucion = message.data.secuencia;
        statusSecuencia.textContent = `Secuencia en ejecución (#${secuenciaEnEjecucion})`;
        break;

      case 'carrito_movimiento_ok':
        if (ejecutandoSecuencia && !secuenciaPausada) {
          pasoActualIndex++;
          if (pasoActualIndex < secuenciaActual.length) {
            const siguientePaso = secuenciaActual[pasoActualIndex];
            enviarMovimiento(siguientePaso.operacion);
          } else {
            ejecutandoSecuencia = false;
            statusSecuencia.textContent = 'Secuencia finalizada';
            statusMovimiento.textContent = 'En espera...';
          }
        }
        break;

      case 'obstaculo_detectado':
        statusObstaculo.textContent = `⚠️ Obstáculo: ${obstaculos[message.data.obstaculo] || 'Desconocido'}`;
        break;

      case 'obstaculo_real':
        statusObstaculo.textContent = `⚠️ Obstáculo: ${obstaculos[message.data.obstaculo] || 'Desconocido'} (${message.data.distancia}cm)`;
        statusEvasion.textContent = `🔄 Evasión: ${message.data.evasion}`;
        if (ejecutandoSecuencia) {
          secuenciaPausada = true;
          statusSecuencia.textContent = '⏸️ Secuencia PAUSADA (obstáculo real)';
        }
        break;

      case 'carrito_listo_reanudar':
        statusEvasion.textContent = '✅ Evasión completada';
        statusObstaculo.textContent = 'Ninguno';
        if (ejecutandoSecuencia) {
          secuenciaPausada = false;
          statusSecuencia.textContent = '▶️ Reanudando secuencia...';
        }
        break;

      case 'carrito_error':
        alert(`⚠️ Error del carrito:\nTipo: ${message.data.tipo}\nMensaje: ${message.data.mensaje}`);
        if (ejecutandoSecuencia) {
          ejecutandoSecuencia = false;
          secuenciaPausada = false;
          statusSecuencia.textContent = '❌ Secuencia detenida (error del carrito)';
          statusMovimiento.textContent = 'Error detectado';
        }
        break;

      case 'ejecutar_evasion':
        statusEvasion.textContent = `🔄 Ejecutando evasión: ${message.data.nombre}`;
        break;

      case 'comando_emergencia':
        statusMovimiento.textContent = '🛑 Comando de emergencia enviado';
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Error al procesar mensaje WebSocket:', error);
  }
}

async function enviarMovimiento(idOperacion) {
  if (idOperacion === null || idOperacion === undefined) {
    console.error('Operación inválida, se ignora el envío:', idOperacion);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/movimiento/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_dispositivo: DISPOSITIVO_ID,
        id_operacion: idOperacion
      })
    });

    const data = await response.json();

    if (modoManual && !ejecutandoSecuencia) {
      statusMovimiento.textContent = `Movimiento: ${operaciones[idOperacion] || 'Desconocido'}`;
    }

    if (isRecording) {
      recordedSequence.push({
        operacion: idOperacion,
        ms: tiemposOperacion[idOperacion]
      });

      pasoCount.textContent = recordedSequence.length;
      overlayCount.textContent = `${recordedSequence.length} pasos`;

      const movItem = document.createElement('div');
      movItem.className = 'movimiento-item';
      movItem.innerHTML = `
        <span class="paso-numero">${recordedSequence.length}</span>
        <span class="operacion-nombre">${operaciones[idOperacion]}</span>
        <span class="tiempo-ms">${tiemposOperacion[idOperacion]}ms</span>
      `;

      if (recordedSequence.length === 1) {
        overlayMovimientos.innerHTML = '';
      }

      overlayMovimientos.appendChild(movItem);
      overlayMovimientos.scrollTop = overlayMovimientos.scrollHeight;
    }

    return data;
  } catch (error) {
    console.error('Error al enviar movimiento:', error);
    alert('Error al comunicarse con el servidor');
  }
}

document.querySelectorAll('.control-btn').forEach(btn => {
  let isPressed = false;

  btn.addEventListener('mousedown', () => {
    if (ejecutandoSecuencia || isPressed) return;
    isPressed = true;
    const operacion = parseInt(btn.dataset.op, 10);
    modoManual = true;
    enviarMovimiento(operacion);
    btn.style.opacity = '0.7';
    btn.style.transform = 'scale(0.95)';
  });

  const resetButton = () => {
    if (!isPressed) return;
    isPressed = false;
    enviarMovimiento(3);
    statusMovimiento.textContent = 'Detenido (esperando comando)';
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  };

  btn.addEventListener('mouseup', resetButton);
  btn.addEventListener('mouseleave', resetButton);
});

btnGrabar.addEventListener('click', () => {
  if (!isRecording) {
    isRecording = true;
    modoManual = true;
    recordedSequence = [];

    btnGrabar.textContent = '⏹️ Detener Grabación';
    btnGrabar.classList.remove('btn-danger');
    btnGrabar.classList.add('btn-secondary');
    btnGuardar.disabled = true;
    btnEjecutarGrabada.disabled = true;
    recordingInfo.style.display = 'block';
    pasoCount.textContent = '0';

    overlayGrabacion.style.display = 'block';
    overlayCount.textContent = '0 pasos';
    overlayMovimientos.innerHTML = '<p class="text-muted small mb-0">Presiona botones para grabar...</p>';

    statusMovimiento.textContent = '🔴 MODO GRABACIÓN ACTIVO';
  } else {
    isRecording = false;

    btnGrabar.textContent = '🔴 Grabar Secuencia';
    btnGrabar.classList.remove('btn-secondary');
    btnGrabar.classList.add('btn-danger');
    btnGuardar.disabled = recordedSequence.length === 0;
    btnEjecutarGrabada.disabled = true;
    recordingInfo.style.display = 'none';

    statusMovimiento.textContent = `Secuencia grabada (${recordedSequence.length} pasos) - Guárdala primero`;
  }
});

btnGuardar.addEventListener('click', async () => {
  const nombre = nombreSecuencia.value.trim();

  if (!nombre) {
    alert('Por favor, ingresa un nombre para la secuencia');
    return;
  }

  if (recordedSequence.length === 0) {
    alert('No hay movimientos grabados');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/secuencia/demo/agregar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_dispositivo: DISPOSITIVO_ID,
        nombre: nombre,
        pasos: JSON.stringify(recordedSequence)
      })
    });

    const data = await response.json();

    if (data && data.length > 0) {
      const idSecuenciaGrabada = data[0].id_secuencia;
      secuenciaActual = [...recordedSequence];

      alert(`✅ Secuencia "${nombre}" guardada con ID ${idSecuenciaGrabada}`);
      nombreSecuencia.value = '';
      recordedSequence = [];
      btnGuardar.disabled = true;
      btnEjecutarGrabada.disabled = false;

      overlayGrabacion.style.display = 'none';

      await cargarSecuencias();
    }
  } catch (error) {
    console.error('Error al guardar secuencia:', error);
    alert('Error al guardar la secuencia');
  }
});

btnEjecutarGrabada.addEventListener('click', async () => {
  if (secuenciaActual.length === 0) {
    alert('Primero debes guardar una secuencia');
    return;
  }
  await ejecutarSecuencia(secuenciaActual, 'Secuencia grabada');
});

async function cargarSecuencias() {
  try {
    const response = await fetch(`${API_URL}/secuencia/demo/ultimas20/${DISPOSITIVO_ID}`);
    const data = await response.json();

    selectSecuencia.innerHTML = '<option value="">Seleccionar secuencia...</option>';

    data.forEach(sec => {
      const option = document.createElement('option');
      option.value = sec.id_secuencia ?? sec.ID_SECUENCIA ?? sec.id;
      option.textContent = `${sec.nombre ?? sec.NOMBRE} (${new Date(sec.creado_en ?? sec.CREADO_EN).toLocaleString()})`;
      selectSecuencia.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar secuencias:', error);
  }
}

btnRepetir.addEventListener('click', async () => {
  const idSecuencia = parseInt(selectSecuencia.value, 10);

  if (!idSecuencia) {
    alert('Selecciona una secuencia para repetir');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/secuencia/pasos/${idSecuencia}`);
    const pasos = await response.json();

    if (!pasos || pasos.length === 0) {
      alert('Esta secuencia no tiene pasos registrados');
      return;
    }

    const pasosNormalizados = pasos.map(normalizarPaso).filter(Boolean);

    if (pasosNormalizados.length === 0) {
      alert('La secuencia no tiene pasos válidos');
      return;
    }

    secuenciaActual = pasosNormalizados;
    await ejecutarSecuencia(secuenciaActual, `Secuencia #${idSecuencia}`);
  } catch (error) {
    console.error('Error al repetir secuencia:', error);
    alert('Error al ejecutar la secuencia');
  }
});

async function ejecutarSecuencia(pasos, nombreSec) {
  ejecutandoSecuencia = true;
  modoManual = false;
  secuenciaActual = pasos;
  pasoActualIndex = 0;
  secuenciaPausada = false;

  statusSecuencia.textContent = `Ejecutando ${nombreSec}...`;

  while (pasoActualIndex < secuenciaActual.length) {
    if (secuenciaPausada) {
      await sleep(100);
      continue;
    }

    const paso = secuenciaActual[pasoActualIndex];
    statusSecuencia.textContent = `${nombreSec} - Paso ${pasoActualIndex + 1} de ${secuenciaActual.length}`;
    statusMovimiento.textContent = operaciones[paso.operacion] || 'Desconocido';

    await enviarMovimiento(paso.operacion);
    await sleep(paso.ms);

    pasoActualIndex++;
  }

  statusSecuencia.textContent = 'Secuencia finalizada';
  statusMovimiento.textContent = 'En espera...';
  ejecutandoSecuencia = false;
  modoManual = true;
}

document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  cargarSecuencias();
});
