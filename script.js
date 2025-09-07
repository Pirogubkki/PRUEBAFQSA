const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const horas = Array.from({length:13}, (_,i)=>8+i);

let horariosJSON = {};
let activeButton = null;

// Usa tu URL de Google Sheet (con la pestaña "1"):
const SHEET_URL = "https://opensheet.elk.sh/1J8gZdT3VF1DJZ37kxTo8LRw7-2VOFfFSDc5Iu2YFVWQ/1";

// Esta función agrupa las filas por salón y día
function agrupaHorariosPorSalon(rows) {
  const resultado = {};
  rows.forEach(row => {
    // Ajusta aquí los nombres EXACTOS según tu hoja de cálculo
    const salon = row["Salon"] || row["Salón"] || row["salon"];
    const dia = row["Dia"] || row["día"] || row["dia"];
    if (!salon || !dia) return;
    if (!resultado[salon]) {
      resultado[salon] = {capacidad: row["capacidad"] ? Number(row["capacidad"]) : undefined};
      dias.forEach(d => resultado[salon][d] = []);
    }
    if (dias.includes(dia)) {
      resultado[salon][dia].push({
        materia: row["Materia"] || row["materia"],
        inicio: row["Inicio"] || row["inicio"],
        fin: row["Fin"] || row["fin"],
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

function renderCalendario(id, data, nombre) {
  const cont = document.getElementById(id);
  cont.innerHTML = "";
  cont.className = "horario-container";
  // Title & capacidad (if exists)
  const tit = document.createElement("h2");
  tit.textContent = nombre;
  cont.appendChild(tit);
  if (horariosJSON[nombre] && horariosJSON[nombre].capacidad)
    cont.innerHTML += `<div style="font-size:15px; color:#388;">Capacidad: ${horariosJSON[nombre].capacidad} alumnos</div>`;
  // Table
  const cal = document.createElement("div");
  cal.className = "calendario";
  cont.appendChild(cal);
  cal.appendChild(document.createElement("div"));
  dias.forEach(d => {
    const diaHead = document.createElement("div");
    diaHead.textContent = d;
    diaHead.className = "dia-header";
    cal.appendChild(diaHead);
  });
  horas.forEach(h => {
    const horaDiv = document.createElement("div");
    horaDiv.textContent = `${h}:00`;
    horaDiv.className = "hora";
    cal.appendChild(horaDiv);
    dias.forEach(() => {
      const celda = document.createElement("div");
      cal.appendChild(celda);
    });
  });
  data.forEach((ev, idx) => {
    const diaIndex = dias.indexOf(ev.dia) + 2;
    const inicio = parseFloat(ev.inicio.replace(":30",".5").replace(":00",".0"));
    const fin = parseFloat(ev.fin.replace(":30",".5").replace(":00",".0"));
    const rowStart = Math.floor((inicio-8)*2)+2; 
    const duration = (fin - inicio)*2;
    const evento = document.createElement("div");
    evento.className = `evento color-${ev.tipo === "extraordinaria" ? 3 : ((idx % 5)+1)}`;
    evento.style.gridColumn = diaIndex;
    evento.style.gridRow = `${rowStart} / span ${duration}`;
    evento.textContent = ev.materia;
    if (ev.comentario) evento.title = ev.comentario;
    cal.appendChild(evento);
  });
}

function showSchedule(nombre, btn) {
  if(activeButton) activeButton.classList.remove('active');
  btn.classList.add('active');
  activeButton = btn;
  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  renderCalendario('horario-espacio', eventos, nombre);
}

// --- Cargar desde Google Sheets ---
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
