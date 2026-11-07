# F3 · Importación académica Free

## Revisión previa del corpus

Se inspeccionaron localmente las siete muestras PDF autorizadas (30 páginas). Los casos de abajo registran resultados esperados por campo. Los originales quedan fuera del repositorio. Los fixtures reproducen estructuras y contraejemplos con títulos, fechas y códigos sintéticos.

| Muestra | Estructura y resultado esperado | Ambigüedad que se conserva |
|---|---|---|
| Sílabo CS2042 | Portada y políticas, identificación de curso, tabla con seis evaluaciones específicas (dos exámenes, dos continuas, dos proyectos) y fila de subtotal. Detectar curso, títulos, tipos específicos y semanas; excluir subtotal y texto de políticas. | Dos calendarios por duración del ciclo. Semana, ponderación y suma de notas no son fecha ni esfuerzo. El tipo de las continuas/proyectos se revisa cuando no se indica. |
| Laboratorio GIN/GiST | Enunciado multipágina con curso, título, ejercicios y entregables. Un candidato de laboratorio. | El título interno dice 09 y el nombre de exportación dice 10. Usar el título interno con señal de discrepancia. La marca de impresión repetida no es entrega. |
| Actividad grupal de métodos numéricos | Una actividad grupal, semana 2, periodo y entregable MLX. Los ejercicios y los años/valores dentro de fórmulas no son obligaciones. | Fecha, hora y curso explícito ausentes. Sin esfuerzo individual. |
| Laboratorio 6 | Un enunciado con código/curso, fecha en encabezado, tablas de resultados y entrega al final de clase. | Fecha del documento separada de fecha límite. «Al final de la clase» requiere confirmación y hora manual. Los encabezados repetidos son la misma actividad. |
| Tarea de arquitectura | Código, curso y HW#1 en una línea de portada; ejercicios bilingües y numerados. Un candidato de tarea. | El periodo no permite inferir fecha y hora. |
| Anexo de teoría | Tabla de sesiones con columna de evaluación y encabezado a veces ausente en continuación. Seis evaluaciones nombradas (tres continuas, tres exámenes) con fecha y bloque horario en sus filas. | Examen numerado sin equivalencia explícita parcial/final. Filas de clase, tutorías y pie de página excluidos. |
| Anexo de ética | Tabla paginada con evaluaciones, nombres y fechas que pueden ocupar dos líneas. PC1, PC2, EC y Proyecto son etiquetas de evaluación. | Hay fechas de sesión y reprogramación. Un texto desplazado o varias fechas requieren revisión; «Proyecto» no determina que sea grupal ni que la hora de la clase sea un plazo. |

La extracción Free lee estructura real, relaciona campos por fila/encabezado y usa señales explícitas del título o enunciado. Cada fila queda como borrador con localizador y campos pendientes. Escaneos, layouts sin señales reconocibles y datos equívocos tienen salida manual. Las horas de esfuerzo se ingresan por separado. El análisis semántico para sugerir esfuerzo corresponde a Premium en F5.


## Estado y gates

El promotor aprobó los límites base exclusivamente para desarrollo local el 06/11/2026. Después indicó expresamente mantener deshabilitada la carga mientras se resuelve retención e historial Premium. `server/start.ts` conserva su composición F2 y no instancia `ImportService`, Storage F3 ni el worker de importaciones. Las rutas de importación responden `503 IMPORTS_DISABLED`. Las pruebas inyectan el servicio exclusivamente en sus aplicaciones de fixture.

La limpieza implementada se prueba como política candidata con datos sintéticos. Esa política propone retirar la copia temporal al terminar, conservarla hasta 24 h para recuperación transitoria y purgar la revisión a los 7 días. Sigue pendiente D-15. El archivo en el equipo del usuario permanece intacto. Retirar una importación purga borradores y contenido reconocido, conserva actividades confirmadas y deja solo formato y localizador mínimo en `activity_sources`.

El historial de esfuerzo/progreso de F1 se conserva al aplicar una fecha importada. Para F5, ARCH §8.3 propone comparables por curso/tipo y características del trabajo, estimación base previa y total real confirmado. La observación corregida reemplaza la anterior. Definir las características, su retención y el consentimiento es una decisión pendiente de D-10/15. Este código F3 conserva campos estructurales de revisión y la historia académica existente. La propuesta futura de minimización puede permitir personalizar sin guardar el documento completo, pero debe validarse antes de aprobar el borrado para ese flujo.

