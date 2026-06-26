// ===================================================================
// CONFIGURACIÓN DE CONECTIVIDAD Y ESTADO (SUPABASE)
// ===================================================================
const SUPABASE_URL = 'https://bchnsvnglolhueixaddw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaG5zdm5nbG9saHVlaXhhZGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTQxOTksImV4cCI6MjA5Nzk3MDE5OX0.wAeCVYinaurN12dW6MnJ1R99pb8Zl4pgR2NsyKoIDzQ';

let supabaseClient;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Cliente de Supabase inicializado correctamente.");
  } else {
    console.warn("Biblioteca de Supabase no disponible en este momento.");
  }
} catch (e) {
  console.error("Error al inicializar Supabase:", e);
}

let flowers = []; // Array de flores cargadas en el jardín
let isProjectionMode = false;
let lastFetchTime = null; // Para la sincronización incremental


// Configuración de animación y crecimiento
const ANIM_DURATION_FRAMES = 360; // 6 segundos a 60fps

// Paletas de colores curadas (Cálidas, orgánicas y contrastantes con el ladrillo)
const PALETTES = [
  {
    name: 'Atardecer Cálido',
    petals: ['#E25B45', '#F2994A', '#EB5757', '#F2C94C'],
    center: '#FFE599',
    detail: '#E25B45'
  },
  {
    name: 'Primavera Suave',
    petals: ['#D5A6BD', '#C27BA0', '#8E7CC3', '#A4C2F4'],
    center: '#FFE599',
    detail: '#8E7CC3'
  },
  {
    name: 'Bosque Místico',
    petals: ['#76A5AF', '#93C47D', '#A2C4C9', '#F4CCCC'],
    center: '#FFE599',
    detail: '#76A5AF'
  },
  {
    name: 'Identidad UNQ',
    petals: ['#A6192E', '#D99694', '#990000', '#F2C94C'],
    center: '#FFFFFF',
    detail: '#A6192E'
  },
  {
    name: 'Comunidad Viva',
    petals: ['#E06666', '#F6B26B', '#8E7CC3', '#76A5AF'],
    center: '#F2C94C',
    detail: '#E06666'
  }
];

// Flores iniciales para el modo "casi vacío" (si no hay datos en local/server)
const INITIAL_MOCK_FLOWERS = [];

// ===================================================================
// MOTOR PSEUDO-ALEATORIO DETERMINISTA (LCG)
// ===================================================================
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  nextRange(min, max) {
    return min + this.next() * (max - min);
  }
  nextChoice(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// Genera un hash numérico a partir de un string
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// ===================================================================
// ESTADO DE CONEXIÓN A BASE DE DATOS
// ===================================================================
// La conectividad se gestiona a través de consultas HTTPS directas a Supabase


// ===================================================================
// INICIALIZACIÓN DE LA INTERFAZ
// ===================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  isProjectionMode = urlParams.get('mode') === 'screen' || urlParams.get('mode') === 'projection';
  
  updateDOMForMode();
  setupFormListeners();
  
  if (supabaseClient) {
    // Cargar todas las flores del jardín compartido
    await loadSupabaseFlowers();
    // Iniciar sincronización automática cada 5 segundos
    setInterval(syncNewFlowers, 5000);
  } else {
    console.error("No se pudo conectar a la base de datos colectiva (Supabase).");
  }
});

