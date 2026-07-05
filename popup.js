// ── Estado ────────────────────────────────────────────────────
let stream       = null;
let capturedBlob = null;
let tipoActual   = 'antes';
let enviando     = false;
let serverIP     = '';
let nombreEmp    = '';

// ── DOM ───────────────────────────────────────────────────────
const screenConfig  = document.getElementById('screenConfig');
const screenCamera  = document.getElementById('screenCamera');
const screenPreview = document.getElementById('screenPreview');
const footerConfig  = document.getElementById('footerConfig');

const inputNombre   = document.getElementById('inputNombre');
const inputIP       = document.getElementById('inputIP');
const btnGuardar    = document.getElementById('btnGuardarConfig');
const btnEditar     = document.getElementById('btnEditarConfig');

const video         = document.getElementById('video');
const canvas        = document.getElementById('canvas');
const cameraOff     = document.getElementById('cameraOff');
const btnAntes      = document.getElementById('btnAntes');
const btnDespues    = document.getElementById('btnDespues');
const btnCapturar   = document.getElementById('btnCapturar');

const previewImg    = document.getElementById('previewImg');
const previewTipo   = document.getElementById('previewTipo');
const btnCancelar   = document.getElementById('btnCancelar');
const btnEnviar     = document.getElementById('btnEnviar');

const statusDot     = document.getElementById('statusDot');
const statusLabel   = document.getElementById('statusLabel');

// ── Persistencia ──────────────────────────────────────────────
function cargarConfig() {
  chrome.storage.local.get(['nombre', 'serverIP'], (data) => {
    if (data.nombre && data.serverIP) {
      nombreEmp = data.nombre;
      serverIP  = data.serverIP;
      mostrarCamara();
    } else {
      mostrarConfig();
    }
  });
}

function guardarConfig() {
  const nombre = inputNombre.value.trim();
  const ip     = inputIP.value.trim().replace(/\/+$/, '');

  if (!nombre) { showToast('err', '⚠ Escribe tu nombre'); return; }
  if (!ip)     { showToast('err', '⚠ Escribe la IP del servidor'); return; }

  nombreEmp = nombre;
  serverIP  = ip;

  chrome.storage.local.set({ nombre, serverIP: ip }, () => {
    mostrarCamara();
  });
}

// ── Pantallas ─────────────────────────────────────────────────
function mostrarConfig() {
  screenConfig.classList.remove('hidden');
  screenCamera.classList.add('hidden');
  screenPreview.classList.add('hidden');
  footerConfig.style.display = 'none';
  detenerCamara();
}

function mostrarCamara() {
  screenConfig.classList.add('hidden');
  screenCamera.classList.remove('hidden');
  screenPreview.classList.add('hidden');
  footerConfig.style.display = 'block';
  iniciarCamara();
  verificarServidor();
}

function mostrarPreview(blob) {
  screenCamera.classList.add('hidden');
  screenPreview.classList.remove('hidden');
  capturedBlob = blob;
  previewImg.src = URL.createObjectURL(blob);
  previewTipo.textContent = tipoActual === 'antes' ? '📷 Antes del corte' : '✂️ Después del corte';
  previewTipo.className = `preview-tipo ${tipoActual}`;
}

// ── Cámara ────────────────────────────────────────────────────
async function iniciarCamara() {
  detenerCamara();
  btnCapturar.disabled = true;
  cameraOff.style.display = 'flex';
  video.style.display = 'none';

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = stream;
    video.style.display = 'block';
    cameraOff.style.display = 'none';
    btnCapturar.disabled = false;
  } catch (err) {
    cameraOff.innerHTML = '<span>🚫</span><p>Sin acceso a la cámara.<br>Revisa los permisos de Chrome.</p>';
    cameraOff.style.display = 'flex';
  }
}

function detenerCamara() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

// ── Captura ───────────────────────────────────────────────────
btnCapturar.addEventListener('click', () => {
  if (!stream || enviando) return;

  const w = video.videoWidth  || 1280;
  const h = video.videoHeight || 960;

  canvas.width  = w;
  canvas.height = h;

  canvas.getContext('2d').drawImage(video, 0, 0, w, h);

  canvas.toBlob((blob) => {
    if (!blob) { showToast('err', '❌ No se pudo capturar'); return; }
    mostrarPreview(blob);
  }, 'image/jpeg', 0.92);
});

// ── Tipo ──────────────────────────────────────────────────────
btnAntes.addEventListener('click', () => setTipo('antes'));
btnDespues.addEventListener('click', () => setTipo('despues'));

function setTipo(t) {
  tipoActual = t;
  btnAntes.className   = `tipo-btn ${t === 'antes'   ? 'active-antes'   : ''}`;
  btnDespues.className = `tipo-btn ${t === 'despues' ? 'active-despues' : ''}`;
}

// ── Preview: cancelar ─────────────────────────────────────────
btnCancelar.addEventListener('click', () => {
  URL.revokeObjectURL(previewImg.src);
  capturedBlob = null;
  screenPreview.classList.add('hidden');
  screenCamera.classList.remove('hidden');
});

// ── Preview: enviar ───────────────────────────────────────────
btnEnviar.addEventListener('click', async () => {
  if (!capturedBlob || enviando) return;
  enviando = true;
  btnEnviar.disabled = true;
  btnEnviar.innerHTML = '<span class="spinner"></span>';

  const form = new FormData();
  form.append('foto', capturedBlob, 'foto.jpg');
  form.append('tipo', tipoActual);
  form.append('empleado', nombreEmp);

  const url = serverIP.startsWith('http') ? serverIP : `http://${serverIP}`;

  try {
    const res  = await fetch(`${url}:3000/foto`, { method: 'POST', body: form });
    const data = await res.json();

    if (data.ok) {
      URL.revokeObjectURL(previewImg.src);
      capturedBlob = null;
      screenPreview.classList.add('hidden');
      screenCamera.classList.remove('hidden');
      showToast('ok', '✅ Foto enviada a la cajera');
    } else {
      showToast('err', '❌ Error: ' + (data.msg || 'desconocido'));
    }
  } catch (err) {
    showToast('err', '❌ No se pudo conectar al servidor');
  } finally {
    enviando = false;
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = 'Enviar ✓';
  }
});

// ── Verificar servidor ────────────────────────────────────────
async function verificarServidor() {
  if (!serverIP) return;
  const url = serverIP.startsWith('http') ? serverIP : `http://${serverIP}`;
  try {
    const res = await fetch(`${url}:3000/ping`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data.ok) setStatus(true);
    else         setStatus(false);
  } catch {
    setStatus(false);
  }
  setTimeout(verificarServidor, 8000);
}

function setStatus(online) {
  statusDot.className  = `status-dot ${online ? 'on' : ''}`;
  statusLabel.textContent = online ? 'Conectado' : 'Sin conexión';
}

// ── Config botones ────────────────────────────────────────────
btnGuardar.addEventListener('click', guardarConfig);
btnEditar.addEventListener('click', () => {
  inputNombre.value = nombreEmp;
  inputIP.value     = serverIP;
  mostrarConfig();
});

// ── Toast ─────────────────────────────────────────────────────
let toastEl    = null;
let toastTimer = null;

function showToast(tipo, msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.className   = `toast ${tipo}`;
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ── Arranque ──────────────────────────────────────────────────
cargarConfig();