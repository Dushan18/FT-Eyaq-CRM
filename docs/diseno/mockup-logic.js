// Lógica y datos de ejemplo del mockup aprobado "CRM Sabor Mágico.html" (decodificado).
// Solo es referencia de comportamiento, textos y colores. Los datos reales vienen de bk-crm.
// Prop de diseño: mostrarFlujo (boolean, default true) muestra la tarjeta de solicitud en la Bandeja.

const ST = {
  negociando: { label: 'Negociando', bg: '#eef2ff', fg: '#2b45b8' },
  esperando: { label: 'Esperando al dueño', bg: '#fff1e6', fg: '#b14a0b' },
  aceptada: { label: 'Aceptada', bg: '#e8f6ee', fg: '#14753f' },
  rechazada: { label: 'Rechazada', bg: '#fdecec', fg: '#b42323' },
  cancelada: { label: 'Cancelada', bg: '#f0f2f5', fg: '#4a5368' },
  humano: { label: 'Requiere humano', bg: '#fff1e6', fg: '#b14a0b' },
  consulta: { label: 'Consulta', bg: '#f0f2f5', fg: '#4a5368' },
};
const CH = { wa: ['WhatsApp', '#1f9d55', 'W'], fb: ['Facebook', '#2b55e6', 'f'], ig: ['Instagram', '#c13584', 'IG'], web: ['Web', '#6b7385', 'W'] };

