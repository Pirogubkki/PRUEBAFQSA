const dias = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];
const horaInicio = 8, horaFin = 20;

// Orden personalizado para los botones
const ordenSalones = [
  "Salon 1", "Salon 2", "Salon 3", "Salon 4", "Salon 5", "Salon 6", "Salon 7", "Salon 8", "Salon 9", "Salon 10", "Salon 11", "Salon 12",
  "Laboratorio 1", "Laboratorio 2", "Laboratorio 3", "Laboratorio 4",
  "Salon De Usos Multiples"
];

// Generar intervalos de 30 minutos
const intervalos = [];
for (let h = horaInicio; h < horaFin; h++) {
  intervalos.push({ inicio: `${String(h).padStart(2, '0')}:00`, fin: `${String(h).padStart(2, '0')}:30` });
  intervalos.push({ inicio: `${String(h).padStart(2, '0')}:30`, fin: `${String(h + 1).padStart(2, '0')}:00` });
}

let horariosJSON = {};
let activeButton = null;

// URL de las hojas públicas
const SHEET_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/2";
const AVISOS_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/3";

// ---------- Funciones utilitarias ----------
function normalizaDia(str) {
  if (!str) return "";
  str = str.toLowerCase()
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úù]/g, 'u');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function normalizaSalon(str) {
  if (!str) return "";
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\b([a-z])/g, l => l.toUpperCase());
}

function normalizaHora(horaStr) {
  if (!horaStr) return "";
  horaStr = horaStr.trim();
  const parts = horaStr.split(':');
  if (parts[0].length === 1) parts[0] = '0' + parts[0];
  return parts.join(':');
}

function normalizaNombre(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function calcularDuracionEnIntervalos(inicio, fin) {
  let inicioIdx = -1;
  let finIdx = -1;

  for (let i = 0; i < intervalos.length; i++) {
    if (intervalos[i].inicio === inicio) { inicioIdx = i; break; }
  }

  for (let i = 0; i < intervalos.length; i++) {
    if (intervalos[i].fin === fin) { finIdx = i; break; }
  }

  if (finIdx === -1) {
    for (let i = 0; i < intervalos.length; i++) {
      if (intervalos[i].inicio === fin) { finIdx = i - 1; break; }
    }
  }

  if (inicioIdx === -1) {
    console.warn(`No se encontró intervalo de inicio para: ${inicio}`);
    return 1;
  }

  if (finIdx === -1) {
    console.warn(`No se encontró intervalo de fin para: ${fin}`);
    return fin === "20:00" ? intervalos.length - inicioIdx : 1;
  }

  return finIdx - inicioIdx + 1;
}

function agrupaHorariosPorSalon(rows) {
  const resultado = {};
  rows.forEach(row => {
    const salon = normalizaSalon((row["Salon"] || row["Salón"] || row["salon"] || "").trim());
    const dia = normalizaDia((row["Dia"] || row["día"] || row["dia"] || "").trim());
    if (!salon || !dia) return;

    if (!resultado[salon]) {
      resultado[salon] = { capacidad: row["capacidad"] ? Number(row["capacidad"]) : undefined };
      dias.forEach(d => resultado[salon][d] = []);
    }

    if (dias.includes(dia)) {
      const inicio = normalizaHora((row["Inicio"] || row["inicio"] || "").trim());
      const fin = normalizaHora((row["Fin"] || row["fin"] || "").trim());

      if (inicio && fin) {
        resultado[salon][dia].push({
          materia: (row["Materia"] || row["materia"] || "").trim(),
          inicio,
          fin,
          tipo: (row["tipo"] || "").trim(),
          comentario: (row["comentario"] || "").trim()
        });
      }
    }
  });
  return resultado;
}

function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar');
  bar.innerHTML = "";

  const mapaNombreReal = {};
  Object.keys(horarios).forEach(n => { mapaNombreReal[normalizaNombre(n)] = n; });

  ordenSalones.forEach(n => {
    const nNorm = normalizaNombre(n);
    if (mapaNombreReal[nNorm]) {
      const btn = document.createElement('button');
      btn.textContent = mapaNombreReal[nNorm];
      btn.onclick = () => showSchedule(mapaNombreReal[nNorm], btn);
      bar.appendChild(btn);
    }
  });

  Object.keys(horarios).forEach(n => {
    if (!ordenSalones.map(normalizaNombre).includes(normalizaNombre(n))) {
      const btn = document.createElement('button');
      btn.textContent = n;
      btn.onclick = () => showSchedule(n, btn);
      bar.appendChild(btn);
    }
  });
}

