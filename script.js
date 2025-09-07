const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const horaInicio = 8, horaFin = 20;

// Generar intervalos de 30 minutos
const intervalos = [];
for (let h = horaInicio; h < horaFin; h++) {
  intervalos.push({inicio:`${String(h).padStart(2,'0')}:00`, fin:`${String(h).padStart(2,'0')}:30`});
  intervalos.push({inicio:`${String(h).padStart(2,'0')}:30`, fin:`${String(h+1).padStart(2,'0')}:00`});
}

let horariosJSON = {};
let activeButton = null;

// URL de tu hoja pública
const SHEET_URL = "https://opensheet.elk.sh/1J8gZdT3VF1DJZ37kxTo8LRw7-2VOFfFSDc5Iu2YFVWQ/1";

// Normaliza día y salón
function normalizaDia(str) {
  if (!str) return "";
  str = str.toLowerCase()
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u');
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

// Función para calcular cuántos intervalos de 30 min hay entre dos horas
function calcularDuracionEnIntervalos(inicio, fin) {
  const inicioIdx = intervalos.findIndex(intervalo => intervalo.inicio === inicio);
  const finIdx = intervalos.findIndex(intervalo => intervalo.fin === fin);
  
  if (inicioIdx === -1 || finIdx === -1) return 1;
  return finIdx - inicioIdx + 1;
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
      resultado[salon][dia].push({
        materia: (row["Materia"] || row["materia"] || "").trim(),
        inicio: normalizaHora((row["Inicio"] || row["inicio"] || "").trim()),
        fin: normalizaHora((row["Fin"] || row["fin"] || "").trim()),
        tipo: (row["tipo"] || "").trim(),
        comentario: (row["comentario"] || "").trim()
      });
    }
  });
  return resultado;
}

function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar') || document.getElementById('submenu-salones');
  bar.innerHTML = "";
  Object.keys(horarios).sort().forEach(nombre => {
    const btn = document.createElement('button');
    btn.textContent = nombre;
    btn.onclick = () => showSchedule(nombre, btn);
    bar.appendChild(btn);
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

// Función renderCalendario tipo horario tabla - CORREGIDA
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

  // Crear tabla
  const tabla = document.createElement("table");
  tabla.className = "horario-tabla";
  cont.appendChild(tabla);

  // Cabecera
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  trh.innerHTML = `<th>Hora</th>`;
  dias.forEach(d => trh.innerHTML += `<th>${d}</th>`);
  thead.appendChild(trh);
  tabla.appendChild(thead);

  // Matriz para rastrear celdas ocupadas [fila][columna]
  const celdasOcupadas = Array(intervalos.length).fill(null).map(() => Array(dias.length).fill(false));

  // Cuerpo de la tabla
  const tbody = document.createElement("tbody");
  tabla.appendChild(tbody);

  // Procesar cada fila de intervalos
  for (let filaIdx = 0; filaIdx < intervalos.length; filaIdx++) {
    const intervalo = intervalos[filaIdx];
    const tr = document.createElement("tr");
    
    // Celda de hora
    const tdHora = document.createElement("td");
    tdHora.textContent = `${intervalo.inicio} - ${intervalo.fin}`;
    tr.appendChild(tdHora);

    // Procesar cada día
    for (let diaIdx = 0; diaIdx < dias.length; diaIdx++) {
      const dia = dias[diaIdx];
      
      // Si la celda ya está ocupada por una clase anterior, no crear nueva celda
      if (celdasOcupadas[filaIdx][diaIdx]) {
        continue;
      }

      // Buscar si hay una clase que comience en este intervalo y día
      const clase = data.find(ev => 
        ev.dia === dia && ev.inicio === intervalo.inicio
      );

      if (clase) {
        // Calcular duración en intervalos
        const duracion = calcularDuracionEnIntervalos(clase.inicio, clase.fin);
        
        // Marcar celdas como ocupadas
        for (let i = 0; i < duracion && (filaIdx + i) < intervalos.length; i++) {
          celdasOcupadas[filaIdx + i][diaIdx] = true;
        }

        // Crear celda de clase
        const td = document.createElement("td");
        td.rowSpan = duracion;
        td.className = "bloque-clase" + (clase.tipo === "extraordinaria" ? " extraordinaria" : "");
        
        const materiaDiv = document.createElement("div");
        materiaDiv.innerHTML = `<b>${clase.materia}</b>`;
        td.appendChild(materiaDiv);
        
        const horarioDiv = document.createElement("div");
        horarioDiv.style.fontSize = "13px";
        horarioDiv.textContent = `${clase.inicio} - ${clase.fin}`;
        td.appendChild(horarioDiv);
        
        if (clase.comentario) {
          td.title = clase.comentario;
        }
        
        tr.appendChild(td);
      } else {
        // Crear celda vacía
        const td = document.createElement("td");
        tr.appendChild(td);
      }
    }
    
    tbody.appendChild(tr);
  }
}

function showSchedule(nombre, btn) {
  if (activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;
  
  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
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
      const primerSalon = Object.keys(horariosJSON)[0];
      if (primerSalon) {
        const primerBoton = document.querySelector('#button-bar button, .submenu-salones button');
        if (primerBoton) {
          showSchedule(primerSalon, primerBoton);
        }
      }
    }
  })
  .catch(error => {
    console.error('Error cargando datos:', error);
    const contenedorId = document.getElementById('horario-espacio') ? 'horario-espacio' : 'horario-salon';
    document.getElementById(contenedorId).innerHTML = "<b>Error cargando datos.</b>";
  });