// Tipos de mensaje: 'c' cliente, 's' Samanta, 'a' operador, 'x' evento de sistema, 'ok' evento positivo, 'no' evento negativo.
const C = [
  { id: 1, name: 'María Fernández', initials: 'MF', ch: 'wa', time: '2 min', unread: 2, status: 'Solicitó reserva', phone: '+57 310 442 9081', email: 'maria.fdz@correo.com', first: '12 oct 2026', tag: 'esperando', mode: 'samanta',
    req: { id: 'SOL-2461', date: 'Vie 16 oct · 20:00', pax: '6 personas', service: 'Cena · Terraza', notes: 'Cumpleaños, pide torta' },
    msgs: [['c', 'Hola, quiero reservar para el viernes en la noche, somos 6', '19:02'], ['s', '¡Hola María! Con gusto. Tenemos disponibilidad a las 19:30 o 20:00, en salón o terraza. ¿Cuál prefieres?', '19:02'], ['c', 'A las 8 en terraza. Es un cumpleaños, ¿pueden poner una torta?', '19:04'], ['s', 'Perfecto. Podemos incluir torta de chocolate por $45.000. Te confirmo: viernes 16, 20:00, 6 personas, terraza, con torta. ¿Es correcto?', '19:04'], ['c', 'Sí, perfecto', '19:05'], ['x', 'Solicitud enviada al dueño por WhatsApp', '19:05'], ['s', 'Listo, envié tu solicitud. Te aviso apenas el restaurante la confirme.', '19:05']],
    history: [] },
  { id: 2, name: 'Carlos Ibáñez', initials: 'CI', ch: 'fb', time: '14 min', unread: 1, status: 'En conversación', phone: '+57 315 220 1874', email: '—', first: '13 oct 2026', tag: 'negociando', mode: 'samanta',
    req: null,
    msgs: [['c', '¿Tienen mesa para hoy a las 9?', '18:51'], ['s', 'Hola Carlos. Hoy a las 21:00 tenemos mesa en salón principal. ¿Para cuántas personas sería?', '18:51'], ['c', 'Somos 4, ¿tienen menú vegetariano?', '18:53']],
    history: [] },
  { id: 3, name: 'Andrea Salazar', initials: 'AS', ch: 'ig', time: '1 h', unread: 0, status: 'Confirmado', phone: '+57 300 918 5520', email: 'andrea.s@correo.com', first: '02 sep 2026', tag: 'aceptada', mode: 'samanta',
    req: { id: 'SOL-2458', date: 'Sáb 17 oct · 13:00', pax: '2 personas', service: 'Almuerzo · Salón', notes: '—' },
    msgs: [['c', 'Quiero reservar almuerzo el sábado para 2', '17:20'], ['s', 'Claro. ¿Te funciona a las 13:00 en salón?', '17:20'], ['c', 'Sí', '17:21'], ['x', 'Solicitud enviada al dueño por WhatsApp', '17:21'], ['ok', 'El dueño aceptó la reserva', '17:34'], ['s', '¡Confirmado! Te esperamos el sábado 17 a las 13:00.', '17:34'], ['c', 'Genial, muchas gracias', '17:40']],
    history: [['RES-1098', '20 sep 2026', 'aceptada']] },
  { id: 4, name: 'Grupo Empresarial Tauro', initials: 'GT', ch: 'wa', time: '3 h', unread: 1, status: 'Interesado', phone: '+57 601 744 3300', email: 'eventos@tauro.co', first: '13 oct 2026', tag: 'humano', mode: 'humano',
    req: null,
    msgs: [['c', 'Necesitamos cotización para cena de fin de año, 40 personas', '15:10'], ['s', 'Con gusto. Para grupos de más de 20 personas un asesor prepara la propuesta. Te transfiero ahora.', '15:10'], ['x', 'Transferido a operador', '15:11']],
    history: [] },
  { id: 5, name: 'Jorge Peña', initials: 'JP', ch: 'web', time: '5 h', unread: 0, status: 'Recurrente', phone: '+57 300 551 1123', email: 'jorge@correo.com', first: '14 jun 2026', tag: 'cancelada', mode: 'samanta',
    req: { id: 'SOL-2455', date: 'Sáb 8 ago · 20:00', pax: '4 personas', service: 'Cena · Salón principal', notes: 'Cancelada por el cliente' },
    msgs: [['c', 'Quisiera cancelar mi reserva del viernes', '13:12'], ['s', 'Hola Jorge. Encontré tu reserva del sábado 8 a las 20:00 para 4 personas. ¿Confirmas que deseas cancelarla?', '13:12'], ['c', 'Sí, por favor', '13:14'], ['x', 'Reserva cancelada y retirada del calendario', '13:14'], ['s', 'Listo, quedó cancelada. Si quieres reprogramar, escríbeme cuando gustes.', '13:14']],
    history: [['RES-1140', '14 jun 2026', 'aceptada'], ['SOL-2312', '02 nov 2025', 'rechazada']] },
  { id: 6, name: 'Lucía Fernández', initials: 'LF', ch: 'wa', time: '1 d', unread: 0, status: 'Nuevo', phone: '+57 312 006 4417', email: '—', first: '12 oct 2026', tag: 'consulta', mode: 'samanta',
    req: null,
    msgs: [['c', '¿Cuál es el menú del día?', 'Ayer 12:30'], ['s', 'Hoy tenemos lomo al grill con papas criollas y ensalada, $38.000. ¿Te ayudo con una reserva?', 'Ayer 12:30']],
    history: [] },
  { id: 7, name: 'Ricardo Núñez', initials: 'RN', ch: 'ig', time: '1 d', unread: 0, status: 'En conversación', phone: '+57 318 330 9012', email: 'rnunez@correo.com', first: '10 oct 2026', tag: 'rechazada', mode: 'samanta',
    req: { id: 'SOL-2449', date: 'Dom 18 oct · 14:00', pax: '8 personas', service: 'Almuerzo · Terraza', notes: 'Terraza sin cupo' },
    msgs: [['c', 'Reserva para 8 el domingo a las 2 en terraza', 'Ayer 10:02'], ['x', 'Solicitud enviada al dueño por WhatsApp', 'Ayer 10:04'], ['no', 'El dueño rechazó la solicitud', 'Ayer 10:30'], ['s', 'Ricardo, la terraza no tiene cupo ese horario. Puedo ofrecerte salón principal a las 14:00 o terraza a las 16:00.', 'Ayer 10:30'], ['c', 'No podré asistir, gracias', 'Ayer 11:15']],
    history: [] },
  { id: 8, name: 'Paola Duarte', initials: 'PD', ch: 'fb', time: '2 d', unread: 0, status: 'Confirmado', phone: '+57 304 771 2290', email: 'paoduarte@correo.com', first: '05 oct 2026', tag: 'aceptada', mode: 'samanta',
    req: { id: 'SOL-2440', date: 'Jue 15 oct · 19:00', pax: '3 personas', service: 'Cena · Salón', notes: '—' },
    msgs: [['c', '¿Me confirman la reserva del jueves?', '11 oct 09:10'], ['ok', 'El dueño aceptó la reserva', '11 oct 09:22'], ['s', 'Confirmado para el jueves 15 a las 19:00, 3 personas.', '11 oct 09:22'], ['c', 'Confirmado para el jueves, gracias', '11 oct 09:25']],
    history: [] },
];

