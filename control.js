// ============================================
// CONFIGURACIÓN
// ============================================
const API_URL = (window.CONFIG && window.CONFIG.API) || 'https://52.54.157.92/api';
const WS_URL  = (window.CONFIG && window.CONFIG.WS)  || 'ws://54.205.178.208:5001/ws';
const DISPOSITIVO_ID = 1;

// ============================================
// ESTADO DE LA APLICACIÓN
// ============================================
let isRecording = false;
let recordedSequence = [];
let lastOperationTime = 0;
let modoManual = true;
let secuenciaEnEjecucion = null;
let evasionEnEjecucion = null;
let ejecutandoSecuencia = false;

// Control de secuencias con pausas
let idSecuenciaGrabada = null;
let secuenciaActual = [];
let pasoActualIndex = 0;
let secuenciaPausada = false;

// Control de evasiones recursivas
let ejecutandoEvasion = false;
let nivelEvasion = 0;
let stackEvasiones = [];
let historialObstaculos = [];
const MAX_NIVEL_EVASION = 10;
const LOOP_THRESHOLD = 3;

// ============================================
// ELEMENTOS DEL DOM
// ============================================
const statusMovimiento = document.getElementById('status-movimiento');
const statusObstaculo = document.getElementById('status-obstaculo');
const statusSecuencia = document.getElementById('status-secuencia');
const statusEvasion = document.getElementById('status-evasion');
const btnGrabar = document.getElementById('btn-grabar');
const btnGuardar = document.getElementById('btn-guardar');
const btnEjecutarGrabada = document.getElementById('btn-ejecutar-grabada');
const btnRepetir = document.getElementById('btn-repetir');
const btnSimularObstaculo = document.getElementById('btn-simular-obstaculo');
const selectSecuencia = document.getElementById('select-secuencia');
const selectObstaculo = document.getElementById('select-obstaculo');
const nombreSecuencia = document.getElementById('nombre-secuencia');
const recordingInfo = document.getElementById('recording-info');
const pasoCount = document.getElementById('paso-count');
const overlayGrabacion = document.getElementById('overlay-grabacion');
const overlayCount = document.getElementById('overlay-count');
const overlayMovimientos = document.getElementById('overlay-movimientos');

// ============================================
// MAPEO DE OPERACIONES
// ============================================
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

// ✅ TIEMPOS FIJOS POR OPERACIÓN (en ms)
const tiemposOperacion = {
  1: 1500, 2: 1500, 3: 500, 4: 1200, 5: 1200, 6: 1200,
  7: 1200, 8: 800, 9: 800, 10: 1100, 11: 1100
};

// ============================================
// CLIENTE WEBSOCKET NATIVO (con autoreconexión)
// ============================================
let ws = null;
let wsConnected = false;
let reconnectAttempts = 0;
const MAX_RETRY_DELAY = 15000;

function backoffDelay(n) {
  // 500ms, 1s, 2s, 4s... máx 15s con jitter
  const base = Math.min(500 * Math.pow(2, n), MAX_RETRY_DELAY);
  return base + Math.floor(Math.random() * 300);
}

