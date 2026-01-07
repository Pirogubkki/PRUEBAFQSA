const dias = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];
const HORA_INICIO = 7;
const HORA_FIN = 20;

// Orden personalizado para los botones
const ordenSalones = [
  "Salon 1", "Salon 2", "Salon 3", "Salon 4", "Salon 5", "Salon 6",
  "Salon 7", "Salon 8", "Salon 9", "Salon 10", "Salon 11", "Salon 12",
  "Laboratorio 1", "Laboratorio 2", "Laboratorio 3", "Laboratorio 4",
  "Salon De Usos Multiples"
];

// ===================== INTERVALOS =====================
const intervalos = [];
for (let h = HORA_INICIO; h < HORA_FIN; h++) {
  intervalos.push({ inicio: `${String(h).padStart(2,'0')}:00`, fin: `${String(h).padStart(2,'0')}:30` });
  intervalos.push({ inicio: `${String(h).padStart(2,'0')}:30`, fin: `${String(h+1).padStart(2,'0')}:00` });
}

let horariosJSON = {};
let activeButton = null;

// URL Google Sheets
const SHEET_URL = "https://opensheet.elk.sh/1fDuIQUaqOSTsXPbwBrB7s5V7yfZZGfF0jUXcVS_WIJs/2";

// ===================== NORMALIZADORES =====================
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
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
    .replace(/\b([a-z])/g, l => l.toUpperCase());
}

function normalizaHora(horaStr) {
  if (!horaStr) return "";
  const [h, m] = horaStr.trim().split(":");
  return `${String(h).padStart(2,'0')}:${m}`;
}

