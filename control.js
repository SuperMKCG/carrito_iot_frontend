/* ============================================
   control.js — Control Carrito (POST + WSS)
   - Guardar: /secuencia/demo/agregar con pasos en BD
   - Ejecutar grabada: /secuencia/ejecutar (crea secuencia temporal o usa la guardada)
   - Repetir: /secuencia/demo/repetir (obtiene pasos desde BD)
   ============================================ */

// ----------------- Config -----------------
const API_URL = 'https://silencesuzuka.duckdns.org/api';
const WS_URL  = 'wss://silencesuzuka.duckdns.org/ws';
const DISPOSITIVO_ID = 1;

// Velocidades
const SPEED = { lento: 150, medio: 190, alto: 220 };
let selectedSpeed = SPEED.lento;

// Operaciones que solo se ejecutan una vez (no continuas)
// Solo Adelante (1) y Atrás (2) son continuos
const MOVIMIENTOS_UNICOS = [3, 4, 5, 6, 7, 8, 9, 10, 11]; // 3: Detener, 4-7: Vueltas, 8-11: Giros

// Duraciones estimadas para movimientos únicos (en ms)
const DURACIONES_MOVIMIENTOS = {
    3: 500,   // Detener
    4: 1200,  // Vuelta adelante derecha
    5: 1200,  // Vuelta adelante izquierda
    6: 1200,  // Vuelta atrás derecha
    7: 1200,  // Vuelta atrás izquierda
    8: 800,   // Giro 90° derecha
    9: 800,   // Giro 90° izquierda
    10: 1100, // Giro 360° derecha
    11: 1100  // Giro 360° izquierda
};

// ----------------- Estado UI -----------------
const statusMovimiento = document.getElementById('status-movimiento');
const statusObstaculo  = document.getElementById('status-obstaculo');
const statusSecuencia  = document.getElementById('status-secuencia');
const statusEvasion    = document.getElementById('status-evasion');
const btnGrabar           = document.getElementById('btn-grabar');
const btnGuardar          = document.getElementById('btn-guardar');
const btnEjecutarGrabada  = document.getElementById('btn-ejecutar-grabada');
const btnRepetir          = document.getElementById('btn-repetir');
const selectSecuencia     = document.getElementById('select-secuencia');
const nombreSecuencia     = document.getElementById('nombre-secuencia');
const recordingInfo    = document.getElementById('recording-info');
const pasoCount        = document.getElementById('paso-count');
const overlayGrabacion = document.getElementById('overlay-grabacion');
const overlayCount     = document.getElementById('overlay-count');
const overlayMovs      = document.getElementById('overlay-movimientos');

// Botones velocidad (chips)
const speed150 = document.getElementById('btn-speed-150');
const speed190 = document.getElementById('btn-speed-190');
const speed220 = document.getElementById('btn-speed-220');

// ----------------- Estado lógico -----------------
let websocket       = null;
let reconnectTimer  = null;
let isRecording         = false;  // Bandera: true cuando se está grabando una secuencia
let recordedSequence    = [];     // [{operacion, velocidad}]
let ejecutandoSecuencia = false;
let idSecuenciaGrabada  = null;   // ID de la secuencia recién guardada

const operaciones = {
    1:'Adelante',2:'Atrás',3:'Detener',
    4:'Vuelta adelante derecha',5:'Vuelta adelante izquierda',
    6:'Vuelta atrás derecha',7:'Vuelta atrás izquierda',
    8:'Giro 90° derecha',9:'Giro 90° izquierda',
    10:'Giro 360° derecha',11:'Giro 360° izquierda'
};

const obstaculos = {
    1: 'Adelante',
    2: 'Adelante-Izquierda',
    3: 'Adelante-Derecha',
    4: 'Adelante-Izquierda-Derecha',
    5: 'Retrocede'
};

// ----------------- Utilidades -----------------
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function setSpeedActive(btn){
    [speed150, speed190, speed220].forEach(b => b && b.classList.remove('active'));
    if(btn) btn.classList.add('active');
}

