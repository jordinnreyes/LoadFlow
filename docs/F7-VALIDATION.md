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

## F7-04 · Seguridad y privacidad

| Control | Evidencia local |
|---|---|
| Autorización y RLS | Dos cuentas prueban el aislamiento en la API y directamente bajo el rol restringido de PostgreSQL. Una cuenta ajena recibe 404 al intentar retirar un documento y su actualización SQL afecta cero filas. Se verifican RLS forzada y ausencia de permisos directos para `anon`, `authenticated` y `service_role` en nueve tablas críticas. PostgREST rechaza seleccionar el esquema académico con credenciales anónimas y autenticadas. |
| Sesión y CSRF | Se comprueban las cookies `Secure`, `HttpOnly` y `SameSite=Lax`, caducidad, revocación, cifrado de tokens y rechazo de replay OAuth. El multipart con origen ajeno o el CSRF de otra sesión se rechaza antes de crear una importación. |
| Archivos y Storage | La carga rechaza campos multipart extra, incluido un intento de suministrar `sourceUrl`. La suite rechaza formato falso, macros disfrazadas, rutas relativas que salen del ZIP, cifrado y excesos. La extracción sigue usando el contenedor aislado sin red. Con un objeto existente y credenciales de cliente se comprueba que no se puede descargar, firmar, listar, sobrescribir ni eliminar el original de la ruta privada. |
| Destinos HTTP y logs | Auth y Storage de Supabase rechazan redirecciones. Dos servidores loopback verifican que una respuesta 307 no alcanza el segundo destino con la sesión, el cuerpo de carga o las claves. Google Calendar y OpenAI usan destinos fijos y rechazan redirecciones. El logger conserva plantilla de ruta, estado y correlación sin URI cruda, códigos OAuth, cookies, tokens ni fragmentos. Los retornos OAuth usan `Referrer-Policy: no-referrer` y `Cache-Control: no-store`. |
| Retirada y consentimientos | Se comprueba el borrado físico del temporal, el reintento duradero si Storage falla y que retirar elimina nombre, checksum y borradores y preserva la actividad con formato y localizador. Calendar descarta títulos de consultas en curso al ocultarlos y borra credenciales locales tras revocación confirmada. Revocar consentimiento Premium bloquea nuevas solicitudes y lectura de sugerencias sin borrar progreso. |

La comprobación de Calendar usa un doble de Google y las de Premium usan un doble de OpenAI. La auditoría `npm audit --omit=dev --audit-level=high` contra el registro oficial devolvió cero avisos para las dependencias de ejecución del lockfile. D-15 sigue pendiente para la política de retención y borrado de cuenta, otros registros y copias de seguridad antes de piloto. El alcance de esta revisión es la pila local.

### Repetición local

```sh
npm run check
npm run test:integration
npm run test:e2e:f7
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
```

## F7-05 · Fallos y recuperación

| Fallo inyectado | Comportamiento comprobado |
|---|---|
| Calendar deja de responder, limita solicitudes o revoca el permiso | La caída inicia un reintento a los 60 s. Un 429 simulado respeta `Retry-After` y la cola se detiene tras tres intentos. La ocupación previa queda como referencia sin certificar capacidad libre. La revocación detiene los reintentos de ese trabajo y conserva la sesión de WiseLoad. La disponibilidad manual vuelve a acreditar capacidad cuando el estudiante confirma de nuevo el rango. |
| Worker de Calendar termina después de vencer su lease | Su heartbeat no renueva una lease vencida y su respuesta no publica cobertura. Dos workers compiten por la recuperación y solo uno recibe un token nuevo para completar la sincronización. |
| OpenAI simulado supera el timeout y responde después | Se aborta la espera, la operación queda con resultado incierto y la respuesta tardía no publica una sugerencia. El presupuesto conserva la reserva hasta conciliación. Las solicitudes simultáneas no duplican esa reserva. Se puede registrar esfuerzo manual y conservarlo aunque una llamada posterior produzca una sugerencia. |
| Cálculo de planificación interrumpido | Un timeout del worker conserva los bloques y la revisión del último plan confirmado, lo marca desactualizado y permite recalcular manualmente. El Tablero muestra el fallo y mantiene la acción de revisión. La prueba del hilo de cálculo usa un timeout reducido de fixture. |
| PostgreSQL o Auth dejan de responder | Se inyecta un error de conexión solo en el pool del fixture y Chromium recibe un 503. La edición sigue en el formulario. Al recuperar la conexión, el reintento usa la misma clave de idempotencia y aplica una sola revisión, con el progreso previo intacto. Un 503 al renovar la sesión se distingue de una credencial rechazada. |

Los proveedores se simulan. Las colas y la persistencia usan PostgreSQL local con cuentas sintéticas. El fallo de conexión se inyecta por aplicación de prueba para mantener disponible la pila local compartida.

### Repetición local

```sh
npm run check
npm run test:integration
npm run test:e2e:f7
```
