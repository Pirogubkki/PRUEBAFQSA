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
  intervalos.push({inicio:`${String(h).padStart(2,'0')}:00`, fin:`${String(h).padStart(2,'0')}:30`});
  intervalos.push({inicio:`${String(h).padStart(2,'0')}:30`, fin:`${String(h+1).padStart(2,'0')}:00`});
}

let horariosJSON = {};
let activeButton = null;

// URL de tu hoja pública
const SHEET_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/2";

// Normaliza día y salón
function normalizaDia(str) {
  if (!str) return "";
  str = str.toLowerCase()
    .replace(/[áà]/g,'a')
    .replace(/[éè]/g,'e')
    .replace(/[íì]/g,'i')
    .replace(/[óò]/g,'o')
    .replace(/[úù]/g,'u');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function normalizaSalon(str) {
  if (!str) return "";
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\b([a-z])/g, l => l.toUpperCase());
}

// Normaliza hora para tener dos dígitos en la hora y limpia espacios
function normalizaHora(horaStr) {
  if (!horaStr) return "";
  horaStr = horaStr.trim();
  const parts = horaStr.split(':');
  if (parts[0].length === 1) {
    parts[0] = '0' + parts[0];
  }
  return parts.join(':');
}

// Normaliza nombres para comparación robusta
function normalizaNombre(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Función mejorada para calcular duración en intervalos
function calcularDuracionEnIntervalos(inicio, fin) {
  let inicioIdx = -1;
  let finIdx = -1;
  
  // Buscar índice de inicio
  for (let i = 0; i < intervalos.length; i++) {
    if (intervalos[i].inicio === inicio) {
      inicioIdx = i;
      break;
    }
  }
  
  // Buscar índice de fin
  for (let i = 0; i < intervalos.length; i++) {
    if (intervalos[i].fin === fin) {
      finIdx = i;
      break;
    }
  }
  
  if (inicioIdx === -1) {
    console.warn(`No se encontró intervalo de inicio para: ${inicio}`);
    return 1;
  }
  
  if (finIdx === -1) {
    console.warn(`No se encontró intervalo de fin para: ${fin}`);
    return 1;
  }
  
  const duracion = finIdx - inicioIdx + 1;
  console.log(`Duración calculada para ${inicio} - ${fin}: ${duracion} intervalos`);
  return duracion;
}

// Convierte array plano a formato por salón y día
function agrupaHorariosPorSalon(rows) {
  const resultado = {};
  rows.forEach(row => {
    const salon = normalizaSalon((row["Salon"] || row["Salón"] || row["salon"] || "").trim());
    const dia = normalizaDia((row["Dia"] || row["día"] || row["dia"] || "").trim());
    if (!salon || !dia) return;
    
    if (!resultado[salon]) {
      resultado[salon] = {capacidad: row["capacidad"] ? Number(row["capacidad"]) : undefined};
      dias.forEach(d => resultado[salon][d] = []);
    }
    
    if (dias.includes(dia)) {
      const inicio = normalizaHora((row["Inicio"] || row["inicio"] || "").trim());
      const fin = normalizaHora((row["Fin"] || row["fin"] || "").trim());
      
      // Validar que las horas sean válidas
      if (inicio && fin) {
        resultado[salon][dia].push({
          materia: (row["Materia"] || row["materia"] || "").trim(),
          inicio: inicio,
          fin: fin,
          tipo: (row["tipo"] || "").trim(),
          comentario: (row["comentario"] || "").trim()
        });
      } else {
        console.warn(`Horario inválido para ${salon} - ${dia}:`, {inicio, fin});
      }
    }
  });
  return resultado;
}

// ORDEN PERSONALIZADO DE BOTONES
function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar') || document.getElementById('submenu-salones');
  bar.innerHTML = "";

  // Mapa de nombre normalizado a nombre real
  const mapaNombreReal = {};
  Object.keys(horarios).forEach(n => {
    mapaNombreReal[normalizaNombre(n)] = n;
  });

  // Primero en el orden deseado
  ordenSalones.forEach(n => {
    const nNorm = normalizaNombre(n);
    if (mapaNombreReal[nNorm]) {
      const btn = document.createElement('button');
      btn.textContent = mapaNombreReal[nNorm];
      btn.onclick = () => showSchedule(mapaNombreReal[nNorm], btn);
      bar.appendChild(btn);
    }
  });

  // Luego, los que no están en el orden personalizado
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
        eventos.push({
          dia: dia,
          inicio: clase.inicio,
          fin: clase.fin,
          materia: clase.materia,
          tipo: clase.tipo,
          comentario: clase.comentario
        });
      });
    }
  });
  return eventos;
}