const I = {
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  req: 'M9 11l2 2 4-4M5 4h14v16H5z',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  stat: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  team: 'M16 20v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cfg: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
};

// [id, cliente, canal, fecha, personas, servicio, estado, respuesta, idConversación]
const SOLS = [['SOL-2461','María Fernández','wa','Vie 16 oct · 20:00',6,'Cena · Terraza','esperando','Esperando 2 min',1],['SOL-2460','Diego Restrepo','ig','Sáb 17 oct · 21:00',2,'Cena · Salón','esperando','Esperando 38 min',null],['SOL-2458','Andrea Salazar','ig','Sáb 17 oct · 13:00',2,'Almuerzo · Salón','aceptada','En 13 min',3],['SOL-2455','Jorge Peña','web','Sáb 8 ago · 20:00',4,'Cena · Salón principal','cancelada','Por el cliente',5],['SOL-2449','Ricardo Núñez','ig','Dom 18 oct · 14:00',8,'Almuerzo · Terraza','rechazada','En 26 min',7],['SOL-2447','Valentina Ríos','fb','Mié 14 oct · 19:30',4,'Cena · Salón','aceptada','En 8 min',null],['SOL-2440','Paola Duarte','fb','Jue 15 oct · 19:00',3,'Cena · Salón','aceptada','En 12 min',8],['SOL-2438','Felipe Ortiz','web','Mar 13 oct · 13:30',5,'Almuerzo ejecutivo','aceptada','En 5 min',null],['SOL-2431','Camila Vargas','wa','Lun 12 oct · 20:00',2,'Cena · Terraza','rechazada','En 41 min',null]];

// [día, hora, cliente, personas, servicio, zona, notas, canal] → id RES-1201…
const RES = [[12,'13:00','Familia Gómez',4,'Almuerzo','Salón','—','wa'],[12,'20:30','Andrés Mejía',2,'Cena','Terraza','Aniversario','ig'],[13,'13:30','Felipe Ortiz',5,'Almuerzo ejecutivo','Salón','Factura a empresa','web'],[14,'19:30','Valentina Ríos',4,'Cena','Salón','Silla para bebé','fb'],[14,'21:00','Sergio Pardo',2,'Cena','Barra','—','wa'],[15,'19:00','Paola Duarte',3,'Cena','Salón','—','fb'],[16,'12:30','Laura Cano',6,'Almuerzo','Terraza','—','wa'],[16,'20:00','Martín Rojas',8,'Cena','Salón principal','Menú degustación','web'],[17,'13:00','Andrea Salazar',2,'Almuerzo','Salón','—','ig'],[17,'20:00','Natalia Ruiz',10,'Cena','Salón privado','Cumpleaños, decoración','wa'],[17,'21:30','Óscar León',2,'Cena','Terraza','—','fb'],[18,'13:00','Familia Herrera',7,'Almuerzo','Terraza','Dos vegetarianos','wa']].map((r,i)=>({id:'RES-'+(1201+i),day:r[0],time:r[1],client:r[2],pax:r[3],service:r[4],area:r[5],notes:r[6],ch:r[7]}));
const DN = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DNL = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
// Reservas por día del mes (fuera de la semana detallada).
const MCOUNT = {1:3,2:5,3:7,4:4,5:2,6:3,7:2,8:4,9:6,10:8,11:5,19:1,20:1,23:2,24:3,30:1};
const STATS = {
  Semana: { k: [['Reservas aceptadas','12','de 15 solicitudes'],['Rechazadas','3','2 renegociadas por Samanta'],['Tasa de aceptación','80%','Respuesta media del dueño: 14 min'],['Resueltas por Samanta','87%','Sin intervención humana']], ch: [['WhatsApp',68,6],['Instagram',34,3],['Facebook',26,2],['Web',18,1]], sv: [['Cena · Salón',7],['Almuerzo',5],['Cena · Terraza',4],['Eventos y grupos',2],['Menú degustación',1]], bars: [2,1,2,1,2,3,1], bl: DN, bt: 'Reservas aceptadas por día' },
  Mes: { k: [['Reservas aceptadas','47','de 56 solicitudes'],['Rechazadas','9','6 renegociadas por Samanta'],['Tasa de aceptación','84%','Respuesta media del dueño: 17 min'],['Resueltas por Samanta','85%','Sin intervención humana']], ch: [['WhatsApp',270,24],['Instagram',131,11],['Facebook',98,8],['Web',63,4]], sv: [['Cena · Salón',21],['Almuerzo',14],['Cena · Terraza',11],['Eventos y grupos',6],['Menú degustación',3]], bars: [9,12,14,12], bl: ['Sem 1','Sem 2','Sem 3','Sem 4'], bt: 'Reservas aceptadas por semana' },
};
const EST = { 'Nuevo':['#f0f2f5','#4a5368'], 'Interesado':['#eef2ff','#2b45b8'], 'En conversación':['#eef2ff','#2b45b8'], 'Solicitó reserva':['#fff1e6','#b14a0b'], 'Confirmado':['#e8f6ee','#14753f'], 'Rechazado':['#fdecec','#b42323'], 'Perdido':['#f0f2f5','#6b7385'], 'Recurrente':['#e6f4f1','#0f6b5c'] };
// [nombre, canal, estado, último contacto, reservas, consultó, idConversación, teléfono]
const CLIS = [['María Fernández','wa','Solicitó reserva','Hace 2 min',0,'Cena cumpleaños',1,'+57 310 442 9081'],['Carlos Ibáñez','fb','En conversación','Hace 14 min',0,'Mesa para hoy',2,'+57 315 220 1874'],['Andrea Salazar','ig','Confirmado','Hace 1 h',2,'Almuerzo',3,'+57 300 918 5520'],['Grupo Empresarial Tauro','wa','Interesado','Hace 3 h',0,'Evento 40 personas',4,'+57 601 744 3300'],['Jorge Peña','web','Recurrente','Hace 5 h',3,'Cancelación',5,'+57 300 551 1123'],['Lucía Fernández','wa','Nuevo','Ayer',0,'Menú del día',6,'+57 312 006 4417'],['Ricardo Núñez','ig','Perdido','Ayer',0,'Terraza domingo',7,'+57 318 330 9012'],['Paola Duarte','fb','Confirmado','Hace 2 d',1,'Cena',8,'+57 304 771 2290'],['Camila Vargas','wa','Rechazado','Hace 4 d',0,'Cena terraza',null,'+57 311 883 0045'],['Natalia Ruiz','wa','Confirmado','Hace 5 d',4,'Salón privado',null,'+57 320 114 7789'],['Felipe Ortiz','web','Recurrente','Hace 6 d',6,'Almuerzo ejecutivo',null,'+57 301 552 6630']];

