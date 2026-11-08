# DESIGN-SYSTEM — Gestión adaptativa de la sobrecarga estudiantil

**Versión:** refinamiento visual 1.1 · **Fecha:** 2 de noviembre de 2026.  
**Fuente de producto:** [PRD-v6.md](./PRD-v6.md), versión 0.6.0.  
**Contrato de comportamiento:** [UX-FLOWS.md](./UX-FLOWS.md), especialmente C-01–C-10, pantallas S01–S12 y supuestos SUP-01–SUP-11.  
**Estado:** el promotor aprobó la propuesta visual de Stitch revisada para F6. Los tokens implementados están en `src/styles/tokens.css` y prevalecen sobre la paleta histórica de este documento.

**Alcance de esta revisión:** paleta, jerarquía, superficies y adaptación visual. Se conserva íntegro el contrato funcional de UX-FLOWS y el PRD. La marca visible es CargaWise; se reutiliza el icono local de libro como identificador provisional. No se incorporan las funciones, cifras ni afirmaciones de extracción asistida que aparecen en las capturas.

- El tema oscuro es el inicial. Ajustes → Apariencia permite elegir Claro u Oscuro. La preferencia se aplica a todas las pantallas y se guarda en el navegador cuando el almacenamiento está disponible.
- La tarjeta superior del tablero presenta carga, disponibilidad y exceso con una retícula y barras diarias. El rayado representa horas sin ubicar en la fecha del plazo. Las flechas cambian la única semana visible y los filtros operan en su detalle.
- Las obligaciones se muestran como tarjetas minimalistas con espacio para título, curso, prioridad, plazo y esfuerzo. Ajustes separa el alcance Free y los detalles desplegables de las estimaciones Premium.

## 1. Principios y personalidad visual

**[PRD]** El centro es anticipar sobrecarga académica según esfuerzo estimado y disponibilidad real, con control sobre los cambios. Free conserva todo el núcleo; Premium añade sugerencias orientativas. Las decisiones funcionales v6 prevalecen sobre cualquier elección estética de este documento.

**[UX]** Dirección visual: educativa, serena y directa. Fondos pizarra en oscuro y marfil en claro, acento lavanda o índigo, encabezados de estilo editorial y números monoespaciados. La sensación de claridad procede de mostrar qué vence, qué trabajo está programado, qué falta conocer y qué decisión puede tomar el estudiante.

| Principio | Consecuencia en componentes |
|---|---|
| Comprender antes de actuar | Estado textual, fechas y motivo del déficit preceden a la acción de reajuste |
| Incertidumbre visible | «Estimado», «Tentativo», «Pendiente» y origen siempre que corresponda; no presentar desconocido como 0 |
| Separar obligación y esfuerzo | Evaluación fija, entrega y sesiones tienen representaciones y estados distintos |
| Control sobre automatización | Diferenciar plan activo, cambios ya aplicados y vista previa; fijación y deshacer visibles |
| Densidad gradual | Resumen semanal primero; restricciones, versiones y cambios en expansión/detalle |
| Misma lógica multiplataforma | Tokens y lenguaje compartidos; tabla/agenda/panel se adaptan sin quitar funciones móviles |
| Acceso gratuito claro | Importación, prioridades, sesiones, alertas y tiempo real nunca llevan candado Premium |
| Lenguaje sin culpa | Describir horas y restricciones; evitar «vas mal», «fracaso», «semana perfecta» y promesas de salud/notas |

El refinamiento conserva React, TypeScript, Vite y CSS propio. Ambos temas mantienen los estados semánticos y usan las familias tipográficas disponibles en el dispositivo. La aprobación visual es independiente de las políticas pendientes del PRD §15.

## 2. Colores y tokens semánticos

### 2.1 Convención

Los nombres con puntos son identificadores de diseño, no código funcional. Pueden convertirse después en variables de cualquier frontend. **Primitivos** guardan valores; **semánticos** explican uso; **componentes** referencian semánticos. No introducir valores aislados por pantalla. Las dimensiones se expresan en px de referencia lógica, adaptables a unidades escalables sin confundirlas con píxeles físicos.

### 2.2 Primitivos de color

| Familia | Tokens y valores |
|---|---|
| Neutros | `palette.white` #FFFFFF; `palette.slate.50` #F8F9F7; `.100` #F0F2F4; `.300` #E3E7ED; `.500` #64748B; `.600` #526584; `.900` #17212F |
| Azul | `palette.blue.50` #EDF2FB; `.700` #244C8F; `.800` #193F7D; `.900` #103267 |
| Verde | `palette.green.50` #EDF7F2; `.800` #14654E |
| Ámbar | `palette.amber.50` #FFF7E9; `.800` #9A4B08 |
| Rojo | `palette.red.50` #FDF0F1; `.800` #AC2029 |
| Naranja | `palette.orange.50` #FFF7ED; `.800` #9A3412 |
| Violeta | `palette.violet.50` #FAF5FF; `.800` #6B21A8 |

### 2.3 Semánticos: superficies, contenido, acción y foco

| Token | Valor / referencia | Uso |
|---|---|---|
| `color.surface.canvas` | #F8F9F7 | Fondo de aplicación |
| `color.surface.base` | #FFFFFF | Tarjetas, formularios, paneles |
| `color.surface.subtle` | #F0F2F4 | Agrupación secundaria, ocupación externa con trama |
| `color.surface.selected` | #EDF2FB | Fila/semana seleccionada con borde y etiqueta |
| `color.text.primary` | #17212F | Títulos, datos principales |
| `color.text.secondary` | #526584 | Ayudas, metadatos, texto sobre fondos suaves |
| `color.text.tertiary.onWhite` | #64748B | Solo texto secundario sobre blanco; no usar sobre canvas ni tintes |
| `color.text.onAction` | #FFFFFF | Texto en acción primaria |
| `color.text.link` | #244C8F | Enlaces subrayados en texto corrido |
| `color.border.subtle` | #E3E7ED | Separadores decorativos, nunca única delimitación indispensable de control |
| `color.border.control` | #7D899C | Campos, checkbox sin marcar y contornos que identifican controles |
| `color.action.primary` | #244C8F | Acción principal |
| `color.action.primary.hover` | #193F7D | Hover de acción primaria |
| `color.action.primary.pressed` | #103267 | Acción presionada |
| `color.action.secondary.surface` | #FFFFFF | Botón secundario con tinta azul y borde de control |
| `color.action.disabled.surface` | #F0F2F4 | Acción deshabilitada con motivo textual próximo |
| `color.action.disabled.text` | #526584 | Mantener legibilidad, sin bajar opacidad global |
| `color.focus.ring` | #244C8F | Anillo visible separado del componente |
| `color.focus.gap` | #FFFFFF | Separación para botones azules y otros fondos |
| `color.overlay.scrim` | #17212F al 40 % | Detrás de modal; nunca fondo para leer contenido |

### 2.4 Estados semánticos

Cada familia tiene fondo suave, tinta y borde fuerte. La tinta puede servir de icono/borde. El fondo por sí solo no identifica el estado. Las insignias siempre incluyen texto y, si comunican carga, también un icono.

| Familia | Fondo | Texto/icono/borde | Uso permitido |
|---|---|---|---|
| `color.state.info.*` | #EDF2FB | #123B7D | Ayuda, datos pendientes y origen informativo |
| `color.state.success.*` | #EDF7F2 | #14654E | Guardado confirmado y viabilidad condicional, con etiquetas distintas |
| `color.state.warning.*` | #FFF7E9 | #9A4B08 | Precaución, fuente desactualizada, restricciones por revisar |
| `color.state.danger.*` | #FDF0F1 | #AC2029 | Error bloqueante, déficit o conflicto, con iconos/textos que los diferencien |
| `color.state.neutral.*` | #F0F2F4 | #526584 | Vacío, sin asignar y metadatos |
| `color.plan.premium.*` | #FAF5FF | #6B21A8 | Solo acceso/origen Premium; no color de viabilidad ni de mayor importancia académica |