function setEstadoMovimiento(txt){ if(statusMovimiento) statusMovimiento.textContent = txt; }
function setEstadoSecuencia(txt){ if(statusSecuencia) statusSecuencia.textContent = txt; }
function setEstadoObstaculo(txt){ if(statusObstaculo) statusObstaculo.textContent = txt; }
function setEstadoEvasion(txt){ if(statusEvasion) statusEvasion.textContent = txt; }

// Verificar si es un movimiento único (no continuo)
function esMovimientoUnico(operacion){
    return MOVIMIENTOS_UNICOS.includes(operacion);
}

// Verificar si es movimiento continuo (solo Adelante y Atrás)
function esMovimientoContinuo(operacion){
    return operacion === 1 || operacion === 2; // Adelante o Atrás
}

// ----------------- WebSocket -----------------
function connectWebSocket(){
    if(websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) return;
    
    websocket = new WebSocket(WS_URL);
    
    websocket.addEventListener('open', () => {
        clearTimeout(reconnectTimer);
        websocket.send(JSON.stringify({ type:'identify', dispositivo: DISPOSITIVO_ID }));
        setEstadoMovimiento('Conectado al servidor WebSocket');
    });
    
    websocket.addEventListener('close', () => {
        setEstadoMovimiento('Reconectando WebSocket...');
        reconnectTimer = setTimeout(connectWebSocket, 2000);
    });
    
    // Variable para rastrear si hay evasión activa
    let evasionActiva = false;
    let timeoutObstaculo = null;
    
    websocket.addEventListener('message', evt => {
        try{
            const msg = JSON.parse(evt.data || '{}');
            if(msg.type !== 'event') return;
            
            const ev = msg.event;
            const d  = msg.data || {};
            
            if(ev === 'secuencia_iniciada'){
                setEstadoSecuencia(`Secuencia iniciada (ejec #${d.id_ejecucion ?? '-'})`);
                // Limpiar obstáculo al iniciar secuencia
                limpiarMensajeObstaculo();
            } else if(ev === 'comando_carrito'){
                const opId = d.operacion ?? d.operacion_id;
                const opNombre = d.operacion_nombre || operaciones[opId] || `Operación ${opId}`;
                setEstadoMovimiento(`Paso: ${opNombre} | Vel: ${d.velocidad ?? '-'}`);
                
                // Limpiar mensaje de obstáculo cuando el carrito recibe un nuevo comando
                // (significa que ya continuó después de la evasión)
                if(evasionActiva){
                    limpiarMensajeObstaculo();
                    evasionActiva = false;
                }
            } else if(ev === 'secuencia_finalizada'){
                setEstadoSecuencia(`Secuencia finalizada (ejec #${d.id_ejecucion ?? '-'})`);
                ejecutandoSecuencia = false;
                // Limpiar obstáculo al finalizar secuencia
                limpiarMensajeObstaculo();
            } else if(ev === 'obstaculo_detectado'){
                const obsId = d.obstaculo ?? d.id_obstaculo ?? d.obstaculo_id;
                const obsNombre = d.obstaculo_nombre || obstaculos[obsId] || `Obstáculo ${obsId}`;
                setEstadoObstaculo(`⚠️ Obstáculo: ${obsNombre}`);
                evasionActiva = true;
                
                // Limpiar timeout anterior si existe
                if(timeoutObstaculo){
                    clearTimeout(timeoutObstaculo);
                }
                
                // Limpiar automáticamente después de 1 segundo si no hay más actividad
                timeoutObstaculo = setTimeout(() => {
                    if(evasionActiva){
                        limpiarMensajeObstaculo();
                        evasionActiva = false;
                    }
                }, 1000);
            } else if(ev === 'movimiento_completado'){
                // Limpiar obstáculo cuando se completa un movimiento
                // (el carrito terminó la evasión y continuó)
                if(evasionActiva){
                    limpiarMensajeObstaculo();
                    evasionActiva = false;
                }
            }
        }catch(_){}
    });
}

