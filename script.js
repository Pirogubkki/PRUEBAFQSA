/* ============================================================
   Horarios FQ · UADY — lógica de la aplicación
   ============================================================ */

const dias = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];
const horaInicio = 8, horaFin = 20;

// Orden personalizado para los botones
const ordenSalones = [
  "Salon 1", "Salon 2", "Salon 3", "Salon 4", "Salon 5", "Salon 6", "Salon 7", "Salon 8", "Salon 9", "Salon 10", "Salon 11", "Salon 12",
  "Laboratorio 1", "Laboratorio 2", "Laboratorio 3", "Laboratorio 4",
  "Salon De Usos Multiples"
];

// Cuántas semanas dura el semestre (usado solo para el export .ics).
// Ajusta este número si el semestre cambia de duración.
const SEMANAS_SEMESTRE = 16;

// Generar intervalos de 30 minutos
const intervalos = [];
for (let h = horaInicio; h < horaFin; h++) {
  intervalos.push({ inicio: `${String(h).padStart(2, '0')}:00`, fin: `${String(h).padStart(2, '0')}:30` });
  intervalos.push({ inicio: `${String(h).padStart(2, '0')}:30`, fin: `${String(h + 1).padStart(2, '0')}:00` });
}

let horariosJSON = {};
let activeButton = null;
let ultimoQueryFiltro = "";

// URLs de las hojas públicas (opensheet lee el spreadsheet de Google como JSON)
const SHEET_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/2";
const AVISOS_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/3";
// Hoja "Solicitudes" (posición 1). Solo se usa para mostrar un historial breve
// y nunca se expone el correo del solicitante, solo fecha + mensaje.
const SOLICITUDES_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/4";

const DIAS_JS_A_ES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

/* ============================================================
   Utilidades básicas (normalización de texto y horas)
   ============================================================ */

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

function horaAMinutos(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
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
  if (inicioIdx === -1) return 1;
  if (finIdx === -1) return fin === "20:00" ? intervalos.length - inicioIdx : 1;
  return finIdx - inicioIdx + 1;
}

/* ============================================================
   Toasts (avisos flotantes, reemplazan los mensajes de error planos)
   ============================================================ */

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function mostrarToast(mensaje, tipo = "info") {
  let cont = document.getElementById('toast-container');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toast-container';
    document.body.appendChild(cont);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.setAttribute('role', 'status');
  toast.textContent = mensaje;
  cont.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('mostrar'));

  setTimeout(() => {
    toast.classList.remove('mostrar');
    setTimeout(() => toast.remove(), 300);
  }, 4200);
}

/* ============================================================
   Caché local (localStorage) — para que la segunda visita
   cargue instantáneo mientras se revalida en segundo plano
   ============================================================ */

const CACHE_KEY_HORARIOS = "fq_cache_horarios_v1";
const CACHE_KEY_AVISOS = "fq_cache_avisos_v1";

function guardarCache(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify({ datos, guardadoEn: Date.now() }));
  } catch (e) {
    // Si el navegador bloquea localStorage (modo privado, etc.) simplemente no cacheamos.
  }
}

