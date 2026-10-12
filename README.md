# chat-widget

***Español** · [English](https://github.com/ldavidsm/chat-widget/blob/main/README.en.md)*

Una UI de chat que se enchufa en cualquier web. **El backend lo pones tú.**

Es la parte que nadie quiere construir — burbuja, panel, streaming, markdown,
móvil, accesibilidad — sin ninguna opinión sobre de dónde salen las respuestas.
La apuntas a un endpoint y funciona; le cambias la forma a la petición y
funciona con la API que ya tengas.

**[Demo en vivo →](https://ldavidsm.github.io/chat-widget/)** — el panel, el
streaming token a token, las tarjetas y un calendario reservable, funcionando
sin ningún backend detrás.

<!-- Graba un GIF de 6 s del calendario apareciendo dentro del chat, déjalo en
     docs/demo.gif y descomenta:
![chat-widget](https://ldavidsm.github.io/chat-widget/demo.gif)
-->

- **~13 KB gzipped**, cero dependencias
- **Shadow DOM** — el CSS de la página no entra, el del widget no se escapa
- **Streaming** — SSE, NDJSON o texto plano
- **Sin llaves en el navegador** — el widget habla con *tu* backend y con nada más
- Funciona en HTML plano, WordPress, React, Vue, lo que sea

## Instalar

```html
<script src="https://cdn.jsdelivr.net/npm/@luisdsm/chat-widget@0.3.1/dist/chat-widget.js"
        data-endpoint="https://tu-api.com/chat"
        data-title="Soporte"
        data-greeting="¡Hola! ¿En qué puedo ayudarte?"
        async></script>
```

Esa es la integración completa. Fija la versión exacta como arriba para que una
release no te cambie un sitio en producción. `@0.3` sigue la última 0.3.x, y
quitar la versión del todo sirve siempre la más nueva — cómodo para una demo,
mala idea en el sitio de un cliente.

O con npm:

```bash
npm install @luisdsm/chat-widget
```

```js
import { init } from '@luisdsm/chat-widget';

const widget = init({ endpoint: 'https://tu-api.com/chat' });
```

## Los tres niveles

### 1. Un endpoint

El widget manda un POST con JSON y saca la respuesta del cuerpo. Encuentra
automáticamente cualquiera de `reply`, `message`, `text`, `output`, `answer`,
`content`, `response`, y también la forma de OpenAI
`choices[0].message.content`.

```js
init({
  endpoint: 'https://tu-api.com/chat',
  headers: { Authorization: 'Bearer token-de-sesion-publico' },
  stream: true,
});
```

Lo que envía:

```json
{ "message": "hola", "sessionId": "sess_...", "history": [], "timestamp": "..." }
```

### 2. Un endpoint con otra forma

Tu API ya existe y no se parece a eso. Tradúcela:

```js
init({
  endpoint: 'https://tu-n8n.com/webhook/chat',
  transformRequest:  (message, ctx) => ({ pregunta: message, sid: ctx.sessionId }),
  transformResponse: (data) => data.resultado[0].respuesta,
});
```

### 3. Tu propia función

Control total. No se hace ningún fetch por ti; `ctx.append()` escribe en la
burbuja a medida que llega.

```js
init({
  onSend: async (message, ctx) => {
    const stream = await miPropiaLogica(message, ctx.history);
    for await (const chunk of stream) ctx.append(chunk);
  },
});
```

Devuelve una cadena en su lugar si ya tienes la respuesta entera.

## Adaptadores

Preajustes que rellenan los niveles 1 y 2 para un backend conocido. Un
adaptador no es más que un objeto de opciones, así que cualquier cosa que pases
a su lado tiene prioridad.

```js
import { init, adapters } from '@luisdsm/chat-widget';

init({
  adapter: adapters.openai({
    endpoint: 'https://tu-api.com/v1/chat/completions', // tu proxy
    model: 'gpt-4o-mini',
    system: 'Eres una asistente concisa.',
  }),
  texts: { title: 'Asistente' },
});

init({
  adapter: adapters.n8n({ webhookUrl: 'https://tu-n8n.com/webhook/abc' }),
});
```

## Bloques

El texto no siempre es la respuesta. Una contestación puede traer contenido
estructurado, y el widget lo pinta buscando su `type` en un registro:

```json
{
  "reply": "Elige el día que te venga bien",
  "blocks": [{ "type": "calendar", "service": "Limpieza facial" }]
}
```

Vienen tres tipos de serie — `quickReplies`, `cards` y `calendar` — y los tres
se pueden reemplazar. Registrar un tipo es dar una función que devuelve un nodo
del DOM:

```js
init({
  endpoint: '/chat',
  blocks: {
    producto: (data, ctx) => {
      const node = document.createElement('div');
      node.textContent = `${data.nombre} — ${data.precio}`;
      node.onclick = () => ctx.send(`Quiero ${data.nombre}`);
      return node;
    },
  },
});
```

El renderizador recibe `(data, ctx)`, donde `data` es el bloque sin su `type` y
`ctx` lleva `send`, `addMessage`, `render`, `locale`, `scrollToBottom` y
`widget`. Un renderizador que lance una excepción se loguea y se salta: la
conversación sobrevive. Los bloques también funcionan a mitad de stream: manda
un payload SSE con una clave `blocks` después del texto y aparecen cuando la
respuesta termina.

### quickReplies

```json
{ "type": "quickReplies", "options": ["Sí", { "label": "📅 Reservar", "value": "Quiero reservar" }] }
```

### cards

```json
{ "type": "cards", "items": [
  { "title": "Limpieza facial", "text": "60 min · 45 €", "image": "https://…",
    "button": "Reservar", "value": "Reservar una limpieza facial" }
]}
```

Una tarjeta con `url` se convierte en enlace; con `value` manda ese texto a la
conversación como si lo hubiera escrito la persona.

### calendar

Por defecto los huecos vienen en el payload, así que tu backend sigue siendo el
dueño de la disponibilidad:

```json
{ "type": "calendar", "service": "Limpieza facial", "slots": [
  { "start": "2026-10-07T10:00:00+02:00", "staff": "Ana Pérez" },
  { "start": "2026-10-07T11:00:00+02:00" }
]}
```

Para una agenda de verdad querrás que los pida mes a mes. Registra el
calendario con tu propio cargador:

```js
import { init, blocks } from '@luisdsm/chat-widget';

init({
  endpoint: '/chat',
  locale: 'es-ES',
  blocks: {
    calendar: blocks.calendar({
      loadSlots: async ({ start, end, service }) => {
        const res = await fetch(`/slots?from=${start}&to=${end}&service=${service}`);
        return res.json();
      },
      // Por defecto manda "martes 7 de octubre a las 10:00 con Ana" como mensaje.
      onSelect: (slot, ctx) => ctx.send(`Reservar ${slot.date.toISOString()}`),
    }),
  },
});
```

`loadSlots` recibe `{ start, end, startDate, endDate, service, year, month, ctx }`
— `start` y `end` son cadenas `AAAA-MM-DD` en hora local — y puede devolver
cadenas ISO u objetos. Entiende todas estas formas:

```js
'2026-10-07T10:00:00+02:00'

{ start: '2026-10-07T10:00:00+02:00',
  end:   '2026-10-07T13:00:00+02:00',   // o duration: 180
  resources: ['Cabina 2', { label: 'Ana Pérez', type: 'staff' }],
  label: '10:00' }                       // sustituye la hora que se muestra

{ slot_start: '2026-10-07 10:00:00+02',  // estilo Postgres
  slot_end:   '2026-10-07 10:30:00+02',
  staff_name: 'Ana Pérez' }
```

La última es la salida literal de un `timestamptz` de Postgres, con un espacio
donde ISO quiere una `T` y un offset sin minutos. El navegador rechaza las dos
cosas, así que se normalizan antes de parsear: si no, el hueco desaparecía del
calendario sin un error en ninguna parte.

**Duración.** Da `end` (o `duration` en minutos) y el hueco muestra lo que
dura — `30 min`, `1 h 30`, `3 h`. Déjalo fuera y solo aparece la hora de
inicio, que es lo que quiere una clínica con citas de duración uniforme. Un
`end` anterior al inicio se ignora en lugar de pintarse como negativo.

**Recursos.** `resources` es cualquier cosa reservable junto con la hora: una
persona, una sala, una cabina, una máquina. Las entradas de tipo `staff` se
acortan al nombre de pila en la rejilla y se leen como "con Ana" en el mensaje;
el resto se muestra entero. `staff` y `staff_name` siguen funcionando y acaban
como un recurso `staff`, así que `slot.staff` devuelve lo mismo que antes.

Opciones del calendario: `loadSlots`, `onSelect`, `selectMessage`, `texts`
(incluido `texts.units` para las etiquetas `h` / `min`), `weekStart` (`1` para
lunes, el valor por defecto), `monthsAhead` (`3`), `locale`.

### ⚠️ Manda el offset de la zona horaria

Una fecha-hora sin offset — `2026-10-07T10:00:00` — la lee el navegador como
**hora local de quien mira**, no del negocio. Alguien que reserve desde otro
país ve la hora equivocada, sin aviso en ninguna parte.

Si todos tus visitantes están en la misma zona que el calendario, da igual. Si
no, manda siempre el offset y deja que el widget convierta:

```js
'2026-10-07T10:00:00+02:00'   // o '2026-10-07T08:00:00Z'
```

El hueco que llega a `onSelect` lleva un `Date` real, así que
`slot.date.toISOString()` es lo que guardas.

## ⚠️ Las API keys no van aquí

El widget corre en el navegador. Todo lo que le pases — cabeceras incluidas —
lo puede leer cualquiera que abra las devtools. **Nunca pongas una API key de
un LLM en la configuración del widget.** Apunta `endpoint` a tu propio backend,
guarda la llave ahí y deja que él llame al modelo. Con un proxy de 20 líneas
basta:

```python
from fastapi import FastAPI
from pydantic import BaseModel
import os, httpx

app = FastAPI()

class Turn(BaseModel):
    message: str
    sessionId: str | None = None

@app.post("/chat")
async def chat(turn: Turn):
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": turn.message}],
            },
        )
    return {"reply": res.json()["choices"][0]["message"]["content"]}
```

## Opciones

| Opción | Por defecto | Qué hace |
| --- | --- | --- |
| `endpoint` | — | URL a la que el widget manda el POST |
| `onSend` | — | Te encargas tú del intercambio (sustituye a `endpoint`) |
| `adapter` | — | Opciones preajustadas para un backend conocido |
| `stream` | `false` | Leer la respuesta como stream |
| `method` | `'POST'` | Método HTTP |
| `headers` | — | Objeto, o una función `(ctx) => headers` |
| `credentials` | — | Se pasa a `fetch` (`'include'` para auth por cookie) |
| `timeout` | `60000` | Abortar tras estos ms **sin que llegue un solo byte**. Cada chunk lo reinicia, así que acota un cuelgue, no lo que dure una respuesta |
| `transformRequest` | — | `(message, ctx) => body` |
| `transformResponse` | — | `(data, ctx) => string \| { text, quickReplies }` |
| `parseChunk` | — | `(payload) => string \| null` por cada chunk del stream |
| `blocks` | — | Renderizadores de bloques: `{ type: (data, ctx) => node }` |
| `markdown` | `true` | `false` para texto plano, o tu propio renderizador |
| `position` | `'bottom-right'` | O `'bottom-left'` |
| `avatar` | `'✨'` | Un emoji, o la URL de una imagen |
| `quickReplies` | — | Botones que se muestran con el saludo |
| `openOnLoad` | `false` | Arrancar abierto |
| `badgeDelay` | `3000` | Ms antes de que aparezca el punto de no leído; `false` lo desactiva |
| `greetingDelay` | `400` | Ms antes de que caiga el saludo |
| `historyLimit` | `20` | Turnos que se guardan y se mandan como `history` |
| `showTimes` | `true` | Horas debajo de los mensajes |
| `locale` | navegador | Se usa para formatear horas y fechas |
| `key` | `'default'` | Da espacio de nombres a la sesión guardada; ponlo si montas dos widgets |
| `session` | — | `{ storage: 'local' \| 'session' \| false, id }` |
| `container` | `document.body` | Dónde montarlo |
| `texts` | ver abajo | Todos los textos que ve la persona |
| `theme` | ver abajo | Colores y tamaños |

### texts

```js
texts: {
  title: 'Asistente',
  status: 'En línea',
  placeholder: 'Escribe un mensaje…',
  greeting: '',          // se muestra al abrir por primera vez
  error: 'Algo ha ido mal. Inténtalo de nuevo.',
  footer: '',
  send: 'Enviar mensaje',
  close: 'Cerrar chat',
  launcher: 'Abrir chat',
}
```

### theme

```js
theme: {
  primary: '#C9A96E',
  primaryHover: '#b8944f',
  dark: '#2a2118',
  light: '#fdf8f2',
  surface: '#ffffff',
  text: '#2a2118',
  radius: '20px',
  width: '400px',
  height: '580px',
  launcherSize: '60px',
  offset: '28px',
  fontBody: "'DM Sans', sans-serif",
  fontHeading: "'Cormorant Garamond', serif",
  zIndex: 2147483000,
}
```

Cada clave es una propiedad personalizada de CSS en el elemento anfitrión, así
que también puedes ponerlas desde tu propia hoja de estilos: las propiedades
personalizadas sí atraviesan la frontera del shadow DOM.

```css
[data-chat-widget] { --cw-primary: #6366f1; }
```

El widget **no** carga ninguna fuente. Por defecto cae a la pila del sistema;
carga tú las familias si quieres el aspecto original.

## API

```js
const widget = init({ /* … */ });

widget.open();
widget.close();
widget.toggle();
widget.sendMessage('texto');          // como si lo hubiera escrito la persona
widget.addMessage('bot', '**hola**'); // insertar sin llamar al backend
widget.addQuickReplies(['Sí', 'No']);
widget.addBlock('calendar', { service: 'Facial' });
widget.setTheme({ primary: '#111' });
widget.reset();                       // limpia la conversación + nueva sesión
widget.destroy();

widget.on('open',    () => {});
widget.on('close',   () => {});
widget.on('message', ({ role, content }) => {});
widget.on('error',   (error) => {});
widget.on('ready',   (widget) => {});
```

`on()` devuelve una función para desuscribirse. Todos los eventos están también
como opción `onOpen` / `onClose` / `onMessage` / `onError` / `onReady`.

## Atributos data

Para la instalación sin JavaScript. `data-endpoint` es lo que dispara el
arranque automático; añade `data-auto="false"` para cargar el script sin
levantar ningún widget.

`data-endpoint` `data-stream` `data-key` `data-position` `data-avatar`
`data-locale` `data-open-on-load` `data-quick-replies` (separados por `|`)
`data-title` `data-status` `data-greeting` `data-placeholder` `data-footer`
`data-error` `data-primary` `data-dark` `data-light` `data-radius`
`data-width` `data-height` `data-z-index`

## Antes de recoger datos personales

Un chat que pide un nombre, un teléfono o un síntoma está recogiendo datos
personales, y en contextos de salud, legal o financiero son categoría especial
según el RGPD. El widget te da una base razonable — solo un id de sesión
aleatorio en `sessionStorage`, el historial en memoria, sin cookies, sin
peticiones a terceros, sin analítica — pero las obligaciones caen en quien lo
instala:

- tener una base legal, y decir qué haces con los mensajes **antes** de que se escriban
- no volcar una transcripción entera en una herramienta que no está preparada
  para guardar datos de salud
- permitir que alguien pida que se borre su conversación, lo que implica que tu
  backend tiene que guardarla indexada por `sessionId`

Nada de esto le toca al widget hacerlo cumplir. Pero merece una línea en tu
propia documentación, para que quien lo instale no se entere por las malas.

## Seguridad

- El texto del bot se escapa como HTML **antes** de aplicar cualquier markdown,
  así que un backend (o un LLM al que le hayan dicho que escriba HTML) no puede
  inyectar etiquetas. El texto de la persona no se pinta nunca como HTML.
- Solo se construyen enlaces para URLs `http:`, `https:` y `mailto:`, y siempre
  con `rel="noopener noreferrer nofollow"`.
- Sin cookies, sin peticiones a terceros, sin analítica. La única llamada de red
  es la que tú configuras.
- El id de sesión vive en `sessionStorage` y es una cadena opaca aleatoria.

## Desarrollo

```bash
npm install
npm test     # node --test, sin navegador
npm run build
npm run demo # construye, vigila y sirve el repo — abre /docs/
```

`dist/` es un artefacto de build y no está en git: ejecuta `npm run build` (o
`npm run demo`) una vez después de clonar, o la página de demo no tendrá script
que cargar. Al publicar se reconstruye y se pasan los tests automáticamente.

La página de demo vive en `docs/` porque es la carpeta que GitHub Pages puede
servir como raíz del sitio. Carga el build local cuando se abre desde localhost
y el paquete publicado desde jsDelivr en cualquier otro caso, así que el mismo
fichero es a la vez el banco de pruebas y la demo pública.

## Licencia

MIT