// ----------------- Función para limpiar mensaje de obstáculo -----------------
function limpiarMensajeObstaculo(){
    setEstadoObstaculo('Ninguno');
}

// ----------------- API Calls (POST) -----------------
async function postJSON(url, body){
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if(!res.ok) throw data;
    return data;
}

async function enviarMovimiento(idOperacion, esManual = true){
    if(idOperacion == null) return;
    
    // Si es movimiento manual (no grabando), enviar normalmente
    if(esManual && !isRecording){
        try{
            const payload = {
                id_dispositivo: DISPOSITIVO_ID,
                id_operacion: idOperacion,
                velocidad: selectedSpeed
            };
            
            // Para movimientos únicos, incluir duración estimada
            if(esMovimientoUnico(idOperacion)){
                payload.duracion_ms = DURACIONES_MOVIMIENTOS[idOperacion] || 1000;
            }
            
            await postJSON(`${API_URL}/movimiento/registrar`, payload);
            setEstadoMovimiento(`Movimiento: ${operaciones[idOperacion] || idOperacion} (Vel ${selectedSpeed})`);
        }catch(_){
            alert('Error al comunicarse con el servidor');
        }
        return;
    }
    
    // Si está grabando, agregar a la secuencia (excepto "Detener" que viene del mouseup)
    if(isRecording){
        // NO agregar "Detener" (operación 3) cuando viene del mouseup durante grabación
        if(idOperacion === 3 && !esManual){
            return; // Ignorar detener automático durante grabación
        }
        
        recordedSequence.push({ operacion: idOperacion, velocidad: selectedSpeed });
        if(pasoCount) pasoCount.textContent = recordedSequence.length;
        if(overlayCount) overlayCount.textContent = `${recordedSequence.length} pasos`;
        if(overlayMovs){
            if(recordedSequence.length === 1) overlayMovs.innerHTML = '';
            const item = document.createElement('div');
            item.className = 'movimiento-item';
            item.innerHTML = `
                <span class="paso-numero">${recordedSequence.length}</span>
                <span class="operacion-nombre">${operaciones[idOperacion] || idOperacion}</span>
                <span class="tiempo-ms">${selectedSpeed}</span>
            `;
            overlayMovs.appendChild(item);
            overlayMovs.scrollTop = overlayMovs.scrollHeight;
        }
    }
}