function convertirADatosEventos(nombre, horariosSalon) {
  const eventos = [];
  dias.forEach(dia => {
    if (horariosSalon[dia]) {
      horariosSalon[dia].forEach(clase => {
        eventos.push({ dia, inicio: clase.inicio, fin: clase.fin, materia: clase.materia, tipo: clase.tipo, comentario: clase.comentario });
      });
    }
  });
  return eventos;
}

function construirGrid(gridContainer, data) {
  const cornerCell = document.createElement("div");
  cornerCell.className = "grid-header";
  cornerCell.textContent = "Hora";
  gridContainer.appendChild(cornerCell);

  dias.forEach(dia => {
    const headerCell = document.createElement("div");
    headerCell.className = "grid-header";
    headerCell.textContent = dia;
    gridContainer.appendChild(headerCell);
  });

  const celdasOcupadas = new Set();

  intervalos.forEach((intervalo, filaIdx) => {
    const horaCell = document.createElement("div");
    horaCell.className = "grid-hora";
    horaCell.textContent = `${intervalo.inicio} - ${intervalo.fin}`;
    horaCell.style.cssText = `grid-row: ${filaIdx + 2}; grid-column: 1;`;
    gridContainer.appendChild(horaCell);

    dias.forEach((dia, diaIdx) => {
      const celdaKey = `${filaIdx}-${diaIdx}`;
      if (celdasOcupadas.has(celdaKey)) return;

      const clase = data.find(ev => ev.dia === dia && ev.inicio === intervalo.inicio);

      if (clase) {
        const duracion = calcularDuracionEnIntervalos(clase.inicio, clase.fin);
        for (let i = 0; i < duracion; i++) celdasOcupadas.add(`${filaIdx + i}-${diaIdx}`);

        const claseCell = document.createElement("div");
        claseCell.className = "grid-clase " + (clase.tipo === "extraordinaria" ? "extraordinaria" : "semestral");
        claseCell.style.cssText = `grid-row: ${filaIdx + 2} / span ${duracion}; grid-column: ${diaIdx + 2};`;

        const materiaDiv = document.createElement("div");
        materiaDiv.className = "materia-nombre";
        materiaDiv.textContent = clase.materia;
        claseCell.appendChild(materiaDiv);

        const horarioDiv = document.createElement("div");
        horarioDiv.className = "materia-horario";
        horarioDiv.textContent = `${clase.inicio} - ${clase.fin}`;
        claseCell.appendChild(horarioDiv);

        if (clase.comentario) {
          const comentarioDiv = document.createElement("div");
          comentarioDiv.className = "materia-comentario";
          comentarioDiv.textContent = clase.comentario;
          claseCell.appendChild(comentarioDiv);
          claseCell.title = clase.comentario;
        }

        gridContainer.appendChild(claseCell);
      } else {
        const celdaVacia = document.createElement("div");
        celdaVacia.style.cssText = `grid-row: ${filaIdx + 2}; grid-column: ${diaIdx + 2}; background: var(--surface);`;
        gridContainer.appendChild(celdaVacia);
      }
    });
  });
}

function renderCalendario(id, data, nombre) {
  const cont = document.getElementById(id);
  cont.innerHTML = "";
  cont.className = "horario-container";

  const tit = document.createElement("h2");
  tit.textContent = nombre;
  cont.appendChild(tit);

  if (horariosJSON[nombre] && horariosJSON[nombre].capacidad) {
    const capacidadDiv = document.createElement("div");
    capacidadDiv.className = "capacidad-line";
    const icon = document.createElement("img");
    icon.src = "assets/icons/ubicacion.png";
    icon.alt = "";
    icon.onerror = function () { this.remove(); };
    capacidadDiv.appendChild(icon);
    const texto = document.createElement("span");
    texto.innerHTML = `Capacidad: <strong>${horariosJSON[nombre].capacidad} alumnos</strong>`;
    capacidadDiv.appendChild(texto);
    cont.appendChild(capacidadDiv);
  }

  const gridContainer = document.createElement("div");
  gridContainer.className = "horario-grid";
  gridContainer.style.gridTemplateColumns = `120px repeat(${dias.length}, 1fr)`;
  gridContainer.style.gridTemplateRows = `auto repeat(${intervalos.length}, 42px)`;
  cont.appendChild(gridContainer);

  construirGrid(gridContainer, data);
}

