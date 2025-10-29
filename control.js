// ============================================
// CONFIGURACIÓN
// ============================================
const API_URL = 'https://52.54.157.92/api';
const DISPOSITIVO_ID = 1;

// Conexión WebSocket para recibir eventos push
const socket = io('https://52.54.157.92');

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

// ✅ TIEMPOS FIJOS POR OPERACIÓN (en milisegundos)
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

// ============================================
// FUNCIONES DE MOVIMIENTO
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
// FUNCIÓN: Detectar loop infinito
// ============================================
function detectarLoop(idObstaculo) {
  const ahora = Date.now();
  
  historialObstaculos.push({
    obstaculo: idObstaculo,
    timestamp: ahora
  });
  
  historialObstaculos = historialObstaculos.filter(
    h => (ahora - h.timestamp) < 10000
  );
  
  const obstaculosRecientes = historialObstaculos.filter(
    h => h.obstaculo === idObstaculo && (ahora - h.timestamp) < 5000
  );
  
  return obstaculosRecientes.length >= LOOP_THRESHOLD;
}

// ============================================
// FUNCIÓN: Ejecutar evasión recursiva
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
    
    alert('🚨 Sistema detenido:\nEl carrito está atrapado (mismo obstáculo detectado múltiples veces).\n\nRevisa el entorno físico.');
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
// EVENT LISTENERS - BOTONES DE CONTROL
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
// GRABACIÓN DE SECUENCIAS
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

// ============================================
// REPETIR SECUENCIA
// ============================================
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
    
    console.log('Pasos obtenidos de BD:', pasos);
    
    await ejecutarSecuencia(pasos, `Secuencia #${idSecuencia}`);
    
  } catch (error) {
    console.error('Error al repetir secuencia:', error);
    alert('Error al ejecutar la secuencia');
  }
});

// ============================================
// FUNCIÓN: Ejecutar secuencia con soporte para pausas
// ============================================
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

// ============================================
// SIMULACIÓN DE OBSTÁCULOS
// ============================================
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
// WEBSOCKET - EVENTOS PUSH
// ============================================

socket.on('connect', () => {
  console.log('✅ Conectado al servidor WebSocket');
});

socket.on('movimiento_manual', (data) => {
  console.log('Movimiento manual recibido:', data);
});

socket.on('movimiento_secuencia', (data) => {
  console.log('Secuencia ejecutándose:', data);
  secuenciaEnEjecucion = data.secuencia;
});

socket.on('obstaculo_detectado', (data) => {
  console.log('Obstáculo detectado:', data);
});

socket.on('carrito_online', (data) => {
  console.log('🚗 Carrito conectado:', data);
  statusMovimiento.textContent = `✅ Carrito ${data.dispositivo} conectado desde ${data.ip}`;
});

socket.on('carrito_movimiento_ok', (data) => {
  console.log('✅ Carrito terminó movimiento:', data);
  
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
});

socket.on('obstaculo_real', (data) => {
  console.log('⚠️ Obstáculo REAL detectado:', data);
  
  statusObstaculo.textContent = `⚠️ Obstáculo: ${obstaculos[data.obstaculo]} (${data.distancia}cm)`;
  statusEvasion.textContent = `🔄 Evasión: ${data.evasion}`;
  
  if (ejecutandoSecuencia) {
    secuenciaPausada = true;
    statusSecuencia.textContent = '⏸️ Secuencia PAUSADA (obstáculo real)';
  }
});

socket.on('carrito_listo_reanudar', (data) => {
  console.log('✅ Carrito listo para reanudar');
  
  statusEvasion.textContent = '✅ Evasión completada';
  statusObstaculo.textContent = 'Ninguno';
  
  if (ejecutandoSecuencia) {
    secuenciaPausada = false;
    statusSecuencia.textContent = '▶️ Reanudando secuencia...';
  }
});

socket.on('carrito_error', (data) => {
  console.error('❌ Error del carrito:', data);
  
  alert(`⚠️ Error del carrito:\nTipo: ${data.tipo}\nMensaje: ${data.mensaje}`);
  
  if (ejecutandoSecuencia) {
    ejecutandoSecuencia = false;
    secuenciaPausada = false;
    statusSecuencia.textContent = '❌ Secuencia detenida (error del carrito)';
    statusMovimiento.textContent = 'Error detectado';
  }
});

// ============================================
// UTILIDADES
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  cargarSecuencias();
  console.log('🎮 Aplicación de control iniciada');
  console.log('🔌 WebSocket: Eventos ESP8266 listos');
  console.log(`⚙️ Configuración: Máx ${MAX_NIVEL_EVASION} evasiones, Loop detectado a ${LOOP_THRESHOLD} repeticiones`);
});