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

## F7-06 · Tiempos de referencia para staging

Corrida local del 08/11/2026 en Windows, i5-1335U, 8 GiB y Node 24.22.2. Fastify ejecutó las rutas por `inject`, con PostgreSQL, Storage y Docker locales y un doble de Auth. Las lecturas y propuestas tienen una llamada previa de calentamiento. La medición del worker abarca una iteración de cola, con extracción aislada, persistencia y borrado del temporal. La red del navegador, la espera entre iteraciones y los proveedores externos quedan fuera de la muestra.

| Operación | Muestras | Mediana | Mínimo–máximo |
|---|---:|---:|---:|
| Lectura de la semana, con un periodo de 24 actividades | 8 | 1 184 ms | 567–1 496 ms |
| Propuesta de planificación, 24 actividades, 48 sesiones y horizonte de 60 días | 3 | 3 072 ms | 3 042–3 541 ms |
| Recepción PDF de 8 páginas y 3 044 bytes | 3 | 685 ms | 313–1 148 ms |
| Worker PDF | 3 | 6 607 ms | 4 492–14 889 ms |
| Recepción XLSX de 3 hojas y 6 297 bytes | 3 | 323 ms | 288–416 ms |
| Worker XLSX | 3 | 7 067 ms | 5 919–12 309 ms |