// Estado inicial del mockup:
// { sel: 5, filter: 'Todos', query: '', draft: '', navSel: 'Bandeja', calView: 'Semana', calDay: 13, calSel: null,
//   prepared: {}, solTab: 'Todas', statP: 'Semana', cliQ: '', cliEst: 'Todos', cfgTab: 'Empresa', tog: {} }

// Interruptor (toggle): on → fondo #1f3fbf y perilla a la derecha; off → #d6dbe4 y perilla a la izquierda.
// Segmentado (seg): activo → fondo #fff, texto #131a2e, sombra '0 1px 2px rgba(20,27,45,.1)'; inactivo → transparente, #5b6478.
// Chips de filtro: activo → fondo/borde #1f3fbf, texto #fff; inactivo → fondo #fff, borde #e1e5ec, texto #3b4560.

// --- Bandeja ---
// Enviar (send): si hay texto, la conversación pasa a modo 'humano'; si no lo estaba, se agrega el evento
//   ['x', 'Operador tomó la conversación', hora] y luego ['a', texto, hora]. Enter también envía.
// Lista: vista previa = último mensaje que no es evento; prefijo 'Samanta: ' (s) o 'Tú: ' (a).
//   Seleccionado: fondo #f1f4fd, borde izquierdo #1f3fbf. Nombre en 700 si hay no leídos, si no 600.
//   Al abrir una conversación se ponen sus no leídos en 0.
// Filtro de búsqueda: nombre + texto de mensajes, sin distinguir mayúsculas.
// Eventos: ok → #e8f6ee/#14753f, no → #fdecec/#b42323, x → #eceff4/#4a5368.
// Burbujas salientes: operador #1f3fbf/#fff ('Operador'); Samanta #e9eefc/#131a2e ('Samanta · IA').
// Modo: humano → 'Operador' #fff1e6/#b14a0b punto #f26a1b; pausa → 'En pausa' #f0f2f5/#4a5368 punto #8a92a5;
//       samanta → 'Samanta' #e8f6ee/#14753f punto #1f9d55.
// Botón Pausar/Reanudar solo si el modo no es humano (alterna pausa ↔ samanta).
// Botón transferir: en humano → 'Devolver a Samanta' (#eef2ff/#1f3fbf), agrega evento 'Devuelto a Samanta';
//                   si no → 'Pasar a humano' (#f26a1b/#fff), agrega evento 'Transferido a operador'.
// Línea de tiempo de la solicitud:
//   stage = { negociando: 0, esperando: 1, aceptada: 2, rechazada: 2, cancelada: 2 }[tag] ?? 0
//   final = aceptada  → ['Aceptada por el dueño', 'Registrada en el calendario', '#1f9d55']
//           rechazada → ['Rechazada por el dueño', 'Samanta propone otra alternativa', '#dc2626']
//           cancelada → ['Cancelada', 'Retirada del calendario', '#6b7385']
//           otro      → ['Respuesta del dueño', 'ACEPTAR o RECHAZAR', '#1f3fbf']
//   pasos = [['Samanta negocia','Fecha, hora, personas y servicio','#1f3fbf'], ['Enviada al dueño','Por WhatsApp personal','#f26a1b'], final]
//   done = i < stage || (i === 2 && stage === 2); current = i === stage && stage < 2
//   punto = done ? color : '#fff'; aro = done||current ? color : '#d6dbe4'; texto = done||current ? '#131a2e' : '#8a92a5'

