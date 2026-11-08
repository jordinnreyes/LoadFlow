# F7 · Validación integral de WiseLoad

## F7-02 · Importación de documentos

Se repitió la extracción Free de los siete PDF autorizados con el parser Docker aislado, por lectura local y stdin. El registro de esta corrida contiene solo conteos y códigos de revisión. El XLSX es sintético y reproduce la estructura de un anexo con fechas. Los casos nuevos reconstruyen la disposición y las ambigüedades de las muestras con datos ficticios. Los originales quedan en sus rutas locales.

| Entrada | Candidatos | Título | Curso | Tipo | Fecha | Inicio | Fin | Campos que quedan por revisar |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| PDF · sílabo | 6 | 6 | 6 | 2 | 0 | 0 | 0 | Las dos series de semanas no determinan fecha civil. Las etiquetas restantes no identifican un tipo del catálogo. |
| PDF · laboratorio con numeración distinta | 1 | 1 | 1 | 0 | 0 | 0 | 0 | Prevalece el título interno. Tipo, fecha y hora pendientes. |
| PDF · enunciado grupal | 1 | 1 | 0 | 1 | 0 | 0 | 0 | Curso ausente. La semana, las fechas de ejercicios y los valores de fórmulas no definen un plazo. |
| PDF · laboratorio con fecha en portada | 1 | 1 | 1 | 0 | 0 | 0 | 0 | La entrega al final de clase requiere fecha y hora explícitas. |
| PDF · enunciado HW | 1 | 1 | 1 | 1 | 0 | 0 | 0 | El periodo del curso deja el plazo abierto. |
| PDF · anexo de teoría | 6 | 6 | 6 | 0 | 6 | 6 | 6 | Los exámenes numerados y las evaluaciones continuas requieren clasificación. Una página carece de texto seleccionable. |
| PDF · anexo de ética | 4 | 4 | 4 | 2 | 3 | 3 | 3 | Una fecha contradice el día de la semana. El horario de la sesión de proyecto requiere distinguirse del plazo. |
| XLSX · anexo sintético | 7 | 7 | 7 | 7 | 7 | 7 | 7 | Una hoja de contexto queda sin filas reconocidas. Hay celdas combinadas y valores cacheados de fórmula para revisar. |

Los conteos muestran disponibilidad de campos extraídos de estas entradas. Curso extraído es una señal que se asocia solo si hay un curso existente compatible. La zona y el esfuerzo siguen pendientes. Las fechas de tabla contradictorias conservan los valores de origen para revisión. La suite XLSX conserva las comprobaciones de los sistemas 1900 y 1904 y de fechas ambiguas, inválidas o números sin formato de fecha.

| Escenario de regresión | Comprobación |
|---|---|
| Anexo PDF con texto y una página rasterizada | Conserva candidatos textuales y la cobertura por página. Deja pendiente una fecha contradictoria o múltiple y descarta el horario de clase como plazo de proyecto. |
| Enunciado grupal multipágina | Reconoce una sola actividad grupal. Señala que el plazo relativo requiere revisión y excluye las fechas de ejercicios y las marcas de impresión. |
| Duplicados y fecha oficial | Los mismos bytes con otro nombre reutilizan la importación del mismo periodo. Dos filas del PDF corregido quedan señaladas con localizadores distintos. El cambio del plazo extraído por el parser requiere confirmación separada. La fecha anterior queda en el historial y se conservan la duración y el progreso de la única actividad. |
| PDF formado por una imagen | Informa la falta de texto en español y ofrece el alta manual. Se verifica el borrado del temporal, la creación manual y la conservación de esa actividad, el progreso previo y los borradores de otra fuente tras retirar el escaneo. |

### Repetición local

Con Node 24, la pila local y la imagen de extracción fijada descritas en [DEVELOPMENT.md](DEVELOPMENT.md) y [F3-DEVELOPMENT.md](F3-DEVELOPMENT.md):

```sh
npm run check
node --env-file=.env --import tsx --test tests/integration/imports.test.ts
npm run test:e2e:f7
```

La comprobación de escaneo de Chromium usa un PDF con una imagen y sin capa de texto, generado en memoria por `pdf-fixture.ts`. Este corpus acredita la salida manual de la extracción Free. La extracción de texto de las imágenes queda fuera de este alcance.

## F7-03 · Casos límite del planificador

| Escenario | Resultado verificado |
|---|---|
| Oráculo exhaustivo en una cuadrícula de siete minutos | 192 casos adicionales de hasta tres tareas indivisibles y una sesión fijada opcional. El oráculo enumera posiciones y omisiones y compara los minutos asignados en orden Alta, Media y Baja, con dependencias, huecos de cobertura y ocupación. Se verifican repetibilidad, conservación de esfuerzo y de fijadas, ausencia de identificadores repetidos y de cambios en el snapshot de entrada. Los 64 casos de F4 se ejecutan también. |
| Dos tareas en una ventana compartida | Una tarea de 60 min con prioridad Alta podía ocupar el único tramo de 30 min apto para otra tarea. La reparación prueba ambos extremos y encuentra una distribución completa dentro de los plazos. |
| Remanente menor al mínimo | Con 70 min de esfuerzo, máximo de 60 y mínimo de 30, el motor ajusta la división a 40 + 30 en la misma ventana. |
| Límite de búsqueda | El motor se detiene a los 10 000 estados y conserva una distribución válida parcial. El caso con precedencia y sin certificado de déficit informa búsqueda incompleta. La prueba de aborto del worker usa un timeout reducido de fixture. |
| Cambio de hora y zonas de origen | La API rechaza una hora académica inexistente en Nueva York. Planifica un bloque indivisible de 90 minutos reales durante el cambio de hora, con ventana declarada en Nueva York y plazo en Tokio. Cambiar la visualización a Los Ángeles cambia el día mostrado y conserva los instantes UTC, las zonas de origen y la revisión del plan. Las pruebas de disponibilidad comprueban también la hora repetida de otoño. |
| Grupos, fijadas, cambio de fecha y deshacer | La suite de integración repite la aceptación explícita de reservas y el rechazo de reutilizar ocupación equivalente. Verifica que un cambio de fecha y su historial se apliquen juntos y que un compromiso nuevo impida deshacer cuando invalidaría una sesión restaurada. En ese caso se conservan los bloques y la revisión del plan activo. |

La reparación usa `deterministic-2`. El oráculo compara soluciones exactas solo en el dominio pequeño descrito. Para el resto de entradas sigue vigente el límite de búsqueda y la distinción entre faltantes y conflictos demostrados. Los escenarios de API usan cuentas sintéticas en PostgreSQL/Auth locales. La ocupación externa de las pruebas de grupos se simula con evidencia local.

### Repetición local

```sh
npm run check
node --env-file=.env --import tsx --test tests/integration/planning.test.ts
npm run test:e2e:f7
```