## Componentes y límites

- `extraction/` usa `read-excel-file/node@9.3.14`, PDF.js `pdfjs-dist@6.5.438`, yauzl y SAX. Las reglas leen bytes reales, hojas, encabezados y posiciones. Las fórmulas aportan solo su valor cacheado, con advertencia.
- `runner.ts` ejecuta Node 24.22.2 en una imagen oficial fijada por digest. Cada extracción usa contenedor efímero sin red, usuario sin privilegios, raíz y montajes de lectura, capacidades retiradas, 384 MiB de memoria total, heap de 192 MiB, 48 procesos y una CPU. Solo se montan módulos del parser y dependencias. Los bytes llegan por stdin. El contenedor carece de credenciales del backend. Timeout externo de 30 s con retirada forzada del contenedor.
- Los límites aprobados son 10 MiB de entrada, 100 páginas PDF, 20 hojas, 20 000 celdas no vacías y 50 MiB ZIP expandido. Las defensas adicionales del prototipo son 2000 entradas ZIP, cuadrícula materializada de 400 000 posiciones, 500 candidatos, 150 000 fragmentos de texto PDF y salida de 2 MiB. Son límites técnicos de desarrollo que deben revisarse antes de habilitar un entorno.
- `storage.ts` solo acepta Supabase loopback. El bucket privado `cargawise-imports-f3` utiliza claves UUID opacas. Las credenciales de Storage quedan en el adaptador servidor. La API normal no ofrece descargas ni URLs firmadas.
- La migración `0007_imports.sql` incorpora documentos, importaciones/cola, candidatos y fuentes. RLS forzada, FK por propietario y roles separados. Una reserva documental comprometida en BD precede a Storage. Así se puede retomar una escritura ambigua o limpiar un objeto de una carga interrumpida.
- La cola de importaciones se separa de Calendar. Reclamación con SKIP LOCKED, lease de 60 s, token por intento y tres intentos automáticos. La extracción aislada tiene 30 s y el acceso Storage 8 s por solicitud. La finalización bloquea y revalida el trabajo. Si el proceso cae, otro worker puede retomar la lease vencida. Las correcciones de revisión se conservan en importaciones independientes.
- Idempotencia por cuenta y operación. El checksum se consulta dentro del propietario/periodo. La huella de fila y la comparación de título/curso/tipo/fecha proponen coincidencias. Cada resolución se confirma expresamente.
- La confirmación seleccionada comparte la transacción académica existente, valida todas las revisiones y revierte el lote completo ante una fila inválida. `keep` conserva la actividad, `distinct` crea una distinta y `update` propone exclusivamente una fecha/intervalo revisable. Las horas, el progreso y la prioridad vigente se conservan. La aplicación de fecha usa la propuesta de F1 y su revisión de workspace.

Los borradores aceptan campos faltantes, horas manuales, prioridad heredada/excepción y descarte/restauración. El curso requiere asociación con un curso existente del mismo periodo. Cada campo reconocido mantiene valor original, normalizado, página/hoja, fila y columna/coordenada. Las filas combinadas o desplazadas conservan referencias a sus filas de origen.

## Contrato para la futura integración F6

Todas las rutas usan `/api/v1`, cookie BFF y el protocolo existente de Origin/CSRF, Idempotency-Key y revisiones.

| Operación | Uso |
|---|---|
| POST /imports?periodId=UUID | Multipart con exactamente un campo de archivo `file`. Devuelve 202 con importación, documento y job. MIME declarado no decide formato |
| GET /imports | Listado privado paginado |
| GET /imports/{id} | Estado de extracción, cobertura y revisión. Es el recurso de sondeo del job de importación, cuyo ID coincide con el de importación |
| GET /imports/{id}/candidates | Filas, procedencia, coincidencias y prioridad efectiva, con paginación |
| PATCH /import-candidates/{id} | Correcciones o `discarded`, If-Match `"candidate-N"` |
| POST /imports/{id}/confirm | Filas con ID/revisión/resolución y revisión de actividad si hay coincidencia. If-Match `"import-N"` |
| POST /imports/{id}/retry | Reintento explícito de fallo con copia disponible, If-Match de importación |
| POST /imports/{id}/cancel | Cancela trabajo/revisión y solicita retirada de su contenido, If-Match de importación |
| DELETE /documents/{id} | Retirada documental y de borradores con preservación académica, If-Match de la importación |

