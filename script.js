const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
// 08:00 a 20:00, intervalos de 30 minutos
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
        inicio: row["Inicio"] || row["inicio"] || "",
        fin: row["Fin"] || row["fin"] || "",
        tipo: row["tipo"] || "",
        comentario: row["comentario"] || ""
      });
    }
  });
  return resultado;
}

function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar');
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

// ¡NUEVA función tipo calendario!
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

  // Crear tabla tipo grid
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

  // Matriz para saber en qué celdas ya hay rowSpan
  const ocupadas = Array.from({length:intervalos.length},()=>dias.map(()=>false));

  // Body
  const tbody = document.createElement("tbody");
  tabla.appendChild(tbody);

  intervalos.forEach(({inicio,fin}, fila) => {
    const tr = document.createElement("tr");
    // Columna hora
    tr.innerHTML = `<td>${inicio} - ${fin}</td>`;
    dias.forEach((dia, colDia) => {
      if (ocupadas[fila][colDia]) return; // Esta celda ya está ocupada por rowSpan
      // ¿Hay clase que empieza justo aquí?
      const clase = data.find(ev => ev.dia === dia && ev.inicio === inicio);
      if(clase) {
        // ¿Cuántos intervalos ocupa?
        let duracion = 1;
        let t = inicio;
        while(true) {
          // Nueva hora
          const [h,m] = t.split(":").map(Number);
          let next;
          if(m === 0) next = `${String(h).padStart(2,'0')}:30`;
          else next = `${String(h+1).padStart(2,'0')}:00`;
          if(next === clase.fin) break;
          duracion++;
          t = next;
        }
        // Marca intervalos ocupados
        for(let k=0;k<duracion;k++) if(fila+k<ocupadas.length) ocupadas[fila+k][colDia]=true;
        // Dibuja bloque
        const td = document.createElement("td");
        td.rowSpan = duracion;
        td.className = clase.tipo === "extraordinaria" ? "bloque-clase extraordinaria" : "bloque-clase";
        td.innerHTML = `<b>${clase.materia}</b><br><span style="font-size:12px">${clase.inicio} - ${clase.fin}</span>`;
        if(clase.comentario) td.title = clase.comentario;
        tr.appendChild(td);
      } else {
        const td = document.createElement("td");
        tr.appendChild(td);
      }
    });
    tbody.appendChild(tr);
  });
}

function showSchedule(nombre, btn) {
  if(activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;
  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  renderCalendario('horario-espacio', eventos, nombre);
}

// --- Cargar datos desde Google Sheets ---
fetch(SHEET_URL)
  .then(r=>r.json())
  .then(rows=>{
    horariosJSON = agrupaHorariosPorSalon(rows);
    if (Object.keys(horariosJSON).length === 0) {
      document.getElementById('horario-espacio').innerHTML = "<b>No hay horarios cargados.</b>";
    } else {
      renderAllButtons(horariosJSON);
    }
  }).catch(e=>{
    document.getElementById('horario-espacio').innerHTML = "<b>Error cargando datos.</b>";
    console.error(e);
  });