// Función mejorada para renderizar el calendario con CSS Grid
function renderCalendario(id, data, nombre) {
  const cont = document.getElementById(id);
  cont.innerHTML = "";
  cont.className = "horario-container";

  // Título y capacidad
  const tit = document.createElement("h2");
  tit.textContent = nombre;
  cont.appendChild(tit);
  
  if (horariosJSON[nombre] && horariosJSON[nombre].capacidad) {
    const capacidadDiv = document.createElement("div");
    capacidadDiv.style.cssText = "font-size:15px; color:#388; margin-bottom: 10px;";
    capacidadDiv.textContent = `Capacidad: ${horariosJSON[nombre].capacidad} alumnos`;
    cont.appendChild(capacidadDiv);
  }

  // Crear contenedor grid
  const gridContainer = document.createElement("div");
  gridContainer.className = "horario-grid";
  
  // Configurar CSS Grid
  gridContainer.style.cssText = `
    display: grid;
    grid-template-columns: 120px repeat(${dias.length}, 1fr);
    grid-template-rows: auto repeat(${intervalos.length}, 40px);
    gap: 1px;
    background-color: #f0f5f2;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    margin: 20px 0;
  `;
  
  cont.appendChild(gridContainer);

  // Header - celda vacía para la esquina
  const cornerCell = document.createElement("div");
  cornerCell.className = "grid-header";
  cornerCell.textContent = "Hora";
  gridContainer.appendChild(cornerCell);

  // Headers de días
  dias.forEach(dia => {
    const headerCell = document.createElement("div");
    headerCell.className = "grid-header";
    headerCell.textContent = dia;
    gridContainer.appendChild(headerCell);
  });

  // Crear un mapa para rastrear qué celdas están ocupadas
  const celdasOcupadas = new Set();

  // Para cada intervalo de tiempo
  intervalos.forEach((intervalo, filaIdx) => {
    // Celda de hora
    const horaCell = document.createElement("div");
    horaCell.className = "grid-hora";
    horaCell.textContent = `${intervalo.inicio} - ${intervalo.fin}`;
    horaCell.style.cssText = `
      grid-row: ${filaIdx + 2};
      grid-column: 1;
    `;
    gridContainer.appendChild(horaCell);

    // Para cada día
    dias.forEach((dia, diaIdx) => {
      const celdaKey = `${filaIdx}-${diaIdx}`;
      
      // Solo procesar si la celda no está ocupada
      if (!celdasOcupadas.has(celdaKey)) {
        // Buscar si hay una clase que comience exactamente en este intervalo y día
        const clase = data.find(ev => 
          ev.dia === dia && ev.inicio === intervalo.inicio
        );

        if (clase) {
          // Calcular duración
          const duracion = calcularDuracionEnIntervalos(clase.inicio, clase.fin);
          
          // Marcar todas las celdas ocupadas por esta clase
          for (let i = 0; i < duracion; i++) {
            celdasOcupadas.add(`${filaIdx + i}-${diaIdx}`);
          }
          
          // Crear celda de clase
          const claseCell = document.createElement("div");
          
          // Determinar clase CSS
          let claseCSS = "grid-clase";
          if (clase.tipo === "extraordinaria") {
            claseCSS += " extraordinaria";
          } else {
            claseCSS += " semestral";
          }
          claseCell.className = claseCSS;
          
          // Posicionar en el grid
          claseCell.style.cssText = `
            grid-row: ${filaIdx + 2} / span ${duracion};
            grid-column: ${diaIdx + 2};
            background: ${clase.tipo === "extraordinaria" ? "rgba(240, 90, 170, 0.2)" : "rgba(140, 195, 138, 0.25)"};
            border: 2px solid ${clase.tipo === "extraordinaria" ? "#f05aaa" : "#8cc38a"};
            color: ${clase.tipo === "extraordinaria" ? "#7c325e" : "#1e3d24"};
            border-radius: 8px;
            padding: 6px 4px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.2;
            cursor: pointer;
            transition: all 0.2s ease;
          `;
          
          // Hover effects
          claseCell.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.02)';
            this.style.background = clase.tipo === "extraordinaria" ? "rgba(240, 90, 170, 0.35)" : "rgba(140, 195, 138, 0.4)";
          });
          
          claseCell.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.background = clase.tipo === "extraordinaria" ? "rgba(240, 90, 170, 0.2)" : "rgba(140, 195, 138, 0.25)";
          });
          
          // Contenido
          const materiaDiv = document.createElement("div");
          materiaDiv.className = "materia-nombre";
          materiaDiv.textContent = clase.materia;
          materiaDiv.style.cssText = `
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 3px;
            line-height: 1.1;
          `;
          claseCell.appendChild(materiaDiv);
          
          const horarioDiv = document.createElement("div");
          horarioDiv.className = "materia-horario";
          horarioDiv.textContent = `${clase.inicio} - ${clase.fin}`;
          horarioDiv.style.cssText = `
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 2px;
            opacity: 0.8;
          `;
          claseCell.appendChild(horarioDiv);
          
          if (clase.comentario) {
            const comentarioDiv = document.createElement("div");
            comentarioDiv.className = "materia-comentario";
            comentarioDiv.textContent = clase.comentario;
            comentarioDiv.style.cssText = `
              font-size: 10px;
              font-style: italic;
              opacity: 0.7;
              margin-top: 2px;
              line-height: 1.1;
            `;
            claseCell.appendChild(comentarioDiv);
            claseCell.title = clase.comentario;
          }
          
          gridContainer.appendChild(claseCell);
          
          console.log(`Clase añadida: ${clase.materia} en ${dia} de ${clase.inicio} a ${clase.fin}, fila ${filaIdx + 2}, span ${duracion}`);
        } else {
          // Crear celda vacía con fondo blanco
          const celdaVacia = document.createElement("div");
          celdaVacia.style.cssText = `
            grid-row: ${filaIdx + 2};
            grid-column: ${diaIdx + 2};
            background: white;
            border: 1px solid #ddd;
          `;
          gridContainer.appendChild(celdaVacia);
        }
      }
    });
  });
}