Estados de carga y estados de acción son independientes: «Guardado» no cambia el estado «Sobrecarga prevista». El mismo verde no debe sugerir que guardar haya resuelto la carga.

### 2.5 Alias por dominio

| Token | Referencia | Señal adicional obligatoria |
|---|---|---|
| `color.priority.high.*` | naranja 50/800 | «Alta», marcador de dos chevrones |
| `color.priority.medium.*` | azul 50/800 | «Media», marcador de un trazo |
| `color.priority.low.*` | neutro 100/600 | «Baja», marcador descendente |
| `color.week.viable.*` | success | Check + «Viable según datos» |
| `color.week.incomplete.*` | info | Interrogación + «Faltan datos» |
| `color.week.deficit.*` | danger | Triángulo + «N h sin ubicar antes del …» |
| `color.week.conflict.*` | danger | Cruce de intervalos + motivo concreto |
| `color.week.empty.*` | neutral | Calendario vacío + siguiente paso |
| `color.source.stale.*` | warning | Reloj + última consulta + acción de actualizar |
| `color.calendar.session.*` | info | «Estudio/Trabajo» + actividad + inicio/fin |
| `color.calendar.fixed.*` | neutral | Candado + «Evaluación fija» o «Fijada por ti», según objeto |
| `color.calendar.group.*` | warning | Borde discontinuo + «Reserva grupal tentativa» |

La prioridad Alta usa naranja y texto propio, mientras el déficit usa familia danger y cantidad/plazo. No pintar una tarjeta entera de rojo por contener una actividad Alta. Los cursos se distinguen por nombre/abreviación accesible, no por una nueva paleta obligatoria.

## 3. Tipografía y jerarquías

**[UX]** Familia sans serif del sistema operativo para familiaridad, legibilidad y evitar dependencia de descarga. Token `font.family.interface`: tipografía UI disponible en el dispositivo; alternativa sans serif. No imponer marca tipográfica ni framework. Pesos `font.weight.regular` 400, `medium` 500, `semibold` 600 y `bold` 700; usar énfasis selectivo, no bloques enteros en negrita.

| Token | Tamaño / interlínea de referencia | Peso | Uso |
|---|---|---|---|
| `type.page` | móvil 24/32; amplio 28/36 | 700 | Título de vista, uno por pantalla |
| `type.section` | 20/28 | 600 | Secciones y título de tarjeta semanal |
| `type.subsection` | 18/26 | 600 | Subpanel o agrupación |
| `type.body` | 16/24 | 400 | Información y formularios; base global |
| `type.body.strong` | 16/24 | 600 | Valores/acciones, sin depender de mayúsculas |
| `type.label` | 14/20 | 600 | Etiquetas de campo e insignias |
| `type.metadata` | 14/20 | 400 | Procedencia, fechas secundarias y ayudas |
| `type.metric` | 24/32 | 600 | Horas y déficit, siempre con unidad y contexto |
| `type.calendar` | 14/20 | 500 | Evento compacto; agenda usa body |

No texto esencial menor de 14 px de referencia. Metadatos auxiliares de demostración, subtítulo de marca e insignias redundantes pueden usar 12 px en móvil; no reducir así campos, fechas, prioridades ni contenido de actividad. En móvil, entradas de datos a 16 px como base. Unidades junto al número: «1 h 30 min», «6 h estimadas», «2 h sin ubicar»; no usar «6» sin contexto. Números tabulares para comparar horas/fechas, si la fuente lo admite. Textos explicativos con ancho orientativo 60–70 caracteres; títulos y nombres largos pueden ocupar varias líneas. En listas densas, truncado solo si existe forma accesible y directa de leer el título completo sin depender de hover.

El tamaño debe escalar con preferencias del usuario. La tabla se convierte en lista cuando ampliar texto impide leer las celdas. La jerarquía no impone alturas fijas a títulos, tarjetas o mensajes. No escribir acciones o alertas en mayúsculas sostenidas.

## 4. Espaciado y dimensiones

| Token | Valor | Uso orientativo |
|---|---|---|
| `space.0` | 0 | Sin separación |
| `space.1` | 4 | Icono y detalle compacto |
| `space.2` | 8 | Icono–etiqueta, controles relacionados |
| `space.3` | 12 | Separación entre datos de una fila |
| `space.4` | 16 | Padding móvil, campos, secciones internas |
| `space.5` | 20 | Agrupaciones intermedias |
| `space.6` | 24 | Padding de tarjeta amplia, secciones |
| `space.8` | 32 | Bloques de contenido |
| `space.10` | 40 | Separación de áreas |
| `space.12` | 48 | Espaciado de estados vacíos |
| `space.16` | 64 | Márgenes de composición amplios, sin desperdiciar altura móvil |
| `size.target.min` | 44 × 44 | Objetivo interactivo de este sistema |
| `size.target.touch` | 48 × 48 | Recomendado para acciones frecuentes móviles |
| `size.control.height` | mínimo 48 | Inputs/botones comunes |
| `size.row.minHeight` | 56 | Fila interactiva de actividad; crece con contenido |
| `size.icon.sm / md / lg` | 16 / 20 / 24 | Dibujo del icono; el área clicable puede ser mayor |

Usar proximidad para agrupar, no cajas innecesarias alrededor de cada dato. Etiqueta a 8 px de su campo; ayuda/error a 8 px; campos a 16–24 px entre sí. Un bloque no depende de sangrías profundas para expresar su relación.

## 5. Bordes, radios, elevación y movimiento

| Token | Valor | Aplicación |
|---|---|---|
| `border.width.default` | 1 px | Tarjetas/divisores decorativos y campos con borde suficientemente contrastado |
| `border.width.selected` | 2 px | Selección, estado destacado o restricción relevante |
| `border.style.tentative` | discontinuo | Solo carácter tentativo; texto obligatorio |
| `radius.sm` | 6 px | Insignias y eventos compactos |
| `radius.md` | 10 px | Campos, botones y controles |
| `radius.lg` | 14 px | Tarjetas de actividad y menú |
| `radius.xl` | 18 px | Tarjetas semanales y diálogo |
| `radius.pill` | 999 px | Indicadores breves no interactivos, evitando apariencia de botón |
| `elevation.0` | sin sombra | Contenido normal y tarjetas |
| `elevation.1` | 0/1/2 al 2 % + 0/4/16 al 1 %, #17212F | Superficies y tarjetas |
| `elevation.2` | 0/8, desenfoque 32 px, #17212F al 8 % | Panel elevado o menú superpuesto |
| `elevation.3` | 0/24, desenfoque 80 px, #17212F al 16 % | Modal con scrim |
| `focus.width / gap` | 3 px / 2 px | Anillo externo azul con separación blanca |
| `motion.fast / normal` | 120 / 200 ms | Respuesta de control / apertura discreta |
| `motion.reduced` | sin desplazamientos ni pulsos | Con preferencia de movimiento reducido |