Para presupuestar la primera prueba de staging, usar como candidato **Render `1c-2g`** (1 vCPU, 2 GB) para web/API y planificación. El límite local de 384 MiB del parser y los heaps de hasta 192 MiB por hilo de planificación reducen el margen de una instancia de 512 MB si coinciden las cargas. Empezar con una extracción a la vez y presupuestar hasta diez conexiones PostgreSQL por proceso con los dos pools actuales. F8 debe verificar latencias y consumo en el entorno objetivo, adaptar las guardas locales de arranque y demostrar cómo ejecutar el parser aislado allí. La muestra serial es una referencia de tiempos para esa prueba. [Planes de cómputo de Render](https://render.com/docs/compute-plans).

```sh
node --env-file=.env --import tsx scripts/backend/benchmark-f7.ts
```

## F7-07 · Accesibilidad prioritaria de la web

La revisión se concentra en el Tablero conectado y el diálogo de planificación. Chromium comprobó que «Saltar al contenido» es el primer destino de teclado y lleva el foco al contenido principal en la misma ruta. Al abrir el diálogo se enfoca su título. Tab alcanza el botón de cierre y Escape devuelve el foco al botón que abrió la revisión, aunque la propuesta se haya cargado de forma asíncrona. A 390 px comprobó el acceso a «Añadir» y a Calendario y la ausencia de desbordamiento horizontal del Tablero.

| Par de colores en los tokens de uso principal | Oscuro | Claro |
|---|---:|---:|
| Texto principal sobre superficie | 13,21:1 | 15,36:1 |
| Texto secundario sobre superficie | 9,02:1 | 7,87:1 |
| Texto del botón primario | 10,32:1 | 8,15:1 |
| Texto de aviso de error | 7,73:1 | 6,82:1 |
| Indicador de foco sobre superficie | 10,03:1 | 8,15:1 |
| Borde de control sobre superficie | 3,47:1 | 3,82:1 |

Los pares seleccionados superan 4,5:1 para texto y 3:1 para indicadores o bordes. El alcance se limita a estos tokens y a los recorridos descritos. [Contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [contraste de controles](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## F7-08 · Informe de salida local

Cierre técnico del 08/11/2026 en la rama `codex/f7-validation`. Los recorridos críticos ejercitados terminaron sin bloqueadores abiertos. El promotor aprobó el checklist web F01–F18 al cierre de F6 y pidió concentrar F7-06 y F7-07 en los tiempos necesarios para dimensionar staging y en la accesibilidad prioritaria. M4 conserva su revisión por separado.

| Tarea | Resultado y referencia en Git |
|---|---|
| F7-01 | Probada en web local en `658514b`. OTP por Mailpit, cuenta vacía, importación y corrección, planificación y progreso persistentes en dos contextos. Se corrigió la edición de preparación y divisibilidad en actividades importadas. |
| F7-02 | Probada en `fb6de76`. Siete PDF autorizados y un XLSX sintético, revisión por campo, deduplicación, fecha oficial y escaneo con alta manual. Los fixtures se reconstruyeron sin datos personales. |
| F7-03 | Probada en `e1acab5`. Oráculo con 192 casos adicionales, zonas y DST, restricciones y deshacer. Se corrigió la reparación de sesiones divisibles en bordes de ventana y con remanentes. |
| F7-04 | Probada en `b442ebf`. Se comprobó el aislamiento de propietarios, Storage y sesiones, y se bloquearon redirecciones de proveedores y referencias sensibles en logs. La auditoría de dependencias de ejecución registró cero avisos en esa revisión. |
| F7-05 | Probada en `7d39581`. Recuperación ante fallos inyectados de Calendar, OpenAI, planificación, PostgreSQL y Auth. Una lease vencida ya no puede publicar cobertura de Calendar. |
| F7-06 | Medición local acotada en `ca2115f`. Medianas de 1,18 s para leer la semana, 3,07 s para generar una propuesta y 6,61–7,07 s para procesar PDF/XLSX. La primera prueba de staging tiene como referencia 1 vCPU, 2 GB y una extracción a la vez. |
| F7-07 | Revisión web focalizada en `ca2115f`. Se corrigió el foco del diálogo y su retorno tras la carga asíncrona. Se comprobó teclado, ancho de 390 px y seis pares de contraste en cada tema. |
| F7-08 | Informe completado con resultados, trazabilidad y condiciones de staging. |

### Cobertura y repetición

La correspondencia de cada RF y RNF con las tareas y pruebas sigue en la [matriz del plan](../PLAN.md#13-trazabilidad-prd--tareas). La tabla recoge la evidencia de salida y distingue servicios reales de simulaciones.

| Prueba | Evidencia |
|---|---|
| T01, T06 | `npm run check` pasó con compilación web, tipos de servidor, 22 reglas de dominio y 46 pruebas de backend. El oráculo y los casos de restricciones se detallan en F7-03. |
| T02, T04 | PostgreSQL y Storage locales, RLS, carreras, idempotencia y corpus con parser Docker. En F7-05 pasaron 25 pruebas de integración entre `npm run test:integration` y la repetición dirigida de Calendar tras ajustar la expectativa de reconfirmación. |
| T03, T05 | OTP con Supabase local y Mailpit. El promotor comprobó Google web y el consentimiento de Calendar con títulos en F6. F7 usó dobles para revocación, errores y reintentos de Google. |
| T07 | F7 usó un doble de OpenAI para probar presupuesto, fallos y alternativas manuales. La llamada real, su corpus sintético y el costo estimado se documentaron por separado en [F5](F5-DEVELOPMENT.md#resultado-de-la-evaluación-inicial). |
| T08 | `npm run check` cubrió validación de solicitudes/respuestas y OpenAPI. Las suites de integración y seguridad comprobaron aislamiento de recursos y conflictos de versión. `npm run contracts:export` y `npm run contracts:types` reprodujeron los archivos versionados sin diferencias. |
| T09 | `npm run test:e2e:f7` pasó cuatro recorridos conectados con Chromium, incluido el flujo entre dos contextos autenticados, recuperación y foco. Por el cambio del diálogo compartido se repitió `node scripts/browser.mjs test`, el ejecutor de `npm run test:e2e`. Pasaron las 40 ejecuciones de escritorio y móvil emulado. |

La revisión usa Node 24 en Windows, servicios locales y cuentas sintéticas. La configuración de GitHub Actions conserva `pull_request` y limita `push` a `main`.

### Condiciones pendientes

| Ámbito | Qué queda por resolver o verificar |
|---|---|
| Staging y gasto | Resolver D-14/15 y revisar cuentas, región, dominio, presupuesto y credenciales independientes. F8-01 prepara la propuesta concreta para revisión antes de crear recursos. |
| Ejecución desplegada | Adaptar el arranque local, mantener el aislamiento del parser y verificar HTTPS, OAuth, SMTP y secretos del ambiente. Medir CPU, memoria, pool y latencias bajo concurrencia antes de confirmar capacidad. |
| Operación y privacidad | Ensayar migración, restauración de base de datos y objetos, rollback y alertas. Completar en D-15 la política de retención, borrado de cuenta y copias antes del piloto. La extracción local ya comprueba el borrado del original temporal. |
| Validaciones separadas | M4 queda pendiente de revisión del promotor. Android conectado se valida con AM-01/T12 en un APK. La revisión prioritaria de F7-07 dejó fuera lectores de pantalla, ampliación de texto y una auditoría de tacto en dispositivo. |