function showSchedule(nombre, btn) {
  if (activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;
  
  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  console.log(`Mostrando horario para ${nombre}:`, eventos);
  
  const contenedorId = document.getElementById('horario-espacio') ? 'horario-espacio' : 'horario-salon';
  renderCalendario(contenedorId, eventos, nombre);
}

// --- Cargar datos desde Google Sheets ---
fetch(SHEET_URL)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(rows => {
    console.log("Datos recibidos:", rows);
    horariosJSON = agrupaHorariosPorSalon(rows);
    console.log("Horarios procesados:", horariosJSON);
    
    if (Object.keys(horariosJSON).length === 0) {
      const contenedorId = document.getElementById('horario-espacio') ? 'horario-espacio' : 'horario-salon';
      document.getElementById(contenedorId).innerHTML = "<b>No hay horarios cargados.</b>";
    } else {
      renderAllButtons(horariosJSON);
      // Mostrar el primer salón por defecto
      const primerSalon = ordenSalones.map(normalizaNombre).find(nombreNorm =>
        Object.keys(horariosJSON).map(normalizaNombre).includes(nombreNorm)
      );
      let nombreReal = primerSalon
        ? Object.keys(horariosJSON).find(n => normalizaNombre(n) === primerSalon)
        : Object.keys(horariosJSON)[0];
      if (nombreReal) {
        const primerBoton = document.querySelector('#button-bar button, .submenu-salones button');
        if (primerBoton) {
          showSchedule(nombreReal, primerBoton);
        }
      }
    }
  })
  .catch(error => {
    console.error('Error cargando datos:', error);
    const contenedorId = document.getElementById('horario-espacio') ? 'horario-espacio' : 'horario-salon';
    document.getElementById(contenedorId).innerHTML = "<b>Error cargando datos.</b>";
  });

// --- BUSCADOR DE ESPACIOS LIBRES ---
function buscarEspaciosLibres(dia, horaInicio, duracionMin) {
  // Validación de horario: solo entre 08:00 y 20:00
  const [h, m] = horaInicio.split(':').map(Number);
  if (
    isNaN(h) || isNaN(m) || 
    h < horaInicio || h >= horaFin || 
    m < 0 || m > 59
  ) {
    // Si el horario no es válido, regresa un array vacío
    return [];
  }

  const libres = [];
  const iniMin = h * 60 + m;
  const finMin = iniMin + duracionMin;

  Object.keys(horariosJSON).forEach(salon => {
    const eventos = horariosJSON[salon][dia] || [];
    // Si no hay eventos, está libre todo el día
    let ocupado = eventos.some(ev => {
      // Convertir horas a minutos
      const [hin, minin] = ev.inicio.split(':');
      const [hfin, minfin] = ev.fin.split(':');
      const evIni = parseInt(hin) * 60 + parseInt(minin);
      const evFin = parseInt(hfin) * 60 + parseInt(minfin);
      // ¿Se empalman?
      return !(finMin <= evIni || iniMin >= evFin);
    });
    if (!ocupado) libres.push(salon);
  });
  return libres;
}

// Vincular al formulario de búsqueda
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('buscador-btn');
  if (btn) {
    btn.onclick = function() {
      const dia = document.getElementById('busc-dia').value;
      const hora = document.getElementById('busc-hora').value;
      const dur = parseInt(document.getElementById('busc-duracion').value);

      // Validación visual directa para el usuario
      const [h, m] = hora.split(':').map(Number);
      if (
        isNaN(h) || isNaN(m) || 
        h < horaInicio || h >= horaFin || 
        m < 0 || m > 59
      ) {
        document.getElementById('resultado-buscador').innerHTML = `<b>El horario debe estar entre 08:00 y 20:00, con formato HH:MM.</b>`;
        return;
      }

      const libres = buscarEspaciosLibres(dia, hora, dur);
      const resDiv = document.getElementById('resultado-buscador');
      if (libres.length) {
        resDiv.innerHTML = `<b>Espacios libres:</b> ${libres.map(s => `<span style="margin-right:8px;">${s}</span>`).join('')}`;
      } else {
        resDiv.innerHTML = `<b>No hay espacios libres en ese horario 😢</b>`;
      }
    };
  }
});