// ----------------- Controles Manuales (Mouse + Touch) -----------------
document.querySelectorAll('.control-btn').forEach(btn => {
    let pressed = false;
    let movimientoUnicoEjecutado = false;
    let lastTouchTime = 0;
    
    // Función para iniciar movimiento (compartida entre mouse y touch)
    const iniciarMovimiento = (e) => {
        // Prevenir comportamiento por defecto (scroll, zoom, etc.)
        if(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if(ejecutandoSecuencia || pressed) return;
        
        const operacion = parseInt(btn.dataset.op, 10);
        const esUnico = esMovimientoUnico(operacion);
        const esContinuo = esMovimientoContinuo(operacion);
        
        // Para movimientos únicos en modo manual: solo ejecutar una vez
        if(esUnico && !isRecording && !movimientoUnicoEjecutado){
            pressed = true;
            movimientoUnicoEjecutado = true;
            enviarMovimiento(operacion, true);
            btn.style.opacity = '0.85';
            btn.style.transform = 'scale(0.97)';
            
            setTimeout(() => {
                movimientoUnicoEjecutado = false;
                pressed = false;
                btn.style.opacity = '1';
                btn.style.transform = 'scale(1)';
            }, DURACIONES_MOVIMIENTOS[operacion] || 1000);
            return;
        }
        
        // Para movimientos continuos (Adelante/Atrás) o durante grabación
        if(esContinuo || isRecording){
            pressed = true;
            enviarMovimiento(operacion, true);
            btn.style.opacity = '0.85';
            btn.style.transform = 'scale(0.97)';
        }
    };
    
    // Función para finalizar movimiento (compartida entre mouse y touch)
    const finalizarMovimiento = (e) => {
        // Prevenir comportamiento por defecto
        if(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if(!pressed) return;
        
        const operacion = parseInt(btn.dataset.op, 10);
        const esUnico = esMovimientoUnico(operacion);
        const esContinuo = esMovimientoContinuo(operacion);
        
        // Para movimientos únicos: no hacer nada en mouseup/touchend
        if(esUnico && !isRecording){
            pressed = false;
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1)';
            return;
        }
        
        // Para movimientos continuos (Adelante/Atrás): enviar "detener" solo si NO está grabando
        if(esContinuo && !isRecording){
            pressed = false;
            enviarMovimiento(3, true); // Detener manual
            setEstadoMovimiento('Detenido');
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1)';
        } else {
            // Durante grabación, solo resetear estado visual
            pressed = false;
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1)';
        }
    };
    
    // Eventos de MOUSE (desktop)
    btn.addEventListener('mousedown', (e) => {
        // Si hubo un touch reciente (< 300ms), ignorar el mousedown
        if(Date.now() - lastTouchTime < 300) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        iniciarMovimiento(e);
    });
    
    btn.addEventListener('mouseup', finalizarMovimiento);
    btn.addEventListener('mouseleave', finalizarMovimiento);
    
    // Eventos de TOUCH (móvil/tablet)
    btn.addEventListener('touchstart', (e) => {
        lastTouchTime = Date.now();
        iniciarMovimiento(e);
    }, { passive: false });
    
    btn.addEventListener('touchend', finalizarMovimiento, { passive: false });
    btn.addEventListener('touchcancel', finalizarMovimiento, { passive: false });
});

// ----------------- Velocidad (chips) -----------------
if(speed150){ speed150.addEventListener('click', () => { selectedSpeed = SPEED.lento; setSpeedActive(speed150); }); }
if(speed190){ speed190.addEventListener('click', () => { selectedSpeed = SPEED.medio; setSpeedActive(speed190); }); }
if(speed220){ speed220.addEventListener('click', () => { selectedSpeed = SPEED.alto;  setSpeedActive(speed220); }); }

// ----------------- Grabación -----------------
btnGrabar?.addEventListener('click', () => {
    if(!isRecording){
        isRecording = true;
        recordedSequence = [];
        idSecuenciaGrabada = null;
        btnGrabar.textContent = '⏹️ Detener Grabación';
        btnGrabar.classList.remove('btn-danger');
        btnGrabar.classList.add('btn-secondary');
        btnGuardar.disabled = true;
        btnEjecutarGrabada.disabled = true;
        if(recordingInfo) recordingInfo.style.display = 'block';
        if(pasoCount) pasoCount.textContent = '0';
        if(overlayGrabacion) overlayGrabacion.style.display = 'block';
        if(overlayCount) overlayCount.textContent = '0 pasos';
        if(overlayMovs) overlayMovs.innerHTML = '<p class="text-muted small mb-0">Presiona botones para grabar...</p>';
        setEstadoMovimiento('🔴 Grabando...');
    }else{
        isRecording = false;
        btnGrabar.textContent = '🔴 Grabar';
        btnGrabar.classList.remove('btn-secondary');
        btnGrabar.classList.add('btn-danger');
        btnGuardar.disabled = recordedSequence.length === 0;
        btnEjecutarGrabada.disabled = true;
        if(recordingInfo) recordingInfo.style.display = 'none';
        setEstadoMovimiento(`Secuencia lista (${recordedSequence.length} pasos). Guárdala.`);
    }
});