function openWebSocket() {
  try {
    console.log(`🔌 Conectando WS → ${WS_URL}`);
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      wsConnected = true;
      reconnectAttempts = 0;
      console.log('✅ WS conectado');
      // Identificación opcional
      safeSend({ type: 'hello', who: 'control-ui', dispositivo: DISPOSITIVO_ID });
    };

    ws.onmessage = (evt) => {
      // El backend envía strings; si es JSON, lo parseamos
      let payload = null;
      try {
        payload = JSON.parse(evt.data);
      } catch {
        // Si no es JSON, lo ignoramos o lo logueamos
        console.log('📨 WS texto:', evt.data);
        return;
      }

      // Esperamos objetos con { type, ... }
      if (!payload || !payload.type) return;

      switch (payload.type) {
        case 'carrito_online': {
          console.log('🚗 Carrito conectado:', payload);
          statusMovimiento.textContent = `✅ Carrito ${payload.dispositivo} conectado${payload.ip ? ' desde ' + payload.ip : ''}`;
          break;
        }
        case 'movimiento_manual': {
          console.log('Movimiento manual recibido:', payload);
          // Nada más que log por ahora
          break;
        }
        case 'movimiento_secuencia': {
          console.log('Secuencia ejecutándose:', payload);
          secuenciaEnEjecucion = payload.secuencia;
          statusSecuencia.textContent = `Secuencia ${payload.secuencia} ejecutándose...`;
          break;
        }
        case 'carrito_movimiento_ok': {
          console.log('✅ Carrito terminó movimiento:', payload);
          if (ejecutandoSecuencia && !secuenciaPausada) {
            pasoActualIndex++;
            if (pasoActualIndex < secuenciaActual.length) {
              const siguientePaso = secuenciaActual[pasoActualIndex];
              enviarMovimiento(siguientePaso.operacion);
            } else {
              ejecutandoSecuencia = false;
              statusSecuencia.textContent = 'Secuencia finalizada';
            }
          }
          break;
        }
        case 'obstaculo_real': {
          console.log('⚠️ Obstáculo REAL detectado:', payload);
          statusObstaculo.textContent = `⚠️ Obstáculo: ${obstaculos[payload.obstaculo] || payload.obstaculo} ${payload.distancia ? `(${payload.distancia}cm)` : ''}`;
          statusEvasion.textContent = `🔄 Evasión: ${payload.evasion || '-'}`;
          if (ejecutandoSecuencia) {
            secuenciaPausada = true;
            statusSecuencia.textContent = '⏸️ Secuencia PAUSADA (obstáculo real)';
          }
          break;
        }
        case 'carrito_listo_reanudar': {
          console.log('✅ Carrito listo para reanudar');
          statusEvasion.textContent = '✅ Evasión completada';
          statusObstaculo.textContent = 'Ninguno';
          if (ejecutandoSecuencia) {
            secuenciaPausada = false;
            statusSecuencia.textContent = '▶️ Reanudando secuencia...';
          }
          break;
        }
        case 'carrito_error': {
          console.error('❌ Error del carrito:', payload);
          alert(`⚠️ Error del carrito:\nTipo: ${payload.tipo}\nMensaje: ${payload.mensaje}`);
          if (ejecutandoSecuencia) {
            ejecutandoSecuencia = false;
            secuenciaPausada = false;
            statusSecuencia.textContent = '❌ Secuencia detenida (error del carrito)';
            statusMovimiento.textContent = 'Error detectado';
          }
          break;
        }
        default:
          console.log('📨 Evento WS no manejado:', payload);
      }
    };

    ws.onclose = () => {
      wsConnected = false;
      const delay = backoffDelay(reconnectAttempts++);
      console.warn(`⚠️ WS cerrado. Reintentando en ${delay} ms`);
      setTimeout(openWebSocket, delay);
    };

    ws.onerror = (e) => {
      console.error('WS error:', e);
    };
  } catch (e) {
    console.error('No se pudo abrir el WS:', e);
    const delay = backoffDelay(reconnectAttempts++);
    setTimeout(openWebSocket, delay);
  }
}

function safeSend(obj) {
  try {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  } catch (e) {
    console.error('Error enviando por WS:', e);
  }
}

