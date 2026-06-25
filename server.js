const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'flowers.json');

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Cargar flores existentes al inicio
let flowers = [];
if (fs.existsSync(DB_FILE)) {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    flowers = JSON.parse(data);
    console.log(`Cargadas ${flowers.length} flores desde la persistencia.`);
  } catch (err) {
    console.error('Error al leer flowers.json, iniciando vacío:', err);
    flowers = [];
  }
}

// Comprueba si una coordenada normalizada interfiere con el área o el crecimiento sobre el logo en una pantalla de referencia 1920x1080
function overlapsLogo(testX, testY) {
  const W = 1920;
  const H = 1080;
  const cx = W * 0.5;
  const cy = H * 0.45;
  const logoR = H * 0.35; // 378px (70% de la menor dimensión / 2)
  
  const x = testX * W;
  const y = testY * H;
  
  // 1. Validar colisión de la base de la semilla con el logo (margen de 25px)
  const dxBase = x - cx;
  const dyBase = y - cy;
  const dBase = Math.sqrt(dxBase * dxBase + dyBase * dyBase);
  if (dBase < logoR + 25) return true;
  
  // 2. Validar colisión de la cabeza de la flor (crece hacia arriba unos 130px de media en promedio con un margen de 45px)
  const headX = x;
  const headY = y - 130;
  const dxHead = headX - cx;
  const dyHead = headY - cy;
  const dHead = Math.sqrt(dxHead * dxHead + dyHead * dyHead);
  if (dHead < logoR + 45) return true;
  
  return false;
}

// Función para obtener coordenadas normalizadas espaciadas de forma inteligente (evitando superposición con el logo central y otras flores)
function getSpacedCoordinates(existingFlowers) {
  let bestX = Math.random() * 0.8 + 0.1;
  let bestY = Math.random() * 0.65 + 0.15;
  let maxMinDistance = -1;

  // Probar 100 posiciones aleatorias para buscar una que esté fuera del logo central y óptimamente espaciada
  for (let i = 0; i < 100; i++) {
    const testX = Math.random() * 0.8 + 0.1;
    const testY = Math.random() * 0.65 + 0.15;
    
    // Evitar el área ocupada por el logo y el crecimiento de la flor hacia él
    if (overlapsLogo(testX, testY)) {
      continue;
    }

    let minDistance = Infinity;
    for (const f of existingFlowers) {
      const dx = testX - f.x;
      const dy = testY - f.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDistance) {
        minDistance = d;
      }
    }

    if (minDistance > maxMinDistance) {
      maxMinDistance = minDistance;
      bestX = testX;
      bestY = testY;
    }
  }

  return { x: bestX, y: bestY };
}

// Función para persistir de forma segura en archivo
function saveFlowers() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(flowers, null, 2), 'utf8');
  } catch (err) {
    console.error('Error al guardar flowers.json:', err);
  }
}

// Sockets para comunicación bidireccional en tiempo real
io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);

  // Enviar flores actuales al cliente que se conecta
  socket.emit('initial_flowers', flowers);

  // Escuchar cuando un cliente planta una semilla
  socket.on('plant_seed', (data) => {
    const textInput = (data.text || '').trim().substring(0, 30);
    if (!textInput) {
      socket.emit('error_message', { message: 'El texto no puede estar vacío.' });
      return;
    }

    // Calcular coordenadas espacialmente distribuidas
    const coords = getSpacedCoordinates(flowers);

    // Crear la nueva flor
    const newFlower = {
      id: Date.now() + '-' + Math.floor(Math.random() * 1000),
      text: textInput,
      x: coords.x,
      y: coords.y,
      seed: Math.floor(Math.random() * 1000000), // Semilla aleatoria única
      timestamp: new Date().toISOString()
    };

    flowers.push(newFlower);
    saveFlowers();

    // Transmitir flor a TODOS los clientes conectados en tiempo real
    io.emit('grow_flower', newFlower);
    console.log(`Nueva flor plantada por aporte: "${textInput}" en (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)})`);
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Obtener las IPs locales para facilitar la conexión multidispositivo en una instalación local
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    }
  }
  return addresses;
}

server.listen(PORT, () => {
  console.log('\n==================================================');
  console.log(`Servidor de la instalación artística UNQ iniciado.`);
  console.log(`Puerto local: http://localhost:${PORT}`);
  
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log('\nAcceso desde dispositivos en la misma red local (Wi-Fi):');
    localIPs.forEach(ip => {
      console.log(`  http://${ip}:${PORT}`);
    });
  }
  console.log('==================================================\n');
});