Un fallo transitorio durante subida permite repetir el mismo cuerpo y clave. El vencimiento o rechazo permanente exige retirar esa importación antes de volver a cargar una copia nueva. Confirmar datos puede dejar horas desconocidas y `planningState=not_generated`. Las sesiones y su cálculo corresponden a F4. El frontend de `src/` conserva la demo.

## Cobertura medida

Benchmark del contenedor aislado en este equipo, después de revisar los campos de las muestras. Los tiempos incluyen crear y retirar el contenedor. Conteos son campos normalizados disponibles, sujetos a revisión de usuario. La tabla no mide precisión universal.

| Muestra | Candidatos | Título | Curso | Tipo compatible | Fecha | Inicio | Fin | Tiempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sílabo | 6 | 6 | 6 | 2 | 0 | 0 | 0 | 6379 ms |
| Laboratorio GIN/GiST | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 2852 ms |
| Actividad grupal | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 2506 ms |
| Laboratorio 6 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 2453 ms |
| Tarea de arquitectura | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 2352 ms |
| Anexo de teoría | 6 | 6 | 6 | 0 | 6 | 6 | 6 | 2838 ms |
| Anexo de ética | 4 | 4 | 4 | 2 | 3 | 3 | 3 | 3240 ms |
| XLSX sintético | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 4585 ms |

En total, 20 candidatos PDF. Los seis del sílabo conservan semanas y requieren fecha civil. Los cuatro enunciados conservan una obligación por documento y ninguna fecha de impresión se convierte en deadline. Los laboratorios requieren clasificación explícita conforme al catálogo académico aprobado. El anexo de teoría conserva seis intervalos con zona pendiente. En ética se detectan cuatro etiquetas y una fecha queda pendiente por contradicción con el día escrito. Tres horarios corresponden a evaluación y el de Proyecto queda por revisar como plazo. Una página del anexo de teoría carece de texto. El XLSX demuestra siete filas independientes, tres hojas inspeccionadas, fechas 1900/1904, encabezado/curso combinados y fórmula cacheada.

La muestra mayor tiene 3 500 891 bytes y el mayor tiempo medido fue 6379 ms. Esto acredita estas entradas dentro de los límites, junto con los rechazos automatizados de exceso. El corpus autorizado no incluye XLSX personal; el promotor indicó usar la estructura de los anexos para un fixture sintético. Escaneos, tablas complejas y formatos sin señales reconocibles conservan salida manual.

## Verificación reproducible

Usar Node 24 con `./scripts/dev.ps1` y Supabase local como en DEVELOPMENT. Las pruebas construyen aplicaciones independientes con cuentas y documentos sintéticos.

```powershell
& ./scripts/dev.ps1 run check
& ./scripts/dev.ps1 run db:migrate
& ./scripts/dev.ps1 run test:integration
& ./scripts/dev.ps1 run contracts:export
& ./scripts/dev.ps1 run contracts:types
& ./scripts/dev.ps1 run test:e2e
& ./scripts/dev.ps1 audit --omit=dev --audit-level=high
```

El corpus de `tests/fixtures/imports/` incluye README y resultados esperados por campo en `tests/backend/imports.test.ts`. `tests/integration/imports.test.ts` usa Storage y PostgreSQL reales locales para privacidad, borradores, confirmación parcial, idempotencia, propuestas, progreso y limpieza. Los fallos ambiguos de Storage y retirada se prueban con un adaptador doble explícito. El proveedor de identidad de ese fixture es doble, con cuentas Auth locales reales para las FK. Las pruebas históricas de OTP siguen en su suite.

El benchmark personal se ejecutó por lectura directa y stdin, sin subir las muestras a Storage. El archivo local ignorado `.local/f3/benchmark.json` contiene solo conteos, tamaños y tiempos. No se versionan los originales ni nombres de docentes/estudiantes.

Documentación oficial de bibliotecas y mecanismos utilizados. [read-excel-file](https://github.com/catamphetamine/read-excel-file), [PDF.js](https://mozilla.github.io/pdf.js/), [yauzl](https://github.com/thejoshwolfe/yauzl), [multipart](https://github.com/fastify/fastify-multipart), [límites Docker](https://docs.docker.com/engine/containers/resource_constraints/).

F3 queda sujeto a revisión del promotor y D-15. F4 y la integración F6 permanecen en sus fases.