function showSchedule(nombre, btn) {
  if (activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;

  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  renderCalendario('horario-espacio', eventos, nombre);
}

// ---------- Búsqueda de espacios libres ----------
function buscarEspaciosLibres(dia, horaInicioStr, duracionMin) {
  const [h, m] = horaInicioStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < horaInicio || h >= horaFin || m < 0 || m > 59) return [];

  const libres = [];
  const iniMin = h * 60 + m;
  const finMin = iniMin + duracionMin;

  Object.keys(horariosJSON).forEach(salon => {
    const eventos = horariosJSON[salon][dia] || [];
    const ocupado = eventos.some(ev => {
      const [hin, minin] = ev.inicio.split(':');
      const [hfin, minfin] = ev.fin.split(':');
      const evIni = parseInt(hin) * 60 + parseInt(minin);
      const evFin = parseInt(hfin) * 60 + parseInt(minfin);
      return !(finMin <= evIni || iniMin >= evFin);
    });
    if (!ocupado) libres.push(salon);
  });
  return libres;
}

// ---------- Avisos ----------
function mostrarAvisos(avisos) {
  const container = document.getElementById('avisos-lista');
  container.innerHTML = '';

  if (!avisos || avisos.length === 0) {
    container.innerHTML = `
      <div class="aviso-item">
        <div class="aviso-fecha">Sin avisos</div>
        <div class="aviso-texto">No hay avisos disponibles en este momento.</div>
      </div>`;
    return;
  }

  avisos.sort((a, b) => new Date(b.Fecha || b.fecha || '') - new Date(a.Fecha || a.fecha || ''));

  avisos.slice(0, 5).forEach((aviso, idx) => {
    const fecha = aviso.Fecha || aviso.fecha || 'Sin fecha';
    const tipo = aviso.Tipo || aviso.tipo || 'Aviso';
    const mensaje = aviso.Mensaje || aviso.mensaje || aviso.Descripcion || aviso.descripcion || 'Sin mensaje';

    const avisoDiv = document.createElement('div');
    avisoDiv.className = 'aviso-item';
    avisoDiv.style.animationDelay = `${idx * 0.06}s`;
    avisoDiv.innerHTML = `
      <div class="aviso-fecha">${fecha}</div>
      <div class="aviso-texto"><strong>${tipo}:</strong> ${mensaje}</div>
    `;
    container.appendChild(avisoDiv);
  });
}

