# F2 · Disponibilidad y Google Calendar

Implementación local autorizada el 04/11/2026; conserva React/Vite y el prototipo demo. No conecta sus botones a la API: integración UI en F6. La arquitectura, políticas aprobadas y evidencia están en ARCHITECTURE §5/7.5 y PLAN §16.

## Ejecutar

Conservar `.env` y los roles de F0/F1. No repetir `local:env` ni resetear la base. Iniciar Docker/Supabase local como documenta DEVELOPMENT.md y ejecutar:

```powershell
& ./scripts/dev.ps1 run db:migrate
& ./scripts/dev.ps1 run dev:api
```

API en `http://127.0.0.1:3001`; OpenAPI en `/api/v1/openapi.json`. No es un despliegue. No migrar al arrancar API; migraciones Drizzle revisadas 0000–0006 y credencial de migración separada. Fuentes de negocio se consultan con `cw_runtime`, contexto del propietario y RLS forzada. No usar service role para negocio.

## Superficies implementadas

| Endpoint bajo /api/v1 | Uso |
|---|---|
| GET/PUT /periods/{id}/availability | Siete días ISO, zona IANA, vigencia, excepciones, cobertura manual y preferencias confirmadas |
| POST /periods/{id}/availability/copy | Copiar/reemplazar o combinar días explícitos; conserva fecha de revisión manual |
| GET /periods/{id}/capacity?from=DATE&to=DATE | Capacidad por tramos de hasta 31 días civiles |
| GET/POST /manual-commitments | Listar por periodo/rango y crear compromisos confirmados |
| PATCH/DELETE /manual-commitments/{id} | Corregir o retirar un compromiso propio |
| POST /calendar/authorization | Iniciar consentimiento de ocupación independiente del login |
| GET /calendar/callback | Validar usuario/sesión/state/browser/PKCE y guardar vínculo; devuelve JSON hasta F6 |
| GET /calendar/connection | Estado, revisiones, última lectura y política de desarrollo |
| GET /calendar/calendars | Lista persistida para seleccionar; no consulta eventos |
| PUT /calendar/selection | Selección explícita; inicialmente ninguna fuente seleccionada |
| POST /calendar/refresh | `{periodId,reason:open\|resume\|manual\|foreground}` → 202/job deduplicado. Con `manual` admite `weekStart` o `includeCurrentWeek: true` |
| GET /jobs/{id} | Estado del trabajo del propietario; no permite reclamar trabajos por HTTP |
| GET /calendar/busy?from=INSTANT&to=INSTANT | Intervalos, cobertura y antigüedad; sin contenido de eventos |
| DELETE /calendar/connection | Desconectar, cancelar trabajos e intentar revocación Google |

Mutaciones de datos exigen Origin, CSRF e Idempotency-Key. Editar/copiar/desconectar requiere If-Match: `availability-N`, `commitment-N` o `calendar-N`. Inicial sin configurar: `availability-0`. Iniciar OAuth es una transacción de un solo uso con Origin/CSRF, sin Idempotency-Key. No se acepta propietario, derechos Premium o credenciales desde el cuerpo HTTP. DELETE puede enviarse sin cuerpo ni Content-Type o con `{}` si el cliente establece application/json.

Ventanas en minutos locales; 1440 cierra a medianoche del siguiente día. Dividir ventanas nocturnas en sus dos días. ISO lunes=1, domingo=7. La vigencia `validTo` es inclusiva y la cobertura manual usa `[from,to)`. Excepciones reemplazan el día concreto. `no_study` es cero autorizado y `unknown` no es cero. DST inexistente/ambiguo requiere revisión y no produce horas ficticias. Preferencias mínimo/preferido/máximo requieren confirmación y `0 < mínimo ≤ preferido ≤ máximo`.

Capacidad = ventanas autorizadas menos unión ocupada de compromisos, intervalos oficiales internos y snapshots externos, sin doble conteo. `availableMinutes=null` indica incertidumbre; `provisionalMinutes` no demuestra viabilidad ni autoriza usar horas desconocidas. Copiar ventanas no vuelve a confirmar la cobertura manual. Una revisión manual explícita posterior a un fallo/desconexión puede cubrir fechas concretas; un dato antiguo no reemplaza una lectura fallida actual.

## Configurar Google de desarrollo

Habilitar Google Calendar API y crear cliente OAuth web para Calendar, manteniendo el cliente Supabase de identidad. En Audience conservar Testing y cuenta de prueba autorizada. Añadir exactamente en Data Access:

```text
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.events.freebusy
```

Retorno exacto: `http://127.0.0.1:3001/api/v1/calendar/callback`. Variables únicamente en `.env` ignorado:

```dotenv
CALENDAR_CLIENT_ID=ID_DEL_CLIENTE_DE_DESARROLLO
CALENDAR_CLIENT_SECRET=SECRETO_DEL_CLIENTE_DE_DESARROLLO
```

