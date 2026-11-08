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