// ============================================
// FUNCIONES DE MOVIMIENTO (REST)
// ============================================
async function enviarMovimiento(idOperacion) {
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
      statusMovimiento.textContent = `Movimiento: ${operaciones[idOperacion]}`;
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

// ============================================
// DETECCIÓN DE LOOP
// ============================================
function detectarLoop(idObstaculo) {
  const ahora = Date.now();
  historialObstaculos.push({ obstaculo: idObstaculo, timestamp: ahora });
  historialObstaculos = historialObstaculos.filter(h => (ahora - h.timestamp) < 10000);
  const obstaculosRecientes = historialObstaculos.filter(h => h.obstaculo === idObstaculo && (ahora - h.timestamp) < 5000);
  return obstaculosRecientes.length >= LOOP_THRESHOLD;
}

// ============================================
// EVASIÓN RECURSIVA
// ============================================
async function ejecutarEvasion(idObstaculo, enModoAuto) {
  if (detectarLoop(idObstaculo)) {
    console.error('🚨 LOOP INFINITO DETECTADO');
    statusEvasion.textContent = '🚨 Atrapado - Retroceso emergencia';
    statusObstaculo.textContent = '⚠️ Loop infinito detectado';
    await enviarMovimiento(2);
    await sleep(2000);
    await enviarMovimiento(3);
    ejecutandoEvasion = false;
    ejecutandoSecuencia = false;
    secuenciaPausada = false;
    nivelEvasion = 0;
    stackEvasiones = [];
    historialObstaculos = [];
    statusMovimiento.textContent = '🛑 DETENIDO - Carrito atrapado';
    statusSecuencia.textContent = 'Secuencia abortada';
    alert('🚨 Sistema detenido:\nEl carrito está atrapado (mismo obstáculo detectado múltiples veces).');
    return;
  }

  if (nivelEvasion >= MAX_NIVEL_EVASION) {
    console.error('🚨 LÍMITE MÁXIMO DE EVASIONES ALCANZADO');
    statusEvasion.textContent = `🚨 Límite alcanzado (${MAX_NIVEL_EVASION} evasiones)`;
    await enviarMovimiento(2);
    await sleep(2000);
    await enviarMovimiento(3);
    ejecutandoEvasion = false;
    ejecutandoSecuencia = false;
    secuenciaPausada = false;
    nivelEvasion = 0;
    stackEvasiones = [];
    statusMovimiento.textContent = '🛑 DETENIDO - Límite de seguridad';
    alert(`🚨 Límite de seguridad alcanzado:\nSe ejecutaron ${MAX_NIVEL_EVASION} evasiones consecutivas.`);
    return;
  }

  try {
    nivelEvasion++;
    ejecutandoEvasion = true;

    if (nivelEvasion > 1) {
      stackEvasiones.push({
        pasoActualIndex: pasoActualIndex,
        secuenciaActual: [...secuenciaActual]
      });
    }

    const response = await fetch(`${API_URL}/obstaculo/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_dispositivo: DISPOSITIVO_ID,
        id_obstaculo: idObstaculo,
        modo: enModoAuto ? 'AUTO' : 'MANUAL',
        id_ejecucion: secuenciaEnEjecucion
      })
    });

    const data = await response.json();

    if (data && data.length > 0) {
      const secuenciaEvasion = data[0];
      const pasosEvasion = data.slice(1);
      const prefijo = nivelEvasion > 1 ? `[Nivel ${nivelEvasion}] ` : '';
      statusObstaculo.textContent = `⚠️ ${prefijo}Obstáculo: ${obstaculos[idObstaculo]}`;

      for (let i = 0; i < pasosEvasion.length; i++) {
        const paso = pasosEvasion[i];
        statusEvasion.textContent = `🔄 ${prefijo}Evasión: ${secuenciaEvasion.nombre} - Paso ${paso.orden}/${pasosEvasion.length}`;
        statusMovimiento.textContent = `${paso.nombre}`;
        await enviarMovimiento(paso.id_operacion);
        await sleep(paso.duracion_ms);
      }

      statusEvasion.textContent = `✅ Evasión nivel ${nivelEvasion} completada`;
      await sleep(600);
      nivelEvasion--;

      if (nivelEvasion === 0) {
        ejecutandoEvasion = false;
        stackEvasiones = [];
        if (enModoAuto) {
          statusEvasion.textContent = '▶️ Reanudando secuencia original...';
          statusObstaculo.textContent = 'Ninguno';
          await sleep(500);
          statusEvasion.textContent = 'Ninguna';
          secuenciaPausada = false;
        } else {
          statusEvasion.textContent = 'Ninguna';
          statusObstaculo.textContent = 'Ninguno';
          statusMovimiento.textContent = 'En espera...';
        }
      } else {
        const contextoAnterior = stackEvasiones.pop();
        secuenciaActual = contextoAnterior.secuenciaActual;
        pasoActualIndex = contextoAnterior.pasoActualIndex;
        statusEvasion.textContent = `▶️ Continuando evasión nivel ${nivelEvasion}...`;
        await sleep(300);
        stackEvasiones.push(contextoAnterior);
      }
    }
  } catch (error) {
    console.error('Error en evasión:', error);
    nivelEvasion--;
    if (stackEvasiones.length > 0) stackEvasiones.pop();
    if (nivelEvasion === 0) {
      ejecutandoEvasion = false;
    }
  }
}

// ============================================
// BOTONES DE CONTROL
// ============================================
document.querySelectorAll('.control-btn').forEach(btn => {
  let isPressed = false;

  btn.addEventListener('mousedown', () => {
    if (ejecutandoSecuencia || isPressed) return;
    isPressed = true;
    const operacion = parseInt(btn.dataset.op);
    modoManual = true;
    enviarMovimiento(operacion);
    btn.style.opacity = '0.7';
    btn.style.transform = 'scale(0.95)';
  });

  btn.addEventListener('mouseup', () => {
    if (!isPressed) return;
    isPressed = false;
    statusMovimiento.textContent = 'Detenido (esperando comando)';
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  });

  btn.addEventListener('mouseleave', () => {
    if (!isPressed) return;
    isPressed = false;
    statusMovimiento.textContent = 'Detenido (esperando comando)';
    btn.style.opacity = '1';
    btn.style.transform = 'scale(1)';
  });
});

// ============================================
// GRABACIÓN / SECUENCIAS / SIMULACIÓN (igual)
// ============================================
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
  if (!nombre) return alert('Por favor, ingresa un nombre para la secuencia');
  if (recordedSequence.length === 0) return alert('No hay movimientos grabados');

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
      idSecuenciaGrabada = data[0].id_secuencia;
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
  if (!idSecuenciaGrabada || secuenciaActual.length === 0) {
    alert('Primero debes guardar una secuencia');
    return;
  }
  await ejecutarSecuencia(secuenciaActual, `Secuencia #${idSecuenciaGrabada}`);
});

async function cargarSecuencias() {
  try {
    const response = await fetch(`${API_URL}/secuencia/demo/ultimas20/${DISPOSITIVO_ID}`);
    const data = await response.json();
    selectSecuencia.innerHTML = '<option value="">Seleccionar secuencia...</option>';
    data.forEach(sec => {
      const option = document.createElement('option');
      option.value = sec.id_secuencia;
      option.textContent = `${sec.nombre} (${new Date(sec.creado_en).toLocaleString()})`;
      selectSecuencia.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar secuencias:', error);
  }
}

btnRepetir.addEventListener('click', async () => {
  const idSecuencia = parseInt(selectSecuencia.value);
  if (!idSecuencia) return alert('Selecciona una secuencia para repetir');

  try {
    const response = await fetch(`${API_URL}/secuencia/pasos/${idSecuencia}`);
    const pasos = await response.json();
    if (!pasos || pasos.length === 0) return alert('Esta secuencia no tiene pasos registrados');
    await ejecutarSecuencia(pasos, `Secuencia #${idSecuencia}`);
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
    if (secuenciaPausada) { await sleep(100); continue; }
    const paso = secuenciaActual[pasoActualIndex];
    statusSecuencia.textContent = `${nombreSec} - Paso ${pasoActualIndex + 1} de ${secuenciaActual.length}`;
    statusMovimiento.textContent = operaciones[paso.operacion];
    await enviarMovimiento(paso.operacion);
    await sleep(paso.ms);
    pasoActualIndex++;
  }

  statusSecuencia.textContent = 'Secuencia finalizada';
  statusMovimiento.textContent = 'En espera...';
  ejecutandoSecuencia = false;
  modoManual = true;
}

btnSimularObstaculo.addEventListener('click', async () => {
  const idObstaculo = parseInt(selectObstaculo.value);
  const enModoAuto = ejecutandoSecuencia;
  if (enModoAuto && nivelEvasion === 0) {
    secuenciaPausada = true;
    statusSecuencia.textContent = '⏸️ Secuencia PAUSADA (obstáculo detectado)';
  }
  await ejecutarEvasion(idObstaculo, enModoAuto);
});

// ============================================
// UTILIDADES
// ============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  cargarSecuencias();
  openWebSocket();
  console.log('🎮 Aplicación de control iniciada');
  console.log(`🔌 WS hacia ${WS_URL}`);
  console.log(`⚙️ Config: Máx ${MAX_NIVEL_EVASION} evasiones, Loop a ${LOOP_THRESHOLD} repeticiones`);
});