Sin prefijo VITE ni sustitución de `SUPABASE_AUTH_EXTERNAL_GOOGLE_...`. Reiniciar solo API después de configurar. No usar secretos productivos, crear billing ni publicar la app. Tokens Calendar cifrados con AES-GCM/clave versionada; acceso reservado al resolver privado (`cw_identity` con RLS Calendar), no al rol de negocio. No devolverlos al navegador ni registrarlos. El login Supabase no concede Calendar.

Al volver de Google, el cliente solicita la lista aunque no haya zona confirmada ni fuentes elegidas. **Guardar y sincronizar** reúne la selección explícita y la confirmación de zona cuando falta. El backend encola una lectura de la semana actual y del horizonte de planificación.

## Cobertura y trabajos

- Horizonte técnico de fuente: hoy→último plazo conocido, tramos ≤31 días sin truncar. Instantes confirmados conservan su zona académica; fecha sola amplía la consulta conservadoramente sin crear deadline de planificación. Sin plazos futuros se consulta solo hoy. Fuera de cobertura es desconocido. SUP-01/05 de planificación siguen para F4.
- **Actualizar esta semana** envía `reason: "manual"` y `weekStart` (lunes) para leer los siete días visibles en la zona de visualización. Las solicitudes manuales se encolan hasta que hayan pasado 3 s desde el último trabajo terminado. Las solicitudes no manuales conservan el límite de 60 s y los fallos de Google siguen respetando su backoff.
- Estado fresco hasta 30 min desde lectura correcta. Mostrar por separado no conectado/manual, conectado, desactualizado, parcial, error y revocado. En fallos, conservar ocupado anterior. Un error por calendario invalida su frescura aunque el último snapshot sea reciente. FreeBusy usa solo intervalos.
- En F6, **Conectar Google Calendar** solicita `calendar.events.readonly` junto con lista y ocupación. En Calendario, **Mostrar/Ocultar títulos** cambia la visibilidad con `PUT /calendar/event-titles`. Si falta el permiso, **Mostrar títulos** abre el consentimiento para completarlo con la misma cuenta conectada. Los títulos se leen al abrir la semana visible y solo para los calendarios seleccionados. La consulta puede devolver cobertura parcial si un calendario falla o alcanza el límite de lectura.
- Máximo 3 intentos totales por trabajo, mínimo 60 s entre solicitudes/reintentos y Retry-After respetado. 401 permite una renovación; invalid_grant requiere reconectar. Un 403 de permisos no se confunde con límite de cuota.
- Worker consulta la cola cada 2 s; no llama a Google sin un trabajo solicitado. Reclama mediante SKIP LOCKED/lease de 60 s, heartbeat de 20 s y comprobaciones de revisiones antes/después de red. No hay SQL abierto durante Google. Snapshots, cambios de entrada y finalización/reintento se confirman juntos. Cola de tests aislada internamente de la real; su nombre no se acepta por HTTP.
- La función privilegiada de reclamación descubre solo la cola. No concede bypass de RLS de negocio. Un ID HTTP no permite ver/ejecutar trabajos ajenos. El worker espera el trabajo en curso al cerrar la API y evita iniciar otro.
- Revisiones de conexión/selección y lease evitan guardar una respuesta antigua tras desconexión/cambio. La ocupación conocida sigue como referencia. Desconectar detiene nuevas consultas antes de revocar; si Google no confirma, devuelve `unconfirmed`, sin fingir éxito. La sesión CargaWise se conserva.
- Abrir/retomar, refresh manual y cada 15 min con vista activa son señales del cliente F6; F2 publica esta política y procesa trabajos explícitos. No hay watch/event sync ni polling continuo Google con app cerrada.

## Planificación posterior y pruebas

F2 registra revisiones/diferencias antes/después y clasifica autorizaciones SUP-06 aprobadas. Lecturas idénticas no invalidan una propuesta por un simple timestamp. `planningState=not_generated` sigue correcto. Motor, reservas/sesiones fijadas persistidas, aplicación de reajustes, preview y deshacer efectivo llegan en F4; UI real en F6 y Android integrado en AM-01. No se presentan como funciones implementadas por este backend.

Ejecutar `check`, `test:integration`, `contracts:export`, `contracts:types` y `test:e2e` como en DEVELOPMENT.md. Integración usa PostgreSQL, roles/RLS y Supabase reales locales con proveedor Calendar doble; no contacta Google. Sus datos académicos/correos son ficticios. La prueba de migraciones usa exclusivamente una base desechable de nombre validado y aplica/repite todo el journal.

Comprobación Google real del promotor separada de mocks: consentimiento, lista, selección del principal, FreeBusy y desconexión/revocación con sesión preservada. No se infieren pruebas de límites, revocación externa de Google, Android o piloto de esa comprobación. Evidencia/estados en PLAN §16; metadatos locales mínimos bajo `.local/f2/`, sin eventos, emails, cookies ni tokens.

Referencias: [CalendarList](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [OAuth de servidor](https://developers.google.com/identity/protocols/oauth2/web-server).
