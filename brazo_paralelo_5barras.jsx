const { useState, useRef, useEffect } = React;

const BrazoParalelo5Barras = () => {
  // Estados de modo
  const [modo, setModo] = useState('config'); // 'config' o 'gcode'
  
  // Estados de servos (servo1: -180 a 0, servo2: 0 a 180)
  const [servo1, setServo1] = useState(-45);
  const [servo2, setServo2] = useState(45);
  const [servo1Min, setServo1Min] = useState(-180);
  const [servo1Max, setServo1Max] = useState(0);
  const [servo2Min, setServo2Min] = useState(0);
  const [servo2Max, setServo2Max] = useState(180);
  
  // Configuración de la máquina
  const [longBrazo1, setLongBrazo1] = useState(120);
  const [longBrazo2, setLongBrazo2] = useState(160);
  const [longBrazo3, setLongBrazo3] = useState(120);
  const [longBrazo4, setLongBrazo4] = useState(160);
  const [separacionBase, setSeparacionBase] = useState(80);
  
  const [lapizAbajo, setLapizAbajo] = useState(false);
  const [trazos, setTrazos] = useState([]);
  const [ejecutando, setEjecutando] = useState(false);
  const [codigoGcode, setCodigoGcode] = useState('');
  const [consola, setConsola] = useState([]);
  const [posActual, setPosActual] = useState({ x: 0, y: 0 });
  const [velocidad, setVelocidad] = useState(1000);
  const [maquinaConfigurada, setMaquinaConfigurada] = useState(false);
  
  // Calculadora de posición
  const [calcX, setCalcX] = useState(0);
  const [calcY, setCalcY] = useState(120);
  const [angulosCalculados, setAngulosCalculados] = useState(null);
  
  // Estados para arrastre del efector
  const [isDragging, setIsDragging] = useState(false);
  
  // Estados para el joystick integrado
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef(null);

  const BASE_X = 400;
  const BASE_Y = 400;
  
  // Usar configuraciones dinámicas
  const LONG_BRAZO1 = longBrazo1;
  const LONG_BRAZO2 = longBrazo2;
  const LONG_BRAZO3 = longBrazo3;
  const LONG_BRAZO4 = longBrazo4;
  const SEPARACION_BASE = separacionBase;
  
  const SERVO1_X = BASE_X - SEPARACION_BASE / 2;
  const SERVO1_Y = BASE_Y;
  const SERVO2_X = BASE_X + SEPARACION_BASE / 2;
  const SERVO2_Y = BASE_Y;

  useEffect(() => {
    dibujarEscena();
  }, [servo1, servo2, lapizAbajo, trazos, longBrazo1, longBrazo2, longBrazo3, longBrazo4, separacionBase, isDragging, joystickActive, joystickPos]);

  // Efecto para renderizar ecuaciones LaTeX con KaTeX
  useEffect(() => {
    if (window.renderMathInElement) {
      renderMathInElement(document.body, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false}
        ],
        throwOnError: false
      });
    }
  }, [longBrazo1, longBrazo2, separacionBase]);

  // Efecto para el joystick - movimiento continuo
  useEffect(() => {
    if (!joystickActive || ejecutando) return;
    
    const intervalo = setInterval(() => {
      if (Math.abs(joystickPos.x) > 5 || Math.abs(joystickPos.y) > 5) {
        const { efectorX, efectorY } = calcularPosicion();
        if (efectorX !== null && efectorY !== null) {
          // Escalar el movimiento del joystick (Y invertido para coincidir con la dirección visual)
          const velocidadX = joystickPos.x * 0.5;
          const velocidadY = joystickPos.y * 0.5;
          
          const nuevoX = efectorX + velocidadX;
          const nuevoY = efectorY + velocidadY;
          
          const angulos = cinematicaInversa(nuevoX, nuevoY);
          if (angulos) {
            setServo1(angulos.s1);
            setServo2(angulos.s2);
            
            if (lapizAbajo) {
              setTrazos(prev => [...prev, { x: nuevoX, y: nuevoY }]);
            }
          }
        }
      }
    }, 50);
    
    return () => clearInterval(intervalo);
  }, [joystickActive, joystickPos, ejecutando, lapizAbajo]);

  // Event handlers para arrastre del mouse y joystick
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const isPointNearEffector = (mouseX, mouseY, efectorX, efectorY) => {
      const distance = Math.sqrt((mouseX - efectorX) ** 2 + (mouseY - efectorY) ** 2);
      return distance < 15;
    };
    
    const isPointInJoystick = (mouseX, mouseY) => {
      const joystickCenterX = 700;
      const joystickCenterY = 520;
      const joystickRadius = 50;
      const distance = Math.sqrt((mouseX - joystickCenterX) ** 2 + (mouseY - joystickCenterY) ** 2);
      return distance < joystickRadius;
    };

    const handleMouseDown = (e) => {
      if (ejecutando) return;
      
      const pos = getMousePos(e);
      
      // Verificar si se hizo click en el joystick
      if (isPointInJoystick(pos.x, pos.y)) {
        setJoystickActive(true);
        handleJoystickMove(pos);
        return;
      }
      
      // Si no, verificar el efector
      const { efectorX, efectorY } = calcularPosicion();
      if (efectorX !== null && efectorY !== null) {
        if (isPointNearEffector(pos.x, pos.y, efectorX, efectorY)) {
          setIsDragging(true);
          canvas.style.cursor = 'grabbing';
        }
      }
    };
    
    const handleJoystickMove = (pos) => {
      const joystickCenterX = 700;
      const joystickCenterY = 520;
      const maxDistance = 50;
      
      let dx = pos.x - joystickCenterX;
      let dy = pos.y - joystickCenterY;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
      }
      
      setJoystickPos({ x: dx, y: dy });
    };

    const handleMouseMove = (e) => {
      const pos = getMousePos(e);
      
      if (joystickActive) {
        handleJoystickMove(pos);
      } else if (isDragging) {
        // Calcular cinemática inversa para la nueva posición
        const angulos = cinematicaInversa(pos.x, pos.y);
        if (angulos) {
          setServo1(angulos.s1);
          setServo2(angulos.s2);
          
          // Si el lápiz está abajo, agregar trazo
          if (lapizAbajo) {
            setTrazos(prev => [...prev, { x: pos.x, y: pos.y }]);
          }
        }
      } else {
        // Cambiar cursor cuando esté sobre el punto verde o joystick
        const { efectorX, efectorY } = calcularPosicion();
        
        if (isPointInJoystick(pos.x, pos.y)) {
          canvas.style.cursor = 'pointer';
        } else if (efectorX !== null && efectorY !== null && isPointNearEffector(pos.x, pos.y, efectorX, efectorY)) {
          canvas.style.cursor = 'grab';
        } else {
          canvas.style.cursor = 'default';
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        canvas.style.cursor = 'grab';
      }
      if (joystickActive) {
        setJoystickActive(false);
        setJoystickPos({ x: 0, y: 0 });
        canvas.style.cursor = 'default';
      }
    };

    const handleMouseLeave = () => {
      if (isDragging) {
        setIsDragging(false);
        canvas.style.cursor = 'default';
      }
      if (joystickActive) {
        setJoystickActive(false);
        setJoystickPos({ x: 0, y: 0 });
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDragging, joystickActive, ejecutando, lapizAbajo, longBrazo1, longBrazo2, longBrazo3, longBrazo4, separacionBase, servo1Min, servo1Max, servo2Min, servo2Max]);

  // Cinemática directa: calcular posición del efector final
  const calcularPosicion = () => {
    // Servo1 controla el brazo izquierdo (ángulos negativos hacia la izquierda)
    // Convertimos: -180° a 0° => 180° a 0° en el sistema estándar
    const angulo1Rad = ((180 + servo1) * Math.PI) / 180;
    const codo1X = SERVO1_X + LONG_BRAZO1 * Math.cos(angulo1Rad);
    const codo1Y = SERVO1_Y - LONG_BRAZO1 * Math.sin(angulo1Rad);

    // Servo2 controla el brazo derecho (ángulos positivos hacia la derecha)
    const angulo2Rad = (servo2 * Math.PI) / 180;
    const codo2X = SERVO2_X + LONG_BRAZO3 * Math.cos(angulo2Rad);
    const codo2Y = SERVO2_Y - LONG_BRAZO3 * Math.sin(angulo2Rad);

    // Calcular punto de intersección (efector final)
    // usando círculos centrados en cada codo
    const dx = codo2X - codo1X;
    const dy = codo2Y - codo1Y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    
    // Verificar si es posible la configuración
    if (distancia > LONG_BRAZO2 + LONG_BRAZO4 || 
        distancia < Math.abs(LONG_BRAZO2 - LONG_BRAZO4)) {
      return { codo1X, codo1Y, codo2X, codo2Y, efectorX: null, efectorY: null };
    }

    // Calcular intersección usando geometría
    const a = (LONG_BRAZO2 * LONG_BRAZO2 - LONG_BRAZO4 * LONG_BRAZO4 + distancia * distancia) / (2 * distancia);
    const h = Math.sqrt(LONG_BRAZO2 * LONG_BRAZO2 - a * a);
    
    const cx = codo1X + (a * dx) / distancia;
    const cy = codo1Y + (a * dy) / distancia;
    
    // Tomar la solución "hacia abajo" (configuración codo abajo)
    const efectorX = cx + (h * dy) / distancia;
    const efectorY = cy - (h * dx) / distancia;

    return { codo1X, codo1Y, codo2X, codo2Y, efectorX, efectorY };
  };

  // Verificar si las barras se cruzan
  const verificarColision = (s1, s2) => {
    const ang1Rad = ((180 + s1) * Math.PI) / 180;
    const c1X = SERVO1_X + LONG_BRAZO1 * Math.cos(ang1Rad);
    const c1Y = SERVO1_Y - LONG_BRAZO1 * Math.sin(ang1Rad);

    const ang2Rad = (s2 * Math.PI) / 180;
    const c2X = SERVO2_X + LONG_BRAZO3 * Math.cos(ang2Rad);
    const c2Y = SERVO2_Y - LONG_BRAZO3 * Math.sin(ang2Rad);

    const dx = c2X - c1X;
    const dy = c2Y - c1Y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > LONG_BRAZO2 + LONG_BRAZO4 || 
        dist < Math.abs(LONG_BRAZO2 - LONG_BRAZO4)) {
      return false;
    }

    const a = (LONG_BRAZO2 * LONG_BRAZO2 - LONG_BRAZO4 * LONG_BRAZO4 + dist * dist) / (2 * dist);
    const hSq = LONG_BRAZO2 * LONG_BRAZO2 - a * a;
    
    if (hSq < 0) return false;
    
    const h = Math.sqrt(hSq);
    const cx = c1X + (a * dx) / dist;
    const cy = c1Y + (a * dy) / dist;
    const eX = cx + (h * dy) / dist;
    const eY = cy - (h * dx) / dist;

    // Verificar que el efector esté por debajo de los codos (configuración válida)
    // y que no haya cruce de barras
    if (eY >= c1Y - 5 || eY >= c2Y - 5) {
      return false; // Barras cruzadas
    }
    
    // Verificar que los codos no atraviesen la base
    const BASE_LEVEL = SERVO1_Y;
    const MARGEN_BASE = 10;
    
    if (c1Y >= BASE_LEVEL - MARGEN_BASE || c2Y >= BASE_LEVEL - MARGEN_BASE) {
      return false; // Codos atravesando la base
    }
    
    return true;
  };

  // Cinemática inversa: de XY a ángulos de servo
  const cinematicaInversa = (targetX, targetY) => {
    let mejorS1 = null;
    let mejorS2 = null;
    let mejorError = Infinity;
    let mejorDistanciaAngular = Infinity;

    // Búsqueda por fuerza bruta con verificación de colisión
    // Incremento más fino para movimientos suaves
    const incremento = 1;
    
    for (let s1 = servo1Min; s1 <= servo1Max; s1 += incremento) {
      for (let s2 = servo2Min; s2 <= servo2Max; s2 += incremento) {
        // Simular posición con estos ángulos
        const ang1Rad = ((180 + s1) * Math.PI) / 180;
        const c1X = SERVO1_X + LONG_BRAZO1 * Math.cos(ang1Rad);
        const c1Y = SERVO1_Y - LONG_BRAZO1 * Math.sin(ang1Rad);

        const ang2Rad = (s2 * Math.PI) / 180;
        const c2X = SERVO2_X + LONG_BRAZO3 * Math.cos(ang2Rad);
        const c2Y = SERVO2_Y - LONG_BRAZO3 * Math.sin(ang2Rad);

        const dx = c2X - c1X;
        const dy = c2Y - c1Y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > LONG_BRAZO2 + LONG_BRAZO4 || 
            dist < Math.abs(LONG_BRAZO2 - LONG_BRAZO4)) {
          continue;
        }

        const a = (LONG_BRAZO2 * LONG_BRAZO2 - LONG_BRAZO4 * LONG_BRAZO4 + dist * dist) / (2 * dist);
        const hSq = LONG_BRAZO2 * LONG_BRAZO2 - a * a;
        
        if (hSq < 0) continue;
        
        const h = Math.sqrt(hSq);
        const cx = c1X + (a * dx) / dist;
        const cy = c1Y + (a * dy) / dist;
        const eX = cx + (h * dy) / dist;
        const eY = cy - (h * dx) / dist;

        // Verificar que el efector esté por debajo de los codos (evitar cruce)
        if (eY >= c1Y - 5 || eY >= c2Y - 5) {
          continue; // Configuración con barras cruzadas
        }

        // RESTRICCIÓN: Los codos no pueden atravesar la base negra
        // La base está en SERVO1_Y/SERVO2_Y, los codos deben estar arriba (menor Y)
        const BASE_LEVEL = SERVO1_Y; // Nivel de la base
        const MARGEN_BASE = 10; // Margen de seguridad
        
        if (c1Y >= BASE_LEVEL - MARGEN_BASE || c2Y >= BASE_LEVEL - MARGEN_BASE) {
          continue; // Los codos están demasiado cerca o atravesando la base
        }
        
        // RESTRICCIÓN: Verificar que los brazos superiores no crucen la base
        // Usando interpolación lineal para detectar intersección con la base
        const brazo1CruzaBase = (SERVO1_Y > BASE_LEVEL && c1Y < BASE_LEVEL) || 
                                 (SERVO1_Y < BASE_LEVEL && c1Y > BASE_LEVEL);
        const brazo2CruzaBase = (SERVO2_Y > BASE_LEVEL && c2Y < BASE_LEVEL) || 
                                 (SERVO2_Y < BASE_LEVEL && c2Y > BASE_LEVEL);
        
        if (brazo1CruzaBase || brazo2CruzaBase) {
          continue; // Los brazos superiores cruzan la base
        }

        const error = Math.sqrt((eX - targetX) ** 2 + (eY - targetY) ** 2);
        
        // Distancia angular desde la posición actual (PRIORIDAD ALTA para movimientos suaves)
        const distAngular = Math.abs(s1 - servo1) + Math.abs(s2 - servo2);
        
        // PRIORIZAR: movimiento suave sobre precisión exacta
        // Solo considerar soluciones con error razonable
        if (error < 3) { // Tolerancia de 3 píxeles
          // Preferir la solución más cercana angularmente
          if (distAngular < mejorDistanciaAngular) {
            mejorError = error;
            mejorS1 = s1;
            mejorS2 = s2;
            mejorDistanciaAngular = distAngular;
          } else if (distAngular === mejorDistanciaAngular && error < mejorError) {
            // Si la distancia angular es igual, preferir menor error
            mejorError = error;
            mejorS1 = s1;
            mejorS2 = s2;
          }
        }
      }
    }

    if (mejorError < 5) { // Tolerancia de 5 píxeles
      return { s1: mejorS1, s2: mejorS2 };
    }
    
    return null;
  };

  // Animar movimiento suave
  const animarMovimiento = (s1Final, s2Final) => {
    return new Promise(resolve => {
      const s1Inicio = servo1;
      const s2Inicio = servo2;
      const pasos = 20;
      let paso = 0;
      
      const intervalo = setInterval(() => {
        paso++;
        const progreso = paso / pasos;
        
        const nuevoS1 = s1Inicio + (s1Final - s1Inicio) * progreso;
        const nuevoS2 = s2Inicio + (s2Final - s2Inicio) * progreso;
        
        setServo1(nuevoS1);
        setServo2(nuevoS2);
        
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
        
        if (xMatch || yMatch) {
          const xObj = xMatch ? BASE_X + parseFloat(xMatch[1]) : posActual.x;
          const yObj = yMatch ? BASE_Y - parseFloat(yMatch[1]) : posActual.y;
          
          const angulos = cinematicaInversa(xObj, yObj);
          if (angulos) {
            await animarMovimiento(angulos.s1, angulos.s2);
            setPosActual({ x: xObj, y: yObj });
            
            if (lapizAbajo) {
              setTrazos(prev => [...prev, { x: xObj, y: yObj }]);
            }
            
            setConsola(prev => [...prev, 
              `  ✓ Servo1: ${angulos.s1.toFixed(1)}° | Servo2: ${angulos.s2.toFixed(1)}°`
            ]);
          } else {
            setConsola(prev => [...prev, `  ❌ ERROR: Fuera de alcance`]);
          }
        }
      }
      
      // M3 - Bajar lápiz
      else if (cmd.startsWith('M3')) {
        setLapizAbajo(true);
        const { efectorX, efectorY } = calcularPosicion();
        if (efectorX !== null) {
          setTrazos(prev => [...prev, { x: efectorX, y: efectorY }]);
        }
        setConsola(prev => [...prev, `  ✓ Lápiz ABAJO`]);
        await new Promise(r => setTimeout(r, 200));
      }
      
      // M5 - Subir lápiz
      else if (cmd.startsWith('M5')) {
        setLapizAbajo(false);
        setConsola(prev => [...prev, `  ✓ Lápiz ARRIBA`]);
        await new Promise(r => setTimeout(r, 200));
      }
      
      // G28 - Home
      else if (cmd.startsWith('G28')) {
        await animarMovimiento(-45, 45);
        const { efectorX, efectorY } = calcularPosicion();
        setPosActual({ x: efectorX || BASE_X, y: efectorY || BASE_Y });
        setConsola(prev => [...prev, `  ✓ HOME (-45°, 45°)`]);
      }
      
      // G4 - Pausa
      else if (cmd.startsWith('G4')) {
        const pMatch = cmd.match(/P([\d.]+)/);
        const sMatch = cmd.match(/S([\d.]+)/);
        const espera = pMatch ? parseFloat(pMatch[1]) : 
                      (sMatch ? parseFloat(sMatch[1]) * 1000 : 0);
        setConsola(prev => [...prev, `  ⏸ Pausa ${espera}ms`]);
        await new Promise(r => setTimeout(r, espera));
      }
      
      // M17/M18 - Servos
      else if (cmd.startsWith('M17')) {
        setConsola(prev => [...prev, `  ✓ Servos ON`]);
      }
      else if (cmd.startsWith('M18')) {
        setConsola(prev => [...prev, `  ✓ Servos OFF`]);
      }
    }
    
    setConsola(prev => [...prev, '✅ Programa completado']);
  };

  const dibujarEscena = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 800, 600);

    // Fondo
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 350, 800, 250);

    // Cuadrícula
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    for (let i = 0; i < 800; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 600);
      ctx.stroke();
    }
    for (let i = 0; i < 600; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(800, i);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Ejes
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(BASE_X - 150, BASE_Y);
    ctx.lineTo(BASE_X + 150, BASE_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(BASE_X, BASE_Y - 150);
    ctx.lineTo(BASE_X, BASE_Y + 50);
    ctx.stroke();
    
    ctx.fillStyle = '#666';
    ctx.font = '12px monospace';
    ctx.fillText('X+', BASE_X + 160, BASE_Y + 5);
    ctx.fillText('Y+', BASE_X + 5, BASE_Y - 160);
    ctx.fillText('(0,0)', BASE_X + 10, BASE_Y - 5);

    // Trazos del dibujo
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    if (trazos.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trazos[0].x, trazos[0].y);
      for (let i = 1; i < trazos.length; i++) {
        ctx.lineTo(trazos[i].x, trazos[i].y);
      }
      ctx.stroke();
    }

    const { codo1X, codo1Y, codo2X, codo2Y, efectorX, efectorY } = calcularPosicion();

    // Base común
    ctx.fillStyle = '#666';
    ctx.fillRect(SERVO1_X - 5, SERVO1_Y - 5, SERVO2_X - SERVO1_X + 10, 20);

    // Servo 1 (izquierdo)
    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.arc(SERVO1_X, SERVO1_Y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Servo 2 (derecho)
    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.arc(SERVO2_X, SERVO2_Y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brazo superior izquierdo
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(SERVO1_X, SERVO1_Y);
    ctx.lineTo(codo1X, codo1Y);
    ctx.stroke();

    // Brazo superior derecho
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(SERVO2_X, SERVO2_Y);
    ctx.lineTo(codo2X, codo2Y);
    ctx.stroke();

    // Codos
    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.arc(codo1X, codo1Y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.arc(codo2X, codo2Y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (efectorX !== null && efectorY !== null) {
      // Brazos inferiores (antebrazo)
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(codo1X, codo1Y);
      ctx.lineTo(efectorX, efectorY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(codo2X, codo2Y);
      ctx.lineTo(efectorX, efectorY);
      ctx.stroke();

      // Efector final - con indicador visual si está siendo arrastrado
      ctx.fillStyle = isDragging ? '#22c55e' : '#4ade80';
      ctx.beginPath();
      ctx.arc(efectorX, efectorY, isDragging ? 12 : 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = isDragging ? 3 : 2;
      ctx.stroke();
      
      // Halo cuando se está arrastrando
      if (isDragging) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(efectorX, efectorY, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Lápiz
      ctx.strokeStyle = lapizAbajo ? '#dc2626' : '#333';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(efectorX, efectorY);
      ctx.lineTo(efectorX, efectorY + 20);
      ctx.stroke();

      ctx.fillStyle = lapizAbajo ? '#dc2626' : '#6b7280';
      ctx.beginPath();
      ctx.arc(efectorX, efectorY + 25, 5, 0, Math.PI * 2);
      ctx.fill();

      // Info
      ctx.fillStyle = '#333';
      ctx.font = '14px monospace';
      ctx.fillText(`Servo1 (Izq): ${servo1.toFixed(1)}°`, 10, 20);
      ctx.fillText(`Servo2 (Der): ${servo2.toFixed(1)}°`, 10, 40);
      const rx = (efectorX - BASE_X).toFixed(1);
      const ry = (BASE_Y - efectorY).toFixed(1);
      ctx.fillText(`Pos: (${rx}, ${ry})`, 10, 60);
      if (isDragging) {
        ctx.fillStyle = '#22c55e';
        ctx.fillText('Arrastrando...', 10, 80);
      }
      if (joystickActive) {
        ctx.fillStyle = '#1e40af';
        ctx.fillText('Control Joystick Activo', 10, isDragging ? 100 : 80);
      }
    } else {
      // Configuración imposible
      ctx.fillStyle = '#dc2626';
      ctx.font = '14px monospace';
      ctx.fillText('CONFIGURACIÓN IMPOSIBLE', 10, 80);
    }

    // Dibujar Joystick integrado en el canvas (esquina inferior derecha)
    const joystickCenterX = 700;
    const joystickCenterY = 520;
    const joystickRadius = 50;
    const stickRadius = 18;
    
    // Fondo del joystick
    ctx.fillStyle = joystickActive ? 'rgba(30, 64, 175, 0.1)' : 'rgba(156, 163, 175, 0.1)';
    ctx.beginPath();
    ctx.arc(joystickCenterX, joystickCenterY, joystickRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Borde del joystick
    ctx.strokeStyle = joystickActive ? '#1e40af' : '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joystickCenterX, joystickCenterY, joystickRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Centro del joystick
    ctx.fillStyle = '#d1d5db';
    ctx.beginPath();
    ctx.arc(joystickCenterX, joystickCenterY, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Indicadores direccionales
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲', joystickCenterX, joystickCenterY - joystickRadius + 15);
    ctx.fillText('▼', joystickCenterX, joystickCenterY + joystickRadius - 5);
    ctx.fillText('◀', joystickCenterX - joystickRadius + 10, joystickCenterY + 5);
    ctx.fillText('▶', joystickCenterX + joystickRadius - 10, joystickCenterY + 5);
    ctx.textAlign = 'left';
    
    // Stick del joystick
    const stickX = joystickCenterX + (joystickPos.x * joystickRadius / 50);
    const stickY = joystickCenterY + (joystickPos.y * joystickRadius / 50);
    
    ctx.fillStyle = joystickActive ? '#1e40af' : '#4b5563';
    ctx.beginPath();
    ctx.arc(stickX, stickY, stickRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Símbolo en el stick
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⊕', stickX, stickY + 6);
    ctx.textAlign = 'left';
    
    // Etiqueta del joystick
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Joystick', joystickCenterX, joystickCenterY + joystickRadius + 18);
    ctx.textAlign = 'left';

    // Etiqueta de configuración
    ctx.fillStyle = '#4338ca';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('Mecanismo 5-Barras Paralelo', 10, 580);
  };

  const ejecutarGcode = async () => {
    if (!codigoGcode.trim()) return;
    setEjecutando(true);
    setConsola(['=== Iniciando ejecución ===']);
    try {
      await procesarGcode(codigoGcode);
    } catch (error) {
      setConsola(prev => [...prev, `❌ ERROR: ${error.message}`]);
    }
    setEjecutando(false);
  };

  const limpiar = () => {
    setTrazos([]);
    setConsola([]);
  };

  const guardarConfiguracion = () => {
    setMaquinaConfigurada(true);
    setConsola(['✅ Configuración guardada', '📐 Longitudes de brazos actualizadas', '⚙️ Límites de servos establecidos']);
  };

  const calcularAngulos = () => {
    const targetX = BASE_X + calcX;
    const targetY = BASE_Y - calcY;
    
    const angulos = cinematicaInversa(targetX, targetY);
    
    if (angulos) {
      setAngulosCalculados({
        servo1: angulos.s1,
        servo2: angulos.s2,
        alcanzable: true,
        x: calcX,
        y: calcY
      });
      
      setConsola(prev => [
        ...prev,
        `📍 Cálculo para posición (${calcX}, ${calcY}):`,
        `  Servo1 (Izq): ${angulos.s1.toFixed(2)}°`,
        `  Servo2 (Der): ${angulos.s2.toFixed(2)}°`,
        `  ✅ Posición ALCANZABLE`
      ]);
    } else {
      setAngulosCalculados({
        alcanzable: false,
        x: calcX,
        y: calcY
      });
      
      setConsola(prev => [
        ...prev,
        `📍 Cálculo para posición (${calcX}, ${calcY}):`,
        `  ❌ Posición FUERA DE ALCANCE`,
        `  Verifica las dimensiones o límites de servos`
      ]);
    }
  };

  const moverACalculado = () => {
    if (angulosCalculados && angulosCalculados.alcanzable) {
      setServo1(angulosCalculados.servo1);
      setServo2(angulosCalculados.servo2);
      setConsola(prev => [...prev, `✅ Movido a posición calculada`]);
    }
  };

  const irAHome = () => {
    setServo1(-45);
    setServo2(45);
    const { efectorX, efectorY } = calcularPosicion();
    setPosActual({ x: efectorX || BASE_X, y: efectorY || BASE_Y });
    setConsola(prev => [...prev, '🏠 Regresado a HOME']);
  };

  const generarCirculo = () => {
    const radio = 30;
    const cx = 0;
    const cy = 120;
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
    const tam = 60;
    const cx = 0;
    const cy = 120;
    
    let codigo = '; Cuadrado\nG28\nG0 X${cx - tam/2} Y${cy + tam/2}\nM3\n';
    codigo += `G1 X${cx + tam/2} Y${cy + tam/2} F1000\n`;
    codigo += `G1 X${cx + tam/2} Y${cy - tam/2} F1000\n`;
    codigo += `G1 X${cx - tam/2} Y${cy - tam/2} F1000\n`;
    codigo += `G1 X${cx - tam/2} Y${cy + tam/2} F1000\n`;
    codigo += 'M5\nG28\n';
    setCodigoGcode(codigo);
  };

  const exportarArduino = () => {
    let codigo = `// Brazo Robótico Paralelo - Arduino\n#include <Servo.h>\n\n`;
    codigo += `Servo servo1; // Servo izquierdo\n`;
    codigo += `Servo servo2; // Servo derecho\n\n`;
    codigo += `void setup() {\n`;
    codigo += `  servo1.attach(9);\n`;
    codigo += `  servo2.attach(10);\n`;
    codigo += `  Serial.begin(9600);\n}\n\n`;
    codigo += `void loop() {\n`;
    codigo += `  // Configuración: Mecanismo 5-Barras Paralelo\n`;
    codigo += `  servo1.write(${Math.round(servo1)});\n`;
    codigo += `  servo2.write(${Math.round(servo2)});\n`;
    codigo += `  delay(15);\n}\n`;
    
    const blob = new Blob([codigo], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brazo_paralelo_5barras.ino';
    a.click();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-white rounded-xl shadow-2xl">
      <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-blue-900 to-indigo-900 bg-clip-text text-transparent">
        Mecanismo de 5 Barras Paralelo
      </h1>
      <p className="text-center text-gray-600 mb-6 italic">
        (Parallel 5-Bar Linkage / Manipulador Paralelo)
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
          <div className="mb-2 text-sm text-gray-600 italic text-center">
            Arrastra el punto verde con el mouse o usa el joystick integrado (esquina inferior derecha)
          </div>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full border-2 border-gray-300 rounded"
          />
          
          {/* Explicación de movimientos */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-3">Cinemática del Sistema de 5 Barras</h3>
            <div className="space-y-2 text-xs text-gray-700">
              <div className="bg-white p-3 rounded border border-blue-100">
                <p className="font-semibold text-blue-800 mb-2">Movimiento en Eje Horizontal (X):</p>
                <p className="leading-relaxed mb-2">
                  Para desplazar el efector final hacia la derecha, los servomotores rotan en direcciones opuestas:
                </p>
                <div className="bg-gray-50 p-2 rounded text-center">
                  {String.raw`$$\Delta x > 0 \Rightarrow \begin{cases} \theta_1 \uparrow & \text{(menos negativo)} \\ \theta_2 \uparrow & \text{(más positivo)} \end{cases}$$`}
                </div>
                <p className="leading-relaxed mt-2">
                  Donde {String.raw`$\theta_1 \in [-180°, 0°]$`} (Servo 1, izquierdo) y {String.raw`$\theta_2 \in [0°, 180°]$`} (Servo 2, derecho).
                </p>
              </div>
              
              <div className="bg-white p-3 rounded border border-blue-100">
                <p className="font-semibold text-blue-800 mb-2">Movimiento en Eje Vertical (Y):</p>
                <p className="leading-relaxed mb-2">
                  Para desplazar el efector final hacia arriba, ambos servomotores rotan coordinadamente:
                </p>
                <div className="bg-gray-50 p-2 rounded text-center">
                  {String.raw`$$\Delta y > 0 \Rightarrow |\theta_1| \downarrow \land \theta_2 \uparrow$$`}
                </div>
                <p className="leading-relaxed mt-2">
                  El incremento angular es simétrico respecto al centro del área de trabajo para mantener el paralelismo.
                </p>
              </div>
              
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-3 rounded border border-indigo-200">
                <p className="font-semibold text-indigo-900 mb-2">Cinemática Inversa - Modelo Matemático:</p>
                <p className="leading-relaxed mb-2">
                  Dada una posición objetivo {String.raw`$\mathbf{P}(x, y)$`} en el espacio de trabajo, el sistema calcula los ángulos mediante:
                </p>
                <div className="bg-white p-2 rounded text-center space-y-1">
                  <div>{String.raw`$$\mathbf{P} = (x, y) \xrightarrow{\text{cinemática inversa}} (\theta_1, \theta_2)$$`}</div>
                </div>
                <p className="leading-relaxed mt-2 mb-1">
                  Sujeto a las restricciones geométricas:
                </p>
                <div className="bg-white p-2 rounded text-center">
                  {String.raw`$$L_1 = L_3 = ${longBrazo1}\text{mm}, \quad L_2 = L_4 = ${longBrazo2}\text{mm}, \quad d = ${separacionBase}\text{mm}$$`}
                </div>
                <p className="leading-relaxed mt-2 text-xs">
                  El algoritmo verifica alcanzabilidad sin colisiones, privilegiando transiciones suaves: {String.raw`$\min(|\Delta\theta_1| + |\Delta\theta_2|)$`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Panel de controles - MODO CONFIGURACIÓN */}
        {modo === 'config' && (
          <div className="space-y-4">
            {/* Configuración de dimensiones */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Dimensiones</h2>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Brazo Superior Izq (mm): {longBrazo1}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={longBrazo1}
                    onChange={(e) => setLongBrazo1(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Brazo Inferior Izq (mm): {longBrazo2}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={longBrazo2}
                    onChange={(e) => setLongBrazo2(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Brazo Superior Der (mm): {longBrazo3}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={longBrazo3}
                    onChange={(e) => setLongBrazo3(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Brazo Inferior Der (mm): {longBrazo4}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={longBrazo4}
                    onChange={(e) => setLongBrazo4(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Separación Base (mm): {separacionBase}
                  </label>
                  <input
                    type="range"
                    min="40"
                    max="150"
                    value={separacionBase}
                    onChange={(e) => setSeparacionBase(Number(e.target.value))}
                    className="w-full"
                    disabled={ejecutando}
                  />
                </div>
              </div>
            </div>

            {/* Control manual de servos */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Control Manual</h2>
              
              <div className="bg-orange-50 p-3 rounded border border-orange-200 mb-3">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Servo 1 (Izq)</span>
                  <span className="text-lg font-bold text-orange-600">{servo1.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min={servo1Min}
                  max={servo1Max}
                  step="0.5"
                  value={servo1}
                  onChange={(e) => setServo1(Number(e.target.value))}
                  className="w-full"
                  disabled={ejecutando}
                />
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600">Min</label>
                    <input
                      type="number"
                      value={servo1Min}
                      onChange={(e) => setServo1Min(Number(e.target.value))}
                      className="w-full px-2 py-1 text-xs border rounded"
                      disabled={ejecutando}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-600">Max</label>
                    <input
                      type="number"
                      value={servo1Max}
                      onChange={(e) => setServo1Max(Number(e.target.value))}
                      className="w-full px-2 py-1 text-xs border rounded"
                      disabled={ejecutando}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-orange-50 p-3 rounded border border-orange-200">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Servo 2 (Der)</span>
                  <span className="text-lg font-bold text-orange-600">{servo2.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min={servo2Min}
                  max={servo2Max}
                  step="0.5"
                  value={servo2}
                  onChange={(e) => setServo2(Number(e.target.value))}
                  className="w-full"
                  disabled={ejecutando}
                />
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600">Min</label>
                    <input
                      type="number"
                      value={servo2Min}
                      onChange={(e) => setServo2Min(Number(e.target.value))}
                      className="w-full px-2 py-1 text-xs border rounded"
                      disabled={ejecutando}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-600">Max</label>
                    <input
                      type="number"
                      value={servo2Max}
                      onChange={(e) => setServo2Max(Number(e.target.value))}
                      className="w-full px-2 py-1 text-xs border rounded"
                      disabled={ejecutando}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    setLapizAbajo(!lapizAbajo);
                    if (!lapizAbajo) {
                      const { efectorX, efectorY } = calcularPosicion();
                      if (efectorX !== null) {
                        setTrazos([...trazos, { x: efectorX, y: efectorY }]);
                      }
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

            {/* Calculadora de posición */}
            <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-blue-200">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Calculadora de Posición</h2>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Coordenada X (mm)
                  </label>
                  <input
                    type="number"
                    value={calcX}
                    onChange={(e) => setCalcX(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded"
                    step="1"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Coordenada Y (mm)
                  </label>
                  <input
                    type="number"
                    value={calcY}
                    onChange={(e) => setCalcY(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded"
                    step="1"
                  />
                </div>

                <button
                  onClick={calcularAngulos}
                  className="w-full bg-blue-900 text-white py-2 rounded font-semibold hover:bg-blue-800"
                >
                  Calcular Ángulos
                </button>

                {angulosCalculados && (
                  <div className={`p-3 rounded border-2 ${
                    angulosCalculados.alcanzable 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-red-50 border-red-300'
                  }`}>
                    {angulosCalculados.alcanzable ? (
                      <>
                        <p className="text-sm font-semibold text-green-800 mb-2">
                          ✅ Posición alcanzable
                        </p>
                        <div className="text-xs space-y-1 font-mono">
                          <div className="flex justify-between">
                            <span>Servo 1:</span>
                            <span className="font-bold">{angulosCalculados.servo1.toFixed(2)}°</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Servo 2:</span>
                            <span className="font-bold">{angulosCalculados.servo2.toFixed(2)}°</span>
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
                        ❌ Fuera de alcance
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-600">
                  <p className="font-semibold mb-1">💡 Uso:</p>
                  <p>Ingresa las coordenadas X, Y que planeas usar en tu G-code para verificar si son alcanzables y ver los ángulos necesarios.</p>
                </div>
              </div>
            </div>

            {/* Acciones de configuración */}
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
            {/* Info de configuración actual */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold mb-3 text-blue-900">Config Actual</h2>
              <div className="text-xs space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>Brazos Izq:</span>
                  <span className="font-mono">{longBrazo1}mm, {longBrazo2}mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Brazos Der:</span>
                  <span className="font-mono">{longBrazo3}mm, {longBrazo4}mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Separación:</span>
                  <span className="font-mono">{separacionBase}mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Servos:</span>
                  <span className="font-mono">[{servo1Min}-{servo1Max}°], [{servo2Min}-{servo2Max}°]</span>
                </div>
              </div>
            </div>

            {/* Calculadora de posición */}
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
                  onClick={calcularAngulos}
                  className="w-full bg-blue-900 text-white py-2 rounded font-semibold hover:bg-blue-800 text-sm"
                >
                  Calcular
                </button>

                {angulosCalculados && (
                  <div className={`p-2 rounded border ${
                    angulosCalculados.alcanzable 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-red-50 border-red-300'
                  }`}>
                    {angulosCalculados.alcanzable ? (
                      <>
                        <div className="text-xs space-y-1 font-mono mb-2">
                          <div className="flex justify-between">
                            <span>Servo1:</span>
                            <span className="font-bold">{angulosCalculados.servo1.toFixed(1)}°</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Servo2:</span>
                            <span className="font-bold">{angulosCalculados.servo2.toFixed(1)}°</span>
                          </div>
                        </div>
                        <div className="text-xs font-mono bg-white p-2 rounded border">
                          G0 X{calcX} Y{calcY}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-red-800">❌ Fuera de alcance</p>
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
                placeholder="G28 ; Home&#10;G0 X0 Y120&#10;M3 ; Bajar lápiz&#10;G1 X30 Y120 F1000&#10;G1 X30 Y90&#10;M5 ; Subir lápiz"
                className="w-full h-40 p-2 text-xs font-mono border rounded resize-none"
                disabled={ejecutando}
              />
              
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={ejecutarGcode}
                  disabled={ejecutando || !codigoGcode.trim()}
                  className="bg-blue-900 text-white py-2 rounded font-semibold hover:bg-blue-800 disabled:bg-gray-300 text-sm"
                >
                  {ejecutando ? 'Ejecutando...' : 'Ejecutar'}
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
                ? 'Configura tu máquina y prueba movimientos manuales...' 
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
          <h3 className="font-semibold text-blue-900 mb-2">Configuración</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Mecanismo de 5 Barras</strong></li>
            <li>• 2 servos en la base (paralelos)</li>
            <li>• 4 eslabones móviles</li>
            <li>• Alta rigidez estructural</li>
            <li>• Mayor precisión</li>
          </ul>
        </div>
        
        <div className="bg-indigo-50 p-4 rounded-lg border-2 border-indigo-200">
          <h3 className="font-semibold text-indigo-900 mb-2">Comandos G-code</h3>
          <ul className="text-sm text-indigo-800 space-y-1 font-mono">
            <li><strong>G0/G1</strong> X Y F - Mover</li>
            <li><strong>G28</strong> - Home</li>
            <li><strong>G4</strong> P/S - Pausa</li>
            <li><strong>M3</strong> - Bajar lápiz</li>
            <li><strong>M5</strong> - Subir lápiz</li>
          </ul>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
          <h3 className="font-semibold text-green-900 mb-2">Ventajas</h3>
          <ul className="text-sm text-green-800 space-y-1">
            <li>• Mayor velocidad</li>
            <li>• Menor inercia</li>
            <li>• Más preciso</li>
            <li>• Área de trabajo simétrica</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

window.BrazoParalelo5Barras = BrazoParalelo5Barras;