const { useState, useRef, useEffect } = React;

const MotorPorEje = () => {
  // Estados de modo
  const [modo, setModo] = useState('config'); // 'config' o 'gcode'
  
  // Estados de motores (posición en mm)
  const [motorX, setMotorX] = useState(0);
  const [motorY, setMotorY] = useState(0);
  const [motorXMin, setMotorXMin] = useState(-150);
  const [motorXMax, setMotorXMax] = useState(150);
  const [motorYMin, setMotorYMin] = useState(-150);
  const [motorYMax, setMotorYMax] = useState(150);
  
  // Configuración de la máquina
  const [pasosMotorX, setPasosMotorX] = useState(200); // pasos por revolución
  const [pasosMotorY, setPasosMotorY] = useState(200);
  const [mmPorRevX, setMmPorRevX] = useState(8); // mm por revolución (tornillo sin fin)
  const [mmPorRevY, setMmPorRevY] = useState(8);
  
  const [lapizAbajo, setLapizAbajo] = useState(false);
  const [trazos, setTrazos] = useState([]);
  const [ejecutando, setEjecutando] = useState(false);
  const [codigoGcode, setCodigoGcode] = useState('');
  const [consola, setConsola] = useState([]);
  const [velocidad, setVelocidad] = useState(1000);
  const [maquinaConfigurada, setMaquinaConfigurada] = useState(false);
  
  // Calculadora de pasos
  const [calcX, setCalcX] = useState(50);
  const [calcY, setCalcY] = useState(50);
  const [pasosCalculados, setPasosCalculados] = useState(null);
  
  const canvasRef = useRef(null);

  const BASE_X = 400;
  const BASE_Y = 300;
  const ESCALA = 1; // píxeles por mm

  useEffect(() => {
    dibujarEscena();
  }, [motorX, motorY, lapizAbajo, trazos, motorXMin, motorXMax, motorYMin, motorYMax]);

  // Convertir mm a pasos
  const mmAPasos = (mm, ejeX = true) => {
    const pasosPorMm = ejeX ? pasosMotorX / mmPorRevX : pasosMotorY / mmPorRevY;
    return Math.round(mm * pasosPorMm);
  };

  // Convertir pasos a mm
  const pasosAMm = (pasos, ejeX = true) => {
    const pasosPorMm = ejeX ? pasosMotorX / mmPorRevX : pasosMotorY / mmPorRevY;
    return pasos / pasosPorMm;
  };

  // Calcular posición en canvas
  const mmACanvas = (x, y) => {
    return {
      canvasX: BASE_X + x * ESCALA,
      canvasY: BASE_Y - y * ESCALA
    };
  };

  // Animar movimiento suave
  const animarMovimiento = (xFinal, yFinal) => {
    return new Promise(resolve => {
      const xInicio = motorX;
      const yInicio = motorY;
      const pasos = 20;
      let paso = 0;
      
      const intervalo = setInterval(() => {
        paso++;
        const progreso = paso / pasos;
        
        const nuevoX = xInicio + (xFinal - xInicio) * progreso;
        const nuevoY = yInicio + (yFinal - yInicio) * progreso;
        
        setMotorX(nuevoX);
        setMotorY(nuevoY);
        
        if (paso >= pasos) {
          clearInterval(intervalo);
          resolve();
        }
      }, 1000 / velocidad * 10);
    });
  };

  // Procesar comandos G-code
  const procesarGcode = async (codigo) => {
    const lineas = codigo.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith(';'));
    
    for (const linea of lineas) {
      const cmd = linea.split(';')[0].trim().toUpperCase();
      setConsola(prev => [...prev, `> ${cmd}`]);
      
      // G0/G1 - Movimiento
      if (cmd.startsWith('G0') || cmd.startsWith('G1')) {
        const xMatch = cmd.match(/X([-\d.]+)/);
        const yMatch = cmd.match(/Y([-\d.]+)/);
        const fMatch = cmd.match(/F([\d.]+)/);
        
        if (fMatch) setVelocidad(parseFloat(fMatch[1]));
        
        let xObj = motorX;
        let yObj = motorY;
        
        if (xMatch) xObj = parseFloat(xMatch[1]);
        if (yMatch) yObj = parseFloat(yMatch[1]);
        
        // Verificar límites
        if (xObj < motorXMin || xObj > motorXMax || yObj < motorYMin || yObj > motorYMax) {
          setConsola(prev => [...prev, `    ERROR: Fuera de límites (X: ${motorXMin} a ${motorXMax}, Y: ${motorYMin} a ${motorYMax})`]);
        } else {
          await animarMovimiento(xObj, yObj);
          
          if (lapizAbajo) {
            const { canvasX, canvasY } = mmACanvas(xObj, yObj);
            setTrazos(prev => [...prev, { x: canvasX, y: canvasY }]);
          }
          
          const pasosX = mmAPasos(xObj, true);
          const pasosY = mmAPasos(yObj, false);
          
          setConsola(prev => [...prev, 
            `    Movido a X:${xObj.toFixed(2)}mm Y:${yObj.toFixed(2)}mm`,
            `    (Motor X: ${pasosX} pasos | Motor Y: ${pasosY} pasos)`
          ]);
        }
      }
      
      // M3 - Bajar lápiz
      else if (cmd.startsWith('M3')) {
        setLapizAbajo(true);
        const { canvasX, canvasY } = mmACanvas(motorX, motorY);
        setTrazos(prev => [...prev, { x: canvasX, y: canvasY }]);
        setConsola(prev => [...prev, `    Lápiz ABAJO`]);
        await new Promise(r => setTimeout(r, 200));
      }
      
      // M5 - Subir lápiz
      else if (cmd.startsWith('M5')) {
        setLapizAbajo(false);
        setConsola(prev => [...prev, `    Lápiz ARRIBA`]);
        await new Promise(r => setTimeout(r, 200));
      }
      
      // G28 - Home
      else if (cmd.startsWith('G28')) {
        await animarMovimiento(0, 0);
        setConsola(prev => [...prev, `    HOME (0, 0)`]);
      }
      
      // G4 - Pausa
      else if (cmd.startsWith('G4')) {
        const pMatch = cmd.match(/P([\d.]+)/);
        const sMatch = cmd.match(/S([\d.]+)/);
        const espera = pMatch ? parseFloat(pMatch[1]) : 
                      (sMatch ? parseFloat(sMatch[1]) * 1000 : 0);
        setConsola(prev => [...prev, `    Pausa ${espera}ms`]);
        await new Promise(r => setTimeout(r, espera));
      }
      
      // G92 - Establecer posición
      else if (cmd.startsWith('G92')) {
        const xMatch = cmd.match(/X([-\d.]+)/);
        const yMatch = cmd.match(/Y([-\d.]+)/);
        
        if (xMatch) setMotorX(parseFloat(xMatch[1]));
        if (yMatch) setMotorY(parseFloat(yMatch[1]));
        
        setConsola(prev => [...prev, `    Posición establecida`]);
      }
      
      // M17/M18 - Motores
      else if (cmd.startsWith('M17')) {
        setConsola(prev => [...prev, `    Motores ON`]);
      }
      else if (cmd.startsWith('M18')) {
        setConsola(prev => [...prev, `    Motores OFF`]);
      }
    }
    
    setConsola(prev => [...prev, '  Programa completado']);
  };

  const dibujarEscena = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 800, 600);

    // Fondo
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 800, 600);

    // Área de trabajo (límites de la máquina)
    const areaMinX = BASE_X + motorXMin * ESCALA;
    const areaMaxX = BASE_X + motorXMax * ESCALA;
    const areaMinY = BASE_Y - motorYMax * ESCALA;
    const areaMaxY = BASE_Y - motorYMin * ESCALA;
    
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(areaMinX, areaMinY, areaMaxX - areaMinX, areaMaxY - areaMinY);
    ctx.strokeStyle = '#1976d2';
    ctx.lineWidth = 2;
    ctx.strokeRect(areaMinX, areaMinY, areaMaxX - areaMinX, areaMaxY - areaMinY);

    // Cuadrícula (cada 50mm)
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    for (let x = motorXMin; x <= motorXMax; x += 50) {
      const canvasX = BASE_X + x * ESCALA;
      ctx.beginPath();
      ctx.moveTo(canvasX, areaMinY);
      ctx.lineTo(canvasX, areaMaxY);
      ctx.stroke();
      
      if (x !== 0) {
        ctx.fillStyle = '#90a4ae';
        ctx.font = '10px monospace';
        ctx.fillText(`${x}`, canvasX - 10, BASE_Y + 15);
      }
    }
    
    for (let y = motorYMin; y <= motorYMax; y += 50) {
      const canvasY = BASE_Y - y * ESCALA;
      ctx.beginPath();
      ctx.moveTo(areaMinX, canvasY);
      ctx.lineTo(areaMaxX, canvasY);
      ctx.stroke();
      
      if (y !== 0) {
        ctx.fillStyle = '#90a4ae';
        ctx.font = '10px monospace';
        ctx.fillText(`${y}`, BASE_X - 25, canvasY + 3);
      }
    }
    ctx.setLineDash([]);

    // Ejes principales
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(areaMinX, BASE_Y);
    ctx.lineTo(areaMaxX, BASE_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(BASE_X, areaMinY);
    ctx.lineTo(BASE_X, areaMaxY);
    ctx.stroke();
    
    // Flechas y etiquetas de ejes
    ctx.fillStyle = '#37474f';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('X+', areaMaxX + 5, BASE_Y + 5);
    ctx.fillText('Y+', BASE_X + 5, areaMinY - 5);
    ctx.fillText('(0,0)', BASE_X + 5, BASE_Y - 5);

    // Trazos del dibujo
    ctx.strokeStyle = '#1976d2';
    ctx.lineWidth = 2;
    if (trazos.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trazos[0].x, trazos[0].y);
      for (let i = 1; i < trazos.length; i++) {
        ctx.lineTo(trazos[i].x, trazos[i].y);
      }
      ctx.stroke();
    }

    // Posición actual del efector
    const { canvasX, canvasY } = mmACanvas(motorX, motorY);

    // Representación del carro en X (riel horizontal)
    ctx.fillStyle = '#78909c';
    ctx.fillRect(areaMinX - 10, BASE_Y + 30, areaMaxX - areaMinX + 20, 15);
    
    // Carro móvil en X
    ctx.fillStyle = '#2196f3';
    ctx.fillRect(canvasX - 20, BASE_Y + 25, 40, 25);
    ctx.strokeStyle = '#0d47a1';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvasX - 20, BASE_Y + 25, 40, 25);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('X', canvasX - 4, BASE_Y + 40);

    // Representación del carro en Y (riel vertical)
    ctx.fillStyle = '#78909c';
    ctx.fillRect(BASE_X - 45, areaMinY - 10, 15, areaMaxY - areaMinY + 20);
    
    // Carro móvil en Y
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(BASE_X - 50, canvasY - 20, 25, 40);
    ctx.strokeStyle = '#1b5e20';
    ctx.lineWidth = 2;
    ctx.strokeRect(BASE_X - 50, canvasY - 20, 25, 40);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('Y', BASE_X - 41, canvasY + 3);

    // Líneas guía desde los carros hasta el efector
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    
    ctx.beginPath();
    ctx.moveTo(canvasX, BASE_Y + 25);
    ctx.lineTo(canvasX, canvasY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(BASE_X - 25, canvasY);
    ctx.lineTo(canvasX, canvasY);
    ctx.stroke();
    
    ctx.setLineDash([]);

    // Efector final (cabezal)
    ctx.fillStyle = '#ff9800';
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e65100';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Lápiz
    ctx.strokeStyle = lapizAbajo ? '#f44336' : '#607d8b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvasX, canvasY);
    ctx.lineTo(canvasX, canvasY + 20);
    ctx.stroke();

    ctx.fillStyle = lapizAbajo ? '#f44336' : '#90a4ae';
    ctx.beginPath();
    ctx.arc(canvasX, canvasY + 25, 5, 0, Math.PI * 2);
    ctx.fill();

    // Info en pantalla
    ctx.fillStyle = '#1a237e';
    ctx.font = '14px monospace';
    ctx.fillText(`Motor X: ${motorX.toFixed(2)}mm (${mmAPasos(motorX, true)} pasos)`, 10, 20);
    ctx.fillText(`Motor Y: ${motorY.toFixed(2)}mm (${mmAPasos(motorY, false)} pasos)`, 10, 40);
    ctx.fillText(`Lápiz: ${lapizAbajo ? '🔴 ABAJO' : '⚪ ARRIBA'}`, 10, 60);

    // Título
    ctx.fillStyle = '#1565c0';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('Sistema Cartesiano - Motor por Eje (X, Y)', 10, 580);
  };

  const ejecutarGcode = async () => {
    if (!codigoGcode.trim()) return;
    setEjecutando(true);
    setConsola(['=== Iniciando ejecución ===']);
    try {
      await procesarGcode(codigoGcode);
    } catch (error) {
      setConsola(prev => [...prev, `  ERROR: ${error.message}`]);
    }
    setEjecutando(false);
  };

  const limpiar = () => {
    setTrazos([]);
    setConsola([]);
  };

  const guardarConfiguracion = () => {
    setMaquinaConfigurada(true);
    setConsola(['  Configuración guardada', '  Parámetros de motores establecidos', '  Límites de trabajo configurados']);
  };

  const calcularPasos = () => {
    const pasosX = mmAPasos(calcX, true);
    const pasosY = mmAPasos(calcY, false);
    
    const alcanzable = calcX >= motorXMin && calcX <= motorXMax && 
                       calcY >= motorYMin && calcY <= motorYMax;
    
    setPasosCalculados({
      x: calcX,
      y: calcY,
      pasosX: pasosX,
      pasosY: pasosY,
      alcanzable: alcanzable
    });
    
    if (alcanzable) {
      setConsola(prev => [
        ...prev,
        `📍 Cálculo para posición (${calcX}, ${calcY}):`,
        `  Motor X: ${pasosX} pasos`,
        `  Motor Y: ${pasosY} pasos`,
        `    Posición ALCANZABLE`
      ]);
    } else {
      setConsola(prev => [
        ...prev,
        `📍 Cálculo para posición (${calcX}, ${calcY}):`,
        `    Posición FUERA DE LÍMITES`,
        `  Límites: X[${motorXMin}, ${motorXMax}] Y[${motorYMin}, ${motorYMax}]`
      ]);
    }
  };

  const moverACalculado = () => {
    if (pasosCalculados && pasosCalculados.alcanzable) {
      setMotorX(pasosCalculados.x);
      setMotorY(pasosCalculados.y);
      setConsola(prev => [...prev, `  Movido a posición calculada`]);
    }
  };

  const irAHome = () => {
    setMotorX(0);
    setMotorY(0);
    setConsola(prev => [...prev, '  Regresado a HOME (0, 0)']);
  };

  const generarCirculo = () => {
    const radio = 50;
    const cx = 0;
    const cy = 50;
    const segmentos = 36;
    
    let codigo = '; Círculo\nG28\n';
    codigo += `G0 X${cx + radio} Y${cy}\nM3\n`;
    
    for (let i = 0; i <= segmentos; i++) {
      const ang = (i / segmentos) * 2 * Math.PI;
      const x = cx + radio * Math.cos(ang);
      const y = cy + radio * Math.sin(ang);
      codigo += `G1 X${x.toFixed(2)} Y${y.toFixed(2)} F1000\n`;
    }
    
    codigo += 'M5\nG28\n';
    setCodigoGcode(codigo);
  };

  const generarCuadrado = () => {
    const tam = 80;
    const cx = 0;
    const cy = 50;
    
    let codigo = '; Cuadrado\nG28\n';
    codigo += `G0 X${cx - tam/2} Y${cy + tam/2}\nM3\n`;
    codigo += `G1 X${cx + tam/2} Y${cy + tam/2} F1000\n`;
    codigo += `G1 X${cx + tam/2} Y${cy - tam/2} F1000\n`;
    codigo += `G1 X${cx - tam/2} Y${cy - tam/2} F1000\n`;
    codigo += `G1 X${cx - tam/2} Y${cy + tam/2} F1000\n`;
    codigo += 'M5\nG28\n';
    setCodigoGcode(codigo);
  };

  const generarEstrella = () => {
    const radio = 60;
    const puntas = 5;
    const cx = 0;
    const cy = 50;
    
    let codigo = '; Estrella\nG28\n';
    
    for (let i = 0; i <= puntas * 2; i++) {
      const ang = (i / (puntas * 2)) * 2 * Math.PI - Math.PI / 2;
      const r = i % 2 === 0 ? radio : radio * 0.4;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      
      if (i === 0) {
        codigo += `G0 X${x.toFixed(2)} Y${y.toFixed(2)}\nM3\n`;
      } else {
        codigo += `G1 X${x.toFixed(2)} Y${y.toFixed(2)} F1000\n`;
      }
    }
    
    codigo += 'M5\nG28\n';
    setCodigoGcode(codigo);
  };

  const exportarArduino = () => {
    let codigo = `// CNC Cartesiano - Motor por Eje - Arduino\n`;
    codigo += `// Requiere: AccelStepper library\n\n`;
    codigo += `#include <AccelStepper.h>\n\n`;
    codigo += `// Definir pines de los motores paso a paso\n`;
    codigo += `#define MOTOR_X_STEP 2\n`;
    codigo += `#define MOTOR_X_DIR 3\n`;
    codigo += `#define MOTOR_Y_STEP 4\n`;
    codigo += `#define MOTOR_Y_DIR 5\n`;
    codigo += `#define SERVO_Z 9\n\n`;
    codigo += `// Configuración de motores\n`;
    codigo += `AccelStepper motorX(AccelStepper::DRIVER, MOTOR_X_STEP, MOTOR_X_DIR);\n`;
    codigo += `AccelStepper motorY(AccelStepper::DRIVER, MOTOR_Y_STEP, MOTOR_Y_DIR);\n\n`;
    codigo += `// Parámetros de configuración\n`;
    codigo += `const int PASOS_POR_REV = ${pasosMotorX};\n`;
    codigo += `const float MM_POR_REV = ${mmPorRevX};\n`;
    codigo += `const float PASOS_POR_MM = PASOS_POR_REV / MM_POR_REV;\n\n`;
    codigo += `void setup() {\n`;
    codigo += `  motorX.setMaxSpeed(1000);\n`;
    codigo += `  motorX.setAcceleration(500);\n`;
    codigo += `  motorY.setMaxSpeed(1000);\n`;
    codigo += `  motorY.setAcceleration(500);\n`;
    codigo += `  Serial.begin(115200);\n`;
    codigo += `  Serial.println("CNC Cartesiano Listo");\n}\n\n`;
    codigo += `void moverA(float x, float y) {\n`;
    codigo += `  long pasosX = x * PASOS_POR_MM;\n`;
    codigo += `  long pasosY = y * PASOS_POR_MM;\n`;
    codigo += `  motorX.moveTo(pasosX);\n`;
    codigo += `  motorY.moveTo(pasosY);\n`;
    codigo += `  while (motorX.distanceToGo() != 0 || motorY.distanceToGo() != 0) {\n`;
    codigo += `    motorX.run();\n`;
    codigo += `    motorY.run();\n`;
    codigo += `  }\n}\n\n`;
    codigo += `void loop() {\n`;
    codigo += `  // Posición actual: X=${motorX.toFixed(2)}mm, Y=${motorY.toFixed(2)}mm\n`;
    codigo += `  moverA(${motorX.toFixed(2)}, ${motorY.toFixed(2)});\n`;
    codigo += `  delay(1000);\n}\n`;
    
    const blob = new Blob([codigo], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cnc_motor_por_eje.ino';
    a.click();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-white rounded-xl shadow-2xl">
      <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-blue-900 to-indigo-900 bg-clip-text text-transparent">
        Sistema Cartesiano - Motor por Eje
      </h1>
      <p className="text-center text-gray-600 mb-6 italic">
        (Cartesian CNC / X-Y Gantry System)
      </p>

      {/* Selector de modo */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setModo('config')}
          className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
            modo === 'config'
              ? 'bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Configuración y Control Manual
        </button>
        <button
          onClick={() => setModo('gcode')}
          disabled={!maquinaConfigurada}
          className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
            modo === 'gcode'
              ? 'bg-gradient-to-r from-indigo-900 to-indigo-800 text-white shadow-lg'
              : maquinaConfigurada
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Ejecución G-code
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas */}
        <div className="lg:col-span-2 bg-gray-50 rounded-lg shadow-lg p-4">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full border-2 border-gray-300 rounded"
          />
        </div>

        {/* Panel de controles - MODO CONFIGURACIÓN */}
        {modo === 'config' && (
          <div className="space-y-4">
            {/* Configuración de motores */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Config. Motores</h2>
              
              <div className="space-y-3">
                <div className="bg-blue-50 p-3 rounded border border-blue-200">
                  <h3 className="font-semibold text-sm mb-2">Motor X</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600">Pasos/rev</label>
                      <input
                        type="number"
                        value={pasosMotorX}
                        onChange={(e) => setPasosMotorX(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm border rounded"
                        disabled={ejecutando}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">mm/rev</label>
                      <input
                        type="number"
                        value={mmPorRevX}
                        onChange={(e) => setMmPorRevX(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm border rounded"
                        step="0.1"
                        disabled={ejecutando}
                      />
                    </div>
                    <div className="text-xs bg-white p-2 rounded">
                      <strong>Resolución:</strong> {(pasosMotorX / mmPorRevX).toFixed(2)} pasos/mm
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <h3 className="font-semibold text-sm mb-2">Motor Y</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600">Pasos/rev</label>
                      <input
                        type="number"
                        value={pasosMotorY}
                        onChange={(e) => setPasosMotorY(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm border rounded"
                        disabled={ejecutando}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">mm/rev</label>
                      <input
                        type="number"
                        value={mmPorRevY}
                        onChange={(e) => setMmPorRevY(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm border rounded"
                        step="0.1"
                        disabled={ejecutando}
                      />
                    </div>
                    <div className="text-xs bg-white p-2 rounded">
                      <strong>Resolución:</strong> {(pasosMotorY / mmPorRevY).toFixed(2)} pasos/mm
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Límites de trabajo */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Límites</h2>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Eje X: [{motorXMin}, {motorXMax}] mm
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={motorXMin}
                      onChange={(e) => setMotorXMin(Number(e.target.value))}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      placeholder="Min"
                      disabled={ejecutando}
                    />
                    <input
                      type="number"
                      value={motorXMax}
                      onChange={(e) => setMotorXMax(Number(e.target.value))}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      placeholder="Max"
                      disabled={ejecutando}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Eje Y: [{motorYMin}, {motorYMax}] mm
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={motorYMin}
                      onChange={(e) => setMotorYMin(Number(e.target.value))}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      placeholder="Min"
                      disabled={ejecutando}
                    />
                    <input
                      type="number"
                      value={motorYMax}
                      onChange={(e) => setMotorYMax(Number(e.target.value))}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      placeholder="Max"
                      disabled={ejecutando}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Control manual */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Control Manual</h2>
              
              <div className="space-y-3">
                <div className="bg-blue-50 p-3 rounded border border-blue-200">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Posición X</span>
                    <span className="text-lg font-bold text-blue-600">{motorX.toFixed(2)} mm</span>
                  </div>
                  <input
                    type="range"
                    min={motorXMin}
                    max={motorXMax}
                    step="0.5"
                    value={motorX}
                    onChange={(e) => setMotorX(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                  <div className="text-xs text-center mt-1 text-gray-600">
                    {mmAPasos(motorX, true)} pasos
                  </div>
                </div>

                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Posición Y</span>
                    <span className="text-lg font-bold text-green-600">{motorY.toFixed(2)} mm</span>
                  </div>
                  <input
                    type="range"
                    min={motorYMin}
                    max={motorYMax}
                    step="0.5"
                    value={motorY}
                    onChange={(e) => setMotorY(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                  <div className="text-xs text-center mt-1 text-gray-600">
                    {mmAPasos(motorY, false)} pasos
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setLapizAbajo(!lapizAbajo);
                      if (!lapizAbajo) {
                        const { canvasX, canvasY } = mmACanvas(motorX, motorY);
                        setTrazos([...trazos, { x: canvasX, y: canvasY }]);
                      }
                    }}
                    className={`flex-1 px-3 py-2 rounded font-semibold ${
                      lapizAbajo
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-300 text-gray-700'
                    }`}
                    disabled={ejecutando}
                  >
                    {lapizAbajo ? 'Lápiz Abajo' : 'Lápiz Arriba'}
                  </button>
                  
                  <button
                    onClick={irAHome}
                    className="flex-1 bg-blue-900 text-white px-3 py-2 rounded font-semibold hover:bg-blue-800"
                    disabled={ejecutando}
                  >
                    Home
                  </button>
                </div>
              </div>
            </div>

            {/* Calculadora */}
            <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-blue-200">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Calculadora</h2>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">X (mm)</label>
                    <input
                      type="number"
                      value={calcX}
                      onChange={(e) => setCalcX(Number(e.target.value))}
                      className="w-full px-2 py-1 border rounded"
                      step="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Y (mm)</label>
                    <input
                      type="number"
                      value={calcY}
                      onChange={(e) => setCalcY(Number(e.target.value))}
                      className="w-full px-2 py-1 border rounded"
                      step="1"
                    />
                  </div>
                </div>

                <button
                  onClick={calcularPasos}
                  className="w-full bg-blue-900 text-white py-2 rounded font-semibold hover:bg-blue-800"
                >
                  Calcular Pasos
                </button>

                {pasosCalculados && (
                  <div className={`p-3 rounded border-2 ${
                    pasosCalculados.alcanzable 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-red-50 border-red-300'
                  }`}>
                    {pasosCalculados.alcanzable ? (
                      <>
                        <p className="text-sm font-semibold text-green-800 mb-2">
                            Posición alcanzable
                        </p>
                        <div className="text-xs space-y-1 font-mono">
                          <div className="flex justify-between">
                            <span>Motor X:</span>
                            <span className="font-bold">{pasosCalculados.pasosX} pasos</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Motor Y:</span>
                            <span className="font-bold">{pasosCalculados.pasosY} pasos</span>
                          </div>
                        </div>
                        <button
                          onClick={moverACalculado}
                          className="w-full mt-2 bg-green-600 text-white py-1 px-2 rounded text-xs font-semibold hover:bg-green-700"
                        >
                          → Mover a esta posición
                        </button>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-red-800">
                          Fuera de límites
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Acciones</h2>
              
              <button
                onClick={guardarConfiguracion}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 mb-2 shadow-md"
              >
                Guardar Configuración
              </button>

              <button
                onClick={limpiar}
                className="w-full bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700"
              >
                Limpiar Dibujo
              </button>

              {maquinaConfigurada && (
                <div className="mt-3 p-3 bg-green-50 border-2 border-green-300 rounded-lg text-center">
                  <p className="text-green-700 font-semibold">Máquina configurada</p>
                  <p className="text-xs text-green-600 mt-1">
                    Puedes ir al modo G-code
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Panel de controles - MODO G-CODE */}
        {modo === 'gcode' && (
          <div className="space-y-4">
            {/* Info configuración */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Config Actual</h2>
              <div className="text-xs space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Motor X:</span>
                  <span className="font-mono">{pasosMotorX} pasos, {mmPorRevX}mm/rev</span>
                </div>
                <div className="flex justify-between">
                  <span>Motor Y:</span>
                  <span className="font-mono">{pasosMotorY} pasos, {mmPorRevY}mm/rev</span>
                </div>
                <div className="flex justify-between">
                  <span>Límites X:</span>
                  <span className="font-mono">[{motorXMin}, {motorXMax}] mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Límites Y:</span>
                  <span className="font-mono">[{motorYMin}, {motorYMax}] mm</span>
                </div>
              </div>
            </div>

            {/* Calculadora */}
            <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-blue-200">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Calculadora</h2>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">X (mm)</label>
                    <input
                      type="number"
                      value={calcX}
                      onChange={(e) => setCalcX(Number(e.target.value))}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Y (mm)</label>
                    <input
                      type="number"
                      value={calcY}
                      onChange={(e) => setCalcY(Number(e.target.value))}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={calcularPasos}
                  className="w-full bg-blue-900 text-white py-2 rounded font-semibold hover:bg-blue-800 text-sm"
                >
                  Calcular
                </button>

                {pasosCalculados && (
                  <div className={`p-2 rounded border ${
                    pasosCalculados.alcanzable 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-red-50 border-red-300'
                  }`}>
                    {pasosCalculados.alcanzable ? (
                      <>
                        <div className="text-xs space-y-1 font-mono mb-2">
                          <div className="flex justify-between">
                            <span>X:</span>
                            <span className="font-bold">{pasosCalculados.pasosX} pasos</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Y:</span>
                            <span className="font-bold">{pasosCalculados.pasosY} pasos</span>
                          </div>
                        </div>
                        <div className="text-xs font-mono bg-white p-2 rounded border">
                          G0 X{calcX} Y{calcY}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-red-800">  Fuera de límites</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Editor G-code */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Editor G-code</h2>
              <textarea
                value={codigoGcode}
                onChange={(e) => setCodigoGcode(e.target.value)}
                placeholder="G28 ; Home&#10;G0 X50 Y50&#10;M3 ; Bajar lápiz&#10;G1 X100 Y50 F1000&#10;G1 X100 Y100&#10;M5 ; Subir lápiz"
                className="w-full h-40 p-2 text-xs font-mono border rounded resize-none"
                disabled={ejecutando}
              />
              
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={ejecutarGcode}
                  disabled={ejecutando || !codigoGcode.trim()}
                  className="bg-blue-900 text-white py-2 rounded font-semibold hover:bg-blue-800 disabled:bg-gray-300 text-sm"
                >
                  {ejecutando ? '⏳ Ejecutando...' : '▶️ Ejecutar'}
                </button>
                <button
                  onClick={() => setCodigoGcode('')}
                  disabled={ejecutando}
                  className="bg-gray-500 text-white py-2 rounded font-semibold hover:bg-gray-600 text-sm"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Programas predefinidos */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Programas</h2>
              <div className="space-y-2">
                <button
                  onClick={generarCirculo}
                  disabled={ejecutando}
                  className="w-full bg-indigo-900 text-white py-2 rounded font-semibold hover:bg-indigo-800 text-sm"
                >
                  Generar Círculo
                </button>
                <button
                  onClick={generarCuadrado}
                  disabled={ejecutando}
                  className="w-full bg-indigo-900 text-white py-2 rounded font-semibold hover:bg-indigo-800 text-sm"
                >
                  Generar Cuadrado
                </button>
                <button
                  onClick={generarEstrella}
                  disabled={ejecutando}
                  className="w-full bg-indigo-900 text-white py-2 rounded font-semibold hover:bg-indigo-800 text-sm"
                >
                  Generar Estrella
                </button>
              </div>
            </div>

            {/* Acciones */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Acciones</h2>
              <div className="space-y-2">
                <button
                  onClick={limpiar}
                  disabled={ejecutando}
                  className="w-full bg-red-600 text-white py-2 rounded font-semibold hover:bg-red-700 text-sm"
                >
                  Limpiar Dibujo
                </button>
                <button
                  onClick={exportarArduino}
                  className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 text-sm"
                >
                  Exportar Arduino
                </button>
                <button
                  onClick={() => setModo('config')}
                  className="w-full bg-gray-400 text-white py-2 rounded font-semibold hover:bg-gray-500 text-sm"
                >
                    Volver a Config
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Consola */}
      <div className="mt-6 bg-white p-4 rounded-lg shadow-lg">
        <h2 className="text-lg font-semibold mb-3 text-gray-700">Consola</h2>
        <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-xs h-40 overflow-y-auto">
          {consola.length === 0 ? (
            <div className="text-gray-500">
              {modo === 'config' 
                ? 'Configura tu máquina cartesiana y prueba movimientos...' 
                : 'Esperando comandos G-code...'}
            </div>
          ) : (
            consola.map((linea, i) => (
              <div key={i} className={linea.includes('ERROR') ? 'text-red-400' : ''}>{linea}</div>
            ))
          )}
        </div>
      </div>

      {/* Info */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">Sistema Cartesiano</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Un motor por eje</strong></li>
            <li>• Motores paso a paso (X, Y)</li>
            <li>• Movimiento lineal directo</li>
            <li>• Fácil de programar</li>
            <li>• Alta precisión</li>
          </ul>
        </div>
        
        <div className="bg-indigo-50 p-4 rounded-lg border-2 border-indigo-200">
          <h3 className="font-semibold text-indigo-900 mb-2">Comandos G-code</h3>
          <ul className="text-sm text-indigo-800 space-y-1 font-mono">
            <li><strong>G0/G1</strong> X Y F - Mover</li>
            <li><strong>G28</strong> - Home (0,0)</li>
            <li><strong>G92</strong> X Y - Set pos</li>
            <li><strong>M3</strong> - Bajar lápiz</li>
            <li><strong>M5</strong> - Subir lápiz</li>
          </ul>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
          <h3 className="font-semibold text-green-900 mb-2">Ventajas</h3>
          <ul className="text-sm text-green-800 space-y-1">
            <li>• Diseño simple</li>
            <li>• Área rectangular</li>
            <li>• Fácil calibración</li>
            <li>• Escalable</li>
            <li>• Económico</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

window.MotorPorEje = MotorPorEje;