function updateDOMForMode() {
  const body = document.body;
  const qrInfo = document.getElementById('projection-info');
  
  if (isProjectionMode) {
    body.classList.add('mode-projection');
    body.classList.remove('show-form');
    body.classList.add('show-garden');
    qrInfo.classList.add('show');
  } else {
    body.classList.remove('mode-projection');
    body.classList.add('show-form');
    body.classList.remove('show-garden');
    qrInfo.classList.remove('show');
  }
  
  // Generar QR dinámico
  if (isProjectionMode) {
    const hostUrl = window.location.origin + window.location.pathname;
    document.getElementById('qr-url-text').innerText = hostUrl.replace(/^https?:\/\//, '');
    const qrImg = document.getElementById('qr-image');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(hostUrl)}&color=A6192E`;
  }
}

function setupFormListeners() {
  const input = document.getElementById('contribution-input');
  const counter = document.querySelector('.input-char-counter');
  
  if (input && counter) {
    input.addEventListener('input', () => {
      const len = input.value.length;
      counter.innerText = `${len} / 30`;
      counter.style.color = len >= 30 ? '#A6192E' : 'var(--text-muted)';
    });
  }
}

// Transición fluida al jardín colectivo
function transitionToGarden() {
  if (!isProjectionMode) {
    document.body.classList.remove('show-form');
    document.body.classList.add('show-garden');
  }
}

// Retorno a la pantalla de participación
function returnToForm() {
  document.body.classList.remove('show-garden');
  document.body.classList.add('show-form');
  
  const input = document.getElementById('contribution-input');
  if (input) {
    input.value = '';
    input.disabled = false;
    document.querySelector('.input-char-counter').innerText = '0 / 30';
    setTimeout(() => input.focus(), 800);
  }
}

// Envío del aporte
async function handleFormSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('contribution-input');
  const btn = document.getElementById('btn-submit');
  const text = input.value.trim();
  
  if (text) {
    btn.disabled = true;
    input.disabled = true;
    
    // TRANSICIÓN AL JARDÍN INMEDIATA PARA VER EL CRECIMIENTO
    transitionToGarden();
    
    if (supabaseClient) {
      await plantFlower(text);
    } else {
      console.warn("Supabase no inicializado, no se pudo guardar.");
    }
    
    showSuccessNotification();
    
    // Habilitar de nuevo tras un delay
    setTimeout(() => {
      btn.disabled = false;
    }, 1500);
  }
}

function showSuccessNotification() {
  const notif = document.getElementById('success-notification');
  notif.classList.add('show');
  setTimeout(() => {
    notif.classList.remove('show');
  }, 4000);
}

function toggleScreenMode() {
  isProjectionMode = !isProjectionMode;
  const newUrl = isProjectionMode 
    ? `${window.location.pathname}?mode=screen` 
    : window.location.pathname;
  window.history.pushState({}, '', newUrl);
  updateDOMForMode();
  
  if (typeof resizeCanvasAndBG === 'function') {
    resizeCanvasAndBG();
  }
}

// ===================================================================
// LÓGICA DE PERSISTENCIA Y SINCRONIZACIÓN CON SUPABASE
// ===================================================================
async function loadSupabaseFlowers() {
  try {
    const { data, error } = await supabaseClient
      .from('flowers')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) throw error;
    
    if (data) {
      flowers = data.map(f => createFlowerObject({
        id: f.id,
        text: f.text,
        x: Number(f.x),
        y: Number(f.y),
        seed: Number(f.seed),
        timestamp: f.created_at
      }, true));
      
      if (data.length > 0) {
        lastFetchTime = data[data.length - 1].created_at;
      }
      console.log(`Cargadas ${flowers.length} flores desde la base de datos de Supabase.`);
    }
  } catch (err) {
    console.error("Error al cargar flores de Supabase:", err);
  }
}

async function syncNewFlowers() {
  try {
    let query = supabaseClient
      .from('flowers')
      .select('*');
      
    if (lastFetchTime) {
      query = query.gt('created_at', lastFetchTime);
    }
    
    const { data, error } = await query.order('created_at', { ascending: true });
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      data.forEach(f => {
        // Evitar duplicar flores existentes
        if (!flowers.some(existing => existing.id === f.id)) {
          const newFlower = createFlowerObject({
            id: f.id,
            text: f.text,
            x: Number(f.x),
            y: Number(f.y),
            seed: Number(f.seed),
            timestamp: f.created_at
          }, false); // false para animar crecimiento
          flowers.push(newFlower);
        }
      });
      
      lastFetchTime = data[data.length - 1].created_at;
      console.log(`Sincronizadas ${data.length} flores nuevas desde Supabase.`);
    }
  } catch (err) {
    console.error("Error al sincronizar nuevas flores de Supabase:", err);
  }
}

// Comprueba si una coordenada interfiere con el logo en el espacio virtual (margen mínimo de 10px)
function overlapsLogoLocal(testX, testY, W, H) {
  const cx = W * 0.5;
  // Usar siempre centro de 0.4 en el espacio virtual para consistencia
  const cy = H * 0.4;
  const logoR = min(W, H) * 0.35; // 70% de la menor dimensión / 2
  
  const x = testX * W;
  const y = testY * H;
  
  // 1. Validar colisión de la base de la semilla con el logo (margen mínimo de 10px)
  const dxBase = x - cx;
  const dyBase = y - cy;
  const dBase = Math.sqrt(dxBase * dxBase + dyBase * dyBase);
  if (dBase < logoR + 10) return true;
  
  // 2. Validar colisión de la cabeza de la flor (crece hacia arriba unos 125px con margen mínimo de 10px)
  const headX = x;
  const headY = y - 125;
  const dxHead = headX - cx;
  const dyHead = headY - cy;
  const dHead = Math.sqrt(dxHead * dxHead + dyHead * dyHead);
  if (dHead < logoR + 10) return true;
  
  return false;
}

// Algoritmo local de generación radial concéntrica de mejor candidato en coordenadas virtuales (1920x1080)
function getSpacedCoordinatesLocal() {
  const W = 1920;
  const H = 1080;
  const cx = W * 0.5; // 960
  const cy = H * 0.4; // 432 (siempre usar el centro virtual standard de 0.4 para consistencia)
  const logoR = H * 0.35; // 378
  
  let bestX = cx / W;
  let bestY = cy / H;
  let maxMinDistance = -1;
  let foundValid = false;

  const minY = 0.15;
  const maxY = 0.85;

  // Probar 150 candidatos para buscar la mejor distribución radial espaciada en el anillo
  for (let i = 0; i < 150; i++) {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random();
    
    // Radio del anillo
    const ringInner = logoR + 10; // Zona de exclusión mínima de 10px
    const ringOuter = logoR + H * 0.45; // 378 + 486 = 864px
    const ringWidth = ringOuter - ringInner;
    
    // Usar u^2 para agrupar denso cerca del logo (u^2 es cercano a 0)
    const d = ringInner + ringWidth * (u * u);
    
    const px = cx + d * Math.cos(theta);
    const py = cy + d * Math.sin(theta);
    
    const testX = px / W;
    const testY = py / H;
    
    // Limitar a márgenes de la zona segura virtual
    if (testX < 0.05 || testX > 0.95 || testY < minY || testY > maxY) {
      continue;
    }
    
    // Validar colisión base y cabeza con el logo en coordenadas virtuales (W=1920, H=1080)
    if (overlapsLogoLocal(testX, testY, W, H)) {
      continue;
    }

    let minDistance = Infinity;
    for (const f of flowers) {
      const dx = testX - f.normX;
      const dy = testY - f.normY;
      const distVal = Math.sqrt(dx * dx + dy * dy);
      if (distVal < minDistance) {
        minDistance = distVal;
      }
    }

    if (minDistance > maxMinDistance) {
      maxMinDistance = minDistance;
      bestX = testX;
      bestY = testY;
      foundValid = true;
    }
  }

  // Fallback si no hay candidato con espaciado ideal: buscar cualquier posición válida en el anillo
  if (!foundValid) {
    for (let i = 0; i < 100; i++) {
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random();
      const ringInner = logoR + 10;
      const ringOuter = logoR + H * 0.45;
      const ringWidth = ringOuter - ringInner;
      const d = ringInner + ringWidth * (u * u);
      
      const px = cx + d * Math.cos(theta);
      const py = cy + d * Math.sin(theta);
      
      const testX = px / W;
      const testY = py / H;
      
      if (testX >= 0.05 && testX <= 0.95 && testY >= minY && testY <= maxY) {
        if (!overlapsLogoLocal(testX, testY, W, H)) {
          return { x: testX, y: testY };
        }
      }
    }
    // Fallback absoluto por si acaso
    return { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.6 + 0.2 };
  }

  return { x: bestX, y: bestY };
}

async function plantFlower(text) {
  const coords = getSpacedCoordinatesLocal();
  const seed = Math.floor(Math.random() * 1000000);
  
  const newFlowerData = {
    text: text,
    x: coords.x,
    y: coords.y,
    seed: seed
  };
  
  try {
    const { data, error } = await supabaseClient
      .from('flowers')
      .insert([newFlowerData])
      .select();
      
    if (error) throw error;
    
    if (data && data.length > 0) {
      const inserted = data[0];
      
      // Mostrar inmediatamente en la pantalla local iniciándose el crecimiento
      const newFlower = createFlowerObject({
        id: inserted.id,
        text: inserted.text,
        x: Number(inserted.x),
        y: Number(inserted.y),
        seed: Number(inserted.seed),
        timestamp: inserted.created_at
      }, false); // false para que empiece a crecer
      
      flowers.push(newFlower);
      
      // Actualizar lastFetchTime
      if (!lastFetchTime || inserted.created_at > lastFetchTime) {
        lastFetchTime = inserted.created_at;
      }
      
      console.log(`Flor plantada con éxito en el jardín colectivo: "${text}"`);
    }
  } catch (err) {
    console.error("Error al guardar flor en Supabase:", err);
    alert("Hubo un error al plantar tu flor. Por favor, verifica tu conexión e inténtalo de nuevo.");
  }
}

// ===================================================================
// CREAR OBJETO FLOR INTERACTIVO
// ===================================================================
function createFlowerObject(data, isFullyGrown) {
  const rand = new SeededRandom(data.seed);
  
  // Determinar parámetros morfológicos de la flor
  const numPetals = Math.floor(rand.nextRange(5, 12));
  const petalShape = Math.floor(rand.nextRange(0, 4)); // 0: redonda, 1: punta, 2: bilobulada, 3: festoneada
  const palette = rand.nextChoice(PALETTES);
  const petalColor = rand.nextChoice(palette.petals);
  const centerColor = palette.center;
  const detailColor = palette.detail;
  const centerSize = rand.nextRange(15, 28);
  const petalLength = rand.nextRange(28, 48);
  const petalWidth = rand.nextRange(14, 28);
  const stemHeight = rand.nextRange(80, 130);
  const stemWaviness = rand.nextRange(12, 28);
  const numLeaves = Math.floor(rand.nextRange(1, 3));
  const windOffset = rand.nextRange(0, 6.28);
  
  // Influencia del texto en la escala
  const textHash = hashString(data.text);
  const textRand = new SeededRandom(textHash);
  const scaleMultiplier = textRand.nextRange(0.85, 1.25);
  
  // Si tiene doble capa de pétalos
  const hasDoubleLayer = (data.seed % 3 === 0);
  const innerLayerColor = hasDoubleLayer ? rand.nextChoice(palette.petals) : null;

  return {
    id: data.id,
    text: data.text,
    normX: data.x,
    normY: data.y,
    seed: data.seed,
    
    // Visuals
    numPetals,
    petalShape,
    petalColor,
    centerColor,
    detailColor,
    centerSize,
    petalLength,
    petalWidth,
    stemHeight,
    stemWaviness,
    numLeaves,
    windOffset,
    scaleMultiplier,
    hasDoubleLayer,
    innerLayerColor,
    
    // Animación
    growProgress: isFullyGrown ? 1.0 : 0.0,
    animFrame: isFullyGrown ? ANIM_DURATION_FRAMES : 0,
    particles: [] // Partículas para la germinación
  };
}

// ===================================================================
// MOTOR GRÁFICO - p5.js
// ===================================================================
// ===================================================================
// MOTOR GRÁFICO - p5.js
// ===================================================================
let bgGraphics;
let unqLogoImg;
let logoLoadedSuccessfully = false;

function setup() {
  const container = document.getElementById('canvas-container');
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(container);
  
  frameRate(60);
  
  // Carga nativa del logo mural PNG oficial para evitar bloqueos de CORS en modo local (file://)
  unqLogoImg = new Image();
  unqLogoImg.onload = function() {
    logoLoadedSuccessfully = true;
    console.log("Logo mural oficial cargado con éxito de forma nativa.");
    generateBrickWall(); // Regenerar la pared para pintar el logo encima
  };
  unqLogoImg.onerror = function() {
    logoLoadedSuccessfully = false;
    console.warn("Fallo al cargar logo-mural.png de forma nativa. Se usará el stencil geométrico de respaldo.");
  };
  unqLogoImg.src = 'logo-mural.png';

  generateBrickWall(); // Generación inicial
}

function draw() {
  image(bgGraphics, 0, 0);
  
  // Evitar dibujar las flores si el formulario de bienvenida está activo
  // Esto evita superposiciones de flores detrás del cuadro de texto en móvil y escritorio
  if (document.body.classList.contains('show-form') && !isProjectionMode) {
    return;
  }
  
  // Dibujar todas las flores
  for (let i = 0; i < flowers.length; i++) {
    const flower = flowers[i];
    
    // Actualizar animación
    if (flower.growProgress < 1.0) {
      flower.animFrame++;
      flower.growProgress = constrain(flower.animFrame / ANIM_DURATION_FRAMES, 0, 1);
    }
    
    drawFlower(flower);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  generateBrickWall();
}

function resizeCanvasAndBG() {
  resizeCanvas(windowWidth, windowHeight);
  generateBrickWall();
}

// Pared de ladrillos histórica ilustrada de alto contraste (UNQ)
function generateBrickWall() {
  bgGraphics = createGraphics(width, height);
  bgGraphics.noStroke();
  
  // Configuración de ladrillos
  const brickW = 100;
  const brickH = 38;
  const mortar = 4.0; // Juntas ligeramente más gruesas para destacar
  
  // Fondo de mortero/cemento arenoso claro (Alto contraste)
  bgGraphics.background('#ebdcd0');
  
  const cols = Math.ceil(width / (brickW + mortar)) + 2;
  const rows = Math.ceil(height / (brickH + mortar)) + 2;
  
  // Dibujado de ladrillos
  for (let r = 0; r < rows; r++) {
    const y = r * (brickH + mortar);
    const xOffset = (r % 2 === 0) ? 0 : -(brickW + mortar) / 2;
    
    for (let c = 0; c < cols; c++) {
      const x = c * (brickW + mortar) + xOffset;
      
      const n = noise(r * 0.35, c * 0.35);
      
      // Paleta UNQ: Rojos arcillosos profundos y ricos
      let rVal = map(n, 0, 1, 130, 160);
      let gVal = map(n, 0, 1, 40, 52);
      let bVal = map(n, 0, 1, 32, 42);
      
      // Envejecimiento/Desgaste
      const ageNoise = noise(r * 2.3, c * 1.7);
      if (ageNoise > 0.72) {
        rVal -= 38; // Ladrillo quemado/oscuro
        gVal -= 12;
        bVal -= 10;
      } else if (ageNoise < 0.28) {
        rVal += 22; // Ladrillo claro terracota
        gVal += 12;
        bVal += 8;
      }
      
      // Dibujar bloque
      bgGraphics.fill(rVal, gVal, bVal);
      bgGraphics.rect(x, y, brickW, brickH, 2.5);
      
      // Bisel de luz superior (Ilustración manual)
      bgGraphics.stroke(255, 255, 255, 30);
      bgGraphics.strokeWeight(1.2);
      bgGraphics.line(x + 1, y + 1, x + brickW - 1, y + 1);
      bgGraphics.line(x + 1, y + 1, x + 1, y + brickH - 1);
      
      // Bisel de sombra inferior/derecho
      bgGraphics.stroke(0, 0, 0, 45);
      bgGraphics.line(x + 1, y + brickH - 1, x + brickW - 1, y + brickH - 1);
      bgGraphics.line(x + brickW - 1, y + 1, x + brickW - 1, y + brickH - 1);
      bgGraphics.noStroke();
      
      // Textura granulada manual
      bgGraphics.fill(rVal - 18, gVal - 8, bVal - 8, 100);
      for (let p = 0; p < 3; p++) {
        const px = x + noise(x, p) * brickW;
        const py = y + noise(y, p) * brickH;
        const pSize = noise(px, py) * 2.5 + 1;
        bgGraphics.ellipse(px, py, pSize, pSize);
      }
      
      // Grietas finas de ilustración en algunos ladrillos
      if (noise(r * 4.8, c * 4.8) > 0.9) {
        bgGraphics.stroke(rVal - 45, gVal - 22, bVal - 22, 160);
        bgGraphics.strokeWeight(1.0);
        const gx = x + brickW * noise(r, c);
        const gy = y + brickH * noise(c, r);
        bgGraphics.line(gx, gy, gx + 8, gy + 4);
        bgGraphics.line(gx + 8, gy + 4, gx + 5, gy + 11);
        bgGraphics.noStroke();
      }
    }
  }
  
  // Dibujar el Logo Mural Pintado (Stencil de la UNQ)
  drawMuralLogo();
}

function drawMuralLogo() {
  const logoSize = min(width, height) * 0.38;
  const logoX = width * 0.5;
  const logoY = isProjectionMode ? height * 0.46 : height * 0.4;
  
  if (logoLoadedSuccessfully && unqLogoImg && unqLogoImg.width > 0) {
    // Dibujar el logo oficial PNG usando el contexto 2D nativo del canvas
    // Esto nos permite aplicar 'screen' blending para hacer transparente el fondo negro del PNG
    bgGraphics.push();
    bgGraphics.translate(logoX, logoY);
    
    // Configurar composite y transparencia nativos del canvas
    bgGraphics.drawingContext.globalCompositeOperation = 'screen';
    bgGraphics.drawingContext.globalAlpha = 0.22; // Opacidad del 22% (visible pero integrado)
    
    // Escalar el logo oficial para que sea bien grande (70% del alto menor del lienzo)
    const imgW = min(width, height) * 0.7;
    const imgRatio = unqLogoImg.height / unqLogoImg.width;
    const imgH = imgW * (imgRatio ? imgRatio : 1.0);
    
    // Dibujar centrada en (0,0)
    bgGraphics.drawingContext.drawImage(unqLogoImg, -imgW / 2, -imgH / 2, imgW, imgH);
    
    // Restaurar valores por defecto para no afectar el resto del buffer
    bgGraphics.drawingContext.globalCompositeOperation = 'source-over';
    bgGraphics.drawingContext.globalAlpha = 1.0;
    bgGraphics.pop();
  } else {
    // Stencil geométrico de respaldo (Cortesía institucional)
    bgGraphics.push();
    bgGraphics.translate(logoX, logoY);
    bgGraphics.noFill();
    bgGraphics.stroke(255, 245, 235, 18);
    bgGraphics.strokeWeight(logoSize * 0.08);
    bgGraphics.strokeCap(ROUND);
    bgGraphics.arc(0, 0, logoSize * 0.8, logoSize * 0.8, -QUARTER_PI, TWO_PI - HALF_PI - QUARTER_PI);
    bgGraphics.strokeWeight(logoSize * 0.09);
    bgGraphics.bezier(
      -logoSize * 0.08, -logoSize * 0.08,
      logoSize * 0.15, logoSize * 0.15,
      logoSize * 0.32, logoSize * 0.32,
      logoSize * 0.42, logoSize * 0.42
    );
    bgGraphics.pop();
  }
}

// ===================================================================
// DIBUJADO DE LA FLOR Y SU ANIMACIÓN ORGÁNICA
// ===================================================================
function drawFlower(flower) {
  // Recalcular posiciones de las flores según la relación de aspecto de la pantalla
  const W_ref = 1920;
  const H_ref = 1080;
  
  // Distancia y ángulo de la flor en la pantalla de referencia 16:9
  const dx_ref = (flower.normX - 0.5) * W_ref;
  const dy_ref = (flower.normY - 0.4) * H_ref;
  const d_ref = Math.sqrt(dx_ref * dx_ref + dy_ref * dy_ref);
  const theta = Math.atan2(dy_ref, dx_ref);
  
  const logoR_ref = H_ref * 0.35; // 378px
  const d_rel = Math.max(10, d_ref - logoR_ref);
  
  const cx = width * 0.5;
  const cy = isProjectionMode ? height * 0.46 : height * 0.4;
  const logoR = min(width, height) * 0.35;
  
  const currentScale = min(width, height) / H_ref;
  const d_rel_scaled = d_rel * currentScale;
  
  let x, y;
  const currentAspect = width / height;
  const referenceAspect = 16 / 9;
  const isMobile = width < 480;
  
  if (currentAspect < referenceAspect) {
    // Celulares (aspecto angosto como 9:19): estirar verticalmente para aprovechar el espacio
    const aspectFactor = referenceAspect / currentAspect;
    const verticalStretch = Math.min(1.8, Math.sqrt(aspectFactor));
    
    const rx = logoR + d_rel_scaled;
    const ry = logoR + d_rel_scaled * verticalStretch;
    
    x = cx + rx * Math.cos(theta);
    y = cy + ry * Math.sin(theta);
  } else {
    // Pantallas horizontales (escritorio 16:9 o superior)
    const r = logoR + d_rel_scaled;
    x = cx + r * Math.cos(theta);
    y = cy + r * Math.sin(theta);
  }

  // Asegurar que las coordenadas físicas calculadas se mantengan visibles en el dispositivo actual
  x = constrain(x, width * 0.05, width * 0.95);
  y = constrain(y, height * 0.15, height * 0.85);

  const p = flower.growProgress;
  
  push();
  
  // Balanceo por el viento asíncrono
  const windAngle = sin(frameCount * 0.015 + flower.windOffset) * 0.045 * p;
  translate(x, y);
  rotate(windAngle);
  
  // Reducir un 25% el tamaño de las flores en dispositivos móviles
  if (isMobile) {
    scale(0.75);
  }
  
  if (p <= 0.35) {
    // ---------------------------------------------------------------
    // ETAPAS 1 Y 2: APARECE SEMILLA Y CAE CON OSCILACIÓN
    // ---------------------------------------------------------------
    let seedY = -180;
    let currentSeedY = seedY;
    let currentSeedX = 0;
    let seedOpacity = 0;
    
    if (p <= 0.1) {
      const t = map(p, 0, 0.1, 0, 1);
      seedOpacity = map(t, 0, 1, 0, 255);
      currentSeedY = seedY;
    } else {
      const t = map(p, 0.1, 0.35, 0, 1);
      seedOpacity = 255;
      
      const easeInQuad = t * t;
      currentSeedY = lerp(seedY, 0, easeInQuad);
      
      // Balanceo lateral (hoja al viento)
      currentSeedX = sin(t * 12) * 16 * (1 - easeInQuad);
    }
    
    drawSeedParticle(currentSeedX, currentSeedY, seedOpacity);
    
  } else if (p > 0.35 && p <= 0.5) {
    // ---------------------------------------------------------------
    // ETAPA 3: GERMINACIÓN + PARTÍCULAS
    // ---------------------------------------------------------------
    const t = map(p, 0.35, 0.5, 0, 1);
    
    // Tiemblo de impacto
    const shake = sin(frameCount * 0.7) * 0.8;
    translate(shake, 0);
    
    fill(210, 150, 70);
    noStroke();
    ellipse(0, 0, 7.5, 9.5);
    
    if (flower.particles.length === 0 && t > 0.05) {
      initializeSparkles(flower);
    }
    
    updateAndDrawSparkles(flower);
    
    const sproutLen = map(t, 0, 1, 2, 14);
    const sproutW = map(t, 0, 1, 1.2, 3.5);
    stroke(130, 185, 100);
    strokeWeight(sproutW);
    noFill();
    bezier(0, 0, -2, -sproutLen * 0.4, 2, -sproutLen * 0.8, 1, -sproutLen);
    
    if (t > 0.55) {
      const leafT = map(t, 0.55, 1, 0, 1);
      noStroke();
      fill(100, 168, 75);
      push();
      translate(1, -sproutLen);
      rotate(-QUARTER_PI);
      ellipse(-2.5, 0, 4 * leafT, 2 * leafT);
      rotate(HALF_PI);
      ellipse(2.5, 0, 4 * leafT, 2 * leafT);
      pop();
    }
    
  } else if (p > 0.5) {
    // ---------------------------------------------------------------
    // ETAPAS 4 Y 5: CRECIMIENTO DE TALLO Y FLORACIÓN ELÁSTICA
    // ---------------------------------------------------------------
    let stemProgress = 1.0;
    let bloomProgress = 0.0;
    
    if (p <= 0.75) {
      stemProgress = map(p, 0.5, 0.75, 0.08, 1.0);
      bloomProgress = 0.0;
    } else {
      stemProgress = 1.0;
      const t = map(p, 0.75, 1.0, 0, 1);
      bloomProgress = elasticEaseOut(t);
    }
    
    const totalHeight = flower.stemHeight * flower.scaleMultiplier;
    const currentHeight = totalHeight * stemProgress;
    
    updateAndDrawSparkles(flower);
    
    // TALLO ONDULADO
    noFill();
    stroke(100, 155, 78);
    strokeWeight(map(stemProgress, 0, 1, 3.8, 2.5));
    
    beginShape();
    vertex(0, 0);
    const steps = 15;
    let endX = 0;
    let endY = 0;
    for (let s = 0; s <= steps * stemProgress; s++) {
      const tStep = s / steps;
      const sy = -totalHeight * tStep;
      const sx = noise(flower.seed * 0.1, tStep * 2.5) * flower.stemWaviness - (flower.stemWaviness / 2);
      vertex(sx, sy);
      if (s === Math.floor(steps * stemProgress)) {
        endX = sx;
        endY = sy;
      }
    }
    endShape();
    
    // HOJAS
    if (flower.numLeaves >= 1 && stemProgress > 0.4) {
      const h1Progress = min(1.0, (stemProgress - 0.4) * 2.5);
      const ly1 = -totalHeight * 0.35;
      const lx1 = noise(flower.seed * 0.1, 0.35 * 2.5) * flower.stemWaviness - (flower.stemWaviness / 2);
      drawStemLeaf(lx1, ly1, -QUARTER_PI - 0.2, h1Progress);
    }
    if (flower.numLeaves >= 2 && stemProgress > 0.7) {
      const h2Progress = min(1.0, (stemProgress - 0.7) * 3);
      const ly2 = -totalHeight * 0.68;
      const lx2 = noise(flower.seed * 0.1, 0.68 * 2.5) * flower.stemWaviness - (flower.stemWaviness / 2);
      drawStemLeaf(lx2, ly2, QUARTER_PI + 0.2, h2Progress);
    }
    
    // Semilla residual
    noStroke();
    fill(130, 90, 40);
    ellipse(0, 2, 7, 5.5);
    
    // FLORACIÓN
    if (bloomProgress > 0) {
      push();
      translate(endX, endY);
      scale(bloomProgress * flower.scaleMultiplier);
      
      drawPetals(flower);
      drawCenter(flower);
      
      const headGlobalX = x + endX * (bloomProgress * flower.scaleMultiplier * (isMobile ? 0.75 : 1.0));
      drawWordLabel(flower, bloomProgress, headGlobalX);
      
      pop();
    }
  }
  
  pop();
}

function drawSeedParticle(sx, sy, opacity) {
  push();
  translate(sx, sy);
  noStroke();
  
  for (let b = 3; b > 0; b--) {
    fill(255, 245, 200, (opacity / 4) * (4 - b));
    ellipse(0, 0, 7 * b, 9 * b);
  }
  
  fill(235, 170, 70, opacity);
  ellipse(0, 0, 7, 9);
  
  pop();
}

function initializeSparkles(flower) {
  const numSparkles = 10;
  for (let i = 0; i < numSparkles; i++) {
    const angle = random(0, TWO_PI);
    const speed = random(1.5, 4.0);
    flower.particles.push({
      x: 0,
      y: 0,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed - random(0.5, 1.5),
      opacity: 255,
      size: random(3.0, 6.0),
      color: random(['#FFE599', '#A4C2F4', '#93C47D', '#FFD1A9'])
    });
  }
}

function updateAndDrawSparkles(flower) {
  if (flower.particles.length === 0) return;
  
  push();
  noStroke();
  for (let i = flower.particles.length - 1; i >= 0; i--) {
    const p = flower.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.opacity -= 4.5;
    p.size = max(0.2, p.size - 0.05);
    
    if (p.opacity <= 0) {
      flower.particles.splice(i, 1);
      continue;
    }
    
    fill(color(p.color).levels[0], color(p.color).levels[1], color(p.color).levels[2], p.opacity);
    ellipse(p.x, p.y, p.size, p.size);
  }
  pop();
}

function drawStemLeaf(lx, ly, rotAngle, scaleFactor) {
  push();
  translate(lx, ly);
  rotate(rotAngle);
  scale(scaleFactor);
  
  noStroke();
  fill(115, 168, 76);
  
  beginShape();
  vertex(0, 0);
  quadraticVertex(10, -6, 20, -2);
  quadraticVertex(10, 4, 0, 0);
  endShape(CLOSE);
  
  stroke(148, 200, 105, 140);
  strokeWeight(0.8);
  line(0, 0, 16, -1.8);
  pop();
}

function drawPetals(flower) {
  const petals = flower.numPetals;
  const col = color(flower.petalColor);
  const detailCol = color(flower.detailColor);
  
  noStroke();
  
  for (let i = 0; i < petals; i++) {
    const angle = map(i, 0, petals, 0, TWO_PI);
    push();
    rotate(angle);
    
    fill(0, 0, 0, 20);
    drawPetalShape(1.8, 1.8, flower.petalLength, flower.petalWidth, flower.petalShape);
    
    fill(col);
    drawPetalShape(0, 0, flower.petalLength, flower.petalWidth, flower.petalShape);
    
    stroke(detailCol.levels[0], detailCol.levels[1], detailCol.levels[2], 130);
    strokeWeight(1.2);
    line(0, 0, flower.petalLength * 0.65, 0);
    if (petals > 6) {
      line(0, 0, flower.petalLength * 0.48, flower.petalWidth * 0.16);
      line(0, 0, flower.petalLength * 0.48, -flower.petalWidth * 0.16);
    }
    pop();
  }
  
  if (flower.hasDoubleLayer) {
    const innerCol = color(flower.innerLayerColor);
    const innerLen = flower.petalLength * 0.68;
    const innerWidth = flower.petalWidth * 0.68;
    
    for (let i = 0; i < petals; i++) {
      const angle = map(i, 0, petals, 0, TWO_PI) + (PI / petals);
      push();
      rotate(angle);
      
      fill(innerCol);
      noStroke();
      drawPetalShape(0, 0, innerLen, innerWidth, flower.petalShape);
      
      stroke(255, 255, 255, 100);
      strokeWeight(0.9);
      line(0, 0, innerLen * 0.6, 0);
      pop();
    }
  }
}

function drawPetalShape(x, y, len, w, type) {
  push();
  translate(x, y);
  noStroke();
  
  if (type === 0) {
    ellipse(len * 0.5, 0, len, w);
  } else if (type === 1) {
    beginShape();
    vertex(0, 0);
    quadraticVertex(len * 0.4, w * 0.5, len, 0);
    quadraticVertex(len * 0.4, -w * 0.5, 0, 0);
    endShape(CLOSE);
  } else if (type === 2) {
    beginShape();
    vertex(0, 0);
    bezierVertex(len * 0.35, -w * 0.65, len * 0.8, -w * 0.55, len, -w * 0.15);
    bezierVertex(len * 0.95, 0, len * 0.95, 0, len, w * 0.15);
    bezierVertex(len * 0.8, w * 0.55, len * 0.35, w * 0.65, 0, 0);
    endShape(CLOSE);
  } else if (type === 3) {
    beginShape();
    vertex(0, 0);
    quadraticVertex(len * 0.25, w * 0.45, len * 0.5, w * 0.4);
    quadraticVertex(len * 0.75, w * 0.5, len, w * 0.1);
    quadraticVertex(len * 0.9, 0, len, -w * 0.1);
    quadraticVertex(len * 0.75, -w * 0.5, len * 0.5, -w * 0.4);
    quadraticVertex(len * 0.25, -w * 0.45, 0, 0);
    endShape(CLOSE);
  }
  
  pop();
}

function drawCenter(flower) {
  const size = flower.centerSize;
  const col = color(flower.centerColor);
  const detailCol = color(flower.detailColor);
  
  push();
  
  noStroke();
  fill(0, 0, 0, 30);
  ellipse(1.5, 1.5, size, size);
  
  fill(col);
  ellipse(0, 0, size, size);
  
  fill(detailCol);
  const numDots = Math.floor(size * 0.75);
  for (let i = 0; i < numDots; i++) {
    const angle = map(i, 0, numDots, 0, TWO_PI);
    const r = size * 0.32;
    const dx = cos(angle) * r;
    const dy = sin(angle) * r;
    ellipse(dx, dy, 2.6, 2.6);
  }
  
  stroke(detailCol);
  strokeWeight(1.8);
  noFill();
  ellipse(0, 0, size * 0.25, size * 0.25);
  
  pop();
}

function drawWordLabel(flower, bloomProgress, globalX) {
  if (!flower.text) return;
  
  push();
  
  const textAlpha = map(bloomProgress, 0.72, 1.0, 0, 225, true);
  
  if (textAlpha > 0) {
    rectMode(CORNER);
    noStroke();
    fill(255, 252, 245, textAlpha * 0.78);
    
    textFont('Source Serif 4');
    textSize(11.5);
    textStyle(ITALIC);
    
    const textW = textWidth(flower.text);
    const paddingH = 6;
    const paddingV = 3;
    
    // Determinar si la flor está en la mitad derecha de la pantalla
    // Si es así, dibujamos el texto a la izquierda de la flor para evitar que se corte en el borde derecho
    const isRightHalf = globalX > width * 0.5;
    
    let labelX, lineEndX;
    if (isRightHalf) {
      labelX = -flower.petalLength - 8 - textW;
      lineEndX = labelX + textW + paddingH;
    } else {
      labelX = flower.petalLength + 8;
      lineEndX = labelX - paddingH;
    }
    
    const labelY = 4;
    
    // Dibujar el fondo de la etiqueta
    rect(labelX - paddingH, labelY - 10.5 - paddingV, textW + (paddingH * 2), 14.5 + (paddingV * 2), 4.5);
    
    // Dibujar la línea conectora
    stroke(81, 83, 74, textAlpha * 0.4);
    strokeWeight(1.2);
    line(0, 0, lineEndX, labelY - 3.5);
    
    // Dibujar el texto
    noStroke();
    fill(81, 83, 74, textAlpha);
    text(flower.text, labelX, labelY);
  }
  
  pop();
}

// ===================================================================
// FUNCIONES AUXILIARES DE EASING (SUAVIZADOS)
// ===================================================================
function elasticEaseOut(t) {
  const p = 0.3;
  return pow(2, -10 * t) * sin((t - p / 4) * (2 * PI) / p) + 1;
}