function leerCache(clave) {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/* ============================================================
   Estado "en vivo": día/hora actual, clase en curso, ocupación
   ============================================================ */

function obtenerDiaHoraActual() {
  const ahora = new Date();
  return {
    dia: DIAS_JS_A_ES[ahora.getDay()],
    minutos: ahora.getHours() * 60 + ahora.getMinutes()
  };
}

function eventoEnCurso(eventos, dia, minutos) {
  return eventos.find(ev => {
    if (ev.dia !== dia) return false;
    const ini = horaAMinutos(ev.inicio);
    const fin = horaAMinutos(ev.fin);
    return minutos >= ini && minutos < fin;
  });
}

function salonOcupadoAhora(nombreSalon) {
  const { dia, minutos } = obtenerDiaHoraActual();
  if (!dias.includes(dia)) return false; // fin de semana: todo libre
  const eventos = (horariosJSON[nombreSalon] && horariosJSON[nombreSalon][dia]) || [];
  return eventos.some(ev => minutos >= horaAMinutos(ev.inicio) && minutos < horaAMinutos(ev.fin));
}

function proximaClase(nombreSalon) {
  const { dia, minutos } = obtenerDiaHoraActual();
  const datosSalon = horariosJSON[nombreSalon];
  if (!datosSalon) return null;

  const idxHoy = dias.indexOf(dia);
  // Buscamos desde hoy (si aplica) hasta 5 días hacia adelante, dando la vuelta a la semana.
  const inicioBusqueda = idxHoy === -1 ? 0 : idxHoy;

  for (let offset = 0; offset < 6; offset++) {
    const idx = (inicioBusqueda + offset) % dias.length;
    const diaBuscado = dias[idx];
    const eventosDia = (datosSalon[diaBuscado] || [])
      .slice()
      .sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio));

    for (const ev of eventosDia) {
      const esHoyMismo = offset === 0 && diaBuscado === dia;
      if (!esHoyMismo || horaAMinutos(ev.inicio) > minutos) {
        return { ...ev, dia: diaBuscado, esHoy: esHoyMismo };
      }
    }
  }
  return null;
}

/* ============================================================
   Agrupar datos crudos del sheet
   ============================================================ */

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

/* ============================================================
   Barra de botones de salones (con indicador "ocupado ahora")
   ============================================================ */

function crearBotonSalon(nombreReal) {
  const btn = document.createElement('button');
  btn.type = "button";

  const dot = document.createElement('span');
  const ocupado = salonOcupadoAhora(nombreReal);
  dot.className = "estado-dot " + (ocupado ? "ocupado" : "libre");
  dot.setAttribute('aria-hidden', 'true');
  btn.appendChild(dot);

  const texto = document.createElement('span');
  texto.textContent = nombreReal;
  btn.appendChild(texto);

  btn.setAttribute('aria-label', `${nombreReal}, ${ocupado ? "ocupado ahora" : "libre ahora"}`);
  btn.onclick = () => showSchedule(nombreReal, btn);
  return btn;
}

function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar');
  bar.innerHTML = "";

  const mapaNombreReal = {};
  Object.keys(horarios).forEach(n => { mapaNombreReal[normalizaNombre(n)] = n; });

  ordenSalones.forEach(n => {
    const nNorm = normalizaNombre(n);
    if (mapaNombreReal[nNorm]) bar.appendChild(crearBotonSalon(mapaNombreReal[nNorm]));
  });

  Object.keys(horarios).forEach(n => {
    if (!ordenSalones.map(normalizaNombre).includes(normalizaNombre(n))) {
      bar.appendChild(crearBotonSalon(n));
    }
  });

  aplicarFiltroBotones(ultimoQueryFiltro);
}

/* ============================================================
   Buscador de texto (filtra los botones de salón / materias)
   ============================================================ */

function aplicarFiltroBotones(query) {
  ultimoQueryFiltro = query || "";
  const q = normalizaNombre(ultimoQueryFiltro.trim());
  const botones = document.querySelectorAll('#button-bar button');

  botones.forEach(btn => {
    if (!q) { btn.style.display = ""; return; }

    const nombreSalon = btn.querySelector('span:last-child').textContent;
    const coincideSalon = normalizaNombre(nombreSalon).includes(q);

    const datosSalon = horariosJSON[nombreSalon];
    let coincideMateria = false;
    if (datosSalon) {
      coincideMateria = dias.some(d => (datosSalon[d] || []).some(ev => normalizaNombre(ev.materia).includes(q)));
    }

    btn.style.display = (coincideSalon || coincideMateria) ? "" : "none";
  });
}

/* ============================================================
   Construcción del grid de horario
   ============================================================ */