// Guardar secuencia con pasos en BD
btnGuardar?.addEventListener('click', async () => {
    const nombre = (nombreSecuencia?.value || '').trim();
    if(!nombre){ alert('Escribe un nombre para la secuencia'); return; }
    if(recordedSequence.length === 0){ alert('No hay movimientos grabados'); return; }
    
    const velDefault = recordedSequence[0]?.velocidad ?? SPEED.lento;
    
    try{
        // Enviar secuencia con pasos al backend
        const data = await postJSON(`${API_URL}/secuencia/demo/agregar`, {
            id_dispositivo: DISPOSITIVO_ID,
            nombre: nombre,
            velocidad: velDefault,
            pasos: recordedSequence  // ← Enviar array de pasos
        });
        
        const idSec = data?.[0]?.id_secuencia ?? data?.[0]?.ID_SECUENCIA;
        if(!idSec){ alert('No se pudo recuperar el ID de la secuencia'); return; }
        
        idSecuenciaGrabada = idSec;
        alert(`✅ Secuencia "${nombre}" guardada (ID ${idSec})`);
        nombreSecuencia.value = '';
        btnGuardar.disabled = true;
        btnEjecutarGrabada.disabled = false;
        if(overlayGrabacion) overlayGrabacion.style.display = 'none';
        await cargarSecuencias();
    }catch(e){
        console.error('Error al guardar:', e);
        alert('Error al guardar la secuencia');
    }
});

// Ejecutar la secuencia recién grabada (usa el ID guardado)
btnEjecutarGrabada?.addEventListener('click', async () => {
    if(!idSecuenciaGrabada){
        alert('Primero guarda la secuencia grabada');
        return;
    }
    
    try{
        ejecutandoSecuencia = true;
        setEstadoSecuencia('Ejecutando secuencia grabada...');
        
        // Usar el endpoint de ejecutar que obtiene pasos desde BD
        await postJSON(`${API_URL}/secuencia/ejecutar`, {
            id_dispositivo: DISPOSITIVO_ID,
            id_secuencia: idSecuenciaGrabada
        });
    }catch(e){
        ejecutandoSecuencia = false;
        console.error('Error al ejecutar:', e);
        alert('Error al ejecutar la secuencia grabada');
    }
});

// ----------------- Repetir (obtiene pasos desde BD) -----------------
async function cargarSecuencias(){
    try{
        const res = await fetch(`${API_URL}/secuencia/demo/ultimas20/${DISPOSITIVO_ID}`);
        const data = await res.json();
        if(!selectSecuencia) return;
        
        selectSecuencia.innerHTML = '<option value="">Seleccionar secuencia...</option>';
        (data || []).forEach(s => {
            const id  = s.id_secuencia ?? s.ID_SECUENCIA ?? s.id;
            const nom = s.nombre ?? s.NOMBRE ?? 'Secuencia';
            const fec = s.creado_en ?? s.CREADO_EN ?? '';
            const op  = document.createElement('option');
            op.value = id;
            op.textContent = `${nom} (${fec ? new Date(fec).toLocaleString() : ''})`;
            selectSecuencia.appendChild(op);
        });
    }catch(_){}
}

btnRepetir?.addEventListener('click', async () => {
    const idSec = parseInt(selectSecuencia?.value || '0',10);
    if(!idSec){ alert('Selecciona una secuencia'); return; }
    
    try{
        ejecutandoSecuencia = true;
        setEstadoSecuencia(`Repitiendo secuencia #${idSec}...`);
        
        // Usar el endpoint de repetir que obtiene pasos desde BD automáticamente
        await postJSON(`${API_URL}/secuencia/demo/repetir`, {
            id_dispositivo: DISPOSITIVO_ID,
            id_secuencia: idSec
        });
    }catch(e){
        ejecutandoSecuencia = false;
        console.error('Error al repetir:', e);
        alert('Error al repetir la secuencia');
    }
});

// ----------------- Init -----------------
document.addEventListener('DOMContentLoaded', () => {
    setSpeedActive(speed150);               // Lento por defecto
    selectedSpeed = SPEED.lento;
    connectWebSocket();
    cargarSecuencias();
});