function normalizaNombre(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ===================== DURACIÓN =====================
function calcularDuracionEnIntervalos(inicio, fin) {
  const inicioIdx = intervalos.findIndex(i => i.inicio === inicio);
  const finIdx = intervalos.findIndex(i => i.fin === fin);
  if (inicioIdx === -1 || finIdx === -1) return 1;
  return finIdx - inicioIdx + 1;
}

// ===================== AGRUPAR HORARIOS =====================
function agrupaHorariosPorSalon(rows) {
  const resultado = {};
  rows.forEach(row => {
    const salon = normalizaSalon((row["Salon"] || row["Salón"] || "").trim());
    const dia = normalizaDia((row["Dia"] || row["día"] || "").trim());
    if (!salon || !dia) return;

    if (!resultado[salon]) {
      resultado[salon] = { capacidad: row["capacidad"] ? Number(row["capacidad"]) : undefined };
      dias.forEach(d => resultado[salon][d] = []);
    }

    if (dias.includes(dia)) {
      const inicio = normalizaHora(row["Inicio"]);
      const fin = normalizaHora(row["Fin"]);
      if (inicio && fin) {
        resultado[salon][dia].push({
          materia: row["Materia"] || "",
          inicio,
          fin,
          tipo: row["tipo"] || "",
          comentario: row["comentario"] || ""
        });
      }
    }
  });
  return resultado;
}

// ===================== BOTONES =====================
function renderAllButtons(horarios) {
  const bar = document.getElementById('button-bar') || document.getElementById('submenu-salones');
  bar.innerHTML = "";

  const mapa = {};
  Object.keys(horarios).forEach(n => mapa[normalizaNombre(n)] = n);

  ordenSalones.forEach(n => {
    const real = mapa[normalizaNombre(n)];
    if (real) {
      const btn = document.createElement("button");
      btn.textContent = real;
      btn.onclick = () => showSchedule(real, btn);
      bar.appendChild(btn);
    }
  });
}

// ===================== CONVERSIÓN EVENTOS =====================
function convertirADatosEventos(nombre, horariosSalon) {
  const eventos = [];
  dias.forEach(dia => {
    horariosSalon[dia].forEach(clase => {
      eventos.push({ dia, ...clase });
    });
  });
  return eventos;
}

// ===================== CALENDARIO =====================
function renderCalendario(id, data, nombre) {
  const cont = document.getElementById(id);
  cont.innerHTML = "";
  cont.className = "horario-container";

  const titulo = document.createElement("h2");
  titulo.textContent = nombre;
  cont.appendChild(titulo);

  const grid = document.createElement("div");
  grid.className = "horario-grid";
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `120px repeat(${dias.length}, 1fr)`;
  grid.style.gridTemplateRows = `auto repeat(${intervalos.length}, 40px)`;
  cont.appendChild(grid);

  grid.appendChild(Object.assign(document.createElement("div"), { textContent: "Hora" }));
  dias.forEach(d => grid.appendChild(Object.assign(document.createElement("div"), { textContent: d })));

  const ocupadas = new Set();

  intervalos.forEach((intv, fila) => {
    const hora = document.createElement("div");
    hora.textContent = `${intv.inicio} - ${intv.fin}`;
    hora.style.gridRow = fila + 2;
    hora.style.gridColumn = 1;
    grid.appendChild(hora);

    dias.forEach((dia, col) => {
      if (ocupadas.has(`${fila}-${col}`)) return;

      const clase = data.find(ev => ev.dia === dia && ev.inicio === intv.inicio);
      if (clase) {
        const dur = calcularDuracionEnIntervalos(clase.inicio, clase.fin);
        for (let i = 0; i < dur; i++) ocupadas.add(`${fila+i}-${col}`);

        const cell = document.createElement("div");
        cell.style.gridRow = `${fila+2} / span ${dur}`;
        cell.style.gridColumn = col + 2;
        cell.textContent = `${clase.materia}\n${clase.inicio} - ${clase.fin}`;
        cell.style.background = "#cde";
        grid.appendChild(cell);
      } else {
        const empty = document.createElement("div");
        empty.style.gridRow = fila + 2;
        empty.style.gridColumn = col + 2;
        grid.appendChild(empty);
      }
    });
  });
}

// ===================== MOSTRAR SALÓN =====================
function showSchedule(nombre, btn) {
  if (activeButton) activeButton.classList.remove("active");
  btn.classList.add("active");
  activeButton = btn;

  const eventos = convertirADatosEventos(nombre, horariosJSON[nombre]);
  renderCalendario("horario-espacio", eventos, nombre);
}

// ===================== CARGA DATOS =====================
fetch(SHEET_URL)
  .then(r => r.json())
  .then(rows => {
    horariosJSON = agrupaHorariosPorSalon(rows);
    renderAllButtons(horariosJSON);
    const primer = Object.keys(horariosJSON)[0];
    if (primer) showSchedule(primer, document.querySelector("button"));
  });

// ===================== BUSCADOR =====================
function buscarEspaciosLibres(dia, horaStr, duracionMin) {
  const [h, m] = horaStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h < HORA_INICIO || h >= HORA_FIN) return [];

  const ini = h * 60 + m;
  const fin = ini + duracionMin;

  return Object.keys(horariosJSON).filter(salon => {
    return !horariosJSON[salon][dia].some(ev => {
      const [hi, mi] = ev.inicio.split(":").map(Number);
      const [hf, mf] = ev.fin.split(":").map(Number);
      const eIni = hi * 60 + mi;
      const eFin = hf * 60 + mf;
      return !(fin <= eIni || ini >= eFin);
    });
  });
}

// ===================== EVENTO BUSCADOR =====================
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("buscador-btn");
  if (!btn) return;

  btn.onclick = () => {
    const dia = document.getElementById("busc-dia").value;
    const hora = document.getElementById("busc-hora").value;
    const dur = parseInt(document.getElementById("busc-duracion").value);

    const libres = buscarEspaciosLibres(dia, hora, dur);
    document.getElementById("resultado-buscador").innerHTML =
      libres.length
        ? `<b>Espacios libres:</b> ${libres.join(", ")}`
        : `<b>No hay espacios libres 😢</b>`;
  };
});
