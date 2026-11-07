# Desarrollo CargaWise · F0–F4

Continuación F2: [disponibilidad y Calendar](./F2-DEVELOPMENT.md). Los resultados F0/F1 que siguen son evidencia histórica; el estado actual de ejecución se registra en PLAN §16.

Continuación F4 en [planificación, propuestas y sesiones](./F4-DEVELOPMENT.md).

Importación local habilitada con originales temporales: [política, requisitos y verificación F3](./F3-DEVELOPMENT.md). Requiere Docker, la imagen del parser fijada y Storage privado; el servidor no descarga imágenes ni utiliza un parser alternativo sin aislamiento.

Stack y gates: ARCHITECTURE.md / PLAN.md. La UI de `src/` conserva su modo demo; integrar API es F6. No se inicia producción ni se crean servicios cloud con estos pasos.

## Entorno y comandos

Node exacto en `.node-version`/`.nvmrc` (24.22.2); npm 10.8.2 o 11, Docker con contenedores Linux. Instalar con `npm ci`. En este equipo también existe Node 24 portable en `.local/runtime`; para no alterar Node global, usar `& ./scripts/dev.ps1 <argumentos npm>` en PowerShell. Ejemplo: `& ./scripts/dev.ps1 run check`. Ese wrapper ejecuta npm con el Node elegido; no basta anteponer PATH a `npm.cmd` cuando su instalación contiene su propio `node.exe`.

1. `npm run local:start`: solo pila Supabase local identificada `cargawise-f0`. No requiere login ni proyecto cloud. No detener/borrar contenedores de otros proyectos.
2. `npm run local:env`: crea roles separados y `.env` ignorado; nunca sobrescribe un `.env` ni roles existentes. El bootstrap concede al migrador solo USAGE de `auth` y REFERENCES de `auth.users`, mediante `supabase_admin` del contenedor propio; runtime/identity no reciben acceso a esas tablas. Si ya existen, conservar la configuración; no resetear una base para recuperar credenciales. Valores y claves no se imprimen. Si se perdió `.env`, revisar un procedimiento de recuperación local antes de rotar roles; no hacer reset automático.
3. `npm run db:migrate`: SQL versionado mediante migrador Drizzle con credencial independiente y lock. Repetir es seguro; no se migra al arrancar API. No `schema push` destructivo.
4. `npm run dev:api`: API en loopback `http://127.0.0.1:3001`; `npm run dev` mantiene el prototipo en 5173. Si ya está abierto, conservar ese proceso.

Supabase local expone API 54321, DB 54322 y correo capturado Mailpit 54324. Son herramientas locales, no un producto publicado. Usar exclusivamente direcciones `.test`/datos ficticios; correo no se envía a personas reales. El esquema privado `app` no está expuesto por Data API. Runtime y migración usan roles distintos; no usar `postgres`, service role o credencial de migración para consultas de negocio.

`.env.example` contiene placeholders. `.env`, claves, keystores, caches, objetos/builds y perfiles locales no se versionan. Nunca poner secretos en `VITE_*`. No copiar datos o credenciales de producción. No ejecutar `supabase link/push/deploy` en F0/F1.

## Verificación

- `npm run check`: build frontend, tipos backend, 22 reglas demo y pruebas unitarias/contratos backend.
- `npm run contracts:export` y `npm run contracts:types`: especificación y tipos de transporte generados; comprobar diff. No conecta la UI ni comparte entidades SQL.
- `npm run test:integration`: requiere la BD local real; si falta configuración falla explícitamente. No sustituye RLS con una base en memoria.
- `npm run setup:browser` y `npm run test:e2e`: pruebas desktop/móvil del prototipo. Son contextos de prueba separados del perfil abierto.
- `npm audit`: revisión completa de dependencias; `--omit=dev` aísla runtime. Cualquier excepción de herramienta debe registrar alcance, mitigación y revisión; no usar `audit fix --force`.

Las migraciones SQL revisadas se ejecutan con `drizzle-orm` y su migrador oficial. No se necesita un servidor Studio ni la herramienta opcional `drizzle-kit` para aplicar SQL; se retiró esa dependencia de desarrollo al detectar su cadena heredada de esbuild. La elección Drizzle permanece. `openapi-typescript` usa minimatch 11.0.4 fijado en override, comprobando la generación de contratos después de actualizarlo.

