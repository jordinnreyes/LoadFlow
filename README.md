# WiseLoad

## Estado del proyecto

La web responsive está en **F6, integración en curso**. La entrada principal usa el acceso por código de correo y carga la información de la cuenta autenticada. Los escenarios de demostración están separados para desarrollo.

El prototipo completo y sus pruebas quedaron versionados en el baseline `2e41ea7`, rama `codex/f0-f1-backend`. La configuración backend/local, instrucciones, seguridad y verificación se describen en [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md). El registro actual de ejecución está en [PLAN.md, §15](./PLAN.md#15-registro-de-ejecución--3-de-noviembre-de-2026). No se suben `.env`, dependencias, datos o artefactos locales.

| Documento | Uso |
|---|---|
| [PRD-v6.md](./PRD-v6.md) | Requisitos de producto y decisiones vigentes |
| [UX-FLOWS.md](./UX-FLOWS.md) | Pantallas, navegación, estados y trazabilidad |
| [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) | Tokens/componentes y refinamiento visual existente |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Diagnóstico, alternativas de stack, diagramas, seguridad, datos, API y costos propuestos |
| [PLAN.md](./PLAN.md) | F0–F8: backend → integración de la UI existente → staging; producción con aprobación independiente |

Stack aprobado: React/TypeScript/Vite/CSS y backend modular Fastify, PostgreSQL/Auth/Storage con Supabase y migraciones Drizzle. Se trabaja con contenedores locales aislados; no se han contratado servicios. Los costos orientativos y decisiones D-* permanecen en ARCHITECTURE, con sus políticas operativas pendientes.

OTP por correo y Google Sign-In están aceptados provisionalmente, con Calendar independiente e interfaces seguras SO/proveedor permitidas. Los parámetros de acceso de desarrollo/pruebas y SUP-08 se aprobaron expresamente; no habilitan piloto real. El spike Capacitor Android está en [spikes/android-capacitor](./spikes/android-capacitor/README.md); instalación/flujo demo/HTTPS ya comprobados, mientras Google/Calendar reales en Android siguen para AM-01. El endpoint HTTPS temporal se apagó tras la prueba. OpenAI no se usa en F0/F1; el aviso de key continúa en F5-04.

Las verificaciones del prototipo de las secciones siguientes corresponden al modo demo. El estado de la integración se registra en [PLAN.md, §21](./PLAN.md#21-inicio-de-f6--7-de-noviembre-de-2026).

Aplicación responsive para revisar la experiencia de anticipación de sobrecarga estudiantil. Construida con React, TypeScript, Vite y CSS reutilizable a partir de PRD-v6, UX-FLOWS y DESIGN-SYSTEM.

**Demostración local en `/?modo=demo`:** acceso, documentos, Calendar y estimaciones simulados. Para el acceso real en desarrollo, sigue la [guía de conexión local](./docs/DEVELOPMENT.md#primer-recorrido-conectado-de-f6).

## Ejecutar

Usar Node **24.22.2** según `.node-version`/`.nvmrc`, npm 10.8.2 o 11 y el lockfile. La instalación global del equipo no se cambia; existe runtime portable ignorado en `.local/runtime`. En Windows, `& ./scripts/dev.ps1 run <script>` lo selecciona. La infraestructura local backend requiere Docker Linux; el frontend demo puede abrirse sin ella.

```sh
npm ci
npm run dev
```

Abrir [http://127.0.0.1:5173/](http://127.0.0.1:5173/). El servidor escucha exclusivamente en loopback. Si se indica que el puerto está ocupado, cerrar el proceso de desarrollo anterior o usar `npm run dev -- --port 5174` y abrir ese puerto. Las pruebas de navegador usan 5173.

En PowerShell, si la política de ejecución impide usar el comando `npm`, usar `npm.cmd` en los mismos comandos. Detener el servidor propio con Ctrl+C en su terminal.

```sh
npm run build
npm run preview
```

El build web normal queda en `dist/` y usa la sesión de la cuenta conectada. Para probarlo con Vite Preview, configura la API local con el origen de la URL que imprime Vite, normalmente [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

## Qué revisar en la demostración

1. **Entrar con un perfil existente:** en Acceso, pulsar «Continuar con Google». Es una simulación que abre directamente el tablero Free de Alex. Seleccionar Premium antes de entrar abre otro perfil de ejemplo. No se abre un proveedor externo.
2. **Tablero → actividad → calendario:** abrir «PC 3 · Integrales y aplicaciones» y revisar sus sesiones. Observar el trabajo adelantado del parcial de Física y la semana del 30 nov., que contiene sesiones aunque no haya vencimientos.
3. **Importar:** usar «Excel · 5 PC + 2 exámenes». Corregir una fila, introducir horas y confirmar el inicio/divisibilidad de forma individual o mediante las acciones explícitas del lote. Confirmar solo algunas filas y retomar los borradores después.
4. **Reajustar:** cambiar disponibilidad o prioridad y comparar antes/después sin alterar el plan hasta confirmar. En una actividad, actualizar la fecha del examen; la comparación muestra fecha vigente/propuesta, procedencia y consecuencias.
5. **Registrar progreso:** anotar horas reales acumuladas, corregirlas y terminar preparación. Comprobar que el examen sigue pendiente de rendir y que las futuras sesiones flexibles desaparecen.
6. **Explorar excepciones:** en Ajustes → Herramientas del prototipo, elegir Sobrecarga, Información pendiente, Sin bloque compatible o Calendar desactualizado. Cada cambio de escenario requiere confirmar que reemplaza el plan local del perfil actual.
7. **Probar Premium:** cambiar a Premium en Ajustes o cargar el escenario con historial. Aceptar/rechazar/corregir una sugerencia de ejemplo. Para personalización, el escenario debe representar elegibilidad y debe estar activado el consentimiento para usar su historial ficticio.

Para comprobar la bienvenida: «Crear cuenta» con un correo de ejemplo nuevo → Calendar opcional → «Ahora no» → tablero vacío y guía descartable. Reutilizar el mismo correo mantiene ese perfil en este navegador. No se envían correos y no se verifica ninguna identidad.

## Rutas y pantallas

Las rutas de esta tabla pertenecen a la demostración de desarrollo. Conserva `?modo=demo` antes del hash, por ejemplo `http://127.0.0.1:5173/?modo=demo#/tablero`.

| Ruta / superficie                                      | UX-FLOWS | Contenido                                                                                |
| ------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `/#/acceso` y apertura sin sesión simulada             | S01      | Registro/inicio Google o correo, recuperación explicativa                                |
| `/#/tablero`                                           | S02      | Una semana por página, métricas, filtros, guía, alertas e importación                    |
| `/#/calendario`                                        | S03      | Semana y agenda; ocupación, disponibilidad, sesiones y plazos                            |
| `/#/importar`                                          | S04      | Ejemplos de PDF/.xlsx, revisión editable, pendientes y confirmación parcial              |
| `/#/disponibilidad`                                    | S05      | Ventanas múltiples por día, excepciones y preferencias 60/30/120 min                     |
| `/#/prioridades`                                       | S06      | Periodo, cursos, bases curso+tipo y consulta de excepciones individuales                 |
| `/#/ajustes`                                           | S07      | Perfil, fuentes, documentos, tiempo real, planes y controles de demostración             |
| `/#/calendario/:id` y `/#/calendario/nueva`            | S08      | Detalle/alta/edición contextual de actividad; fecha, restricciones, prioridad y sesiones |
| Acción «Registrar progreso» dentro del detalle         | S09      | Progreso, acumulado real, restante, preparación y cumplimiento independientes            |
| Panel de comparación / carga / deshacer                | S10      | Antes/después, impactos, faltantes y confirmaciones                                      |
| Panel Calendar desde bienvenida/ajustes/disponibilidad | S11      | Selección de calendarios ficticios, conexión, actualización y desconexión                |
| Ajustes → «Simular conflicto entre versiones»          | S12      | Comparación y elección explícita entre versiones ficticias de una actividad              |

Los paneles no son nuevos destinos permanentes. En móvil, el detalle usa el espacio completo y conserva su regreso; la agenda mantiene las acciones de la cuadrícula. Las métricas de horas y los próximos plazos se integran en las tarjetas, omitiendo el resumen duplicado del encabezado para que el trabajo semanal aparezca antes. Disponibilidad y prioridades también se abren desde Ajustes. Sesión de acceso válida → tablero directo, sin repetir onboarding.

## Escenarios y datos

**Reloj de demostración fijo:** lunes 2 de noviembre de 2026, 08:00, America/Lima. Las fechas no avanzan con el reloj del ordenador para que los escenarios sean reproducibles. Periodo inicial hasta el 18 de diciembre, editable.

| Escenario               | Qué representa                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Semana viable           | Siete obligaciones de Cálculo II, Física I, Programación II e Innovación; sesiones adelantadas y reservas grupales |
| Primera visita          | Sin actividades ni ventanas confirmadas; no afirma viabilidad ni presenta carga desconocida como cero              |
| Información pendiente   | Una duración ausente y otra actividad sin inicio permitido                                                         |
| Sobrecarga              | Demanda superior a los intervalos compatibles antes de los plazos                                                  |
| Sin bloque compatible   | Trabajo indivisible de 3 h con ventanas de 1 h; tener horas agregadas no resuelve la restricción                   |
| Calendar desactualizado | Se conserva ocupación previa y se señala que el análisis actual es parcial                                         |
| Premium con historial   | Registros ficticios comparables y una bandera explícita de elegibilidad, sin inventar un umbral de aprendizaje     |

Calendar de ejemplo contiene intervalos de clases, gimnasio y una reunión. La interfaz externa muestra **ocupación anónima por intervalo**, sin títulos privados; la lista de calendarios permite seleccionar Universidad/Personal. Las sesiones son internas y nunca se escriben en Google.

Ejemplos de importación:

- Excel con cinco prácticas y dos exámenes: siete filas, todas con horas aún por ingresar.
- PDF con enunciado individual: una obligación revisable; puede solicitar sugerencia de ejemplo en Premium.
- Datos incompletos: una fila sin fecha; permite confirmar las otras y conservar la incompleta.
- Versión actualizada: propone adelantar el parcial existente; exige elegir cómo tratar la coincidencia y confirmar el nuevo dato, sin duplicación automática.
- Archivo ilegible: aviso recuperable y alternativa manual. Un archivo local arbitrario solo muestra su nombre; **no se interpreta ni se afirma que se extrajo su contenido**.

## Reglas de demostración

La lógica local es determinista y está en `src/rules.ts`. Separa ocupaciones fijas de preparación y usa minutos, fechas civiles y ventanas autorizadas. Es un algoritmo sencillo de asignación, no un optimizador definitivo.

- Solo actividades confirmadas afectan el plan. Curso puede quedar sin asignar; título/tipo/fecha son mínimos. Sin hora necesaria para verificar el corte, esfuerzo o inicio permitido, se muestra pendiente y no se inventan datos.
- Prioridad: excepción individual → base curso+tipo → sin prioridad. Alta/Media/Baja tienen efecto en la disputa de huecos; a igualdad se atiende antes el plazo más cercano. Las restricciones prevalecen.
- Sin divisibilidad confirmada se exige un bloque continuo. Las divisibles usan preferencias editables de sesión; remanentes bajo mínimo permanecen visibles.
- Se unen intervalos superpuestos antes de descontarlos. Se respetan evaluaciones con intervalo confirmado, ocupaciones externas/locales y sesiones fijadas.
- Una edición manual de sesión la fija al confirmar. Reorganizar actividad conserva las otras actividades; recalcular plan revisa las flexibles del conjunto.
- Deshacer revalida contra restricciones actuales y conserva datos académicos, progreso y compromisos nuevos. No restaura a ciegas sesiones que ahora colisionan.
- Cambios académicos reales muestran anterior/nuevo/origen; conservar historial no crea otra evaluación. Una fecha real válida puede confirmarse aunque produzca déficit. Las fijaciones se señalan en conflicto, sin moverlas silenciosamente.
- Una entrega grupal propone hasta 3×2 h en días consecutivos cercanos al deadline cuando caben, o días distintos próximos/resultado parcial. Requiere aceptación, modificación o desactivación. La equivalencia con una ocupación externa se declara explícitamente y reduce la reserva pendiente sin contar dos veces.
- Horas reales acumuladas sustituyen el total previo al corregirse. Restante explícito prevalece sobre `max(0, estimado − real)`. Cero restante y plazo vencido no completan automáticamente la preparación ni el cumplimiento.
- Terminar preparación/trabajo cancela futuras flexibles; las fijadas se conservan salvo autorización de retiro. Rendir/entregar son estados separados.
- Free y Premium usan el mismo planificador. Las sugerencias son constantes predefinidas por escenario/contenido, con aceptación explícita; no se consulta IA ni se promete precisión. El cambio a Free conserva duración operativa, historial y sesiones.

## Organización del código y componentes

| Archivo / área                    | Responsabilidad limitada al prototipo                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/model.ts`                    | Tipos compartidos, constantes del reloj ficticio y estructura de actividad                 |
| `src/demo.ts`                     | Datos de ejemplo, perfiles, documentos y escenarios                                        |
| `src/rules.ts`                    | Intervalos, asignación de sesiones, validación y resumen semanal                           |
| `src/state.tsx`                   | Estado React y persistencia local por perfil; aviso de fallo de almacenamiento             |
| `src/navigation.ts`               | Rutas hash y control de salida con cambios pendientes                                      |
| `src/App.tsx`                     | Shell, coordinación de vistas y confirmación de propuestas                                 |
| `src/components/ui.tsx`           | Botones, campos, etiquetas, avisos, modal nativo accesible, iconos locales, estados vacíos |
| `src/components/ActivityForm.tsx` | Campos académicos, horas, restricciones, reservas y sugerencia simulada                    |
| `src/pages/`                      | Acceso, Dashboard, Calendario, Importación, Disponibilidad, Prioridades, Ajustes           |
| `src/panels/`                     | Actividad/progreso, comparación de cambios y conexión Calendar                             |
| `src/styles/tokens.css`           | Tokens semánticos derivados del sistema de diseño                                          |
| `src/styles/app.css`              | Presentación y adaptaciones responsive, sin framework visual                               |
| `tests/rules.test.ts`             | Comprobaciones de restricciones y conteo                                                   |
| `tests/flows.spec.ts`             | Recorridos de interfaz en escritorio y móvil                                               |

Componentes de dominio reutilizados: fila de actividad, tarjeta semanal, resumen de sesiones, selector de prioridad, campo de horas, formulario académico, reservas grupales, sugerencia base/personalizada, agenda, bloque de calendario, comparador antes/después e indicador de origen/estado.

## Comprobar el proyecto

```sh
npm test
npm run build
npm run setup:browser
npm run test:e2e
```

`setup:browser` descarga Chromium de Playwright en `.local/browsers/`, dentro del proyecto. `test:e2e` usa ese navegador y puede reutilizar el servidor 5173 o iniciarlo si está libre. `test-results/` y `playwright-report/` contienen resultados/capturas/trazas; se excluyen de Git junto con dependencias y builds. Las pruebas usan contextos de navegador separados, no el perfil abierto del usuario.

### Checklist de validación

Validación ejecutada: comprobación de TypeScript y build estático correctos, **22 pruebas de reglas locales aprobadas y 36 pruebas de navegador aprobadas** (18 recorridos en escritorio y los mismos 18 en móvil), más revisiones de regresión de los ajustes finales. También se revisaron capturas de ambas presentaciones. Las pruebas cubren:

- [x] Registro nuevo por correo, Calendar omitido, tablero vacío y regreso con sesión local.
- [x] Perfil existente y cierre de sesión, sin OAuth real.
- [x] Tablero, trabajo adelantado y navegación contextual a las sesiones.
- [x] Siete filas, corrección, confirmación parcial y continuidad de borradores tras recargar.
- [x] Alta manual y permanencia local del estado.
- [x] Base de prioridad, excepción individual y asignación con efecto real sobre huecos disputados.
- [x] Cambio de disponibilidad con propuesta antes de aplicar.
- [x] Cambio académico confirmado, historial y sesiones limitadas al nuevo plazo.
- [x] Horas reales corregibles y preparación terminada sin marcar rendida una evaluación.
- [x] Calendar simulado, estado desactualizado y ausencia de solicitudes externas en ese recorrido.
- [x] Free/Premium, aceptación de sugerencia, downgrade con datos conservados y personalización ficticia con consentimiento.
- [x] Equivalencia de reunión grupal y reserva sin duplicación de tiempo ocupado.
- [x] Sobrecarga, falta de información e incompatibilidad estructural diferenciadas.
- [x] Movimiento individual fijado, nuevo compromiso conflictivo y deshacer inválido bloqueado.
- [x] Documento actualizado sobre la misma actividad sin duplicarla ni reemplazar fechas antes de confirmar.
- [x] Decisión explícita al salir de un formulario modificado y cancelación de un diálogo por teclado.
- [x] Rutas principales sin desbordamiento horizontal general a 1440, 390 y 320 px; la cuadrícula conserva desplazamiento localizado.

La accesibilidad se ha abordado con etiquetas/ayudas asociadas, foco visible, controles nativos, diálogo con fondo inerte, Escape, agenda sin arrastrar y mensajes textuales. **No se afirma certificación WCAG ni se han realizado pruebas con estudiantes o una auditoría completa con lectores de pantalla.**

## Relación con el PRD y decisiones abiertas

En la entrega del prototipo se leyeron completos los tres documentos y no se modificó el PRD. La solicitud de aquella etapa autorizó el prototipo. En la revisión documental del 3 de noviembre se añaden ARCHITECTURE.md y PLAN.md, sujetos a aprobación, sin implementar backend.

| Requisitos                  | Implementación / revisión                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-01/05                    | Contexto de periodo/curso, alta y edición manual de obligaciones                                                                                                           |
| RF-02/03/04/16/23           | Importación predefinida, revisión, borradores, coincidencias y actualización confirmada de fuente                                                                          |
| RF-06/07/15/24              | Horas manuales/reales, origen, sugerencias simuladas y distinción Free/Premium                                                                                             |
| RF-08/18/20                 | Ventanas y ocupación, consentimiento separado representado, fuente manual/actualizada/desactualizada                                                                       |
| RF-09/10/11/12/21/22        | Restricciones, prioridades, cálculo de intervalos, sesiones, tarjetas, faltantes y explicación de viabilidad                                                               |
| RF-13/14/28                 | Fijación, reorganización por alcance, deshacer revalidado y cambios de fecha académica                                                                                     |
| RF-19/26                    | Dashboard vacío/poblado, navegación superior al calendario, cinco semanas y guía opcional                                                                                  |
| RF-25                       | Identidad y sesión solo simuladas, perfiles locales y salida                                                                                                               |
| RF-27                       | Persistencia en un navegador; S12 representa visualmente versiones divergentes, sin afirmar continuidad real entre dispositivos                                            |
| RNF-01/02/04/05/06/12/15    | Estados y origen, accesibilidad básica, integridad local, respuestas y adaptación responsive                                                                               |
| RNF-03/07/08/09/10/11/13/14 | Mínimos datos y separación de funciones representados; seguridad, aislamiento real, sincronización y calidad de IA quedan fuera por tratarse de un prototipo sin servicios |

Tratamiento explícito de pendientes de UX-FLOWS §11:

- **SUP-01/02:** periodo de ejemplo con cierre conocido; semana lunes–domingo, 24 h y zona fija Lima. Sin cierre, alcance provisional hasta el último deadline. No hay cambio automático de zona.
- **SUP-03:** correo es un selector local de perfil, sin contraseña ni recuperación real. No establece un método productivo de autenticación.
- **SUP-04:** empate residual por orden de confirmación; mezcla con prioridades no declaradas usa plazo y se explica como provisional. No se asigna Media de forma implícita.
- **SUP-05:** fecha sin hora conserva deadline pero deja preparación no verificable, sin inventar 23:59. Cambios académicos requieren procedencia y confirmación.
- **SUP-06:** las ediciones del plan se revisan antes de confirmar; la importación inicial y el registro de progreso muestran el efecto después de su confirmación explícita. Aplicar un resultado parcial no aplica bloques inválidos.
- **SUP-07:** comparación entre versiones solo escenificada. No existe resolución distribuida ni backend.
- **SUP-08:** esfuerzo positivo para programar; campos desconocidos vacíos. Cero real/restante no cierra; no hay reapertura automática ni medición individual de trabajo grupal.
- **SUP-09:** elegibilidad personalizada explícita por escenario, sin umbral; no hay precio, cuotas, pago ni precisión cuantificada.
- **SUP-10:** retirar documento conserva actividades confirmadas. Retención, eliminación/exportación de cuenta reales siguen pendientes.
- **SUP-11:** aplicación de tokens y objetivo de accesibilidad básico; no se presenta como aprobación visual ni certificación.

El PRD contiene formulaciones resumidas sobre horizonte y fechas fijas que pueden parecer absolutas. Aquí prevalecen §10.5.1 y §10.5.10/RF-28: se consideran las fechas vigentes del periodo y se permiten cambios académicos reales confirmados; el motor no posterga fechas por conveniencia. La continuidad real web/app descrita en el PRD se limita intencionalmente por la solicitud actual de no implementar backend.

## Limitaciones conocidas y reemplazos futuros

- El algoritmo local es secuencial y determinista, con preferencia/fecha y restricciones; **no prueba optimalidad ni garantiza hallar toda distribución teóricamente viable**. Un faltante describe el resultado del motor de demostración. El motor definitivo requerirá validación y criterios propios, sin decidirlo aquí.
- Las sesiones fijadas que pasan a chocar con un compromiso se conservan identificadas en conflicto hasta decisión explícita; no se presentan como un conjunto viable.
- La importación usa fixtures y no analiza archivos. Solo se conserva localmente el nombre de un archivo arbitrario seleccionado, nunca su contenido extraído.
- Las sugerencias son valores de ejemplo; no existen modelos, personalización estadística ni resultados de exactitud. Los registros históricos de escenario no validan beneficios del producto.
- El reloj se mantiene fijo para revisar las mismas semanas. No hay recurrencia productiva, cambio de zona, soporte offline completo ni notificaciones push/correo.
- La sesión y los perfiles no ofrecen aislamiento de seguridad real: cualquier persona con acceso al almacenamiento de este navegador puede inspeccionarlos. Usar exclusivamente información ficticia.
- La persistencia depende de `localStorage` y puede eliminarse al limpiar datos del navegador. Los escenarios se reinician desde Ajustes, confirmando su reemplazo. No se debe confundir este almacenamiento con una base de datos de producto.
- Deben sustituirse posteriormente el acceso simulado, los fixtures de extracción, los intervalos Google ficticios, la elegibilidad/sugerencias Premium de ejemplo y la concurrencia escenificada. Esa etapa no se inicia en esta entrega.

El prototipo se detiene en revisión visual e interactiva. No establece arquitectura de producción, seguridad real, políticas comerciales ni validez de las hipótesis de mercado.

## Refinamiento visual con referencias de Stitch · 2 de noviembre de 2026

Se mantiene una web responsive con React 19, TypeScript, Vite y CSS propio; no es PWA ni app nativa. La marca visible es WiseLoad. Se ajustaron tokens, superficies, jerarquía de horas, tarjetas de actividad, agenda, revisión de importaciones, encabezado y componentes compartidos mediante estilos. La tabla de revisión permanece en escritorio y los mismos campos se presentan como tarjetas en móvil. Las referencias aportan estética, no reglas ni datos.

Se conservaron rutas, estado local, datos ficticios y reglas. PRD-v6.md y UX-FLOWS.md permanecen sin cambios. La paleta y radios actualizados se reflejan en DESIGN-SYSTEM.md. El tablero sigue como vista principal y el calendario como complemento; una ocupación porcentual baja no demuestra viabilidad ante restricciones por plazo.

Verificación de esta revisión: compilación TypeScript, 22 pruebas de reglas y 36 pruebas de interfaz existentes en escritorio/móvil. Se amplió la comprobación visual de rutas con los anchos 320, 600, 768 y 1024 px y capturas de tablero, calendario e importación en `.local/visual-refinement/`. No constituye validación con dispositivos físicos ni certificación de accesibilidad.
