// ============================================
// CONFIGURACIÓN
// ============================================
const API_URL = 'http://52.54.157.92:5500/api';  // ✅ CAMBIO: 5000 → 5500
const DISPOSITIVO_ID = 1;
const REFRESH_INTERVAL = 1000; // 1 segundo

// ============================================
// FUNCIONES DE ACTUALIZACIÓN
// ============================================

async function actualizarMovimientos() {
  try {
    const response = await fetch(`${API_URL}/movimiento/ultimos10/${DISPOSITIVO_ID}`);
    const data = await response.json();
    
    const tbody = document.getElementById('tabla-movimientos');
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay movimientos registrados</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(mov => `
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
    
    const tbody = document.getElementById('tabla-obstaculos');
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay obstáculos registrados</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(obs => `
      <tr>
        <td>${obs.id_evento_obstaculo}</td>
        <td>${obs.id_obstaculo}</td>
        <td><span class="badge bg-warning text-dark">${obs.descripcion}</span></td>
        <td><span class="badge ${obs.modo === 'AUTO' ? 'bg-info' : 'bg-secondary'}">${obs.modo}</span></td>
        <td>${obs.id_secuencia_evasion}</td>
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
    
    const tbody = document.getElementById('tabla-secuencias');
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay secuencias registradas</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(sec => `
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
    
    if (data.length > 0) {
      const mov = data[0];
      document.getElementById('um-id').textContent = mov.id_evento;
      document.getElementById('um-op-id').textContent = mov.id_operacion;
      document.getElementById('um-op-nombre').textContent = mov.operacion;
      document.getElementById('um-fecha').textContent = new Date(mov.creado_en).toLocaleString('es-MX');
    }
    
  } catch (error) {
    console.error('Error al actualizar último movimiento:', error);
  }
}

async function actualizarUltimoObstaculo() {
  try {
    const response = await fetch(`${API_URL}/obstaculo/ultimo/${DISPOSITIVO_ID}`);
    const data = await response.json();
    
    if (data.length > 0) {
      const obs = data[0];
      document.getElementById('uo-id').textContent = obs.id_evento_obstaculo;
      document.getElementById('uo-obs-id').textContent = obs.id_obstaculo;
      document.getElementById('uo-desc').textContent = obs.descripcion;
      document.getElementById('uo-modo').textContent = obs.modo;
      document.getElementById('uo-sec').textContent = obs.id_secuencia_evasion;
      document.getElementById('uo-fecha').textContent = new Date(obs.creado_en).toLocaleString('es-MX');
    }
    
  } catch (error) {
    console.error('Error al actualizar último obstáculo:', error);
  }
}

// ============================================
// ACTUALIZACIÓN PERIÓDICA
// ============================================

async function actualizarTodo() {
  await Promise.all([
    actualizarMovimientos(),
    actualizarObstaculos(),
    actualizarSecuencias(),
    actualizarUltimoMovimiento(),
    actualizarUltimoObstaculo()
  ]);
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Primera carga
  actualizarTodo();
  
  // Actualización periódica cada 1 segundo
  setInterval(actualizarTodo, REFRESH_INTERVAL);
});