CI ejecuta matriz Windows/Linux y una pila Supabase efímera Linux. No utiliza secretos de despliegue ni llama Google/OpenAI. Generar workflow no acredita ejecución remota; registrar resultados locales y remotos por separado. Los artefactos de logs/trazas de autenticación no se publican sin revisar su contenido.

## Ramas, cambios y revisión

Rama `codex/<tarea>`; commits pequeños por baseline, preparación y dominio. Antes de editar: `git status`, inspeccionar cambios y conservar trabajo local. No `git add .`, reset, clean ni stash destructivo. Revisar la lista exacta antes de commit. Un commit local no implica push, merge ni despliegue.

Cada PR debe describir comportamiento, IDs F*/RF/RNF, archivos/migraciones, pruebas ejecutadas y limitaciones. Separar implementación de verificación y aprobación. La revisión del promotor es la única que marca un hito Aprobado; los checks técnicos pueden dejarlo Probado. Migraciones requieren SQL revisado y prueba desde cero/versión anterior; no revertir datos automáticamente con un rollback binario.

Producción, piloto, gasto y credenciales conservan sus gates. No se reutilizan las claves locales fuera del equipo/CI efímero. La etapa Android se limita a F0-07 y su evidencia; un APK compilado no prueba login, Calendar o distribución.

## Backend F1 implementado

