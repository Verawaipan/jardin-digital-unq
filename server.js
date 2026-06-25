const express = require('express');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

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

app.listen(PORT, () => {
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
