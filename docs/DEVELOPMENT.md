# Desarrollo CargaWise · F0/F1

Stack y gates: ARCHITECTURE.md / PLAN.md. La UI de `src/` conserva su modo demo; integrar API es F6. No se inicia producción ni se crean servicios cloud con estos pasos.

## Entorno y comandos

Node exacto en `.node-version`/`.nvmrc` (24.22.2); npm 10.8.2 o 11, Docker con contenedores Linux. Instalar con `npm ci`. En este equipo también existe Node 24 portable en `.local/runtime`; para no alterar Node global, usar `& ./scripts/dev.ps1 <argumentos npm>` en PowerShell. Ejemplo: `& ./scripts/dev.ps1 run check`. Ese wrapper ejecuta npm con el Node elegido; no basta anteponer PATH a `npm.cmd` cuando su instalación contiene su propio `node.exe`.

1. `npm run local:start`: solo pila Supabase local identificada `cargawise-f0`. No requiere login ni proyecto cloud. No detener/borrar contenedores de otros proyectos.
2. `npm run local:env`: crea roles separados y `.env` ignorado; nunca sobrescribe un `.env` ni roles existentes. Si ya existen, conservar la configuración; no resetear una base para recuperar credenciales. Valores y claves no se imprimen. Si se perdió `.env`, revisar un procedimiento de recuperación local antes de rotar roles; no hacer reset automático.
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

Fuentes oficiales consultadas para preparación: [Fastify v5](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/), [Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started), [correo de pruebas](https://supabase.com/docs/guides/auth/testing-auth-flows), [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node/releases). Revalidar compatibilidad antes de actualizar versiones.
