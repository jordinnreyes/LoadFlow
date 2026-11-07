# F4 · Planificación Free

El promotor autorizó F4 en esta sesión desde `65e0355`. La rama de desarrollo es `codex/f4-planning`. La UI se integra en F6. Al cerrar F4, las importaciones seguían deshabilitadas. La autorización posterior de originales temporales y su habilitación local están en PLAN §19 y docs/F3-DEVELOPMENT.md.

## Reglas aprobadas localmente

D-04/SUP-04 atiende Alta, Media, Baja y después sin prioridad declarada. Dentro de cada nivel usa plazo más cercano, primera confirmación y UUID. Una actividad Baja con plazo posterior puede preceder a otra sin prioridad. Las dependencias se resuelven primero y heredan urgencia de posición desde sus dependientes. La ausencia de prioridad se conserva como desconocida.

SUP-01/02/05 calcula desde el reloj del servidor hasta el cierre confirmado del periodo, o el último corte académico confirmado si falta cierre. El horizonte provisional se conserva en el snapshot. Las zonas originales de fechas y ventanas permanecen explícitas. La visualización semanal puede usar la zona confirmada del perfil. Fecha sin hora/zona, inicio desconocido, esfuerzo faltante y horario evaluativo incompleto mantienen análisis parcial.

D-09 permite explorar hasta 10 000 estados y aborta sin aplicar después de 20 s. Alcanzar el límite devuelve la mejor distribución válida encontrada y marca búsqueda limitada. Solo los certificados de capacidad insuficiente, ciclo/dependencia inválida, inicio posterior al corte o falta de bloque continuo justifican déficit/conflicto demostrado. Los restantes faltantes conservan diagnóstico de distribución no encontrada.

La reparación asigna por prioridad con restricciones, prueba otras posiciones de indivisibles por minuto y otras ventanas para divisibles/grupos. La búsqueda es determinista y acotada. Preferencia y máximo corresponden al fraccionamiento automático. Un trabajo indivisible puede superar el máximo preferido. Los remanentes bajo mínimo se combinan si caben dentro del máximo o quedan pendientes.

## Núcleo y adaptación

`packages/planning-core/` generaliza los intervalos y las reglas de la demo, usa minutos UTC enteros y recibe el reloj y la cobertura. El backend F2 reutiliza su unión/resta manteniendo milisegundos en el adaptador de fuentes. El núcleo conserva relaciones académicas tipadas y versiones de política/algoritmo. El validador independiente revisa ventanas, cobertura, ocupación, fechas, dependencias, conservación de esfuerzo y sesiones preservadas.

`PlanningService` lee un snapshot autorizado bajo transacción, libera el lock para el cálculo y guarda una propuesta ligada a revisiones de workspace y plan. Aplicar vuelve a leer cobertura y reloj, valida precondiciones y confirma el resultado en una transacción. La propuesta incluye antes/después, diferencias y autorizaciones necesarias. El cliente solo envía comandos tipados.

El cálculo corre en un Worker de Node 24 con entorno vacío, sin credenciales y TypeScript nativo. Dos cálculos concurrentes como máximo y heap de 192 MiB por hilo son guardas técnicas locales, con 429/503 explícitos. El timeout termina el hilo. La lectura de snapshots tiene un presupuesto separado de 20 s y consultas PostgreSQL acotadas por el timeout del pool. El benchmark cubre datos sintéticos pequeños y medianos, sin acreditar capacidad universal.

La migración `0008_planning.sql` agrega sesiones, ajustes grupales, equivalencias, versiones, propuestas y cola. RLS forzada, claves compuestas por propietario y funciones de reclamación restringidas al resolver de identidad. Las credenciales de identidad no leen directamente las tablas de planificación. Las sesiones se modifican bajo el lock de propietario utilizado por el resto del backend. Se permiten conflictos entre fijadas y ocupación externa para conservarlos y revisarlos.

## Propuestas y comandos

Prefijo `/api/v1`. Las mutaciones requieren cookie BFF, Origin, CSRF, Idempotency-Key y la revisión indicada. OpenAPI y cliente TS se generan desde las rutas.

| Ruta | Operación |
|---|---|
| GET /periods/{id}/plan | Plan actual, revisión de workspace/plan, último cambio aplicado, propuesta pendiente y estado de la recalculación |
| POST /periods/{id}/planning-proposals | Vista previa con `recalculate`, `move`, `fix`, `session_state`, `undo` o `academic_date`. If-Match de workspace |
| GET /planning-proposals/{id} | Antes/después, diferencias, diagnósticos, balance por actividad y confirmaciones requeridas |
| POST /planning-proposals/{id}/apply | Confirmaciones exactas e If-Match de workspace. La revisión de plan se comprueba también |
| GET /periods/{id}/weekly-plan?from=DATE&to=DATE | Calendario y resúmenes semanales por tramos de 1–31 días. El cálculo completo supera ese tramo |
| GET/PUT /activities/{id}/group-reservations | Ajustes 3×120 iniciales, aceptación/edición/desactivación. PUT requiere revisión de actividad |
| POST /activities/{id}/group-equivalences | Intervalo de ocupación vigente de un calendario propio seleccionado. Requiere revisión de actividad |
| DELETE /activities/{id}/group-equivalences/{equivalenceId} | Retirada explícita de equivalencia, con revisión de actividad |

`recalculate` permite alcance general o una actividad. `move` conserva duración y fija el bloque al confirmar. `fix` cambia movilidad. `session_state` confirma realización después de finalizar el intervalo o cancela expresamente. Marcar una sesión realizada conserva separados el registro de horas reales y los cierres de actividad.