Tarjetas normales planas con borde; la sombra comunica superposición, no importancia académica. Selección y foco son distintos: seleccionado no pierde su borde al recibir foco. No animar una reorganización como bloques que saltan sin explicación; mostrar diferencias textuales. Sin celebraciones, vibraciones punitivas ni flashes para sobrecarga. Estados skeleton son estáticos con movimiento reducido. Orden de capas conceptual: contenido → barra fija → menú → panel → modal → aviso contextual; una notificación no cubre un diálogo ni su foco.

## 6. Grid y breakpoints responsive

Valores **[UX]** propuestos por capacidad de contenido, no por marcas de dispositivo. La lógica de producto no cambia en un breakpoint.

| Token | Rango lógico | Grid / márgenes / gap | Comportamiento |
|---|---|---|---|
| `layout.compact` | menor de 600 px | 4 columnas, margen 16, gap 16 | Una columna de contenido; panel completo; importación en lista; calendario agenda |
| `layout.medium` | 600–1023 px | 8 columnas, margen 24, gap 24 | Formularios amplios, dos áreas solo si son legibles; navegación web compacta; lista/tabla según ancho real |
| `layout.wide` | desde 1024 px | 12 columnas, margen 32, gap 24 | Calendario amplio + panel lateral; revisión masiva en tabla |
| `layout.maxWidth` | 1440 px | Contenedor centrado | Evitar renglones interminables; calendario puede usar todo el contenedor |
| `layout.readingWidth` | 760 px | Ancho máximo orientativo | Cuenta/formularios largos |
| `layout.weekCard.maxWidth` | 960 px | Lista centrada en tablero | Priorizar lectura; no forzar cinco tarjetas en línea |
| `layout.detail.width` | 360–440 px cuando cabe | Panel de calendario | Debe conservar calendario útil; si no cabe, detalle completo |
| `layout.dialog.maxWidth` | 560 px; comparación hasta 960 px | Margen mínimo 16 en compacto | Alto según contenido, acciones accesibles al desplazarse |
| `layout.header.minHeight` | 64 px | Crece con texto | No recorta contenido al ampliar fuente |
| `layout.bottomNav.minHeight` | 64 px + área segura | Solo compacto | Compensar espacio al final de contenido |

