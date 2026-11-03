# Referencia de diseño — CRM Sabor Mágico

El mockup aprobado (`CRM Sabor Mágico.html`) es la fuente de verdad visual del frontend.
Ese archivo es un bundle autoextraíble; aquí se conserva su contenido legible:

| Archivo | Contenido |
| --- | --- |
| `mockup-template.html` | Plantilla decodificada (estructura y estilos inline exactos de cada vista). `{{ }}`, `sc-for` y `sc-if` son el motor de plantillas del mockup; en Next.js se traducen a JSX. |
| `mockup-logic.js` | Lógica y datos de ejemplo del mockup (estados, colores, textos, comportamiento de botones). |

## Tokens visuales

- Tipografía: **Plus Jakarta Sans** 400/500/600/700, `-webkit-font-smoothing: antialiased`.
- Lienzo `#e8ebf1`, tarjetas blancas con radio 20 px, separación 12 px, padding exterior 16 px.
- Navegación lateral `#0e1838`, 76 px de ancho, ítems de 52 px.
- Texto: principal `#131a2e`, secundario `#5b6478`, tenue `#7a8296`, muy tenue `#8a92a5`.
- Acento: `#1f3fbf` (hover `#18339e`), naranja de acción `#f26a1b`.
- Canales: WhatsApp `#1f9d55`, Facebook `#2b55e6`, Instagram `#c13584`, Web `#6b7385`.
- Estados (fondo / texto):
  - Negociando `#eef2ff / #2b45b8`
  - Esperando al dueño · Requiere humano `#fff1e6 / #b14a0b`
  - Aceptada `#e8f6ee / #14753f`
  - Rechazada `#fdecec / #b42323`
  - Cancelada · Consulta `#f0f2f5 / #4a5368`

## Adaptaciones respecto al mockup

El mockup usa datos de ejemplo de Colombia (COP, +57, Bogotá). El backend (`bk-crm`) solo admite
`PEN`/`USD` y zona `America/Lima`, por eso los datos simulados del frontend usan Perú.
La estructura, colores, tipografía y estados se mantienen idénticos.