function construirGrid(gridContainer, data, resaltarActual) {
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

  const { dia: diaActual, minutos: minutosActuales } = obtenerDiaHoraActual();
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
        let claseCSS = "grid-clase " + (clase.tipo === "extraordinaria" ? "extraordinaria" : "semestral");
        if (duracion >= 6) claseCSS += " clase-larga"; // 3 horas o más
        if (resaltarActual && dia === diaActual && minutosActuales >= horaAMinutos(clase.inicio) && minutosActuales < horaAMinutos(clase.fin)) {
          claseCSS += " clase-en-curso";
        }
        claseCell.className = claseCSS;
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
        celdaVacia.className = "celda-vacia";
        celdaVacia.style.cssText = `grid-row: ${filaIdx + 2}; grid-column: ${diaIdx + 2};`;
        gridContainer.appendChild(celdaVacia);
      }
    });
  });
}

/* ============================================================
   Vista de lista por día (para pantallas móviles)
   ============================================================ */

function esVistaMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function renderListaDia(cont, data) {
  const lista = document.createElement("div");
  lista.className = "lista-dias-mobile";

  dias.forEach(dia => {
    const eventosDia = data.filter(ev => ev.dia === dia).sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio));

    const details = document.createElement("details");
    details.className = "dia-accordion";
    if (dia === obtenerDiaHoraActual().dia) details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `${dia} · ${eventosDia.length} ${eventosDia.length === 1 ? "clase" : "clases"}`;
    details.appendChild(summary);

    if (eventosDia.length === 0) {
      const vacio = document.createElement("p");
      vacio.className = "dia-vacio";
      vacio.textContent = "Sin clases este día.";
      details.appendChild(vacio);
    } else {
      const ul = document.createElement("ul");
      ul.className = "dia-lista";
      eventosDia.forEach(ev => {
        const li = document.createElement("li");
        li.className = "dia-item " + (ev.tipo === "extraordinaria" ? "extraordinaria" : "semestral");
        li.innerHTML = `<strong>${ev.materia}</strong><span>${ev.inicio} - ${ev.fin}</span>` + (ev.comentario ? `<em>${ev.comentario}</em>` : "");
        ul.appendChild(li);
      });
      details.appendChild(ul);
    }
    lista.appendChild(details);
  });

  cont.appendChild(lista);
}

/* ============================================================
   Widget "próxima clase en este salón"
   ============================================================ */

function renderProximaClase(nombreSalon) {
  let widget = document.getElementById('proxima-clase-widget');
  const prox = proximaClase(nombreSalon);

  if (!prox) {
    if (widget) widget.remove();
    return;
  }

  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'proxima-clase-widget';
    widget.className = 'proxima-clase-widget';
    const cont = document.getElementById('horario-espacio');
    cont.parentNode.insertBefore(widget, cont);
  }

  const cuando = prox.esHoy ? `Hoy, ${prox.inicio}` : `${prox.dia}, ${prox.inicio}`;
  widget.innerHTML = `
    <span class="proxima-clase-label">Próxima clase en este salón</span>
    <span class="proxima-clase-info"><strong>${prox.materia || "Sin nombre"}</strong> · ${cuando} - ${prox.fin}</span>
  `;
}

/* ============================================================
   Render principal del horario de un salón
   ============================================================ */

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

  // Acciones: exportar .ics y generar QR de este salón
  const acciones = document.createElement("div");
  acciones.className = "salon-acciones";
  acciones.innerHTML = `
    <button type="button" class="accion-btn" id="btn-ics">Agregar a calendario (.ics)</button>
  `;
  cont.appendChild(acciones);
  cont.querySelector('#btn-ics').onclick = () => exportarICS(nombre, data);

  renderProximaClase(nombre);

  if (esVistaMobile()) {
    renderListaDia(cont, data);
  } else {
    const gridContainer = document.createElement("div");
    gridContainer.className = "horario-grid";
    gridContainer.style.gridTemplateColumns = `120px repeat(${dias.length}, 1fr)`;
    gridContainer.style.gridTemplateRows = `auto repeat(${intervalos.length}, 42px)`;
    cont.appendChild(gridContainer);
    construirGrid(gridContainer, data, true);
  }
}

