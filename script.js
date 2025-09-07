const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const horaInicio = 8, horaFin = 20;
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
    .replace(/[á]/g,'a').replace(/[é]/g,'e').replace(/[í]/g,'i').replace(/[ó]/g,'o').replace(/[ú]/g,'u');
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function normalizaSalon(str) {
  if (!str) return "";
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\b([a-z])/g, l => l.toUpperCase());
}

// Normaliza hora para tener dos dígitos en la hora
function normalizaHora(horaStr) {
  if (!horaStr) return "";
  const parts = horaStr.split(':');
  if (parts[0].length === 1) {
    parts[0] = '0' + parts[0];
  }
  return parts.join(':');
}

// Convierte array plano a formato por salón y día
function agrupaHorariosPorSalon(rows) {
  const resultado = {};
  rows.forEach(row => {
    const salon = normalizaSalon(row["Salon"] || row["Salón"] || row["salon"]);
    const dia = normalizaDia(row["Dia"] || row["día"] || row["dia"]);
    if (!salon || !dia) return;
    if (!resultado[salon]) {
      resultado[salon] = {capacidad: row["capacidad"] ? Number(row["capacidad"]) : undefined};
      dias.forEach(d => resultado[salon][d] = []);
    }
    if (dias.includes(dia)) {
      resultado[salon][dia].push({
        materia: row["Materia"] || row["materia"] || "",
        inicio: normalizaHora(row["Inicio"] || row["inicio"] || ""),
        fin: normalizaHora(row["Fin"] || row["fin"] || ""),
        tipo: row["tipo"] || "",
        comentario: row["comentario"] || ""
      });
    }
  });
  return resultado;
}

function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar') || document.getElementById('submenu-salones'); // compatible con ambos ids
  bar.innerHTML = "";
  Object.keys(horarios).forEach(nombre => {
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

// NUEVA función renderCalendario tipo horario tabla
function renderCalendario(id, data, nombre) {
  const cont = document.getElementById(id);
  cont.innerHTML = "";
  cont.className = "horario-container";

  // Título y capacidad
  const tit = document.createElement("h2");
  tit.textContent = nombre;
  cont.appendChild(tit);
  if (horariosJSON[nombre] && horariosJSON[nombre].capacidad)
    cont.innerHTML += `<div style="font-size:15px; color:#388;">Capacidad: ${horariosJSON[nombre].capacidad} alumnos</div>`;

  // Definir intervalos de media hora
  const horaInicio = 8, horaFin = 20;
  const intervalos = [];
  for (let h = horaInicio; h < horaFin; h++) {
    intervalos.push({inicio:`${String(h).padStart(2,'0')}:00`, fin:`${String(h).padStart(2,'0')}:30`});
    intervalos.push({inicio:`${String(h).padStart(2,'0')}:30`, fin:`${String(h+1).padStart(2,'0')}:00`});
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

  // Matriz de ocupación
  const ocupadas = Array.from({length:intervalos.length}, ()=>dias.map(()=>false));

  // Cuerpo
  const tbody = document.createElement("tbody");
  tabla.appendChild(tbody);

  for (let fila = 0; fila < intervalos.length; fila++) {
    const {inicio,fin} = intervalos[fila];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${inicio} - ${fin}</td>`;

    for (let colDia = 0; colDia < dias.length; colDia++) {
      if (ocupadas[fila][colDia]) continue;

      const dia = dias[colDia];
      const clase = data.find(ev => ev.dia === dia && ev.inicio === inicio);

      if(clase) {
        // Calcular duración
        let duracion = 1;
        let t = inicio;
        while(true) {
          const [h,m] = t.split(":").map(Number);
          let next = (m === 0) ? `${String(h).padStart(2,'0')}:30` : `${String(h+1).padStart(2,'0')}:00`;
          if(next === clase.fin) break;
          duracion++;
          t = next;
        }
        // Marcar ocupadas SOLO desde la segunda fila
        for(let k=1;k<duracion;k++) if(fila+k<ocupadas.length) ocupadas[fila+k][colDia]=true;

        // Crear celda clase
        const td = document.createElement("td");
        td.rowSpan = duracion;
        td.className = "bloque-clase" + (clase.tipo === "extraordinaria" ? " extraordinaria" : "");
        td.innerHTML = `<b>${clase.materia}</b><br><span style="font-size:13px">${clase.inicio} - ${clase.fin}</span>`;
        if(clase.comentario) td.title = clase.comentario;
        tr.appendChild(td);
      } else {
        // Celda vacía solo si no está ocupada
        tr.appendChild(document.createElement("td"));
      }
    }
    tbody.appendChild(tr);
  }
}


function showSchedule(nombre, btn) {
  if(activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;
  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  // para compatibilidad con ambos ids de destino
  if(document.getElementById('horario-espacio')) {
    renderCalendario('horario-espacio', eventos, nombre);
  } else {
    renderCalendario('horario-salon', eventos, nombre);
  }
}

// --- Cargar datos desde Google Sheets ---
fetch(SHEET_URL)
  .then(r=>r.json())
  .then(rows=>{
    horariosJSON = agrupaHorariosPorSalon(rows);
    if (Object.keys(horariosJSON).length === 0) {
      if(document.getElementById('horario-espacio')) {
        document.getElementById('horario-espacio').innerHTML = "<b>No hay horarios cargados.</b>";
      } else {
        document.getElementById('horario-salon').innerHTML = "<b>No hay horarios cargados.</b>";
      }
    } else {
      renderAllButtons(horariosJSON);
    }
  }).catch(e=>{
    if(document.getElementById('horario-espacio')) {
      document.getElementById('horario-espacio').innerHTML = "<b>Error cargando datos.</b>";
    } else {
      document.getElementById('horario-salon').innerHTML = "<b>Error cargando datos.</b>";
    }
    console.error(e);
  });