El tablero muestra una semana por página y abre inicialmente la actual. El selector recorre el horizonte disponible. Fechas, horas y etiquetas se conservan al cambiar de ancho. El objetivo de reflujo es 320 px CSS. Las tablas o calendarios con desplazamiento horizontal lo limitan al componente y ofrecen lista o agenda equivalente. [Referencia de reflujo W3C](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

El teclado móvil no debe ocultar el campo activo, errores ni acciones finales. Una barra inferior de acciones respeta área segura y deja espacio reservado en el contenido. En horizontal o con texto grande puede pasar a flujo normal. Se permite orientación vertical u horizontal; no forzar una para completar flujos.

## 7. Navegación web y móvil

| Componente | Web | Móvil | Reglas comunes |
|---|---|---|---|
| Navegación principal | «Tablero», «Calendario» y «Ajustes» en encabezado o barra lateral compacta | Barra inferior con icono + etiqueta para esos tres destinos | Activo con texto/peso + indicador, nunca solo color |
| Añadir/importar | «Añadir» persistente y CTA inferior Importar en tablero | «Añadir» sobre navegación con opciones Importar/Manual; CTA inferior en contenido | Ningún candado; no tapar alerta, tarjeta ni teclado |
| Selector de semanas | Rango, anterior/siguiente y esta semana | Misma información, controles de 44–48 px | Navegación del tramo no limita horizonte; riesgo posterior tiene acceso |
| Configuración | Índice de Disponibilidad, Periodo/cursos/prioridades y Cuenta | Lista de las mismas secciones en Ajustes | S05/S06/S07 accesibles directamente desde guía/avisos |
| Detalle contextual | Panel en calendario | Pantalla de panel con Atrás | Identidad de actividad y retorno a semana conservados |
| Guía opcional | Bloque contextual con enlaces | Bloque breve expandible | Cerrar no desactiva funciones; reabrir desde cuenta/ayuda |

El acceso al calendario se mantiene arriba del selector semanal en S02, aunque también exista navegación global. No se añade un destino separado para alertas, Premium, horas o cada paso de importación. Los destinos S01–S12 se mantienen según UX-FLOWS §3. Iconos no sustituyen etiquetas críticas. Una ruta visual tiene título y un regreso comprensible, no solo una flecha sin nombre accesible.

## 8. Controles: botones, campos y selección

### 8.1 Botones y enlaces

| Variante | Presentación | Uso |
|---|---|---|
| Principal | Azul, texto blanco, radio md, altura mínima 48 | Una acción dominante por bloque: Importar, Confirmar seleccionadas, Guardar progreso |
| Secundario | Blanco, texto azul, borde control | Revisar, Ver calendario, Mantener plan |
| Texto | Tinta de enlace, sin caja; subrayado en párrafo | Navegar a ayuda/detalle; no sustituye confirmación crítica |
| Destructivo | Fondo danger/tinta contrastada o sólido validado posteriormente | Retirar fuente/descartar cambios, con alcance explícito; no para prioridad Alta |
| Icono con nombre | Área 44–48 px, icono 20–24 y nombre accesible | Anterior, siguiente, cerrar; tooltip complementario también por foco |

Estados: reposo, hover donde existe, presionado, foco, en proceso, deshabilitado y error del resultado. En proceso conserva ancho y verbo: «Guardando…», «Leyendo archivo…». Evitar doble envío, pero mantener salida/revisión segura. No deshabilitar todo el formulario por pedir una sugerencia Premium si puede continuar manualmente.

Deshabilitar solo cuando no puede ejecutarse y explicar qué falta junto al control; no esconder el motivo en tooltip inaccesible. Una acción Premium no disponible abre explicación secundaria con alternativa manual; no parece un error académico. «Confirmar fecha nueva» no se deshabilita por déficit del plan si la fecha real es válida; las sesiones inviables sí se mantienen fuera de aplicación.

### 8.2 Campos de datos

| Control | Especificación de contenido e interacción |
|---|---|
| Texto | Etiqueta persistente, ayuda y estado; placeholder solo ejemplo, nunca única etiqueta. Título y tipo marcados como mínimos de confirmación |
| Curso | Selector buscable o creación integrada; «Sin asignar» explícito y válido, sin convertirlo en error |
| Tipo | Lista de tipos académicos del PRD, sin taxonomía empresarial: tarea/informe, PC, examen, exposición, proyecto individual, entrega grupal; nombres reconocidos pueden corregirse |
| Fecha y hora | Selector accesible más entrada manual; fecha, inicio y fin por separado cuando corresponda. «Sin hora confirmada» no rellena 00:00/23:59; ver SUP-05 |
| Esfuerzo estimado | «Horas de preparación» o «Horas de trabajo» según tipo; entrada h/min con equivalencia visible. No reutilizar duración de examen. Vacío = pendiente |
| Horas reales | «Horas reales acumuladas (opcional)»; mostrar total previo al corregir y aclarar «Este total reemplaza el anterior» |
| Restante | «Tiempo que te falta (opcional)»; prevalece sobre resta orientativa. Cero no cierra actividad |
| Prioridad | Alta/Media/Baja y «Sin prioridad declarada»; distinguir «Heredar de curso + tipo» de excepción |
| Inicio permitido | Opción explícita «Puedo empezar desde ahora» o fecha elegida; no preseleccionar permiso |
| Divisibilidad | «No declarada», «Se puede dividir», «Un solo bloque»; ayuda: sin confirmar se mantiene un bloque, según PRD |
| Dependencia | Solo seleccionar/declarar una existente conocida; no inventar prerequisitos ni obligar al estudiante a modelar un proyecto |
| Archivo | Selector «Elegir PDF o Excel (.xlsx)», nombre/formato/estado y reemplazar; arrastrar complementario en web. Sin tamaño máximo inventado |

Aceptar coma o punto como separador decimal y normalizar la visualización en español **[UX]**. Mostrar equivalencia en minutos antes de confirmar para evitar confundir 1,5 h con 1 h 5 min. Cantidades negativas inválidas. No crear topes arbitrarios de horas ni inferir cero. Para duración operativa cero, seguir pendiente SUP-08; los escenarios programables usan esfuerzo positivo.

Validación al salir del campo o enviar, sin interrumpir cada pulsación. Ante envío inválido, resumen enfocable con enlaces a campos y mensajes locales. Conservar valores. Ejemplo: «La hora final debe ser posterior a la inicial». Una falta que permite confirmación parcial es advertencia de completitud, no error que bloquee todo el lote.

### 8.3 Selecciones y listas de revisión

- Checkbox para filas, calendarios múltiples y autorizaciones concretas; radio/select para alternativa única; switch solo para preferencia binaria con efecto comprensible, nunca para aceptar consentimiento oculto.
- «Seleccionar confirmables» muestra cuántas y por qué otras no lo son. No confirmar filas invisibles filtradas sin indicar alcance. Totales seleccionadas/pendientes siempre coherentes.
- Acciones de lote limitadas a capacidades ya previstas: confirmar, descartar candidatos y asignar datos comunes con revisión. No distribuir la misma duración a todas silenciosamente ni sobrescribir excepciones al cambiar base.
- Tabla web con encabezados, selección etiquetada por título y edición de celda con foco; expansión para restricciones/origen. Móvil conserva identidad y pendientes de cada fila, con navegación «Siguiente pendiente».
- Al aceptar sugerencia, una etiqueta de origen sigue visible; al corregir, «Sugerencia Premium corregida por ti». Rechazar no borra duración operativa ya confirmada.

## 9. Tarjetas semanales y de actividad

### 9.1 Tarjeta semanal

**Composición:** contenedor base, borde sutil, radio xl, padding 16 compacto/24 amplio y gap interno 16. Alto libre. Encabezado con rango de semana y estado; bloques de capacidad, trabajo programado, datos faltantes, vencimientos, sesiones y riesgo hasta plazo. El detalle completo está en UX-FLOWS §5.2.

| Alias de componente | Referencia o regla |
|---|---|
| `weekCard.surface / border / radius` | surface.base / border.subtle / radius.xl |
| `weekCard.padding.compact / wide` | space.4 / space.6 |
| `weekCard.title` | type.section, text.primary |
| `weekCard.metric` | type.metric + unidad y contexto |
| `weekCard.state` | Familia week correspondiente + icono/texto; nunca solo franja de color |
| `weekCard.sectionGap` | space.4; encabezados de secciones con type.label |
| `weekCard.action` | «Ver carga y opciones» y «Ver calendario» con objetivos táctiles |

No hacer toda la tarjeta un único botón que contenga otros botones. El título de actividad y las acciones tienen destinos claros. Cabecera de tarjeta permanece legible sin comprimir su estado en una sigla.

**Contenido:** «6 h de trabajo programado» y «2 h de reservas tentativas» separados; capacidad con origen; «Vence esta semana» independiente de «Sesiones esta semana». Esfuerzo restante de una actividad es informativo y no se vuelve a sumar al total semanal. Trabajo adelantado lleva «Vence el …». Horas sin ubicar se asocian a plazo, no se inventa su semana de ejecución. Una semana vacía tiene mensaje y siguiente paso, no barras 0/0 ni check verde.

### 9.2 Fila o tarjeta de actividad

Contenedor base, radio lg si independiente; fila con divisor si ya está dentro de tarjeta semanal. Orden: título → curso/tipo y fecha → prioridad efectiva/origen → progreso/horas pendientes → acceso a sesiones. Usar 16 px de padding, objetivo mínimo de fila 56 px que crece con contenido.

Variantes de contenido: individual, evaluación con preparación, entrega grupal, incompleta, preparación terminada, evaluación rendida/entrega cumplida y fecha propuesta. Son variaciones del mismo componente; no crean pantallas nuevas.

Mostrar, por ejemplo, «Preparación terminada · Examen pendiente»; una marca de check sola no puede sugerir cierre completo de ambos. Si hay varias sesiones, «3 sesiones · 4 h» abre lista de fechas. Candado acompaña una sesión fijada, no la obligación completa como si su fecha no pudiera cambiar por RF-28.

### 9.3 Bloque de sugerencia de esfuerzo

Panel info o premium suave, título «Sugerencia inicial Premium» o «Sugerencia personalizada Premium» según elegibilidad real; valor/rango, incertidumbre, fundamento breve, fuente y acciones Aceptar / Cambiar / Usar mis horas. Un rango exige elegir esfuerzo operativo explícito. La versión del procedimiento puede estar en detalle de origen, sin convertir identificadores internos en información principal.

Sin historial suficiente: «Esta sugerencia es general. Aún no hay historial comparable suficiente para personalizarla». Sin contexto: «No hay información suficiente para sugerir horas. Puedes ingresarlas tú». No usar porcentaje de confianza, precisión garantizada ni reloj de predicción exacta.

## 10. Calendario, sesiones y procedencia

### 10.1 Capas visuales y leyenda

| Elemento | Tratamiento visual | Etiqueta mínima / interacción |
|---|---|---|
| Ventana autorizada | Área clara delimitada y etiqueta en detalle; no toda celda vacía se pinta como disponible | «Ventana de estudio · 16:00–19:00», editable en S05 |
| Fuera de ventana | Superficie sutil neutra, sin apariencia de hueco recomendado | «Fuera de tu disponibilidad»; no se usa sin autorización |
| Ocupación de Google | Trama diagonal gris, contorno control y texto secundario | «Ocupado · Google Calendar · 18:00–19:00»; solo lectura, sin título privado |
| Compromiso local | Neutro, borde continuo e icono de compromiso | Título local si declarado, intervalo y «Manual»; edición de datos locales |
| Evaluación fija interna | Neutro con contorno fuerte e icono de evaluación | Curso/tipo + «Evaluación fija» + intervalo; cambio oficial desde S08/F15 |
| Sesión flexible | Info suave, borde continuo, icono de estudio | Actividad, inicio/fin, duración y «Flexible» en detalle |
| Sesión fijada por usuario | Mismo bloque de estudio con candado y contorno reforzado | «Fijada por ti», acción «Liberar»; no mover automáticamente |
| Reserva grupal | Warning suave, borde discontinuo | «Reserva grupal tentativa», intervalo y actividad; editable/desactivable |
| Vencimiento sin horario | Marcador de fecha en cabecera/lista, nunca bloque de duración ficticia | «Entrega» o «Evaluación · horario por confirmar» |
| Sesión en vista previa | Contorno discontinuo azul y etiqueta «Propuesta» | Antes/después con fecha; no se confunde con reserva grupal por texto/icono |
| Colisión | Marca danger + icono de conflicto y lista enlazada | «Coincide con … · requiere revisión»; no ocultar uno de los bloques |

Color no es la única distinción: ocupación externa tiene trama; tentativas y propuestas indican su naturaleza por texto; fijación usa candado; fecha sin hora usa marcador. La misma leyenda se ofrece en cuadrícula y agenda. No mostrar títulos Google para justificar una colisión; intervalo y fuente bastan.

### 10.2 Cuadrícula y agenda

| Token / patrón | Valor de diseño inicial |
|---|---|
| `calendar.hourHeight` | 64 px de referencia en cuadrícula amplia; es escala visual, no duración preferida |
| `calendar.timeColumn` | 56 px como base; crece con fuente/formato |
| `calendar.dayMinWidth` | 112 px; si no cabe, pasar a menos días/agenda o scroll localizado |
| `calendar.event.padding` | 8 px; radio sm |
| `calendar.event.border` | 1 px control; 2 px si fijado/seleccionado |
| `calendar.agenda.row` | Mínimo 56 px, crece según título/estado/acciones |

La cuadrícula conserva proporción temporal, sin alargar artificialmente una sesión corta para hacerla táctil; la agenda y el detalle ofrecen su objetivo de 44–48 px. Se muestra todo intervalo autorizado relevante mediante navegación/desplazamiento, no se limita el horario a 08:00–20:00 por diseño. El control de fechas permite llegar a sesiones en otras semanas del horizonte.

Mover se realiza también con «Editar sesión» y campos fecha/inicio/fin. Confirmación: «Esta sesión quedará fijada y no se moverá automáticamente». «Reorganizar actividad» y «Recalcular plan» son acciones diferentes con alcance visible. No convertir un gesto de mover sesión en cambio de fecha oficial. La consulta de actividad conserva acceso a todas sus sesiones y al calendario completo.

### 10.3 Origen y versiones

Insignias de origen: «Declarado por ti», «Extraído de PDF», «Extraído de Excel», «Sugerencia Premium aceptada», «Sugerencia Premium corregida por ti», «Personalizada con historial» y «Manual». Origen y confirmación son campos distintos: extraído no significa aceptado.

En cambio académico, usar comparación «Vigente» / «Propuesta» antes de confirmar, y «Anterior» / «Vigente» en historial después. Mostrar fuente conocida y momento de confirmación. La fecha anterior no aparece como otro evento activo. Una versión documental nueva propone cambios campo por campo sin sobrescribir correcciones silenciosamente. No inventar página/hoja si no se conoce la procedencia exacta.

## 11. Indicadores de disponibilidad y sobrecarga

### 11.1 Estado compuesto

Los estados oficiales y su composición se conservan en UX-FLOWS §7.1. Este sistema define su forma, sin crear umbrales nuevos:

| Estado | Icono + texto | Acción y detalle |
|---|---|---|
| Sin actividades | Calendario vacío + «Sin actividades ni sesiones» | Importar/crear, sin sello de viabilidad |
| Pendiente de datos | Interrogación + «Faltan datos para evaluar» | Enumerar horas, ventanas, inicio/horario u otra condición faltante |
| Viable según datos | Check + «Viable según los datos confirmados» | Resumen de estimaciones y reservas, sin promesa de cumplimiento |
| Sobrecarga prevista | Triángulo + «2 h sin ubicar antes del jueves, 18:00», por ejemplo | Actividades/plazos responsables y «Ver carga y opciones» |
| Conflicto sin solución actual | Cruce de intervalos + «No hay un bloque continuo de 2 h» u otro motivo | Identificar restricción y opciones permitidas |
| Fuente desactualizada | Reloj + «Calendar sin actualizar · última consulta …» | Actualizar/reconectar/confirmar manual; superpuesto a otros estados |

Si falta información y ya existe un déficit conocido: «Al menos 2 h sin ubicar; falta estimar 1 actividad». No ocultar el riesgo bajo un aviso genérico de incompletitud ni afirmar una cifra total exacta. Si el único resultado viable procede de una lectura anterior, identificarlo como «Último cálculo» y el análisis actual como parcial.

### 11.2 Cifras y barras

- Primero texto legible: capacidad autorizada compatible, trabajo individual programado, reservas tentativas, fijaciones como desglose y horas no ubicadas por plazo. El total no duplica vencimientos ni vuelve a restar fijaciones ya consideradas.
- Si se usa una barra, será complemento: segmentos con patrón/leyenda y el valor numérico al lado. Reservas tentativas llevan trama o borde discontinuo. «Sin dato» utiliza espacio/trama rotulada, nunca un segmento de cero.
- La barra de utilización semanal usa una base coherente: capacidad autorizada menos ocupación fija externa/local y evaluaciones, comparada con sesiones internas programadas, incluidas fijadas. Es un resumen visual de ocupación, no la `capacidad_usable` residual del recálculo, que ya descuenta fijadas. No dividir un total con fijadas por una capacidad que las descontó y crear déficit ficticio.
- Si la capacidad confirmada es cero, decir «No hay tiempo autorizado en este intervalo»; si es desconocida, «Define tu disponibilidad». No mostrar porcentajes 0/0 ni infinito.
- No añadir bandas «moderada» o «crítica» a partir de porcentajes no aprobados. Déficit se determina por ventanas compatibles hasta cada plazo y factibilidad; un porcentaje semanal no sustituye esa comprobación.

### 11.3 Manual y fallo de fuente son diferentes

«Disponibilidad manual» usa neutral/info sin icono de error. Puede acompañar un plan viable si el estudiante confirmó los datos suficientes. «Conectado y actualizado» muestra última lectura real; «Desactualizado», «Permiso revocado» y «Error de lectura» usan warning con acciones específicas. La app no supone ocupación vacía al fallar la lectura. Calendar y guardado entre clientes tienen etiquetas separadas para que «Guardado» no signifique «Google actualizado».

## 12. Prioridades Alta, Media y Baja

Insignia compacta con texto, marcador y semántica propia; no usar estrellas, puntuaciones ni tamaño de tarjeta para representar importancia. «Sin prioridad declarada» es neutral con signo de interrogación, sin valor Media preseleccionado.

| Estado | Texto de origen | Comportamiento |
|---|---|---|
| Heredada | «Alta · de Cálculo + Examen» | Cambiar base afecta solo actividades que heredan |
| Excepción individual | «Media · solo esta actividad» | Acción «Volver a heredar»; no modifica otras |
| Sin base ni excepción | «Sin prioridad declarada» | Se usan plazos/restricciones identificados, sin atribuir preferencia al estudiante |

Selector con radio/select etiquetado; en móvil no depender de un ciclo de toques sobre un icono. En edición masiva, resumen «Cambiará N actividades que heredan; M excepciones se mantienen». Explicación breve: «A igual prioridad, se considera primero el plazo más cercano. Las fechas y los horarios confirmados se respetan». Empates residuales y mezcla con no declaradas se mantienen como SUP-04; el diseño no introduce ponderaciones académicas.

## 13. Loading, empty, error, warning y success

La respuesta debe decir qué está ocurriendo y qué puede hacer el estudiante. La tabla siguiente define patrones reutilizables; los estados por pantalla/flujo están en UX-FLOWS §4/6.

| Estado de interacción | Presentación | Contenido y acción |
|---|---|---|
| Loading | Indicador discreto + texto; skeleton de estructura sin cifras de ejemplo | «Leyendo archivo…», «Recalculando sesiones…», «Guardando progreso…». Sin porcentaje ni tiempo restante inventados |
| Empty inicial | Icono sobrio, título, explicación breve y CTA | «Aún no tienes actividades. Importa tu cronograma o añade una actividad». Mantener navegación semanal y calendario |
| Empty por semana | Mensaje dentro de tarjeta | «Sin actividades ni sesiones esta semana». No decir «Todo bajo control» |
| Empty por filtro | Explicar filtro y «Ver todo» | No sugerir que se borraron las obligaciones |
| Error local | Borde danger + icono + mensaje junto al campo | Explicar corrección concreta; conservar valores; resumen si hay varios |
| Error de proceso | Bloque persistente en contexto | «No pudimos leer este PDF. Puedes reintentar o ingresar las actividades». No sugerir Premium como requisito de entrada manual |
| Warning | Fondo suave, icono y frase accionable | Datos incompletos, fuente antigua, cambios con impacto o posible duplicado; no bloquear acciones que sí son válidas |
| Success | Confirmación breve con detalle de efecto | «6 actividades confirmadas; 1 borrador guardado». No igualar guardado con plan viable |

No usar textos como «Error desconocido» sin ruta útil. Diferenciar fallo del documento, cálculo, permisos y guardado. Si el cálculo falla después de guardar datos nuevos, decir «Datos guardados; plan pendiente de recalcular» y conservar el anterior rotulado. No fingir que todo sigue actualizado.

La confirmación de extracción no activa obligaciones. La de generación puede incluir distribución parcial: «Se programaron 6 h; quedan 2 h sin ubicar». La de fecha puede incluir conflicto: «Fecha actualizada; revisa 2 sesiones». Estos mensajes mantienen visibles los problemas aunque la operación de guardado haya tenido éxito.

## 14. Modales, confirmaciones y notificaciones

### 14.1 Elegir el contenedor

- Panel de detalle para actividad/sesión con contexto de calendario; completo en móvil.
- Panel de revisión S10 para antes/después y sobrecarga; no abrir un modal por cada movimiento.
- Diálogo breve para una decisión puntual con efecto claro: retirar fuente, descartar cambios sin guardar, confirmar retiro de fijadas o desconectar Calendar.
- Mensaje en línea para validación, datos faltantes o explicación Premium. No interrumpir consulta con ofertas.
- Aviso persistente para obsolescencia, déficit, conflicto y guardado fallido. Un toast solo complementa, no es la única forma de descubrirlos.

**[UX]** No apilar modales: el paso siguiente reemplaza contenido y conserva regreso. Un modal tiene título, explicación, alcance y acciones con verbos específicos. Foco inicial dentro, Tab/Shift+Tab contenidos, Escape para cancelar sin confirmar y retorno al invocador; fondo inerte mientras está abierto. En contenido largo, iniciar en título/resumen legible, no saltar directo al último botón. [Patrón de diálogo modal W3C](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### 14.2 Confirmación proporcional al efecto

| Caso | Mensaje mínimo | Acción explícita |
|---|---|---|
| Movimiento individual | «Esta sesión quedará fijada y no se moverá automáticamente» | «Mover y fijar» |
| Reorganización de actividad | «Se revisarán solo las sesiones flexibles de esta actividad» | «Reorganizar actividad» |
| Ampliar ventana | Horario anterior/nuevo y sesiones afectadas; sin insinuar que debe sacrificar descanso | «Guardar disponibilidad» |
| Cambio oficial de fecha | Fecha/intervalo vigente frente a nuevo, origen y consecuencias | «Confirmar fecha nueva» |
| Finalizar preparación | Flexibles futuras a cancelar y fijadas conservadas hasta decisión | «Terminar preparación» y control separado para retirar fijadas |
| Deshacer | Alcance de distribución anterior y resultado de revalidación | «Restaurar distribución» solo si válida |
| Retirar documento | Documento, actividades asociadas y efecto exacto propuesto | «Retirar documento»; decisión sobre actividades explícita |
| Concurrencia | Guardado disponible frente a edición pendiente | «Conservar lo guardado» o «Revisar mi cambio»; revalidar al aplicar |

El botón de cancelar nunca confirma por accidente. No aceptar cambios haciendo clic fuera del diálogo. Si hay cambios sin guardar, salir exige elegir permanecer o descartarlos; no presentar un guardado que no ocurrió. El formulario de fecha real puede guardarse aunque el plan resultante sea imposible, con aviso; no aplicar bloques que violen restricciones.

### 14.3 Mensajes breves y recuperación

Aviso de guardado no crítico: referencia orientativa `feedback.toast.duration` de 6 s **[UX]**, pausa mientras recibe foco/hover; el mismo resultado sigue visible en contexto. Si contiene acción importante o error, no caduca automáticamente. «Ver cambios» y «Deshacer última reorganización» siguen accesibles en S02/S03/S10 mientras exista esa reorganización; no dependen de acertar un toast fugaz.

Los mensajes de carga/éxito se anuncian de forma no interruptiva; errores que requieren atención se anuncian con prioridad adecuada sin repetirse en bucle. Una replanificación automática no roba foco ni abre múltiples ventanas. En esta entrega, «notificación» significa respuesta dentro del producto; no se incorpora correo, push ni un canal nuevo no aprobado por el PRD.

## 15. Accesibilidad y verificación

**Objetivo propuesto [UX, SUP-11]:** WCAG 2.2 nivel AA para los flujos completos; el PRD exige accesibilidad básica y deja el nivel formal pendiente. La propuesta necesita revisión y validación del futuro producto; no afirmar conformidad por tener una paleta. Se consideran teclado, orden de foco, uso sin arrastrar, nombres/estados comprensibles y autenticación accesible. [Norma W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

### 15.1 Contraste y comprobaciones realizadas

Texto normal con mínimo 4,5:1; este sistema usa ese objetivo también para sus etiquetas pequeñas, evitando depender de la excepción de texto grande. [Contraste de texto W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Contornos e indicadores necesarios para identificar controles/estados deben alcanzar 3:1 contra colores adyacentes; divisores decorativos suaves no sustituyen esos contornos. [Contraste no textual W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Ratios aproximados calculados para pares sólidos propuestos mediante luminancia relativa sRGB. Son comprobaciones de tokens, no de una interfaz renderizada:

| Combinación | Ratio aproximado | Uso |
|---|---|---|
| #17212F sobre #FFFFFF | 16,22:1 | Texto principal |
| #526584 sobre #FFFFFF | 5,91:1 | Texto secundario |
| #526584 sobre #F8F9F7 | 5,60:1 | Metadatos sobre canvas |
| #64748B sobre #FFFFFF | 4,76:1 | Texto tenue exclusivamente sobre blanco |
| #FFFFFF sobre #244C8F | 8,38:1 | Botón principal |
| #244C8F sobre #F8F9F7 | 7,94:1 | Foco/enlace sobre canvas |
| #14654E sobre #EDF7F2 | 6,39:1 | Viabilidad y éxito |
| #9A4B08 sobre #FFF7E9 | 5,83:1 | Warning |
| #AC2029 sobre #FDF0F1 | 6,32:1 | Déficit/error/conflicto |
| #123B7D sobre #EDF2FB | 9,60:1 | Info y prioridad Media |
| #9A3412 sobre #FFF7ED | 6,88:1 | Prioridad Alta |
| #526584 sobre #F0F2F4 | 5,27:1 | Neutro y prioridad Baja |
| #6B21A8 sobre #FAF5FF | 8,13:1 | Identificación Premium |
| #7D899C sobre #FFFFFF | 3,54:1 | Contorno de control: objetivo no textual 3:1 |

El texto tenue se reserva al blanco. En superficies de estado se usa su tinta semántica; el borde de control se diferencia del separador decorativo. Los ratios corresponden a colores sólidos y no certifican por sí solos la interfaz. Deben verificarse también foco, hover, tramas y combinaciones renderizadas.

### 15.2 Reglas operables del sistema

| Área | Especificación de diseño / comprobación futura |
|---|---|
| Color y forma | Estado de carga incluye texto, icono y cifra/motivo; prioridad tiene nombre; fijación tiene candado; tentativas y origen textual |
| Teclado | Recorrido lógico por encabezado, selector, tarjetas y acciones; Tab/Shift+Tab en controles; Enter/Espacio según control. No hay acciones exclusivas de hover, gesto o arrastre |
| Foco | Anillo 3 px con separación; nunca oculto tras barra/teclado. Al abrir detalle, enfocar título o primer control adecuado; al volver restaurar invocador/posición |
| Tabla de revisión | Encabezados y nombres de celda/fila; selección anunciada; errores enlazados. Evitar un Tab por cada fragmento de texto, manteniendo accesibles los controles |
| Fechas/calendario | Entrada manual alternativa al selector; agenda equivalente con todas las acciones; leyenda textual; no imponer navegación por cuadrícula compleja para completar tarea |
| Semántica | Vistas con título y región principal; encabezados jerárquicos; botón para acción y enlace para navegación; controles con nombre, estado y relación con ayudas/errores |
| Lectores de pantalla | Anunciar guardado/recálculo y resumen de cambios sin leer todas las tarjetas otra vez. Estado/etiqueta de campo no depende de posición o color |
| Formularios | Etiquetas persistentes, opcional/obligatorio explícitos, datos preservados al error, resumen enfocable; no bloquear pegado ni apoyos de autenticación |
| Texto y zoom | Probar aumento de texto, zoom y ancho equivalente 320 px; sin recorte de fechas/estados ni pérdida de controles; orden de lectura coincide con visual |
| Movimiento | Respetar movimiento reducido, sin flashes ni cambios que requieran seguir animaciones para entender el plan |
| Contraste forzado | Etiquetas, bordes y símbolos conservan significado sin fondos; verificar foco y selección en alto contraste |
| Pantalla táctil | Objetivos de diseño 44×44 px como mínimo y 48×48 frecuentes en móvil, separación de 8 px cuando sea posible; fila de calendario corta tiene alternativa en agenda |

La referencia AA de tamaño de objetivo establece 24×24 px o excepciones de espaciado/equivalencia; la propuesta de 44/48 px es un estándar de diseño más amplio de este producto, no una cita del mínimo AA. [Tamaño de objetivo W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

No se certifica accesibilidad de flujos de Google ajenos al producto. La app debe conservar regreso, explicación y opción de omitir. Los detalles técnicos de semántica se resolverán después; aquí se fijan resultados verificables sin seleccionar framework.

## 16. Interacción y microcopy

### 16.1 Reglas de voz y formato

Español claro, tono respetuoso y trato «tú». Verbos directos y breves; una instrucción por mensaje. No llamar «inteligente» a cada acción ni atribuir IA a planificación por reglas. Usar «sobrecarga prevista» y «según tus datos», sin diagnosticar estrés. No decir «te sobra tiempo» cuando faltan horas o compromisos.

Preferencias propuestas SUP-02: fechas día/mes con mes escrito cuando elimina ambigüedad, semana lunes–domingo, hora 24 h y zona confirmada. «Hoy/mañana» acompañado de fecha en decisiones críticas. Decimales locales aceptados; duración principal como «1 h 30 min». Ejemplos no se confunden con valores ya confirmados.

Al guardar, describir el alcance: «Prioridad guardada para Cálculo + Examen» o «Solo esta actividad». Fechas se llaman vigentes/propuestas/anteriores según estado; nunca «corregidas» automáticamente por el motor. La palabra «personalizada» se reserva para elegibilidad real Premium, no por conocer el nombre del usuario.

### 16.2 Catálogo de mensajes base

| Contexto | Microcopy propuesto |
|---|---|
| Valor inicial | «Anticipa tu carga y organiza tus sesiones según el tiempo que tienes» |
| Registro | «Continuar con Google» · apoyo «Recomendado»; «Continuar con correo» |
| Recomendación Calendar | «Evita volver a ingresar tus compromisos. Puedes conectar Google Calendar para consultar horarios ocupados» |
| Permiso Calendar | «Solo consultaremos ocupación de los calendarios que elijas. No crearemos ni modificaremos eventos» |
| Omitir | «Ahora no»; después «Puedes usar disponibilidad manual y conectarlo más adelante» |
| Vacío inicial | «Aún no tienes actividades. Importa un PDF o Excel para revisar tus evaluaciones, o añade una actividad» |
| CTA principal | «Importar actividad — PDF/Excel» |
| Revisión | «Revisa los datos antes de incorporarlos a tu planificación» |
| Horas de examen | «¿Cuánto tiempo estimas que necesitas para prepararte? No incluyas la duración del examen» |
| Horas desconocidas | «Horas de preparación pendientes. La carga todavía es parcial» |
| Inicio no declarado | «¿Puedes empezar desde ahora o necesitas esperar hasta otra fecha?» |
| Divisibilidad no declarada | «No has confirmado si se puede dividir. Se mantendrá en un solo bloque mientras no lo indiques» |
| Prioridad heredada | «Alta · de Cálculo + Examen»; acción «Cambiar solo esta actividad» |
| Sin prioridad | «Sin prioridad declarada. Se consideran los plazos y las restricciones» |
| Tramo visible | «Esta semana y las próximas cuatro»; enlace «Ver otras semanas» |
| Adelanto | «Trabajo adelantado · vence el 12 nov.» |
| Viabilidad | «Viable según los datos confirmados. Las horas de trabajo son estimadas» |
| Déficit | «Quedan 2 h sin ubicar antes del jueves, 18:00» |
| Imposibilidad | «No hay un bloque continuo de 2 h antes de la fecha límite» |
| Modo manual | «Disponibilidad manual · basada en tus ventanas y compromisos confirmados» |
| Calendar antiguo | «No pudimos actualizar Calendar. Mostramos la última consulta del …; revisa los horarios afectados» |
| Movimiento seguro | «Reubicamos 2 sesiones flexibles. Tus sesiones fijadas se mantuvieron» |
| Deshacer incompatible | «No podemos restaurar esa distribución: ahora coincide con un compromiso ocupado» |
| Cambio académico | «La fecha vigente es … La nueva fecha es … Confírmala si corresponde al cambio comunicado» |
| Fecha confirmada con riesgo | «Fecha actualizada. Quedan 2 h sin ubicar antes del nuevo plazo» |
| Progreso | «Horas reales acumuladas (opcional)»; «Este total reemplaza el anterior» |
| Estimado superado | «Has registrado más tiempo que el estimado. ¿Cuánto crees que te falta?» |
| Preparación terminada | «Terminaste de prepararte. La evaluación sigue pendiente de rendir» |
| Trabajo terminado | «Trabajo terminado. Aún falta confirmar la entrega» |
| Sesiones al cerrar | «Se cancelarán tus sesiones futuras flexibles de esta preparación. Las fijadas se conservarán hasta que decidas retirarlas» |
| Grupo | «Reserva grupal tentativa: hasta 3 sesiones de 2 h. Puedes editarla o desactivarla» |
| Equivalencia | «¿Este intervalo ocupado corresponde a esta colaboración? Solo lo contaremos una vez» |
| Free y sugerencia | «Sugerir horas requiere Premium. Puedes ingresar tus horas y planificar gratis» |
| Premium sin base | «No hay información suficiente para sugerir horas. Puedes añadir contexto o ingresarlas tú» |
| Historial insuficiente | «Esta sugerencia es general; aún no hay historial comparable suficiente para personalizarla» |
| Sin guardar | «Tus cambios aún no se guardaron. Reintenta antes de salir» |
| Concurrencia | «Esta actividad cambió en otro dispositivo. Revisa las diferencias antes de guardar» |

### 16.3 Reglas de interacción persistentes

No recalcular con cada pulsación ni aplicar filas sin confirmar. Una simulación no cambia el plan. Cambios flexibles aplicados automáticamente se notifican con alcance y acceso a ver/deshacer. Si otra actualización invalida una vista previa, pedir revisar de nuevo antes de aplicar. Una fijación se libera explícitamente; ampliar una ventana es decisión del estudiante, no autorización implícita por pulsar «Resolver».

Acciones rápidas de móvil siempre nombran su objeto: «Registrar progreso» abre el estado del trabajo; «Ya rendí» no cierra preparación silenciosamente. Marcar cierre solicita datos reales opcionales; no prellenar horas con las agendadas ni tratar el tiempo de guardado como fecha efectiva declarada. Correcciones de horas acumuladas sustituyen el total, manteniendo historial en ambos planes.

## 17. Free/Premium sin obstaculizar lo gratuito

| Área | Free | Premium | Presentación |
|---|---|---|---|
| Acceso y continuidad | Cuenta, misma información web/app | Igual | Sin muro comercial para iniciar ni continuar |
| PDF/.xlsx | Importar, extraer campos reconocibles y corregir | Igual | CTA idéntico, sin insignia Premium |
| Duración operativa | Manual y editable | Manual o sugerencia aceptada/corregida | Campo manual siempre accesible |
| Prioridades, ventanas y Google | Completas | Iguales | Sin candado ni cuota generativa implícita |
| Tarjetas, sesiones y reajuste | Completos por reglas | Iguales | Ningún «resolver con IA» para déficit |
| Registro real/cierre | Gratuito y opcional | Igual | No convertir el registro de horas en promoción obligatoria |
| Sugerencia inicial semántica | No ejecuta análisis | Opcional, según acceso/contexto | Ayuda secundaria y salida manual; origen e incertidumbre |
| Personalización básica | Sin nuevas sugerencias personalizadas | Solo historial suficiente/comparable y consentimiento aplicable | Estado base/personalizado real; ningún aprendizaje avanzado en MVP |
| Historial y plan previo al perder Premium | Conservados | Conservados | Se deshabilitan nuevas sugerencias, no datos ni sesiones confirmados |

El distintivo Premium aparece solo junto a la función exclusiva o estado de cuenta, con tinta violeta y texto. Evitar coronas, candados en importación y grandes banners en alertas. Al solicitar función sin derecho, explicación en línea con «Ingresar mis horas»; opcional «Ver diferencias» lleva a sección informativa de S07. No abre checkout ni presume una prueba gratuita.

Precios, cuotas, prueba, cobro, antigüedad requerida del historial, criterios de comparabilidad, tolerancia de estimación y políticas definitivas de conservación no se fijan aquí. El diseño reserva espacio para datos reales cuando existan políticas aprobadas; no usa «ilimitado», «gratis para siempre» ni cifras de consumo de ejemplo como contrato. Si Premium falla o se agota un derecho aprobado, mantener horas manuales, carga conocida y todas las funciones Free.

## 18. Inventario reutilizable, trazabilidad y cierre

### 18.1 Componentes iniciales para el futuro prototipo

Este inventario especifica elementos, no desarrolla componentes funcionales.

| Familia | Elementos y variantes imprescindibles | Uso |
|---|---|---|
| Estructura | Encabezado, navegación, selector semanal, panel contextual, sección de ajustes | S01–S12 según UX-FLOWS |
| Acciones | Botón principal/secundario/texto/destructivo, menú Añadir, icono etiquetado | Importar, confirmar, volver, mover/fijar |
| Formularios | Campo, ayuda, error, fecha/intervalo, esfuerzo h/min, selector, radio/checkbox, archivo | S01/04/05/06/08/09/11 |
| Revisión | Lista/tabla de candidatos, fila expandible, estado por fila, contador y confirmación parcial | S04 |
| Académico | Tarjeta semanal, fila de obligación, prioridad/herencia, origen/certeza, progreso separado | S02/04/06/08 |
| Calendario | Cuadrícula/agenda, bloque por tipo, leyenda, fijación, bandeja sin ubicar, marcador de plazo | S03/08 |
| Explicación | Capacidad/demanda, déficit por plazo, desglose de reservas, fuentes/antigüedad | S02/03/10 |
| Cambios | Comparación antes/después, confirmación de fecha, resumen de movimientos y deshacer revalidado | S08/10 |
| Continuidad | Guardando/guardado/pendiente/error, comparación concurrente | Vistas editables, S12 |
| Respuesta | Loading/skeleton, vacío, aviso, mensaje de validación, éxito y diálogo | Todos según condiciones |
| Plan | Insignia Free/Premium, sugerencia base/personalizada/abstención, comparación informativa | S04/07/08 |

### 18.2 Vínculo con requisitos

| Decisión de diseño | Fuente PRD / UX-FLOWS | Comprobación documental |
|---|---|---|
| Tarjetas centrales y navegación | RF-19/26; C-06; S02 | Calendario arriba, selector, tarjetas y CTA inferior |
| Distinción de estados y accesibilidad | RF-10/11/17; RNF-01/02/15; §7 UX | Texto/icono/cifra, desconocido no es cero, manual no es error |
| Importación y controles de lote | RF-02/03/04/23; C-02; S04 | Siete filas, horas de preparación, origen, parcialidad y borradores |
| Sesiones y fijaciones | RF-09/12/13/14/21; C-03/07 | Sin drag obligatorio, alcance visible y reversión segura |
| Prioridades | RF-22; C-03; S06 | Herencia, excepción y plazo más cercano a igual nivel |
| Fuente Calendar | RF-08/18/20; C-04; S11 | Consentimiento separado, ocupación sin detalles, desactualizado distinto de manual |
| Grupo | RF-06/10/21; §10.5.7; F16 | 3×2 h tentativas, aceptación/equivalencia por intervalo |
| Progreso y cierres | RF-07/15; §10.5.8; C-05; S09 | Tiempo opcional, acumulado corregible y estados independientes |
| Cambio académico | RF-16/28; §10.5.10; C-08; F15 | Vigente/propuesta/anterior y confirmación con impacto |
| Planes y datos | RF-24/27; C-09/10; S07/12 | Free completo, Premium optativo, datos preservados y conflictos explícitos |

### 18.3 Revisión y límites

Revisado contra PRD-v6 y UX-FLOWS en nombres de estados, planes, navegación, conteo de horas, fechas actualizables, fijaciones, finalización y fuentes. Los valores visuales y patrones de interacción son propuestas [UX]; las ambigüedades funcionales/políticas permanecen en SUP-01–SUP-11, sin elevarlas a decisiones aprobadas.

**Validación documental original (31 de octubre):** coherencia documental y cálculo de contraste de los pares sólidos listados. **Pendiente de revisión posterior:** apariencia renderizada, estados combinados, interacción con teclado/lectores de pantalla, ampliación de texto y pruebas de comprensión con estudiantes. No se han creado pantallas, prototipo, código, arquitectura, backend ni base de datos para hacer esa validación.

**Refinamiento 1.1 (2 de noviembre):** implementado sobre el prototipo existente, con tarjeta semanal central, cifras agrupadas, déficit por plazo, curso separado del título, agenda con tarjetas semánticas y revisión de importaciones por tarjetas en móvil/tabla en escritorio. No se modifica UX-FLOWS ni el PRD. El porcentaje visual describe estudio programado y reservas frente a capacidad conocida; no representa demanda total ni se utiliza para decidir viabilidad. Las horas sin ubicar conservan su actividad/plazo. Las verificaciones ejecutadas se documentan en README y en la entrega, sin afirmar certificación formal.