function showSchedule(nombre, btn) {
  if (activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;

  try { localStorage.setItem('fq_ultimo_salon', nombre); } catch (e) {}

  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  renderCalendario('horario-espacio', eventos, nombre);
}

// Vuelve a dibujar el horario activo si cruzamos el punto de quiebre móvil/escritorio
let anchoAnterior = esVistaMobile();
window.addEventListener('resize', () => {
  const ahoraMobile = esVistaMobile();
  if (ahoraMobile !== anchoAnterior && activeButton) {
    anchoAnterior = ahoraMobile;
    const nombre = activeButton.querySelector('span:last-child').textContent;
    const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
    renderCalendario('horario-espacio', eventos, nombre);
  }
});

/* ============================================================
   Exportar .ics (agregar horario del salón a Google/Apple Calendar)
   ============================================================ */

function diaEsToRRuleDia(dia) {
  return { Lunes: "MO", Martes: "TU", Miercoles: "WE", Jueves: "TH", Viernes: "FR" }[dia];
}

function proximaFechaParaDia(dia) {
  const idxObjetivo = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"].indexOf(dia);
  const hoy = new Date();
  const diff = (idxObjetivo - hoy.getDay() + 7) % 7;
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + diff);
  return fecha;
}

function formatoICSFecha(fecha, horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  const f = new Date(fecha);
  f.setHours(h, m, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${f.getFullYear()}${pad(f.getMonth() + 1)}${pad(f.getDate())}T${pad(f.getHours())}${pad(f.getMinutes())}00`;
}

function exportarICS(nombreSalon, eventos) {
  if (!eventos.length) {
    mostrarToast("Este salón no tiene clases para exportar.", "info");
    return;
  }

  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FQ UADY//Horarios//ES\r\nCALSCALE:GREGORIAN\r\n";

  eventos.forEach((ev, idx) => {
    const fechaBase = proximaFechaParaDia(ev.dia);
    const dtStart = formatoICSFecha(fechaBase, ev.inicio);
    const dtEnd = formatoICSFecha(fechaBase, ev.fin);
    const rruleDia = diaEsToRRuleDia(ev.dia);
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${nombreSalon}-${ev.dia}-${ev.inicio}-${idx}@fq-uady\r\n`;
    ics += `DTSTAMP:${dtStart}Z\r\n`;
    ics += `DTSTART:${dtStart}\r\n`;
    ics += `DTEND:${dtEnd}\r\n`;
    if (rruleDia) ics += `RRULE:FREQ=WEEKLY;BYDAY=${rruleDia};COUNT=${SEMANAS_SEMESTRE}\r\n`;
    ics += `SUMMARY:${(ev.materia || "Clase")} (${nombreSalon})\r\n`;
    if (ev.comentario) ics += `DESCRIPTION:${ev.comentario.replace(/\r?\n/g, "\\n")}\r\n`;
    ics += "END:VEVENT\r\n";
  });

  ics += "END:VCALENDAR\r\n";

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `horario-${normalizaNombre(nombreSalon).replace(/\s+/g, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  mostrarToast("Archivo .ics descargado. Ábrelo para importarlo a tu calendario.", "success");
}

/* ============================================================
   Búsqueda de espacios libres
   ============================================================ */

function buscarEspaciosLibres(dia, horaInicioStr, duracionMin) {
  const [h, m] = horaInicioStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < horaInicio || h >= horaFin || m < 0 || m > 59) return [];

  const libres = [];
  const iniMin = h * 60 + m;
  const finMin = iniMin + duracionMin;

  Object.keys(horariosJSON).forEach(salon => {
    const eventos = horariosJSON[salon][dia] || [];
    const ocupado = eventos.some(ev => {
      const evIni = horaAMinutos(ev.inicio);
      const evFin = horaAMinutos(ev.fin);
      return !(finMin <= evIni || iniMin >= evFin);
    });
    if (!ocupado) libres.push(salon);
  });
  return libres;
}

/* ============================================================
   Avisos y reportes
   ============================================================ */

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
    .then(avisos => { mostrarAvisos(avisos); guardarCache(CACHE_KEY_AVISOS, avisos); })
    .catch(error => {
      console.error('Error cargando avisos:', error);
      mostrarToast("No se pudieron cargar los avisos.", "error");
    });
}

/* ============================================================
   Historial de solicitudes (hoja "Solicitudes")
   No se muestra el correo del solicitante, solo fecha + mensaje.
   ============================================================ */

function claseEstado(estadoRaw) {
  const e = normalizaNombre((estadoRaw || "").trim());
  if (e === "aceptado") return "estado-aceptado";
  if (e === "rechazado") return "estado-rechazado";
  if (e === "en revision" || e === "en revisión") return "estado-revision";
  return "";
}

function mostrarHistorialSolicitudes(filas) {
  const container = document.getElementById('historial-solicitudes-lista');
  if (!container) return;
  container.innerHTML = '';

  if (!filas || filas.length === 0) {
    container.innerHTML = `<p class="dia-vacio">Aún no hay solicitudes registradas.</p>`;
    return;
  }

  const recientes = filas.slice(-5).reverse();

  recientes.forEach(fila => {
    const solicitud = fila["Solicitud"] || fila["solicitud"] || "Sin detalle";
    const comentario = fila["Comentario"] || fila["comentario"] || "";
    const fecha = fila["Creado"] || fila["creado"] || "Sin fecha";
    const estado = fila["Estado"] || fila["estado"] || "";

    const item = document.createElement('div');
    item.className = 'aviso-item ' + claseEstado(estado);
    item.innerHTML = `
      <div class="aviso-fecha">${escapeHTML(fecha)}${estado ? ` · <span class="estado-pill">${escapeHTML(estado)}</span>` : ""}</div>
      <div class="aviso-texto">${escapeHTML(solicitud)}</div>
      ${comentario ? `<div class="aviso-comentario">${escapeHTML(comentario)}</div>` : ""}
    `;
    container.appendChild(item);
  });
}

function cargarHistorialSolicitudes() {
  const container = document.getElementById('historial-solicitudes-lista');
  if (!container) return;

  fetch(SOLICITUDES_URL)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(mostrarHistorialSolicitudes)
    .catch(error => {
      console.error('Error cargando historial de solicitudes:', error);
      container.innerHTML = `<p class="dia-vacio">No se pudo cargar el historial de solicitudes.</p>`;
    });
}

/* ============================================================
   Página de exportar (todos los salones, para imprimir/PDF)
   ============================================================ */

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

    construirGrid(gridContainer, eventos, false);
    contenedor.appendChild(salonDiv);
  });
}

/* ============================================================
   Modal de solicitud
   ============================================================ */

function openSolicitud() {
  document.getElementById('modal-solicitud-bg').classList.add('active');
}

function closeSolicitud() {
  document.getElementById('modal-solicitud-bg').classList.remove('active');
}

/* ============================================================
   Arranque: pintar caché al instante, luego revalidar con la red
   ============================================================ */

function pintarDesdeHorarios(horarios) {
  horariosJSON = horarios;
  if (Object.keys(horariosJSON).length === 0) return;

  renderAllButtons(horariosJSON);

  const params = new URLSearchParams(location.search);
  const salonEnURL = params.get('salon');

  let nombreObjetivo = null;
  if (salonEnURL) {
    nombreObjetivo = Object.keys(horariosJSON).find(n => normalizaNombre(n) === normalizaNombre(salonEnURL));
  }
  if (!nombreObjetivo) {
    try {
      const ultimo = localStorage.getItem('fq_ultimo_salon');
      if (ultimo) nombreObjetivo = Object.keys(horariosJSON).find(n => n === ultimo);
    } catch (e) {}
  }
  if (!nombreObjetivo) {
    const primerSalonNorm = ordenSalones.map(normalizaNombre).find(nombreNorm =>
      Object.keys(horariosJSON).map(normalizaNombre).includes(nombreNorm)
    );
    nombreObjetivo = primerSalonNorm
      ? Object.keys(horariosJSON).find(n => normalizaNombre(n) === primerSalonNorm)
      : Object.keys(horariosJSON)[0];
  }

  if (nombreObjetivo) {
    const botones = Array.from(document.querySelectorAll('#button-bar button'));
    const boton = botones.find(b => b.querySelector('span:last-child').textContent === nombreObjetivo) || botones[0];
    if (boton) showSchedule(nombreObjetivo, boton);
  }
}

// 1) Pintar de inmediato con lo que haya en caché (si existe)
const cacheHorarios = leerCache(CACHE_KEY_HORARIOS);
const cacheAvisos = leerCache(CACHE_KEY_AVISOS);
if (cacheHorarios) pintarDesdeHorarios(cacheHorarios.datos);
if (cacheAvisos) mostrarAvisos(cacheAvisos.datos);
if (!cacheHorarios) document.getElementById('horario-espacio').classList.add('skeleton-cargando');

// 2) Revalidar con la red siempre, para que la información nunca quede vieja
Promise.all([
  fetch(SHEET_URL).then(response => response.ok ? response.json() : Promise.reject('Error en horarios')),
  fetch(AVISOS_URL).then(response => response.ok ? response.json() : Promise.reject('Error en avisos'))
])
  .then(([horarios, avisos]) => {
    const horariosAgrupados = agrupaHorariosPorSalon(horarios);
    guardarCache(CACHE_KEY_HORARIOS, horariosAgrupados);
    guardarCache(CACHE_KEY_AVISOS, avisos);

    document.getElementById('horario-espacio').classList.remove('skeleton-cargando');

    if (Object.keys(horariosAgrupados).length === 0) {
      document.getElementById('horario-espacio').innerHTML = "<b>No hay horarios cargados.</b>";
    } else {
      pintarDesdeHorarios(horariosAgrupados);
    }
    mostrarAvisos(avisos);
  })
  .catch(error => {
    console.error('Error cargando datos:', error);
    document.getElementById('horario-espacio').classList.remove('skeleton-cargando');
    if (!cacheHorarios) {
      document.getElementById('horario-espacio').innerHTML = "<b>Error cargando datos.</b>";
    }
    mostrarToast("No se pudo conectar con la base de datos. Mostrando la última versión guardada.", "error");
    cargarAvisos();
  });

cargarHistorialSolicitudes();

/* ============================================================
   Event listeners generales
   ============================================================ */

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

  const filtro = document.getElementById('filtro-salon');
  if (filtro) {
    filtro.addEventListener('input', (e) => aplicarFiltroBotones(e.target.value));
  }

  const modalBg = document.getElementById('modal-solicitud-bg');
  if (modalBg) {
    modalBg.onclick = function (e) { if (e.target === this) closeSolicitud(); };
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
          status.textContent = "";
          mostrarToast("¡Gracias por tu solicitud!", "success");
          form.reset();
          setTimeout(cargarHistorialSolicitudes, 1500);
        } else {
          response.json().then(data => {
            const msg = Object.hasOwn(data, 'errors')
              ? data["errors"].map(error => error["message"]).join(", ")
              : "Hubo un problema al enviar tu formulario.";
            mostrarToast(msg, "error");
          });
        }
      }).catch(() => mostrarToast("Hubo un problema al enviar tu formulario.", "error"));
    });
  }
});