`academic_date` referencia una propuesta académica F1 propia y vigente. La fecha, su historial y las sesiones se aplican juntos. Las rutas F1 originales siguen permitiendo confirmar un cambio académico aunque deje conflictos; marcan el plan desactualizado y solicitan recálculo seguro. La nueva vía F4 permite revisar también las sesiones antes de confirmar.

Un plan parcial requiere `accept_partial_plan`. Conservar sesiones previas en conflicto requiere `keep_fixed_conflicts`; incluye fijadas y otras sesiones intactas al editar una sola. Reservas grupales nuevas pendientes requieren `group_reservations`. Liberar una fijada requiere `release_fixed_sessions`. Cambiar fecha exige `academic_date_change`. Las sesiones nuevas o editadas inválidas se rechazan aunque se confirmen faltantes. Las autorizaciones se revisan nuevamente al aplicar.

## Grupos, progreso y deshacer

Las reservas grupales son tentativas y diferenciadas del esfuerzo individual. La propuesta prefiere días consecutivos cercanos al corte y usa días distintos compatibles si hace falta. Las equivalencias cubren solo ocupación vigente confirmada y se limitan al objetivo. Cada intervalo se asigna una vez por propietario. Cambiar selección, revisión o vigencia de Calendar invalida el anclaje y pide revisión.

Las reservas aceptadas se conservan al cambiar una fecha y pueden quedar en conflicto. Desactivar el grupo cancela reservas futuras flexibles y conserva las fijadas para decisión explícita. Ninguna reserva se transforma en dedicación real.

El endpoint de progreso F1 mantiene la sustitución del total real y los cierres independientes. Al terminar preparación individual o cumplir una entrega grupal cancela, en la misma transacción, sesiones futuras flexibles. Las fijadas se mantienen con diagnóstico cuando corresponda. Reapertura conserva historia y requiere restante explícito según SUP-08 aprobado.

Deshacer usa la distribución anterior y las restricciones actuales. La cancelación debida a una reorganización se distingue de una cancelación del estudiante o del cierre de preparación. Conserva sesiones fijadas/realizadas y revalida las posiciones restauradas. Un compromiso nuevo que invalide la restauración produce 422 y conserva la distribución activa. Fechas, progreso e historial académico permanecen fuera del comando de deshacer.

## Recalcular y explicar cambios

Después del primer plan aplicado, las mutaciones académicas y de disponibilidad encolan recálculo en la misma transacción. La cola usa partición interna, SKIP LOCKED, token de lease de 60 s y hasta tres intentos. Las pruebas utilizan colas propias. Un trabajo obsoleto pierde su token y no aplica resultados. Timeout del cálculo produce fallo seguro; errores transitorios tienen reintento acotado.

El worker calcula una propuesta y usa la política SUP-06 aprobada. Solo aplica automáticamente flexibles con datos completos, cobertura vigente y sin confirmaciones adicionales. Los resultados parciales o con fijadas en conflicto quedan para revisión, con ID de propuesta. `lastAppliedProposalId` permite consultar el resumen después de un reajuste automático, y `undoAvailable` indica que hay una distribución anterior cuya restauración debe revalidarse.

`planningState` de actividades, periodos y disponibilidad distingue `not_generated`, `current` y `stale`. Los resúmenes separan deadlines de semanas de ejecución. Una semana con trabajo adelantado se muestra con sesiones aunque no haya deadlines. Los minutos de una sesión que atraviesa una semana se recortan al intervalo consultado y se contabilizan una vez.

## Verificación y límites

Comandos con Node 24 mediante `./scripts/dev.ps1` y Supabase local, según DEVELOPMENT.

```powershell
& ./scripts/dev.ps1 run db:migrate
& ./scripts/dev.ps1 run check
& ./scripts/dev.ps1 run test:integration
& ./scripts/dev.ps1 run contracts:export
& ./scripts/dev.ps1 run contracts:types
& ./scripts/dev.ps1 run test:e2e
& ./.local/runtime/node_modules/node/bin/node.exe --import tsx scripts/backend/benchmark-planning.ts
```

Las ocho pruebas nuevas del núcleo cubren reglas temporales, prioridad en competencia, dependencias, fijadas, grupos, timeout y un oráculo independiente de 64 instancias pequeñas. Tres pruebas de integración nuevas usan PostgreSQL/Auth locales con cuentas ficticias. Cubren horizonte superior a cinco semanas, idempotencia, dos confirmaciones concurrentes, fechas atómicas, worker, lease vencido, progreso, equivalencias y deshacer permitido/rechazado. La ocupación Calendar de F4 se construye explícitamente como evidencia sintética en PostgreSQL. Las pruebas F2 de proveedor doble y el resultado manual histórico de Google se mantienen separados.

| Benchmark sintético | Actividades | Sesiones | Estados explorados | Tiempo con hilo |
|---|---:|---:|---:|---:|
| Reparación del primer hueco | 2 | 2 | 125 | 242 ms |
| Horizonte de 60 días | 24 | 48 | 0 | 275 ms |
| Límite de reparación | 5 | 4 | 10 000 | 875 ms |

El último caso demuestra 60 minutos de déficit por capacidad y marca también la búsqueda limitada. La prueba de timeout usa un plazo reducido de fixture y verifica aborto sin devolver una distribución parcial. El benchmark reproducible está en `scripts/backend/benchmark-planning.ts`; sus resultados locales se escriben en `.local/f4/benchmark.json`, ignorado por Git. Los tiempos corresponden a una ejecución y varían con la máquina y su carga.

F4 se verificó con entradas académicas manuales y fixtures. La habilitación posterior de importaciones locales no convierte esa evidencia histórica en una prueba de UI integrada. La revisión del promotor y el cierre del hito M2 se registran por separado. Premium corresponde a F5 y la conexión de la UI a F6.