function cargarAvisos() {
  fetch(AVISOS_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(mostrarAvisos)
    .catch(error => {
      console.error('Error cargando avisos:', error);
      document.getElementById('avisos-lista').innerHTML = `
        <div class="aviso-item">
          <div class="aviso-fecha">Error</div>
          <div class="aviso-texto">No se pudieron cargar los avisos. Intenta recargar la página.</div>
        </div>`;
    });
}

// ---------- Página de exportar ----------
function mostrarPaginaExportar() {
  document.querySelector('.main-container').style.display = 'none';
  document.querySelector('.main-header').style.display = 'none';
  document.getElementById('pagina-exportar').classList.add('active');
  generarExportacionCompleta();
}

function volverAPaginaPrincipal() {
  document.querySelector('.main-container').style.display = 'grid';
  document.querySelector('.main-header').style.display = 'block';
  document.getElementById('pagina-exportar').classList.remove('active');
}

function generarExportacionCompleta() {
  const contenedor = document.getElementById('exportar-contenido');
  contenedor.innerHTML = '';

  if (!horariosJSON || Object.keys(horariosJSON).length === 0) {
    contenedor.innerHTML = '<p style="text-align:center; color: var(--ink-muted);">No hay horarios disponibles para exportar.</p>';
    return;
  }

  const salonesOrdenados = [];
  ordenSalones.forEach(nombre => {
    const nombreNorm = normalizaNombre(nombre);
    const nombreReal = Object.keys(horariosJSON).find(n => normalizaNombre(n) === nombreNorm);
    if (nombreReal) salonesOrdenados.push(nombreReal);
  });
  Object.keys(horariosJSON).forEach(nombre => {
    if (!salonesOrdenados.includes(nombre)) salonesOrdenados.push(nombre);
  });

  salonesOrdenados.forEach(nombreSalon => {
    const salonDiv = document.createElement('div');
    salonDiv.className = 'salon-exportar';

    const titulo = document.createElement('h3');
    titulo.textContent = nombreSalon;
    salonDiv.appendChild(titulo);

    if (horariosJSON[nombreSalon].capacidad) {
      const capacidadP = document.createElement('p');
      capacidadP.style.cssText = 'text-align:center; color: var(--ink-muted); margin-bottom: 1rem; font-weight: 500;';
      capacidadP.textContent = `Capacidad: ${horariosJSON[nombreSalon].capacidad} alumnos`;
      salonDiv.appendChild(capacidadP);
    }

    const eventos = convertirADatosEventos(nombreSalon, horariosJSON[nombreSalon]);
    const gridContainer = document.createElement("div");
    gridContainer.className = "horario-grid";
    gridContainer.style.gridTemplateColumns = `120px repeat(${dias.length}, 1fr)`;
    gridContainer.style.gridTemplateRows = `auto repeat(${intervalos.length}, 32px)`;
    salonDiv.appendChild(gridContainer);

    construirGrid(gridContainer, eventos);
    contenedor.appendChild(salonDiv);
  });
}

// ---------- Modal ----------
function openSolicitud() {
  document.getElementById('modal-solicitud-bg').classList.add('active');
}

function closeSolicitud() {
  document.getElementById('modal-solicitud-bg').classList.remove('active');
}

// ---------- Carga inicial de datos ----------
Promise.all([
  fetch(SHEET_URL).then(response => response.ok ? response.json() : Promise.reject('Error en horarios')),
  fetch(AVISOS_URL).then(response => response.ok ? response.json() : Promise.reject('Error en avisos'))
])
  .then(([horarios, avisos]) => {
    horariosJSON = agrupaHorariosPorSalon(horarios);
    mostrarAvisos(avisos);

    if (Object.keys(horariosJSON).length === 0) {
      document.getElementById('horario-espacio').innerHTML = "<b>No hay horarios cargados.</b>";
    } else {
      renderAllButtons(horariosJSON);
      const primerSalonNorm = ordenSalones.map(normalizaNombre).find(nombreNorm =>
        Object.keys(horariosJSON).map(normalizaNombre).includes(nombreNorm)
      );
      const nombreReal = primerSalonNorm
        ? Object.keys(horariosJSON).find(n => normalizaNombre(n) === primerSalonNorm)
        : Object.keys(horariosJSON)[0];
      if (nombreReal) {
        const primerBoton = document.querySelector('#button-bar button');
        if (primerBoton) showSchedule(nombreReal, primerBoton);
      }
    }
  })
  .catch(error => {
    console.error('Error cargando datos:', error);
    document.getElementById('horario-espacio').innerHTML = "<b>Error cargando datos.</b>";
    cargarAvisos();
  });

// ---------- Event listeners ----------
document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('buscador-btn');
  if (btn) {
    btn.onclick = function () {
      const dia = document.getElementById('busc-dia').value;
      const hora = document.getElementById('busc-hora').value;
      const dur = parseInt(document.getElementById('busc-duracion').value);

      const [h, m] = hora.split(':').map(Number);
      if (isNaN(h) || isNaN(m) || h < horaInicio || h >= horaFin || m < 0 || m > 59) {
        document.getElementById('resultado-buscador').innerHTML = `<b>El horario debe estar entre 08:00 y 20:00.</b>`;
        return;
      }

      const libres = buscarEspaciosLibres(dia, hora, dur);
      const resDiv = document.getElementById('resultado-buscador');
      if (libres.length) {
        resDiv.innerHTML = `<b>Espacios disponibles:</b><br>${libres.map((s, i) => `<span class="chip" style="animation-delay:${i * 0.04}s">${s}</span>`).join('')}`;
      } else {
        resDiv.innerHTML = `<b>No hay espacios disponibles en ese horario.</b>`;
      }
    };
  }

  const modalBg = document.getElementById('modal-solicitud-bg');
  if (modalBg) {
    modalBg.onclick = function (e) {
      if (e.target === this) closeSolicitud();
    };
  }

  const form = document.getElementById("my-form");
  if (form) {
    form.addEventListener("submit", async function handleSubmit(event) {
      event.preventDefault();
      const status = document.getElementById("my-form-status");
      const data = new FormData(event.target);
      fetch(event.target.action, {
        method: form.method,
        body: data,
        headers: { 'Accept': 'application/json' }
      }).then(response => {
        if (response.ok) {
          status.textContent = "¡Gracias por tu solicitud!";
          status.style.color = "var(--navy)";
          form.reset();
        } else {
          response.json().then(data => {
            if (Object.hasOwn(data, 'errors')) {
              status.textContent = data["errors"].map(error => error["message"]).join(", ");
            } else {
              status.textContent = "Hubo un problema al enviar tu formulario.";
            }
            status.style.color = "var(--gold)";
          });
        }
      }).catch(() => {
        status.textContent = "Hubo un problema al enviar tu formulario.";
        status.style.color = "var(--gold)";
      });
    });
  }
});