El proceso Fastify escucha en [127.0.0.1:3001](http://127.0.0.1:3001/api/v1/health/ready). No sirve una segunda interfaz. Contrato navegable como JSON: [OpenAPI](http://127.0.0.1:3001/api/v1/openapi.json); archivo versionado `packages/contracts/openapi.json` y tipos `client.d.ts`. La raíz puede devolver 404: los endpoints empiezan por `/api/v1`. Backend y frontend son procesos independientes y locales; cerrar la terminal/proceso o apagar el equipo los detiene. Para reiniciarlos, iniciar Docker y la pila local y ejecutar `npm run dev:api` y `npm run dev` en terminales separadas; no repetir `local:env` si ya existe.

| Superficie REST (prefijo `/api/v1`) | Operaciones implementadas |
|---|---|
| `/auth/email/challenges`, `/auth/email/verify` | POST de código OTP e intercambio; `intent: register` o `login` |
| `/auth/session`, `/auth/session/refresh`, `/auth/logout` | GET de sesión, POST de renovación/cierre |
| `/auth/google/start`, `/auth/google/callback` | GET de inicio/retorno PKCE; deshabilitado sin configuración de pruebas |
| `/me`, `/me/preferences`, `/me/capabilities` | Perfil, PATCH de preferencias y capacidades Free calculadas en servidor |
| `/periods`, `/periods/{id}` | Listado/alta y PATCH; fechas/zona opcionales, sin semestre inventado |
| `/periods/{id}/courses`, `/courses/{id}` | Listado/alta y PATCH de curso |
| `/courses/{id}/priorities`, `/courses/{id}/priorities/{type}` | GET de bases; PUT/DELETE por curso×tipo |
| `/activities`, `/activities/{id}` | Listado/alta y GET/PATCH no temporal; curso opcional |
| `/activities/{id}/constraints`, `/activities/{id}/priority` | PUT de restricciones o prioridad individual |
| `/activities/{id}/progress`, `/activities/{id}/progress-history` | GET/PUT de progreso y GET de historial paginado |
| `/activities/{id}/date-change-proposals`, `/activities/{id}/date-history` | POST de vista previa y GET de historial |
| `/plan-proposals/{id}`, `/plan-proposals/{id}/apply` | GET de propuesta de fecha y POST de confirmación explícita |

No hay eliminación destructiva de cuentas/actividades ni sesiones de estudio persistidas en F1. Los DELETE implementados solo quitan una regla de prioridad base. La confirmación de fecha usa `confirmations: ["academic_date_change"]`; los campos temporales se rechazan en PATCH genérico. Un examen con intervalo fijo no convierte la duración de ese intervalo en esfuerzo de preparación. Una fecha sin hora/zona conserva esa incertidumbre, sin fabricar medianoche.

### Protocolo para clientes de desarrollo

1. Usar el origen exacto `PUBLIC_APP_ORIGIN` (actualmente `http://127.0.0.1:3001`); POST OTP requiere `Origin`. El correo se captura en [Mailpit](http://127.0.0.1:54324), no se entrega externamente. El prototipo en 5173 **todavía utiliza identidad simulada**; no está conectado a estos endpoints.
2. Verificar el OTP devuelve perfil/CSRF y una cookie opaca `__Host-cw_session`, Secure/HttpOnly/SameSite=Lax. No se entregan tokens de Supabase al navegador. Usar un cliente con almacén de cookies; el transporte Secure en un navegador necesita HTTPS o soporte explícito de loopback del navegador. HTTPS y cookies de un entorno desplegado siguen pendientes de F8; los tests de API no prueban ese despliegue.
3. Las escrituras privadas requieren cookie, `Origin` y `X-CSRF-Token` obtenido de la sesión. Las mutaciones académicas requieren además `Idempotency-Key` (1–128 caracteres alfanuméricos, `:`, `_`, `-`). La misma operación/cuerpo/versión y clave devuelve el resultado original; una clave reutilizada con otro contenido devuelve 409. Guardar y enviar de nuevo el mismo comando después de una respuesta perdida no suma horas otra vez.
4. Para editar enviar `If-Match` con el ETag devuelto (`"profile-N"`, `"course-N"`, `"period-N"`, `"activity-N"`). Proponer fecha requiere la revisión de actividad; **aplicar** usa `"workspace-N"` de la propuesta. Falta de versión: 428; versión obsoleta: 412. Volver a consultar y revisar antes de crear otro comando. No reenviar silenciosamente sobre una revisión nueva.
5. Listados usan `limit` y `cursor` opaco UUID, devolviendo `nextCursor`; historiales ordenan por revisión de actividad descendente, incluso con tiempos idénticos. Errores tienen código, mensaje seguro, campos, requestId y retryable; no incluyen SQL, tokens ni cuerpos recibidos.

### Políticas y seguridad comprobadas

- Parámetros **aprobados solo para desarrollo/pruebas**: OTP de 10 min, cinco intentos por solicitud, reenvío 60 s; sesión BFF de siete días y caducidad por 24 h de inactividad. El límite de correo de Supabase local se amplía exclusivamente para los fixtures de Mailpit; no es una cuota del producto. No existe todavía política completa de abuso/IP, SMTP externo, retención o piloto aprobada.
- El proceso rechaza producción y dependencias remotas. Verifica al arrancar que los roles de negocio/identidad no sean superusuario, BYPASSRLS o migrador ni puedan leer las tablas del otro rol. El propietario proviene del proveedor verificado; no se acepta en cuerpos, filtros arbitrarios ni JWT solo decodificados. RLS forzada y FK compuestas protegen la BD además de las comprobaciones de servicio.
- Tokens y verificadores OAuth se cifran AES-256-GCM en servidor. La cookie se busca por hash y el correo por HMAC; renovación con bloqueo de fila, vínculo de sesión del proveedor, callback de un solo uso y logout local autoritativo aun ante fallo de revocación remota. No se registran URL query, cuerpos ni tokens. La clave de cifrado debe conservarse; su pérdida/rotación requiere un procedimiento explícito y no un reset automático.
- `null` es desconocido; cero conserva revisión pendiente. Horas reales son total acumulado que **sustituye** al anterior, no una suma de eventos. Fin de preparación y evaluación/entrega cumplida son estados independientes. Reapertura requiere acción explícita y restante confirmado, conservando historial. Registrar horas no espera el deadline; la fecha de finalización real es opcional y necesita zona confirmada para validar que no sea futura.
- `needsReview` evalúa esfuerzo; no afirma viabilidad. `planningState: not_generated` indica que F2/F4 todavía deben calcular disponibilidad, sesiones y efectos sobre futuras sesiones. Grupos no reciben tiempo individual supuesto; reservas y equivalencias llegan en F4.
- No se acepta bearer nativo todavía. El esquema de seguridad OpenAPI documenta la dirección futura; un cliente no puede intercambiar un JWT arbitrario por identidad. El intercambio seguro, almacenamiento y retorno en APK deben implementarse/verificarse en la etapa móvil autorizada y AM-01.

### Qué pruebas son reales y qué sigue pendiente

`npm run test:backend`: 8 casos unitarios/contrato. `npm run test:integration`: 10 casos con PostgreSQL real, roles/RLS y API Auth/Storage/Mailpit locales. Tres recorridos de correo son reales: cuenta existente conserva datos, registro/replay/cierre (incluido refresh de proveedor revocado), y rechazo de alta accidental/límite de intentos. La prueba amplia de REST verifica prioridades, null/cero, grupo, historial, fechas y carreras entre dos cuentas.

El reloj y proveedor de las pruebas de concurrencia/OAuth son dobles explícitos; no prueban Google real. Otra prueba usa el SDK real para generar URL y PKCE, sin abrir Google ni autenticar a nadie. Google está deshabilitado por defecto; se activa con `GOOGLE_AUTH_ENABLED=true` y proveedor Google en Supabase local usando credenciales **de desarrollo** desde `.env`, redirects exactos y cuenta autorizada. El promotor configuró su entorno y confirmó personalmente ingreso, logout, reingreso y cancelación de Google real; tras cancelar reportó `SESSION_REQUIRED`. Es evidencia manual web local, no Android ni piloto. Los scopes de identidad son independientes de Calendar; no existe integración Calendar en F1. No pegar secretos por chat ni versionar configuración con ellos.

El callback `/api/v1/auth/google/callback` termina en **200 JSON de sesión**, como OTP, con cookie privada y sin tokens del proveedor. Hasta F6 no redirige al tablero: Fastify no sirve `/#/tablero` y hacerlo causaba un 404 pese a que el acceso había terminado bien. El tablero de 5173 sigue en modo demo. Para comprobar sesión después del ingreso usar `/api/v1/auth/session` en el mismo navegador. No recargar una URL de callback ya consumida: iniciar un nuevo flujo si se necesita repetir. La prueba dirigida HTTP de callback valida respuesta 200, ausencia de redirección, cookie funcional, no exposición de tokens y replay rechazado; usa el proveedor doble explícito.

Para probar rechazo con una cuenta Google ya autorizada usar `/api/v1/auth/google/start?prompt=consent` después de logout: fuerza una nueva pantalla de consentimiento mediante el parámetro oficial del proveedor. Solo se admite ese valor; el enlace normal conserva su comportamiento anterior. Logout de CargaWise no cierra la cuenta Google del navegador. Callback acepta error/error_code/error_description limitados, no refleja sus textos, consume la transacción y devuelve 401 sin emitir una sesión en cancelación. Google Android queda para AM-01.

La prueba de migraciones crea una base PostgreSQL efímera con nombre validado en el contenedor propio y un fixture mínimo `auth.users` para FK, aplica las tres migraciones y repite, y elimina únicamente esa base. La BD principal sigue intacta; allí también se probó actualización desde F0. El 04/11 el promotor aportó captura CI Success de `254370c`; posteriormente se publicó `d255d8f` y se verificó directamente su [CI 41785099991](https://github.com/jordinnreyes/LoadFlow/actions/runs/41785099991): Success global y jobs/steps de frontend Ubuntu/Windows y database correctos. No acredita Android; detalle en PLAN §15. El checkout limpio se comprobó para F0, no se atribuye a un release publicado.

Frontend: 22 pruebas de reglas y 36 ejecuciones Playwright desktop/móvil correctas con Node 24, también en el CI Windows/Linux de d255d8f; fuentes/rutas/tests originales sin cambios funcionales. Build/tipos, backend 8/8 e integración 10/10 correctos. Android: APK debug generado/firmado, instalado y flujo demo probado por el promotor en Samsung SM-A546E/API 36. Variante HTTPS: HTTP 200/requestId ffa26180-6d4e-4f61-8669-dec08f10242c a 2026-11-04T06:27:08.712Z, correlacionado con registro local TLS 1.3/origen localhost y distinto del smoke PC. Herramientas npm del spike sin vulnerabilidades tras actualización compatible. F0/F1 quedan Probadas en su alcance local/web; los hitos requieren revisión del promotor. Endpoint HTTPS temporal detenido al finalizar; API de identidad conservada. No se inicia F2, integración F6 ni distribución por terminar estas pruebas.

Fuentes oficiales consultadas para preparación: [Fastify v5](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/), [Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started), [correo de pruebas](https://supabase.com/docs/guides/auth/testing-auth-flows), [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node/releases). Revalidar compatibilidad antes de actualizar versiones.