// --- Solicitudes ---
// Pestañas: Todas, Esperando (esperando), Aceptadas (aceptada), Rechazadas (rechazada).
// Indicadores: Esperando al dueño (#b14a0b), Aceptadas (#14753f), Rechazadas (#b42323), Respuesta media '14 min' (#131a2e).
// Botón 'Chat' abre la conversación en la Bandeja (limpia filtro y búsqueda).

// --- Calendario ---
// Semana: encabezado del día seleccionado #1f3fbf/#fff, hoy #eef2ff, otros #f5f6f9. Clic en el día → vista Día.
// Tarjeta seleccionada: borde #1f3fbf fondo #f1f4fd; preparada: fondo #f3faf6 y punto verde #1f9d55; normal: borde #e4e8ee fondo #fff.
// Mes: 35 celdas, la primera columna es lunes; hoy con borde y número #1f3fbf; días fuera del mes con opacidad .35.
// Subtítulo: Mes → 'Octubre 2026.'; Semana → 'Semana del 12 al 18 de octubre.'; Día → ''.
// Botón de detalle: preparada → 'Preparada ✓' #e8f6ee/#14753f; si no → 'Marcar como preparada' #1f3fbf/#fff.

// --- Estadísticas ---
// Canales: barra clara = conversaciones (ancho relativo al máximo), barra oscura = reservas (relativo al máximo × 0.6).
// Servicios: ancho relativo al primero. Barras: alto = valor / máximo × 110 px.

// --- Ajustes ---
// Pestañas: Empresa, Horarios, Servicios, Políticas, Samanta, Usuarios. Activa: fondo #f1f4fd, texto #1f3fbf; inactiva: transparente, #3b4560.
// Empresa: Nombre comercial; Moneda; Descripción (ancho completo); Dirección (ancho completo); WhatsApp del negocio; Correo; Página web; Idiomas de atención.
// Horarios: Lunes cerrado; Mar–Mié 12:00–22:00; Jue 12:00–23:00; Vie–Sáb 12:00–00:00; Dom 12:00–18:00.
// Servicios (inactivo con opacidad .5): Lomo al grill · Parrillada para 2 · Menú del día · Menú degustación (inactivo) · Torta de cumpleaños · Salón privado.
// Políticas: 'Política de reserva', 'Política de cancelación'.
// Samanta: canales WhatsApp/Facebook/Instagram/Web; Validación del dueño: Responsable de aprobación, WhatsApp personal,
//   Tiempo máximo de respuesta, Si no responde; Reglas: 'Ofrecer solo servicios activos y precios registrados' (on),
//   'Transferir a humano en grupos de más de 20 personas' (on), 'Proponer otra fecha u horario si el dueño rechaza' (on),
//   'Enviar recordatorio al cliente 24 h antes' (off).
// Usuarios: Frank (Administrador), Ricardo Mora (Propietario), Camila Torres (Operador), Soporte EYAQ (Soporte EYAQ).
