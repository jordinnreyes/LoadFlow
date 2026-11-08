# PRD — Gestión adaptativa de la sobrecarga estudiantil

**Estado:**  v6 aprobado para UX, con las decisiones operativas de v5 incorporadas por solicitud del promotor y fechas académicas actualizables. 
**Versión:** 0.6.0 — v6 (cierre de reglas UX y actualización controlada de fechas académicas)  
**Fecha:** 31 de octubre de 2026  
**Segmento inicial:** estudiantes de pregrado de UTEC  
**Problema central:** sobrecarga estudiantil; el estrés académico se considera una posible consecuencia, no la definición del problema.  
**Responsable de aprobación:** promotor del emprendimiento. Los cambios funcionales solicitados se incorporan como dirección de producto; quedan pendientes la aprobación del prototipo visual, los criterios operativos de implementación y las políticas indicadas en §15.  
**Propósito de este documento:** definir necesidades, alcance, reglas, comportamientos y criterios de aceptación. Las decisiones de producto de login y estado compartido no eligen aún tecnologías de autenticación, persistencia o frameworks.

> **Convención de certeza.** **[E] Evidencia** = dato presente en PC1 o fuente oficial consultada; **[I] Interpretación** = lectura razonable que no establece causalidad; **[H] Hipótesis** = beneficio o comportamiento aún no demostrado; **[D] Decisión provisional** = recomendación de producto que requiere aprobación o puede revisarse; **[R] Requisito de MVP propuesto** = comportamiento esperado si se aprueba este alcance. Los términos «estimado», «probable» y «posible» deben mantenerse visibles cuando corresponda.

## Ficha ejecutiva de decisiones

| Decisión | Estado | Fundamento y alcance v6 | Riesgo / condición |
|---|---|---|---|
| Problema: sobrecarga estudiantil, no estrés | Definida | PC1: 9/9 se organizan, 7/9 subestiman duración | Muestra exploratoria; el estrés puede ser consecuencia |
| Segmento: pregrado UTEC | Definida para MVP | Estudiantes con varias obligaciones que ya usan algún método | No extrapolar cifras a toda UTEC |
| Beneficio central disponible en ambos planes | **Decisión v3 [D]** | Anticipar sobrecarga, distribuir sesiones automáticamente y recalcular al cambiar la disponibilidad | El beneficio depende de datos completos y horas estimadas razonables |
| Modelo comercial freemium | **Decisión v3 [D]** | Free: extracción estructural de PDF/Excel, tiempo de estudio ingresado manualmente, prioridades y planificación sin IA generativa; Premium: análisis semántico de tareas y estimación sugerida mediante IA, personalización histórica | Precio, cuotas, derechos de uso y costos reales por validar; monetización no demostrada |
| Importación de Excel y PDF gratuita | **Decisión v3 [D]** | Ambos planes permiten importar anexos de evaluaciones, sílabos y enunciados; detección de curso, tipo, fecha/hora cuando es reconocible | No equivale a extracción perfecta de escaneos/formatos arbitrarios; corrección y respaldo manual |
| Lista de revisión después de importar | **Decisión v3 [D]** | Ej. 5 prácticas y 2 exámenes → 7 filas para verificar fecha/curso e ingresar horas de preparación/trabajo cuando apliquen | No confundir duración del examen con horas de estudio; si faltan horas, estado parcial |
| Prioridad como atributo operativo | **Decisión v4 [A]** | Niveles Alta/Media/Baja heredables por **curso + tipo**, excepción individual y efecto real en la agenda | Fechas y horarios **confirmados vigentes** prevalecen durante el cálculo; pueden actualizarse por cambio académico confirmado; igual prioridad → plazo más cercano |
| Fecha real de finalización y dedicación | **Decisión v3 [D]** | Registro gratuito y opcional **al completar**, antes o después del deadline; el estudiante indica horas efectivas | No se infiere duración real desde hora de entrega ni desde sesiones previstas |
| Google Calendar | Conservada [D] | Conexión opcional de lectura de ocupación y respaldo manual; sesiones internas no escriben en Google | Consentimiento, cuota, actualización y continuidad |
| Sesiones y tarjetas semanales | Conservada [D] | Ubicación/reubicación automática de bloques internos sin IA generativa; pantalla de tarjetas semanales y calendario contextual | No desplazar eventos fijos **por conveniencia del motor**; el usuario puede confirmar cambios reales de fecha u horario académico, y se recalcula |
| Proyectos grupales simplificados | Conservada [D] | Solo deadline de grupo y reserva tentativa `3 × 2 h`, configurable | No inferir esfuerzo individual ni duplicar reunión ocupada de Google |
| Estimación Premium y consistencia | **Decisión v3 [D]** | Estimaciones orientativas con procedimiento/prompt versionado, contexto de la actividad y abstención cuando no haya fundamento; para entradas comparables valores razonablemente próximos | Prompt aislado no garantiza consistencia ni exactitud; limitación por plan |
| Personalización del historial Premium | **Decisión v3 [D]** | Registro de horas reales disponible para todos; sugerencia personalizada solo Premium con historial suficiente y comparable | No aprender de un único dato; sin modelo/proveedor impuesto |
| Identidad y continuidad web/app | **Decisión v4 [A]** | Registro e inicio de sesión requeridos; Google recomendado; misma cuenta y planificación en navegador y app, con backend/datos compartidos como restricción del proyecto | Método alternativo de correo, seguridad, recuperación y sincronización para arquitectura |
| Primera experiencia guiada | **Decisión v4 [A]** | Después del registro se ofrece conectar Calendar; permite omitir; se muestra tablero vacío y guía contextual para importar y completar disponibilidad; usuario autenticado retorna al tablero | El acompañamiento no bloquea el tablero |
| Prioridad y desempate | **Decisión v4 [A]** | Niveles Alta, Media, Baja por curso+tipo, excepción individual; a igual prioridad se considera antes la actividad de fecha límite más cercana | Empates exactos deben ser estables; no ignorar restricciones duras |
| Bloques de estudio | **Decisión v4 [A]** | Preferencia inicial editable de 60 min, franja utilizable mínima sugerida de 30 min y máximo recomendado de 120 min; sin mover compromisos fijos | Valores de producto provisionales, no hallazgo de entrevistas; preferencias ajustables |
| Estados del tablero | **Decisión v4 [A]** | Vacío, pendiente/incompleto, viable según datos, sobrecarga, conflicto/inviable, fuente desactualizada | No presentar el estado vacío ni datos desconocidos como controlados |
| Retención, suscripción y umbrales | Pendiente operativo | No se elige tecnología ni precio de pago | Resolver antes de piloto con usuarios y comercialización |

**Interpretación del modelo Free/Premium:** importar **y extraer información estructurada** de PDF/Excel es gratuito; el procesamiento no generativo de datos académicos es parte del valor básico. **Premium no es el permiso para subir archivos**, sino el acceso a sugerencias del esfuerzo basadas en comprensión del enunciado y personalización del historial. La extracción gratuita utiliza los datos efectivamente reconocibles y permite corrección. Si un formato exige capacidades no disponibles, informar la limitación y ofrecer ingreso manual: nunca inventar actividades ni tiempos.

**Experiencia principal:** una persona sin sesión ve acceso/registro; el primer ingreso autenticado recomienda conectar voluntariamente Google Calendar y conduce a un **tablero inicialmente vacío** (tarjetas semanales, selector de semanas en la parte superior, acceso al calendario por encima y botón visible «Importar actividad — Excel/PDF» en la zona inferior). La guía contextual invita a importar, completar horas/prioridades y definir ventanas de estudio, sin bloquear el tablero. Después de cargar un documento se muestra una **lista de todas las obligaciones detectadas** con curso, tipo, fecha/hora, horas pendientes y prioridad, y se confirman esos datos **antes** de programar. En ingresos posteriores con sesión válida se abre directamente el tablero. En ambos planes se ofrecen tarjetas semanales, calendario interno, lectura opcional de Google Calendar, distribución automática mediante reglas y recálculo por imprevistos. La vista ilustrativa enviada guía la navegación, no fija el diseño final.

## Registro de revisión v6 — cierre funcional y cambios oficiales de fecha

**Solicitud del promotor (31/10/2026):** incorporar las soluciones del borrador v5 para los hallazgos de Figma y **exceptuar la inmutabilidad absoluta de plazos y eventos académicos**. Los acuerdos de §10.5.1–§10.5.4 y §10.5.6–§10.5.9 pasan a dirección funcional aceptada para elaborar UX, con ajustes de fechas en §10.5.10. La regla §10.5.5 ahora diferencia **restricción vigente durante el cálculo** de **dato académico actualizable por cambio real de la institución o del docente**. Queda prohibido que el planificador altere plazos únicamente para hacer que el plan encaje.

**Efecto de los cambios oficiales:** el estudiante puede modificar y confirmar fecha límite o fecha/hora de examen, práctica, exposición o entrega grupal cuando se adelantan o postergan por feriados, decisiones del docente u otras causas. También puede revisar una versión nueva del documento importado. La aplicación conserva la procedencia y el historial de cambios, recalcula preparación, sesiones y estados, y nunca edita por ello los eventos externos de Google Calendar. Si el nuevo plazo vuelve imposible cumplir, se muestra el conflicto; no se inventa tiempo ni se recuperan horas pasadas.

**Alcance del cierre:** DP-27 a DP-32 quedan incorporadas como reglas de producto para Figma; DP-33 registra la excepción de fechas. Se mantiene pendiente la aprobación del diseño visual y la factibilidad de arquitectura; ningún cierre convierte una hipótesis de mercado en ventaja demostrada.

## Registro de revisión v5 — correcciones al PRD-v4

**Origen:** observaciones del agente de Figma recibidas el 31/10/2026. **Alcance:** se conserva la propuesta de valor, Free/Premium, importación Excel/PDF gratuita, login obligatorio y la visión de tarjetas semanales. Se resuelven: (1) autorización del PRD, (2) contradicción de cuenta, (3) personalización condicional Premium, (4) modo manual frente a fallo Calendar, (5) restricciones duras vs preferencias, (6) movimiento individual/por actividad, (7) horizonte y tarjeta sin deadlines, (8) borradores, (9) restricciones desconocidas, (10) deshacer seguro, (11) reservas grupales, (12) progreso/finalización separados. Las decisiones **DP-27 a DP-32 fueron incorporadas como dirección funcional en la revisión v6**; se mantienen pendientes de prototipado y factibilidad, no de definición inicial.

**Criterio de prototipado:** Figma puede utilizar las reglas operativas de v6 para crear flujos y estados, incluyendo cambios de fechas y conflictos. El diseño visual resultante debe revisarse y aprobarse por separado.


## 1. Resumen del producto

### 1.1 Qué es

**[A]** Producto digital para **navegador y app móvil** de gestión adaptativa de la sobrecarga estudiantil, con acceso por cuenta registrada, información almacenada en una base de datos lógica compartida entre ambos clientes y núcleo funcional gratuito más automatización asistida Premium. Ambos clientes utilizan el mismo backend y repositorio lógico de información, sin seleccionar tecnología ni estructura física en este documento.

- **Entrada gratuita:** importar Excel/PDF (sílabos, anexos de evaluaciones y enunciados) para detectar, cuando los datos sean legibles, cursos, tareas, prácticas calificadas, exámenes, fechas y horarios. Revisar una lista editable antes de crear el plan. También permite registrar actividades manualmente.
- **Free:** el estudiante declara para cada actividad individual las horas que cree que necesita; configura prioridades por curso + tipo o por actividad. El sistema no invoca IA generativa para extraer datos estructurados, programar, detectar sobrecarga o reajustar.
- **Premium:** el análisis semántico del enunciado puede proponer horas orientativas revisables, y el historial de dedicación real podrá ayudar a personalizar sugerencias cuando haya registros comparables suficientes.
- **Acceso y bienvenida:** registro/inicio de sesión, con opción recomendada «Continuar con Google» y alternativa mediante correo; iniciar con Google **no autoriza automáticamente Calendar**. Tras el primer acceso se ofrece su conexión separada y opcional. El tablero vacío permanece accesible y guía sin obligar a completar una configuración inicial.
- **Experiencia:** una sesión válida lleva directamente al tablero; en la zona superior hay entrada al calendario y navegación por semanas, con tarjetas semanales en el centro y CTA «Importar actividad» en la zona inferior, además de acceso persistente para añadir actividades. Al abrir una obligación se enfoca su calendario interno y las sesiones generadas. La aplicación recalcula sesiones flexibles ante cambios y mantiene datos sincronizados entre web y app cuando existe conexión.

La conexión a Google Calendar es opcional. No es un sistema clínico, un LMS, un gestor completo de proyectos grupales ni una promesa de que todas las semanas puedan hacerse viables. La diferencia visual y la facilidad de uso frente a Shovel siguen siendo hipótesis.

### 1.2 Para quién

Estudiantes de pregrado de UTEC que cursan varias asignaturas, ya intentan organizarse y reportan dificultades para estimar su dedicación o reconocer a tiempo la acumulación de trabajo. No se presume que todos presenten exactamente el mismo patrón ni que la muestra represente a toda UTEC.

### 1.3 Problema que pretende resolver

**Problema preliminar:** estudiantes que se organizan durante el semestre subestiman la duración de algunas actividades y pueden advertir demasiado tarde que el esfuerzo requerido por obligaciones académicas concurrentes excede el tiempo disponible, obligándolos a ajustar prioridades apresuradamente, reducir descanso o prepararse de modo insuficiente.

Se distinguirá entre **sobrecarga estructural** (demanda mayor que la capacidad aun con estimaciones correctas) y **sobrecarga agravada por planificación** (estimaciones erradas o cambios no absorbidos). El producto puede visibilizar la primera; no prometerá eliminarla.

### 1.4 Beneficio esperado

Que el estudiante **anticipe semanas de sobrecarga, reciba un calendario de sesiones posibles y pueda reorganizarse** sin tener que distribuir manualmente cada bloque. Tanto Free como Premium reciben ese beneficio central. Free reduce la transcripción mediante importación estructurada, pero exige que el estudiante estime horas; Premium busca reducir también el esfuerzo de estimación, con sugerencias revisables y personalización gradual.

**[H]** Este enfoque podría ahorrar pasos y mejorar decisiones, pero ni la adopción del plan gratuito, ni la precisión Premium, ni la disposición a pagar están validadas. No se promete mejorar notas, sueño o salud.

## 2. Problema y evidencia

### 2.1 Hechos documentados en el PC1

| Hallazgo documentado | Recuento | Alcance y límite |
|---|---:|---|
| Declaran usar algún método de organización | 9/9 | Autorreporte de muestra exploratoria |
| Declaran reservar espacio pero subestimar la duración de ciertas tareas | 7/9 | No se midieron tiempos estimados y reales |
| Priorizan por fecha de entrega | 6/9 | Descripción de criterios utilizados |
| Priorizan según peso de la nota / necesidad de aprobar | 4/9 | Puede solaparse con otros criterios |
| Priorizan cursos importantes para su carrera | 2/9 | Otro criterio, no excluyente |
| Mencionan reuniones de equipo como interrupción | 3/9 | No es necesariamente una causa primaria |
| Mencionan tráfico como interrupción | 3/9 | Puede solaparse entre entrevistados |
| Mencionan asuntos familiares | 2/9 | Puede solaparse entre entrevistados |
| Mencionan desvelarse para terminar trabajos | 4/9 | No se atribuye causalidad individual |
| Reportan llegar sin preparación suficiente a evaluación/presentación | 5/9 | Autopercepción, no rendimiento medido |

**Nota de calidad de fuente:** el PC1 indica que 3 entrevistados del grupo de preparación insuficiente sintieron frustración, pero la lista de esos 3 contiene a Melany, que no figura en la lista de 5 del grupo precedente; ese cruce debe tratarse como inconsistente, sin corregirlo por inferencia. El PC1 informa **ninguna evidencia de retiro de cursos** por esta causa. La hipótesis de que el problema ocurre solo en parciales/finales también quedó cuestionada.

### 2.2 Interpretaciones, hipótesis y límites

- **[I]** El problema no es simplemente «no saber organizarse», pues los nueve entrevistados usan algún método; ello no demuestra eficacia.
- **[I]** Errores al estimar tiempo podrían ocultar déficits de carga hasta fechas cercanas; no se estableció causalidad individual.
- **[H]** Free: importar anexos y completar duraciones manualmente podría conservar el valor de anticipar sobrecarga, aunque algunos estudiantes subestiman las horas (7/9).
- **[H]** Premium: sugerencias iniciales de duración y ajuste básico condicionado al historial comparable podrían reducir trabajo manual; aprendizaje avanzado posterior. El beneficio no está demostrado.
- **[H]** El plan Premium puede resultar atractivo comercialmente; no hay datos de conversión ni disposición a pagar que lo demuestren.
- **[H]** La replanificación automática de sesiones flexibles podría mejorar decisiones ante imprevistos.

No están disponibles las transcripciones completas ni las hojas originales de entrevistas. Los estudios secundarios del PC1 miden fundamentalmente estrés académico y no cuantifican representativamente la sobrecarga de UTEC. Nueve entrevistas no justifican precios, tamaño de mercado ni tasas de adopción.

### 2.3 Evidencia competitiva y sus límites (base revisada 23/10/2026, vigente como referencia v3)

**Shovel — competidor directo de referencia.** Su documentación oficial describe un conjunto amplio de capacidades que se superponen con esta visión:

1. **Captura:** sílabos PDF con importación asistida por IA y sincronización con Canvas, Brightspace, Moodle y Google Classroom. Fuente: https://shovelapp.io/ y https://courses.shovelapp.io/courses/how-to-use-shovel-knowledge-base/.
2. **Estimación:** en lecturas, páginas por tiempo por página (con tiempo adaptable por fuente); en trabajos distintos de lectura, la documentación clásica pide una duración estimada editable. Fuente: https://help.shovelapp.io/en/tasks/create-new-tasks. Además, sus asistentes de IA conectados pueden incorporar estimaciones al procesar sílabos: https://courses.shovelapp.io/lessons/using-shovel-with-ai-assistants/. No está comprobado que exista una estimación universal fiable desde cualquier enunciado.
3. **Detección:** Cushion compara dedicación pendiente con tiempo libre y señala riesgo de sobrecarga. Fuente: https://help.shovelapp.io/en/analytics/the-cushion.
4. **Distribución:** Auto-plan programa tareas estimadas en tiempo libre, respeta fechas límite y presenta trabajos que caben completa/parcialmente o no caben. Puede planificar únicamente el rango visible; ofrece vista previa antes de aplicar. Fuente: https://courses.shovelapp.io/lessons/how-auto-plan-works-in-shovel/.
5. **Replanificación:** Replan puede reorganizar sesiones creadas automáticamente; controla sesiones ya ubicadas y opciones de ajuste. Fuente: misma documentación de Auto-plan.
6. **Seguimiento:** registra dedicación real, ajusta tiempo pendiente y puede actualizar el ritmo de lectura según páginas y minutos reportados. Fuente: https://help.shovelapp.io/en/tasks/tracking-task-progress.

**Otras alternativas.** FlowSavvy ofrece distribución/reprogramación automática (https://flowsavvy.app/); MyStudyLife incorpora horarios, exámenes y planificación asistida (https://mystudylife.com/msl-plus/). Google Calendar ya almacena compromisos como clases o gimnasio; su interfaz y API distinguen ocupado/libre, pero eso no representa por sí solo intención de estudiar. Fuente: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query.

**Conclusión rigurosa:** nuestra **hipótesis** diferencial pasa a ser una **experiencia de extremo a extremo simplificada y automatizada**, presentada mediante tarjetas semanales y calendario de estudio contextual. La presentación visual distinta **no es ventaja demostrada**. No afirmar que solo nuestro producto importa PDFs, predice sobrecarga, aprende del progreso o replantea sesiones; no afirmar tampoco que Shovel carezca de IA.

**Límites:** descripción funcional basada en documentación oficial, no auditoría independiente ni prueba comparativa con usuarios de UTEC. Los detalles del producto competidor pueden cambiar.

## 3. Usuarios y contexto de uso

### 3.1 Segmento prioritario

**Usuario primario:** estudiante de pregrado de UTEC con varios cursos y obligaciones de distintas clases —tareas individuales, prácticas, exámenes y proyectos grupales— que ya utiliza herramientas o rutinas para organizarse.

**Características respaldadas:** uso de algún mecanismo de planificación; dificultad de estimación frecuente dentro de la muestra; decisiones basadas en fecha e importancia de la nota; imprevistos variados.

**No investigado suficientemente:** diferencias por ciclo/carrera; dispositivos preferidos; alfabetización digital; acceso y calidad de documentos; disposición a compartir PDFs, esfuerzo de proyectos grupales, privacidad percibida; cadencia de uso; tolerancia a correcciones; necesidades de accesibilidad; capacidad o disposición de pago.

### 3.2 Situaciones que desencadenan el uso

1. Inicio de ciclo: el estudiante importa **Excel o PDF** de calendario de evaluaciones y confirma cursos, tipos y fechas.
2. **Primera planificación:** revisa la lista importada y consigna sus horas estimadas de estudio por cada práctica/examen/tarea (Free) o revisa sugerencias de horas cuando existen (Premium); configura prioridad por curso + tipo y excepciones por obligación.
3. Recepción de enunciado adicional: lo importa o registra; Premium puede proponer esfuerzo desde el contenido cuando haya base suficiente.
4. Semana exigente: examina tarjetas y sesiones distribuidas; corrige prioridades o duraciones si cambia la situación.
5. Cambio en clases, gimnasio o reunión: se actualiza disponibilidad vía Google Calendar o manualmente y se recalculan sesiones internas flexibles.
6. **Cuando completa una actividad**, aunque sea antes del deadline: indica opcionalmente fecha de finalización y horas reales; se registra en ambos planes, y Premium podrá usar datos suficientes en futuras sugerencias.

**Contexto de acceso multiplataforma [A]:** la carga de Excel/PDF puede efectuarse desde el navegador, y la consulta de tarjetas/sesiones desde la app, sin excluir el uso de cualquiera de las funciones básicas en ambos clientes. El usuario se identifica con una cuenta y los cambios confirmados deben aparecer en el otro cliente al actualizar/abrir la planificación; si falla la sincronización se informa y no se sobrescribe en silencio. Una sesión autenticada no repite el registro ni la bienvenida.

### 3.3 Alcance de la participación de otros usuarios

**[D]** El MVP es individual. Un proyecto grupal se registra como **deadline grupal**, no como cálculo del esfuerzo propio ni suma de las horas de todos los integrantes. Para hacerlo visible en la carga, el producto ofrece **una reserva provisional configurable de tres bloques de dos horas en días consecutivos antes del deadline**, cuando los intervalos y restricciones lo permitan. Es una **convención inicial de planificación**, no una medición del proyecto ni promesa de que la reunión existe. La reserva se presenta como «tentativa», se puede aceptar/editar/desactivar y no duplica reuniones ya ocupadas en Google Calendar. Si no caben tres bloques, se informa el faltante o conflicto. No hay cuentas de compañeros ni chat grupal.

## 4. Propuesta de valor y diferenciación

### 4.1 Propuesta principal

> Ayudamos a estudiantes universitarios a **anticipar su sobrecarga académica y decidir oportunamente cómo distribuir su esfuerzo** mediante importación de cronogramas Excel/PDF, planificación de sesiones según disponibilidad real, tarjetas semanales y recálculo ante cambios. La experiencia gratuita funciona con duraciones y prioridades declaradas por el estudiante; la Premium añade sugerencias de esfuerzo a partir de tareas y personalización progresiva según la dedicación real registrada.

**Posicionamiento:** gestión adaptativa de la sobrecarga estudiantil. La integración y facilidad de uso frente a Shovel son **hipótesis**, no superioridad funcional demostrada. Free no promete horas calculadas automáticamente ni IA para programar.

### 4.2 Capacidades que apoyan el resultado

1. **Captura gratuita y revisión:** Excel/PDF → candidatos a obligación con curso, tipo y fecha → lista editable; un PDF complejo/escaneado puede requerir corrección manual.
2. **Datos de esfuerzo y prioridades:** Free pide horas previstas para actividades individuales y preferencia operativa por **curso + tipo**, con excepción por actividad; Premium permite aceptar o corregir horas sugeridas por análisis semántico.
3. **Disponibilidad realista:** ventanas habilitadas de estudio menos ocupaciones de Google Calendar seleccionado y compromisos locales; huecos vacíos no son automáticamente horas de estudio.
4. **Planificación no generativa para todos:** sesiones internas automáticas antes del deadline, tarjetas semanales, alerta de déficit y recálculo al cambiar las restricciones; control sobre sesiones fijadas.
5. **Seguimiento y personalización:** ambos planes pueden registrar horas realmente dedicadas al completar una actividad; Premium utiliza historial suficiente y comparable para sugerencias futuras. No usar la convención 3×2 h de grupos como dato real.

### 4.3 Diferenciación en tres niveles

| Afirmación | Estado | Redacción admisible |
|---|---|---|
| Problema del usuario | [E] | 7/9 entrevistados reportaron subestimación de tiempos aun cuando utilizan alguna organización |
| Valor básico de Free | [D/H] | Importar Excel/PDF sin IA generativa de estimación, declarar horas/prioridades y recibir planificación automática podría facilitar anticipación |
| Valor adicional Premium | [H] | Comprender tareas para proponer duraciones y personalizarlas con historial podría reducir esfuerzo manual y mejorar utilidad |
| Ventaja buscada de experiencia | [H] | Unificar captura, lista de duraciones, prioridades, tarjetas y replanificación en menos pasos podría reducir fricción |
| Interfaz más simple | Dirección UX [D] | Tarjetas semanales con acceso a calendario contextual; calidad de uso pendiente de prueba |
| IA de estimación | [R, solo Premium] | Sugerencias orientativas similares para entradas comparables y abstención si faltan datos; sin prometer exactitud |
| Superioridad comercial frente a Shovel | No demostrada | No afirmar exclusividad, mayor precisión, menor costo real ni mejor automatización sin evidencia |

La división Free/Premium es una **decisión comercial propuesta**, no una segmentación respaldada por compras reales.

## 5. Objetivos y criterios de éxito

### 5.1 Objetivo primario del MVP

Observar si el estudiante identifica un desajuste relevante que antes no había reconocido y **toma una decisión de planificación viable** al contrastar carga, tiempo disponible y restricciones.

### 5.2 Indicadores propuestos (sin objetivos numéricos inventados)

| Dimensión | Indicador observable | Instrumentación / método | Estado |
|---|---|---|---|
| Anticipación | Conflictos o déficits detectados antes de la fecha crítica | Marca temporal de detección respecto de plazos | Métrica propuesta [H] |
| Decisión útil | Casos en que el usuario examina un ajuste y acepta uno viable | Registro de comparación y confirmación del escenario | Métrica propuesta [H] |
| Viabilidad | Proporción de escenarios aceptados que respetan plazos, límites y horas declaradas | Verificación de restricciones; revisión de casos | Criterio de integridad, no de demanda |
| Carga de ingreso Free | Tiempo y correcciones para importar Excel/PDF y completar horas/prioridades vs. método habitual | Medición durante tareas guiadas | Métrica propuesta [H] |
| Calidad documental gratuita | Obligaciones identificadas correctamente de Excel/PDF (curso, tipo, fecha), errores y correcciones | Comparación con el documento y revisión; diferenciar PDF con texto y escaneado | Métrica funcional de Free |
| Estabilidad de estimaciones Premium | Entradas comparables producen sugerencias orientativas similares, sin exigir identidad; se permite abstención | Repetir tareas de referencia, registrar variación y contrastar con tolerancia antes de implementar | Criterio Premium; no prueba de exactitud |
| Calidad y personalización Premium | Comparar estimación manual inicial, sugerencia Premium, posible ajuste histórico y dedicación real | Comparación por curso/tipo y cantidad de observaciones comparables | Métrica exploratoria [H]; no se garantiza mejora |
| Uso de calendario | Disponibilidad obtenida con consentimiento y sin dobles ocupaciones; estado de sincronización visible | Escenarios de clases/gimnasio, lectura, revocación y actualización | Criterio funcional de integración |
| Simplicidad operativa | Acciones/correcciones necesarias hasta obtener una primera semana planificada | Registro de pasos y reubicaciones manuales | Hipótesis de diferenciación UX |
| Confianza y transparencia | Comprensión de cuándo un cálculo es provisional o no verificable | Pregunta breve de comprensión durante uso | Métrica propuesta [H] |
| Preferencia y disposición a pagar | Elección Free vs Premium, percepción del valor de sugerencia automática | Evaluación comparativa exploratoria; no inferir conversión comercial | Hipótesis comercial no validada |

**Regla para umbrales:** registrar una línea base con un experimento acotado (por ejemplo, 3 a 5 estudiantes con una semana real), documentar dispersión y entonces fijar objetivos de iteración. El tamaño sugerido es exploratorio, no representativo. **No se promete** mejora en notas, sueño, salud mental, abandono universitario ni éxito comercial.

**Indicadores adicionales para UX/continuidad (sin umbrales inventados):** proporción de nuevos usuarios que pueden llegar a su primera tarjeta desde un documento, porcentaje que completa al menos una duración/prioridad, errores de sincronización web/app, accesos sin repetir pasos de bienvenida, y decisiones tomadas a partir de alertas. Medir flujo de Calendar conectado y omitido por separado.

### 5.3 Experimento mínimo antes de inversiones mayores

Sin iniciar una nueva campaña de entrevistas: usar documentos y disponibilidad de una semana académica real con un grupo pequeño; comparar la planificación habitual contra una evaluación manual/asistida de carga y ajustes. Registrar si surgió información nueva, si se modificó una decisión y si la nueva planificación cumple las restricciones. Puede hacerse inicialmente sin producto terminado. El experimento no reemplaza pruebas de aceptación funcional ni establece cuota de mercado.

## 6. Alcance del MVP

### 6.1 Incluido — alcance incorporado v6, sujeto a aprobación

| Capacidad | Free | Premium | Por qué |
|---|:---:|:---:|---|
| Registro e inicio de sesión, Google recomendado y alternativa con correo; acceso a misma cuenta en navegador/app | Sí | Sí | Conservación segura y continuidad de curso, archivos, preferencias, prioridades y sesiones |
| Primer ingreso con recomendación de Calendar, tablero vacío y guía contextual no bloqueante | Sí | Sí | El usuario entiende cómo obtener su primera planificación sin configurar todo antes de entrar |
| Importar **Excel (.xlsx) y PDF** de cronogramas, sílabos y enunciados; extraer datos académicos estructurados cuando sean legibles y revisarlos | Sí | Sí | Evitar transcribir 5 prácticas y 2 exámenes uno por uno; función base sin IA generativa obligatoria |
| Crear y editar cursos, tareas, prácticas calificadas, exámenes, exposiciones y deadlines de grupo | Sí | Sí | Mantener contexto académico y datos completos |
| **Lista de revisión por lote tras importar:** 1 fila por obligación, curso, tipo, plazo; indicar horas de estudio requeridas o pendientes | Sí | Sí | Permitir completar 7 duraciones de 7 evaluaciones reconocidas, sin repetir la captura de fechas |
| Horas previstas de estudio/trabajo **introducidas por el estudiante** y revisables | Sí | Sí | Calcular demanda sin consumo obligatorio de IA; visible el riesgo de subestimación |
| **Sugerencia inicial de horas por análisis semántico del enunciado/documento** con incertidumbre, corrección y abstención | No | Sí | Reducción de trabajo manual como diferencia de servicio; costo IA contenido |
| **Prioridad heredable por curso + tipo** y cambio por evaluación concreta | Sí | Sí | Es un dato operativo para distribución, no solo un filtro visual |
| Lectura opcional de ocupación de Google Calendar y ventanas de estudio manuales | Sí | Sí | Evita ingresar clases/gimnasio dos veces |
| Tarjetas semanales con estados explícitos, acceso superior a calendario y navegación por semanas, botón inferior de importación, alertas y reajuste | Sí | Sí | Valor central visible desde primer ingreso, incluso sin actividades |
| Bloques de estudio propuestos automáticamente en ventanas permitidas, con preferencia de duración editable | Sí | Sí | Evitar distribución manual y respetar plazos, prioridades y descansos |
| Proyectos grupales: deadline y reserva tentativa `3×2 h` editable, sin cálculo de esfuerzo individual | Sí | Sí | Evitar falsa precisión de trabajo colectivo |
| **Registro opcional de horas reales y fecha de finalización al completar**, aun antes del deadline | Sí | Sí | Datos de experiencia y seguimiento accesibles sin pago |
| **Personalización básica de sugerencias, cuando exista historial comparable suficiente** | No | Condicionada | En el MVP Premium se muestra una sugerencia base mientras no existan datos suficientes; si el criterio de suficiencia se cumple, se muestra una sugerencia personalizada. Aprendizaje avanzado/modelos propios se reservan para posteriores versiones |
| Modo manual si Excel/PDF no puede leerse o Calendar no está conectado | Sí | Sí | Continuidad y honestidad con datos desconocidos |

**Política de importación:** la capacidad de **subir y procesar información estructurada** de archivos es gratuita. Para Excel se consideran los campos disponibles (p. ej. curso, tipo, fecha, hora); para PDF, texto/tablas reconocibles sin requerir procesamiento generativo pago. No se garantiza extracción automática completa de archivos escaneados, PDFs ilegibles o esquemas arbitrarios: mostrar el límite y permitir revisión/registro manual. Premium puede interpretar semánticamente un enunciado para sugerir **tiempo**, pero no tiene exclusividad sobre importación de archivos, fechas o tipos.

**Política de completitud:** cada obligación individual identificada en un anexo se presenta para estimar la **preparación o ejecución** correspondiente. El examen con hora fija es diferente de la preparación académica que debe programarse. Una fila sin horas confirmadas permanece pendiente; no se programa como cero ni se marca la semana como controlada si la carga relevante es desconocida.

### 6.2 Fuera del MVP

- Escritura o sincronización bidireccional de sesiones en Google Calendar; el calendario interno conserva los bloques propios.
- Integraciones LMS y calendarios externos distintos de Google Calendar.
- IA generativa necesaria para el **núcleo gratuito**: extracción estructural, prioridades, cálculo de déficit, planificación y recálculo deben funcionar sin ella.
- OCR universal y garantía de procesar cualquier PDF escaneado o archivo con datos ambiguos; habrá manejo de errores y alternativa manual.
- Entrenamiento de modelos propios y personalización avanzada; el **ajuste básico condicionado** al historial suficiente sí forma parte del comportamiento Premium propuesto para el MVP, con alternativa de sugerencia base cuando todavía no haya datos.
- Temporizador Pomodoro, gamificación, chats, cuentas de compañeros, gestión grupal integral, cálculo de carga individual del proyecto grupal.
- Planificación autónoma de toda la vida/semestre y modificación de deadlines, sesiones fijadas o compromisos externos.
- No se exige sincronización sin conexión en tiempo real ni edición offline completa en MVP; las fallas y estados pendientes deben indicarse.
- Promesas de mejora de notas, salud, sueño o éxito comercial; plan gratuito «cero esfuerzo manual»; publicidad o precio concreto sin decisión.

### 6.3 Evoluciones posteriores posibles

Mayor cobertura de formatos/escaneos, integraciones LMS y calendarios adicionales, sincronización autorizada de sesiones, mejores estimaciones de preparación y **aprendizaje personalizado avanzado** por curso/tema, límites de consumo Premium, sistema de cobro y modelos comerciales probados. El lanzamiento comercial de pagos requiere resolver política de cuotas, precio, acceso, privacidad y degradación de Premium a Free antes de implementar el cobro.

### 6.4 Regla de separación de planes [D]

- **Free:** sí requiere una **cuenta de acceso**, pero no suscripción para importar Excel/PDF, revisar/editar obligaciones, introducir duraciones, configurar prioridades, conectar Google Calendar de solo lectura, obtener sesiones por reglas, alertas, reajustes ni registrar horas reales.
- **Premium:** añade análisis semántico orientado a **sugerir duración** y personalización automática del esfuerzo con historial suficiente. Las demás capacidades centrales permanecen accesibles en Free.
- No se garantiza que las sugerencias estén disponibles para cualquier documento ni que sean correctas; la ausencia de dato tiene salida manual en ambos planes.
- El sistema debe dejar claro el origen de horas (declaradas, sugeridas, corregidas, personalizadas), sin bloquear el plan si una sugerencia Premium no está disponible.
- Precios, cuotas, disponibilidad de Premium, política de cambio de plan, retención y límites de uso son **decisiones pendientes**; no se inventan cifras.

## 7. Requisitos funcionales

**Prioridades:** **P0** indispensable para comprobar la hipótesis de valor e integridad; **P1** necesario para cumplir la experiencia de baja fricción/captura de evidencia con alcance controlado. Todo requisito es una **propuesta** de MVP hasta aprobación. Los flujos pueden prototiparse sin que ello constituya autorización de desarrollo. Los criterios de aceptación describen resultados observables, no tecnología.

### RF-01 — Contexto académico básico [P0]

- **Descripción y necesidad:** el estudiante puede identificar sus cursos y el periodo al que pertenecen las obligaciones para interpretar correctamente la carga.
- **Comportamiento esperado:** puede crear/editar un contexto de periodo y asociar actividades a un curso, incluso sin incluir toda la información curricular.
- **Criterios de aceptación:** (1) dado un curso identificado, una actividad importada o manual puede asociarse a él; (2) al cambiar el curso, el cálculo no duplica la actividad; (3) si el curso es desconocido, se marca «sin asignar» y no se inventa.
- **Dependencias:** ninguna. **Supuesto:** contexto individual, sin importación obligatoria desde la universidad.

### RF-02 — Importación gratuita de documentos Excel y PDF [P0]
- **Necesidad:** importar obligaciones académicas sin transcribir filas de un anexo o fechas de un sílabo.
- **Comportamiento:** en Free y Premium admite **Excel (.xlsx) y PDF** de cronogramas/anexos de evaluaciones, sílabos y enunciados. Obtiene información académica **estructurada y reconocible** (curso, tipo, título, fecha/hora) sin exigir IA generativa. Presenta vista de revisión con procedencia y permite registro manual si falla el reconocimiento. La interpretación semántica adicional del enunciado para **estimar horas** es Premium (RF-06), no condición para subir archivos.
- **Aceptación:** (1) importar un Excel de cinco PC y dos exámenes genera hasta siete propuestas diferenciadas cuando sus filas son legibles; (2) un PDF textual con curso/tipo/fecha identificables ofrece propuestas revisables en ambos planes; (3) encabezados, hojas o fechas ambiguas se marcan para revisión y no se completan mediante invención; (4) escaneos/archivos no compatibles producen aviso y alternativa manual; (5) ninguna actividad se activa sin confirmación (RF-04); (6) subir/extraer datos reconocibles no solicita suscripción; (7) actualizar archivo no sobrescribe ediciones silenciosamente.
- **Dependencias:** RF-01. **Incertidumbre:** formatos soportados más allá de `.xlsx` y PDF, esquemas de Excel, límites y calidad de PDF escaneados, a precisar con muestras antes de implementación.

### RF-03 — Detección y clasificación de obligaciones [P0]
- **Necesidad:** distinguir compromisos, preparación y deadlines a partir de Excel/PDF.
- **Comportamiento:** detectar en ambos planes tareas, informes, **prácticas calificadas**, exámenes parciales/finales, exposiciones, proyectos individuales y entregas de proyectos grupales; proponer curso, tipo, título, fecha/hora, origen y campos ausentes. **El examen o práctica con horario fijo es un compromiso distinto de las horas necesarias para prepararse**; la preparación debe solicitarse como duración de estudio. Un proyecto grupal crea deadline y reservas tentativas, sin esfuerzo individual inferido.
- **Aceptación:** (1) cinco PC y dos exámenes aparecen como siete registros individuales identificables, sin fusionarse por tipo; (2) cada registro muestra curso/tipo/fecha o «pendiente de confirmar»; (3) la duración del evento de examen no se transforma automáticamente en horas de preparación; (4) proyectos grupales se distinguen de individuales; (5) si faltan fechas, se solicita confirmación; (6) extracción gratuita no sugiere horas con IA ni impone Premium para identificar tipos.
- **Dependencias:** RF-02 o RF-05 según origen. **Incertidumbre:** heterogeneidad de tipos y nombres de evaluación.

**Regla adicional RF-03 [v5]:** cada candidato permite diferenciar título, tipo y fecha del curso opcional; examen/PC solo bloquea horario cuando se confirma su intervalo de inicio/fin. Si solo consta la fecha, no se inventa ocupación; ver §10.5.2.

### RF-04 — Revisión y confirmación de datos importados [P0]
- **Necesidad:** controlar errores antes de calcular la carga y completar duraciones en una sola lista.
- **Comportamiento:** presenta una lista de **todas** las obligaciones detectadas por archivo, con curso, tipo, deadline, hora fija cuando exista, estado de revisión, duración de estudio pendiente e indicador de prioridad. Permite corregir, descartar, confirmar y continuar al registro de horas (RF-23); no exige pagar para confirmar o corregir.
- **Aceptación:** (1) un Excel con siete evaluaciones identificadas muestra siete filas editables; (2) el estudiante corrige curso, tipo, fecha y nombre por fila; (3) datos no confirmados no alteran carga ni generan sesiones; (4) se conservan correcciones al actualizar documento; (5) falsos positivos pueden descartarse; (6) una entrega grupal requiere tipo y deadline confirmados antes de crear reservas.
- **Dependencias:** RF-03 cuando es importación. **Incertidumbre:** agrupación visual y acciones por lote; diseño posterior.

**Regla adicional RF-04 [v5]:** conservar filas importadas como **borradores persistentes** hasta confirmación parcial o total, con estados por fila `borrador`, `confirmado_incompleto` y `listo_para_programar`; mínimos y efectos de cada uno en §10.5.2.

### RF-05 — Alta y edición manual de actividades [P0]
- **Necesidad:** incorporar actividades no presentes o no legibles en Excel/PDF.
- **Comportamiento:** el estudiante puede crear/editar tarea, informe, práctica, examen, exposición o deadline grupal con curso, tipo, fecha y restricciones; por defecto toda actividad nueva puede heredar la prioridad de curso + tipo (RF-22). Permite declarar duración estimada de estudio individual; no pide horas individuales de proyecto grupal.
- **Aceptación:** (1) alta manual utilizable en Free; (2) una actividad nueva hereda la prioridad configurada y puede sobrescribirse; (3) cambio de fecha u horas confirmadas recalcula carga; (4) duración desconocida no equivale a cero; (5) evento fijo y preparación no se duplican; (6) fechas y horarios académicos confirmados pueden actualizarse **por acción explícita del estudiante** o tras confirmar una nueva versión de la fuente; el planificador no los mueve automáticamente para ganar tiempo y nunca escribe en Google Calendar; (7) la edición conserva fecha anterior y nueva para trazabilidad (RF-28).
- **Dependencias:** RF-01. **Incertidumbre:** atributos opcionales por tipo.

### RF-06 — Duración inicial: manual Free y sugerencia asistida Premium [P0]
- **Necesidad:** contar con horas previstas para planificar, manteniendo un servicio gratuito sin IA generativa obligatoria.
- **Comportamiento Free:** el estudiante **introduce personalmente** la duración aproximada de estudio/trabajo por actividad individual en la lista importada (RF-23) o al crearla. La app no genera una duración por IA generativa. Si deja la duración en blanco, la actividad conserva estado pendiente y la evaluación de carga es parcial.
- **Comportamiento Premium:** opcionalmente el estudiante solicita analizar el contenido del enunciado/documento para recibir **duración o rango orientativo** según curso, tema, tipo, instrucciones, volumen y complejidad reconocible; puede aceptar, modificar o rechazar. Procedimiento/prompt especializado y versionado se definirá en arquitectura. Estimaciones de entradas comparables deberían ser razonablemente cercanas, no idénticas. Si faltan datos relevantes, el sistema se abstiene o pide aclaración; fecha límite, disponibilidad y prioridad **no modifican el esfuerzo intrínseco**.
- **Excepción grupal:** entrega grupal = fecha de deadline y reserva tentativa predeterminada **tres sesiones de dos horas** en días próximos consecutivos cuando quepan, editable/desactivable. No es estimación individual ni horas reales; tampoco cálculo Premium del grupo.
- **Aceptación:** (1) en Free se puede ingresar, cambiar o dejar pendiente cada duración sin llamada generativa obligatoria; (2) en Premium la sugerencia se distingue de horas ingresadas y muestra incertidumbre/procedencia; (3) ante información insuficiente no se inventan horas; (4) variar solo fecha, prioridad o disponibilidad no cambia arbitrariamente la duración sugerida para el mismo enunciado; (5) repetir entradas Premium comparables produce rangos razonablemente similares dentro de tolerancia a definir por casos; (6) proyectos grupales muestran «reserva tentativa 3×2 h»; (7) para exámenes las horas introducidas/sugeridas son **de preparación**, no su tiempo de realización.
- **Dependencias:** RF-03 o RF-05; RF-24 para habilitar sugerencia Premium. **Incertidumbre:** mínimos de datos, calidad de PDF, límites/cuotas, tolerancia, política para no abusar de la IA y pruebas de referencia.

### RF-07 — Confirmación, corrección y seguimiento de horas [P0]
- **Necesidad:** fijar el esfuerzo operativo que usará el calendario sin confundirlo con el tiempo real.
- **Comportamiento:** en Free la duración operativa parte de horas **declaradas por estudiante**; en Premium puede partir de una sugerencia que debe aceptarse/corregirse. Conservar origen y cambios de estimación, horas ya efectivamente dedicadas, restante informado y, solo en Premium con historial suficiente, una sugerencia personalizada distinta de la inicial. Un examen fijo y su preparación tienen horas/estados diferentes.
- **Aceptación:** (1) corregir horas cambia demanda, sesiones y alertas; (2) la duración desconocida se muestra pendiente y no como 0; (3) el usuario sabe si las horas son manuales, IA Premium o ajuste histórico; (4) la reserva grupal editable nunca se etiqueta como trabajo individual medido; (5) rechazar sugerencia Premium mantiene planificación manual viable; (6) no se requiere suscripción para editar duración declarada o consultar comparación con horas reales.
- **Dependencias:** RF-06 para el flujo base. **Nota:** RF-15 provee observaciones posteriores y opcionales para Premium, pero no es prerrequisito de RF-07. **Incertidumbre:** cómo visualizar rangos y fuentes.

### RF-08 — Ventanas de estudio y disponibilidad efectiva [P0]
- **Necesidad:** conocer capacidad real sin duplicar clases o gimnasio que ya aparecen en Google Calendar.
- **Comportamiento:** tras el ingreso puede sugerirse la conexión de Google Calendar, pero siempre se solicita definir ventanas habituales en que el estudiante **acepta estudiar** y sus excepciones (descansos, desplazamientos, actividades). Si se concedió autorización separada para Calendar se descuentan intervalos ocupados. La conexión puede posponerse y no interrumpe el acceso a las tarjetas.
- **Aceptación:** (1) una persona que omite Calendar entra al tablero y puede registrar ocupaciones manualmente; (2) eventos ocupados se descuentan, sin contar intervalos solapados dos veces; (3) no se considera estudiable cualquier hora no ocupada: debe pertenecer a una ventana autorizada; (4) se indica fuente y última actualización de los bloqueos; (5) horario fuera de ventana no se usa sin autorización; (6) horas faltantes se muestran como desconocidas, no libres; (7) una ventana elegida en web se conserva al abrir la misma cuenta en app.
- **Dependencias:** RF-25 (cuenta y preferencias). **Componente opcional conectado:** RF-20 añade ocupaciones externas; no es dependencia del modo manual.

### RF-09 — Restricciones y prioridades de actividades [P0]
- **Necesidad:** propuestas de tiempo compatibles con fechas **vigentes**, restricciones y cambios académicos reales.
- **Comportamiento:** registrar plazo, inicio mínimo, duración pendiente, carácter fijo/flexible, posibilidad de fragmentar y dependencias conocidas. Exámenes y clases con horario confirmado ocupan un intervalo **hasta que se confirme un cambio de fecha/hora**. El deadline grupal se utiliza como límite vigente, mientras sus reservas tentativas son flexibles salvo fijación expresa. El estudiante puede actualizar fechas oficiales cuando su fuente académica cambie; una prioridad no puede cambiar fechas. Véase RF-28. La prioridad se define aparte en RF-22.
- **Aceptación:** (1) el motor no cambia por sí mismo fechas/hora de eventos académicos confirmados, pero el estudiante puede **actualizar y confirmar** sus nuevos valores si fueron reprogramados; (2) no se programa después del **deadline vigente confirmado** ni antes de inicio mínimo; (3) lo indivisible no se fragmenta; (4) una dependencia declarada se respeta; (5) valor desconocido no se considera permiso para fragmentar o adelantar sin validación; (6) preferencias flexibles nunca se confunden con limitaciones rígidas.
- **Dependencias:** RF-03 o RF-05. **Incertidumbre:** criterios predeterminados de divisibilidad y dependencias cuando el PDF calla.

**Regla adicional RF-09 [v5]:** distinguir campos desconocidos de permisos explícitos; si divisibilidad/inicio permitido no han sido confirmados, no interpretar omisión como autorización para programar. Ver §10.5.3.

### RF-10 — Evaluación de demanda y capacidad [P0]
- **Necesidad:** detectar sobrecarga antes del vencimiento sin presentar resultados imposibles como viables.
- **Comportamiento:** comparar demanda de **trabajo individual estimado pendiente + reservas grupales tentativas diferenciadas** con ventanas disponibles, fechas y restricciones; excluir compromisos fijos de capacidad y evitar duplicados con reuniones externas ya reflejadas en Calendar. Reportar carga confirmada separada de carga provisional.
- **Aceptación:** (1) si carga conocida supera capacidad compatible con plazos, mostrar déficit; (2) los bloques de evento fijo no se cuentan como estudio adicional; (3) sesiones grupales reservadas se etiquetan tentativas; (4) grupos y reuniones coincidentes no se contabilizan dos veces cuando el usuario marca equivalencia; (5) falta de información produce estado parcial; (6) suficiencia de horas semanales no implica necesariamente horarios viables; (7) sesiones programadas fuera de semana de deadline se cuentan en **semana de ejecución**, y deadline permanece visible en semana de entrega.
- **Dependencias:** RF-04, RF-07, RF-08, RF-09. **Supuesto:** reglas §10.

**Regla adicional RF-10 [v5]:** horizonte desde hoy hasta el último deadline del periodo confirmado y tarjeta semanal navegable; un déficit requiere explicar su relación con las ventanas compatibles **hasta cada plazo**, no solo una suma estática. Ver §10.5.1.

### RF-11 — Alertas y explicación de viabilidad [P0]
- **Necesidad:** advertir oportunamente y orientar decisiones.
- **Comportamiento:** mostrar semana con plazo próximo, trabajo estimado pendiente, horas disponibles, déficit, obligaciones responsables y estado de certeza. Los títulos de grupo conservan el deadline aunque la reserva se haya distribuido en otra semana.
- **Aceptación:** (1) tarjeta semanal refleja «viable según datos», «déficit previsto», «restricciones en conflicto» o «información insuficiente»; (2) advertencia indica carga confirmada versus tentativas; (3) explica al menos factor afectado; (4) no garantiza cumplimiento ni notas; (5) no comunica «sin sobrecarga» cuando falta esfuerzo de tareas importantes.
- **Dependencias:** RF-10. **Incertidumbre:** vocabulario exacto de estados y jerarquía visual.

### RF-12 — Propuesta y comparación de sesiones concretas [P0]
- **Necesidad:** convertir horas pendientes en una distribución viable sin repartir manualmente cada bloque.
- **Comportamiento:** distribuir automáticamente sesiones antes de cada deadline dentro de ventanas autorizadas, considerando prioridad efectiva, desempate por fecha más próxima, duración, divisibilidad, dependencias y bloqueos. Como criterio inicial **editable** de producto se sugiere una sesión de 60 min, mínimo sugerido de 30 min para fragmentos automáticos y máximo sugerido de 120 min; no son umbrales clínicos ni datos observados. Una actividad indivisible exige hueco continuo suficiente; las reservas grupales tentativas `3×2 h` siguen su regla propia. Se generan bloques solamente con duración y disponibilidad suficientes. Si caben varias opciones, la vista permite evaluar ajustes sin aplicar un cambio imposible.
- **Aceptación:** (1) con horas, plazo y ventanas confirmados se proponen sesiones fechadas; (2) no se superponen con bloques ocupados ni se programan después del plazo; (3) dos actividades con igual prioridad efectiva y ventanas en disputa se programan considerando primero el deadline más cercano, sin violar reglas rígidas; (4) un resto menor que el mínimo sugerido se combina con otro bloque permitido o se señala pendiente, en lugar de desaparecer; el usuario puede ajustar preferencias; (5) una tarea indivisible no se fragmenta; (6) con capacidad insuficiente se indican actividades/horas no ubicadas; (7) los escenarios se distinguen del plan activo.
- **Dependencias:** RF-07, RF-08, RF-09, RF-10, RF-22. **A arquitectura:** algoritmo que satisfaga estas reglas, no seleccionar uno en el PRD.

### RF-13 — Control, notificación y reversión de ajustes [P0]
- **Necesidad:** automatizar sin arrebatar control al estudiante.
- **Comportamiento:** generación inicial de sesiones de estudio y su recalculo interno flexibles puede aplicarse automáticamente dentro de la app; el sistema muestra cambios realizados, permite fijar sesiones y deshacer la última reorganización. **No** escribe en Google Calendar ni cambia por decisión autónoma sesiones fijadas, fechas oficiales o compromisos fijos. **Sí admite** actualizar explícitamente fechas y horarios académicos cuya programación real haya cambiado (RF-28), lo que dispara un recálculo sin editar eventos de Google. El producto puede **proponer** flexibilizar preferencias editables (por ejemplo, ampliar voluntariamente una ventana de estudio o cambiar una duración preferida), pero no puede aplicarlo sin consentimiento. Este flujo de reorganización de sesiones no modifica eventos de Google ni fechas académicas; las **actualizaciones reales de fechas oficiales** se realizan en RF-28 con confirmación y trazabilidad.
- **Aceptación:** (1) cambios internos flexibles se reflejan y se puede ver qué se movió; (2) sesiones fijadas permanecen; (3) un cambio inviable queda como conflicto y no modifica evento externo; (4) hay opción de solicitar reversión de la última distribución; antes de aplicarla se verifican otra vez las ocupaciones y restricciones vigentes, y si colisiona se ofrece una simulación marcada como inviable, sin restaurarla como vigente; (5) simulaciones de opciones no autorizadas no se aplican; (6) se diferencian autoajuste seguro y decisión que exige confirmación.
- **Interacción individual o por actividad:** «Editar sesión» permite cambiar la ubicación de un bloque concreto; una reubicación manual confirmada lo deja **fijado** por defecto hasta que el usuario lo libere. «Reorganizar actividad» recalcula exclusivamente las sesiones **flexibles** vinculadas a esa actividad y muestra el resultado; no mueve sesiones fijadas. No se impone arrastrar y soltar como mecanismo visual. **Dependencias:** RF-12. La automatización ordinaria se limita a sesiones internas no fijadas; una fecha académica confirmada solo se cambia mediante el flujo explícito RF-28, no al arrastrar o reubicar sesiones.

**Regla adicional RF-13 [v5]:** mover una sesión concreta o todas las sesiones flexibles de una actividad son acciones distintas; los cambios manuales confirmados quedan fijados inicialmente. Deshacer siempre revalida ocupaciones nuevas. Ver §10.5.4.

### RF-14 — Imprevistos y recálculo automático [P0]
- **Necesidad:** que el calendario de estudio permanezca útil tras cambios.
- **Comportamiento:** cuando el estudiante confirma una fecha/hora académica reprogramada (RF-28), una actualización del PDF, una prioridad, tiempo restante, compromiso local o cambio de bloques ocupados de Google Calendar, reevalúa carga y reorganiza automáticamente sesiones internas flexibles. Indica estado de actualización/fallo y diferencias; conserva bloqueos manuales y sesiones fijadas.
- **Aceptación:** (1) nuevo evento externo ocupado reduce disponibilidad y mueve sesiones flexibles afectadas si existen alternativas; (2) si no hay alternativas, se muestra déficit/conflicto sin ocupar horarios inexistentes; (3) no modifica eventos de Google ni sesiones fijadas; (4) una fecha adelantada **o postergada confirmada** desencadena nuevo análisis de sesiones, tarjetas y déficit, conservando el registro de cambio; (5) una cuenta que **nunca conectó** Calendar sigue con su modo manual completo, sin error de sincronización; una fuente **previamente conectada** que falla o está desactualizada muestra advertencia de ocupación incompleta; (6) la reversión pasa nuevamente por comprobación de restricciones actuales (RF-13).
- **Dependencias:** RF-08, RF-09, RF-10, RF-13, RF-20 cuando exista conexión. **Incertidumbre:** cadencia de sincronización se define operativamente sin garantizar tiempo real.

### RF-15 — Registro gratuito de dedicación real y personalización Premium [P1]
- **Necesidad:** registrar tiempo efectivo cuando el estudiante termina para aprender sin imponer temporizador ni esperar al vencimiento.
- **Comportamiento común:** al **marcar como completada** una actividad individual, antes, durante o después del deadline, solicitar **opcionalmente** fecha de finalización real y horas efectivas totales. Permitir registrarlas/corregirlas también al actualizar el progreso; preservar el historial en ambos planes. No deducir horas reales de la fecha de vencimiento ni de los bloques agendados.
- **Comportamiento Premium:** cuando haya historial propio **suficiente, comparable y confiable** de curso/tipo u otra similitud fundamentada, ofrecer sugerencias futuras personalizadas y revisables. Con historial insuficiente no atribuir aprendizaje: se puede continuar con duración manual o sugerencia inicial Premium general. Las reservas tentativas `3×2 h` de grupo no alimentan el modelo como esfuerzo individual real.
- **Aceptación:** (1) Free puede completar la actividad y declarar horas reales sin pagar; (2) finalizar dos días antes del deadline habilita la misma acción; (3) registrar datos es opcional; (4) se distinguen horas manualmente estimadas, sugeridas Premium y reales; (5) un caso aislado no modifica futuras estimaciones automáticamente; (6) Premium diferencia estimación inicial de personalizada; (7) al bajar de plan no se destruye el historial ni se altera la duración operativa previa, sujeto a la política de conservación acordada; (8) grupo tentativo no se trata como tiempo real.
- **Dependencias:** RF-05, RF-07 y RF-24 (exclusivamente para habilitar personalización Premium). **Pendiente antes de implementar Premium:** criterios de comparabilidad/suficiencia, mecanismo de ajuste, tratamiento de datos y continuidad al cambiar de plan; arquitectura define el método.

**Regla adicional RF-15 [v5]:** el progreso y la finalización se gestionan por preparación/trabajo y por evento evaluativo fijo separadamente. Horas reales acumuladas se pueden corregir; no se marca automáticamente «completado» por llegar a cero horas restantes ni por vencer el plazo. Ver §10.5.8.

### RF-16 — Duplicados, cambios y procedencia de registros [P0]

- **Descripción y necesidad:** no inflar demanda al cargar múltiples anexos o al actualizar un documento.
- **Comportamiento esperado:** señalar posibles duplicados para confirmación, mantener el origen documental/manual de cada obligación, conservar versiones anteriores de fechas actualizadas y evitar sobrescritura silenciosa.
- **Criterios de aceptación:** (1) una actividad potencialmente repetida se somete a revisión; (2) el usuario puede confirmar que son actividades distintas; (3) una nueva versión con otra fecha **propone una modificación del mismo registro** para revisión y confirmación; (4) no se cuentan por duplicado registros confirmados como la misma obligación; (5) después de confirmar el cambio, la antigua fecha queda como antecedente y solo la fecha vigente alimenta el plan; (6) ante versiones contradictorias, no se sustituye silenciosamente el dato confirmado.
- **Dependencias:** RF-02/04/05/10. **Incertidumbre:** criterio de similitud, sin prometer identificación perfecta.

### RF-17 — Información incompleta, errores y sincronización [P0]
- **Necesidad:** evitar interpretaciones falsas cuando faltan datos.
- **Comportamiento:** distinguir documentos ilegibles, estimación ausente, calendario sin permiso, bloqueos externos desactualizados, imposibilidad por plazo y escenarios solo parcialmente evaluables.
- **Aceptación:** (1) desconocido no equivale a cero; (2) no se afirma «controlada» una semana con demanda relevante no cuantificada; (3) al perder conexión se muestra fecha/estado de última consulta y cómo actualizar o declarar compromisos manualmente; (4) error no elimina datos ya confirmados; (5) fallo de estimación no se resuelve inventando horas; (6) conflictos imposibles identifican la restricción concreta.
- **Dependencias:** RF-02, RF-06, RF-08, RF-10. **Nota:** disponibilidad leída previamente no se presenta como actual tras fallo de sincronización.

### RF-18 — Privacidad, consentimiento y control de datos [P0]
- **Necesidad:** administrar documentos y compromisos con autorización y mínima exposición.
- **Comportamiento:** explicar finalidad de carga **Excel/PDF**, de acceso a disponibilidad Google y del uso del historial para personalización Premium; conexión voluntaria y revocable; lectura de bloques ocupados por defecto, sin títulos privados ni escritura externa; permitir retirar documentos y gestionar registros asociados.
- **Aceptación:** (1) la integración no se activa sin consentimiento; (2) desconectar impide futuras consultas y se explica efecto en el plan; (3) información no pública por defecto; (4) borrar documento no elimina silenciosamente actividades no relacionadas; (5) se indica tratamiento y retención según política aprobada antes de piloto; (6) no se publica nombre de eventos personales en la UI sin permiso para detalles.
- **Dependencias:** RF-02, RF-20 (si se conecta), RF-24 (para personalización Premium). **Pendiente:** política de retención/conservación y requisitos de cumplimiento para uso real.

### RF-19 — Tablero principal de tarjetas semanales y estados [P0]
- **Necesidad:** identificar obligaciones y riesgo desde una pantalla simple, incluso antes de importar la primera actividad.
- **Comportamiento:** usuario autenticado abre directamente un tablero con **acceso al calendario en la zona superior**, filtros/navegación por semana debajo y lista principal de tarjetas semanales. Un acceso destacado **«Importar actividad — PDF/Excel»** aparece en la zona inferior del estado vacío y existe una acción para añadir actividades también con datos. Antes de importar, las tarjetas no simulan carga ni declaran semanas «controladas»: hay un estado vacío y un recorrido orientativo para comenzar. Cada tarjeta poblada agrupa por semana de deadline, muestra curso/tipo/fecha, horas conocidas y estado de carga y lleva al calendario interno al seleccionar actividad. La distribución de sesiones se refleja en semanas de ejecución, sin sumar dos veces vencimientos.
- **Estados que deben diferenciarse:** `sin_actividades`, `pendiente_de_datos` (faltan horas o ventanas), `viable_segun_datos`, `sobrecarga_prevista` (déficit), `conflicto_sin_solucion` (inviable por restricciones aun si horas agregadas parecen suficientes), `fuente_desactualizada` (Calendar/sincronización). `fuente_desactualizada` puede coexistir con otro estado, nunca equivaler a viabilidad confirmada.
- **Aceptación:** (1) primera sesión tras registro llega al tablero vacío con acceso superior al calendario, navegación semanal y CTA inferior de importación; (2) el tablero vacío no dice «controlada» ni atribuye `0 h` confirmadas; (3) tras confirmar una evaluación importada, aparece en la tarjeta de su semana de plazo; (4) actividad seleccionada enfoca calendario y sesiones correspondientes; (5) sin duraciones se informa incompletitud; (6) déficit real presenta horas no ubicadas; (7) días/semanas y estados son utilizables en navegador y app sin diseño visual idéntico obligado.
- **Dependencias:** RF-25, RF-05, RF-11. **Complemento de primer acceso:** RF-26 utiliza este tablero y no es prerrequisito de su existencia. El diseño visual se cierra en Figma.

**Regla adicional RF-19 [v5]:** una semana puede mostrar solo sesiones adelantadas aunque ningún deadline venza allí; esa tarjeta no es «sin actividades». Ver §10.5.1.

### RF-20 — Conexión voluntaria de Google Calendar [P0]
- **Necesidad:** utilizar compromisos ya anotados como clases, gimnasio y reuniones sin volver a ingresarlos.
- **Comportamiento:** después del registro o desde ajustes se **recomienda** conectar Google Calendar, con opción clara de omitir. El inicio de sesión con Google autentica al usuario, **pero no implica autorización de Calendar**; la consulta de ocupación requiere consentimiento específico adicional. El usuario selecciona calendarios y la aplicación consulta bloques ocupado/libre; se muestran sombreados en el calendario interno sin requerir nombres privados. No escribe en Google ni modifica compromisos externos. Debe permitir desconectar.
- **Aceptación:** (1) el usuario puede registrarse con Google y rechazar Calendar, permaneciendo en el tablero; (2) ingresar con correo también permite conectar Calendar posteriormente; (3) si se concede acceso, un intervalo ocupado impide programar allí; (4) no se leen títulos ni descripciones por defecto; (5) solo calendarios autorizados/seleccionados se consideran; (6) calendarios coincidentes no descuentan doble; (7) se indica última actualización, fallo o revocación; (8) no se intenta escribir eventos externos; (9) al entrar desde otro cliente se refleja el estado autorizado conocido, sin pedir permisos sin contexto.
- **Dependencias:** RF-25 (cuenta), RF-08 (ventanas). **Arquitectura** define mecanismos de autorización, permisos mínimos y verificación de sesiones. Sitios oficiales: https://developers.google.com/identity/openid-connect/openid-connect y https://developers.google.com/workspace/calendar/api/auth.

**Regla adicional RF-20 [v5]:** conexión nunca realizada = modo manual válido; conexión antes vigente pero caída/revocada = fuente desactualizada o permisos revocados. La app no confunde ambas situaciones. Ver §10.5.6.

### RF-21 — Autogeneración y reubicación de sesiones internas [P0]
- **Necesidad:** generar y mantener un calendario de estudio sin programación manual repetitiva.
- **Comportamiento:** programar sesiones internas dentro de ventanas compatibles, antes del plazo, priorizando por niveles Alta > Media > Baja y, si la prioridad efectiva es igual, por vencimiento más cercano; sin cambiar eventos fijos ni sesiones fijadas. La fragmentación sigue RF-12: preferencia inicial editable de 60 min, mínimo sugerido 30 min y máximo sugerido 120 min. Recalcular las sesiones flexibles cuando cambian actividades, prioridades, horas o disponibilidad. Mantener visibles los movimientos y opción de deshacer.
- **Aceptación:** (1) las sesiones se generan con horas confirmadas y ventanas aptas; (2) misma información y reglas dan distribución estable y reproducible; (3) ante dos evaluaciones de la misma prioridad el plazo más temprano recibe preferencia de ubicación cuando compiten por la misma ventana; (4) el siguiente desempate exacto utiliza criterio estable y documentado, sin alterar deadlines; (5) no hay bloques en horarios ocupados/no autorizados; (6) la demanda que no cabe permanece visible; (7) sesión fijada no se mueve; (8) sincronización web/app refleja la misma planificación confirmada; (9) reservas grupales tentativas siguen la regla 3×2 h y no son horas individuales medidas.
- **Dependencias:** RF-07, RF-08, RF-09, RF-10, RF-12, RF-22. **Continuidad multiplataforma:** RF-27 propaga el resultado, no es requisito previo del cálculo.

### RF-22 — Prioridad efectiva por curso, tipo y evaluación [P0]
- **Necesidad:** usar la prioridad como dato operativo para programar sesiones, no como simple orden visual.
- **Comportamiento:** al revisar el lote importado o editar un curso, el estudiante puede indicar **Alta, Media o Baja** como prioridad base de la combinación `curso + tipo` (p. ej., Cálculo + examen = Alta). Una actividad particular puede heredar o sobrescribirla. Sin configuración se muestra `sin_prioridad_declarada`; no se inventan preferencias. Los plazos, eventos fijos y dependencias continúan siendo restricciones. Entre actividades con **igual prioridad efectiva**, se atiende primero el **deadline más próximo** al asignar espacios en disputa; si también coincide el plazo, el sistema aplica un criterio secundario estable documentado que no altera restricciones.
- **Aceptación:** (1) dos PC del mismo curso/tipo heredan el mismo nivel; (2) la PC con fecha más cercana se considera antes cuando la prioridad empata; (3) sobrescribir una PC no cambia las demás; (4) cambiar la base solo afecta actividades que todavía heredan; (5) cambiar prioridad produce recálculo de sesiones flexibles y afecta la programación, no solo su posición en la lista; (6) Alta no adelanta ni posterga una fecha fija; (7) con prioridad no declarada, la planificación usa plazos y restricciones de manera identificada, sin afirmar preferencia del estudiante; (8) ponderación, dificultad e importancia se conservan como información opcional, sin pesos automáticos arbitrarios.
- **Dependencias:** RF-01, RF-03 o RF-05. **Consumidor posterior:** RF-21 utiliza la prioridad para generar sesiones.

### RF-23 — Completar duraciones y prioridades en lote tras importar [P0]
- **Necesidad:** que un anexo de evaluaciones se convierta en un plan con pocos pasos, sin tener que abrir siete formularios independientes.
- **Comportamiento:** después de importar y revisar un Excel/PDF, la app muestra **una lista de todas las actividades detectadas** con curso, tipo, fecha/hora, duración de estudio/trabajo prevista y prioridad efectiva editable. Free presenta campos de horas para ingresar; Premium puede ofrecer botón de sugerencia para actividades con descripción suficiente, sin imponerlo. La lista muestra actividades sin horas y permite confirmación parcial, evitando cálculo falsamente completo.
- **Aceptación:** (1) anexo con 5 PC y 2 exámenes reconocidos → 7 filas editables; (2) el usuario registra siete duraciones de preparación cuando corresponda sin reescribir los siete cursos/fechas; (3) una duración faltante queda «pendiente», no cero; (4) cada examen tiene horas de **estudio**, separadas de su bloque de evaluación; (5) prioridad heredada por curso/tipo visible y editable por fila; (6) la primera programación automática se inicia con las duraciones confirmadas; lo no cuantificado permanece señalado como parcial; (7) estos flujos funcionan íntegramente en Free salvo el botón Premium de sugerencia.
- **Dependencias:** RF-03, RF-04, RF-06, RF-07, RF-22. **Incertidumbre:** diseño de tabla/lista multiplataforma, sin imponer aspecto visual.

**Regla adicional RF-23 [v5]:** permitir guardar como borrador las filas incompletas, y confirmar las que cumplan mínimos sin perder las restantes. Separar obligación confirmada sin horas (visible en deadline, no programable) de obligación con horas/restricciones suficientes. Ver §10.5.2.

### RF-24 — Acceso funcional por plan Free y Premium [P0]
- **Necesidad:** controlar gasto variable de IA sin impedir que el usuario gratuito obtenga el resultado central.
- **Comportamiento:** mantener **importación y extracción estructural Excel/PDF, planificación, alertas, prioridad, Google Calendar y registro de tiempo real** en ambos planes; restringir a Premium la sugerencia de horas mediante análisis semántico generativo y la personalización automática. El acceso a Premium no convierte la IA en requisito del flujo básico; ante denegación o cuota se puede continuar con horas manuales. Mostrar qué capacidad requiere Premium sin ocultar registros previamente confirmados.
- **Aceptación:** (1) Free importa un Excel/PDF y obtiene plan si completa datos sin llamadas generativas obligatorias; (2) Free no dispara silenciosamente tareas pagadas de IA por extracción o recálculo; (3) solicitar sugerencia Premium sin acceso no ejecuta análisis y ofrece entrada manual; (4) Premium puede aceptar/rechazar sugerencia y usar idéntico motor de sesiones; (5) downgrade no elimina obligaciones, horas reales ni sesiones ya confirmadas; (6) límites de uso/consentimiento se informan antes de consumir cuota Premium; (7) sin disponibilidad Premium, la planificación básica sigue utilizable.
- **Dependencias:** ninguna funcional: es política transversal de acceso. **Pendiente:** cobro, prueba de cortesía, cuotas, protección ante uso abusivo, continuidad y sincronización entre dispositivos; decisiones comerciales/arquitectónicas posteriores.

### RF-25 — Cuenta, registro e inicio de sesión [P0]
- **Necesidad:** conservar información académica personal y reconocer a la misma persona en navegador y aplicación móvil.
- **Comportamiento:** el usuario sin autenticación ve acceso/registro; para utilizar su planificación requiere crear una cuenta o iniciar sesión. Mostrar **«Continuar con Google» como opción recomendada** y ofrecer una vía alternativa mediante correo. La autenticación con Google **no conecta automáticamente Google Calendar**; se solicita el permiso de Calendar en otro paso. Una sesión vigente abre directamente el tablero semanal, sin repetir la bienvenida. Al cerrar sesión no se exponen datos del usuario anterior.
- **Aceptación:** (1) usuario sin sesión no puede abrir datos privados de otra cuenta; (2) después de registro exitoso entra al flujo de primer acceso; (3) usuario con sesión vigente vuelve al tablero al abrir web o app; (4) tras cierre de sesión se solicita nuevo acceso; (5) cuenta creada por Google funciona en ambos clientes; (6) usuario registrado por correo puede conectar Calendar con autorización posterior, sin que el registro mismo la implique; (7) error de autenticación conserva información existente y ofrece recuperación de acceso sin revelar datos ajenos.
- **Dependencias:** ninguna. **Pendiente de arquitectura/seguridad:** mecanismo de autenticación por correo, sesiones, recuperación y protección de credenciales. No se escoge proveedor de identidad en este PRD.

### RF-26 — Bienvenida contextual y primer tablero vacío [P0]
- **Necesidad:** que un estudiante nuevo entienda cómo crear su primera planificación sin forzarlo a completar un asistente largo.
- **Comportamiento:** tras registrarse, se propone conectar Google Calendar con acciones **«Conectar»** y **«Ahora no»**; luego entra al tablero inicialmente vacío. Un recorrido contextual no bloqueante indica dónde importar Excel/PDF, revisar duraciones/prioridades y definir ventanas de estudio. Arriba se muestra acceso al calendario, luego navegación por próximas semanas y tarjetas centrales vacías/estado de inicio; abajo el CTA principal **«Importar actividad»**. Puede cerrar la guía, explorar el calendario y registrar una actividad manual. Quien ya inició sesión no repite automáticamente el onboarding; puede reabrir la guía desde ayuda.
- **Aceptación:** (1) no hace falta conectar Calendar para entrar; (2) primer tablero sin actividades muestra estado vacío y próximos pasos, nunca «controlada»; (3) el CTA importa Excel/PDF en Free; (4) desde guía se accede a ventanas de estudio, horas y prioridades; (5) el usuario puede omitir la guía y volver luego; (6) tras confirmar una actividad, aparece su tarjeta en semana de deadline; (7) siguientes accesos válidos llevan directamente al tablero; (8) mismos pasos son accesibles en móvil y web, adaptando presentación.
- **Dependencias:** RF-25, RF-19 y RF-02. **Acciones opcionales posteriores:** RF-08 establece ventanas y RF-20 conecta Google Calendar.

### RF-27 — Continuidad de información en navegador y app [P0]
- **Necesidad:** importar/editar desde navegador y consultar o ajustar en móvil sin rehacer el trabajo.
- **Comportamiento:** los dos clientes utilizan la **misma cuenta, el mismo backend de negocio y una base de datos lógica compartida** para cursos, documentos procesados, actividades, horas, prioridades, ventanas, vinculación Calendar, tarjetas y sesiones internas. La arquitectura decidirá almacenamiento, APIs y mecanismo de sincronización; el producto exige continuidad de información confirmada. Si hay ediciones concurrentes o conexión fallida, se informa el estado y no se sobrescriben cambios confirmados silenciosamente.
- **Aceptación:** (1) importar Excel en web y confirmar evaluaciones produce esas mismas tarjetas en app tras acceder/refrescar; (2) modificar prioridad u horas en app aparece en web tras actualización; (3) ambos clientes muestran el mismo plan confirmado y los mismos estados de sobrecarga; (4) se diferencian datos guardados, cambios pendientes y error de sincronización; (5) abrir sesión en otro cliente no crea cuenta o periodo duplicado; (6) conflictos de edición no descartan silenciosamente los cambios; (7) documentos y datos de una cuenta no aparecen en otra; (8) no se promete edición offline completa ni sincronización instantánea.
- **Dependencias:** RF-25. **Datos que debe conservar entre clientes:** RF-01, RF-19 y RF-21, sin que estos requieran RF-27 para calcular. **Arquitectura:** persistencia compartida e integridad, sin prescribir un stack.

**Regla adicional RF-27 [v5]:** los borradores, preferencias de sesión, fijaciones, estados de Calendar y correcciones de progreso forman parte de la continuidad; web y app deben distinguir plan confirmado de propuesta pendiente.

### RF-28 — Actualización confirmada de fechas y horarios académicos [P0]

- **Necesidad:** responder cuando la institución, el docente o el equipo comunica que un examen, una práctica, una exposición o una entrega se **adelanta o posterga** (por feriado u otro motivo), sin mantener una planificación basada en una fecha obsoleta.
- **Comportamiento:** desde una obligación existente, el estudiante puede modificar **fecha límite** y, para compromisos con horario fijo, **inicio y fin**. También puede revisar propuestas de cambio detectadas al volver a importar una versión del Excel/PDF. Antes de aplicar, se muestra fecha anterior, propuesta nueva, origen y consecuencias sobre sus sesiones. El cambio requiere **confirmación explícita** y se conserva en el historial; no se crea una nueva evaluación duplicada si es la misma. Una ocupación que proviene exclusivamente de Google Calendar se actualiza **en Google**, y la app solo refleja su lectura; nunca edita el evento externo.
- **Criterios de aceptación:** (1) un examen adelantado del viernes al miércoles, confirmado por el usuario, pasa a la tarjeta de la semana correspondiente y dispara reprogramación **antes del miércoles**, no después; (2) si el nuevo plazo deja horas sin sitio, se muestra déficit/conflicto; (3) si la fecha se posterga, se reevalúan los espacios disponibles sin restaurar automáticamente sesiones terminadas ni horas reales; (4) para un examen con horario concreto se confirma el intervalo nuevo y el anterior deja de bloquear la agenda **interna**; (5) una propuesta importada no sobrescribe fecha vigente sin confirmación y no genera duplicado; (6) prioridad, duración operativa y progreso se conservan salvo edición expresa; (7) el historial muestra fecha anterior, nueva y momento de confirmación; (8) la modificación no cambia Google Calendar ni sesiones fijadas silenciosamente; ante colisión se solicita decisión; (9) si se intenta asignar una fecha inválida o previa incompatible con tiempo restante se informa el conflicto sin simular solución.
- **Dependencias:** RF-03 o RF-05, RF-09, RF-16; los cálculos **consumidores posteriores** son RF-10, RF-14, RF-19 y RF-21. **Pendiente técnico:** tratamiento de sincronización de versiones y formatos de fecha, sin seleccionar arquitectura.

## 8. Requisitos no funcionales

| ID | Requisito y prioridad | Criterio verificable, sin umbrales arbitrarios | Estado |
|---|---|---|---|
| RNF-01 | Claridad de estado y origen — P0 | Distinguibles: extraído de Excel/PDF, declarado manualmente, sugerido Premium, personalizado, confirmado y desconocido | Necesario |
| RNF-02 | Accesibilidad básica — P0 | Los flujos de importación y **lista de siete evaluaciones** son operables por teclado con etiquetas y mensajes textuales, sin depender únicamente del color | Necesario; nivel de conformidad por decidir |
| RNF-03 | Privacidad por defecto — P0 | Documentos, horas reales y planes no públicos; explicación de uso del historial; opciones de eliminación | Necesario; conservación por aprobar |
| RNF-04 | Integridad de datos — P0 | Importar o recalcular no borra obligaciones confirmadas ni duplica compromisos | Necesario |
| RNF-05 | Confiabilidad de análisis — P0 | Un recálculo fallido se informa y un resultado anterior no aparece como actualizado | Necesario |
| RNF-06 | Respuesta comprensible — P1 | El usuario ve extracción/planificación en curso, terminada o fallida; sin promesa de latencia no medida | Necesario |
| RNF-07 | Mínimos datos — P0 | El usuario no está obligado a entregar historial real ni conectar Google para usar modo manual | Necesario |
| RNF-08 | Continuidad entre plataformas — P0 | Misma cuenta conserva cursos, tareas, tarjetas, horas, prioridades y sesiones entre web y app; errores de sincronización son visibles y no pierden silenciosamente cambios | Necesario; solución técnica posterior |
| RNF-09 | Documentos no confiables — P0 | Las instrucciones presentes en documentos no pueden cambiar las políticas del producto ni activar funciones Premium no autorizadas | Necesario |
| RNF-10 | Consistencia de estimación Premium — P0 | Repeticiones equivalentes producen sugerencias razonablemente similares, versionadas, revisables; **no aplica a duraciones manuales Free** | Necesario para Premium; tolerancia pendiente |
| RNF-11 | Privacidad Google Calendar — P0 | Ocupación autorizada por defecto. Títulos opcionales con permiso explícito de Google y solo para visualización. Acceso de solo lectura | Necesario |
| RNF-12 | Coherencia multiplataforma — P1 | Tarjetas, lista de importación, duraciones, prioridades y sesiones funcionan en dispositivos objetivo | Dirección UX |
| RNF-13 | Control de costos IA — P0 | Captura Excel/PDF, reglas de prioridad, alertas y programación Free no invocan IA generativa por obligación; Premium ofrece control visible de acceso/cuota | Necesario para freemium; umbrales comerciales pendientes |
| RNF-14 | Seguridad y aislamiento de cuenta — P0 | Sesión cerrada no permite ver información privada; dos cuentas no comparten datos; registro con Google no activa acceso a Calendar sin permiso separado | Necesario; controles técnicos posteriores |
| RNF-15 | Estados de primer uso — P0 | Sin actividades, sin horas y con Calendar desconectado se muestran estados informativos distinguibles y accionables; no se usa solo color para informar sobrecarga | Necesario; diseño en Figma |

No se fijan objetivos de latencia, disponibilidad, cuotas, volumen de archivos, precios ni requisitos legales específicos sin base suficiente. Arquitectura elegirá herramientas, motor, biblioteca y proveedor; el PRD fija la separación de comportamientos.

## 9. Flujos de usuario (sin diseño de pantallas)

### FU-00 — Registro, recomendación de Calendar y tablero vacío [A]
1. Si no hay sesión válida, presentar opciones de registro/inicio de sesión; destacar Google y ofrecer alternativa por correo.
2. Tras completar el registro, recomendar conectar Google Calendar, explicando que es opcional. Solicitar autorización **específica** de ocupación solo si el usuario elige conectar.
3. Tanto si conecta como si omite, abrir el **tablero semanal vacío**. Arriba: acceso a calendario; debajo: selector/filtro de semanas próximas; centro: tarjetas sin actividades/estado inicial; abajo: CTA **Importar actividad (PDF/Excel)**.
4. Mostrar guía contextual breve y opcional para importar, confirmar evaluaciones, ingresar horas y prioridades, y configurar ventanas de estudio. El estudiante puede explorar, omitirla o retomarla.
5. En visitas posteriores con sesión vigente, abrir directamente el tablero y cargar los datos confirmados de su cuenta. Al cerrar sesión, volver a acceso.

### FU-01 — Excel/PDF → lista de evaluaciones → horas y prioridad
1. Desde el CTA inferior del tablero, importar un Excel/PDF o crear actividad manual (Free y Premium).
2. Detectar registros cuando haya campos reconocibles y mostrar una fila editable por obligación con curso, tipo, fecha/hora y fuente. Un Excel con 5 PC y 2 exámenes representa 7 filas.
3. El estudiante confirma/corrige los registros; en Free declara duración de preparación/trabajo por evaluación. En Premium puede solicitar sugerencias de horas para enunciados suficientemente explícitos y confirmarlas.
4. Definir prioridad simple Alta/Media/Baja **por curso + tipo**, permitir sobrescribir por actividad. A igualdad de prioridad, las obligaciones con menor plazo reciben precedencia de programación en franjas en disputa.
5. Confirmar registro completo o parcial. Se actualizan tarjetas de la semana de **deadline** sin declarar carga completa si faltan datos.

### FU-02 — Configurar disponibilidad con Google Calendar o manualmente
1. Aceptar la recomendación inicial o abrir «Conectar Calendar» desde tablero/ajustes.
2. Conceder o rechazar un permiso distinto del inicio de sesión; elegir calendarios que aporten ocupación. Si omite, declarar compromisos manuales.
3. Definir ventanas personales de estudio y excepciones, con referencia orientativa de sesiones de 60 min ajustable; lo vacío en Google no significa estudiable.
4. Mostrar bloques ocupados sombreados en el calendario interno, última actualización y huecos realmente compatibles. Mantener las preferencias compartidas entre web/app.

### FU-03 — Autoplanificación y tarjetas semanales
1. Con duraciones, plazos, prioridades y disponibilidad confirmados, generar sesiones compatibles automáticamente; no requieren IA generativa ni plan Premium.
2. Respetar fijos, fechas, dependencias y divisibilidad; preferir bloques de estudio de 60 min, mínimo sugerido de 30 min y máximo sugerido de 120 min, personalizables según necesidad; las reservas grupales siguen su regla específica.
3. Si dos actividades tienen igual prioridad, atender la de menor plazo cuando disputan espacios; si ambas tienen igual plazo, usar desempate estable documentado.
4. Mostrar tarjetas por semana de vencimiento **y trabajo ejecutado/programado**: incluso sin deadlines, una semana con sesiones muestra carga, no aparece vacía. Los estados separan pendiente, viable según datos, sobrecarga, conflicto y fuente desactualizada, sin doble conteo. Mostrar inicialmente esta semana y cuatro siguientes, con navegación a todo el periodo (§10.5.1).
5. Al tocar una evaluación/tarea, abrir el calendario contextual con sus sesiones y compromisos sombreados. En una sesión válida posterior, acceder directamente a este tablero.

### FU-04 — Detectar sobrecarga y evaluar opciones
1. Identificar demanda no ubicada y limitaciones temporales según reglas conocidas.
2. Mostrar déficit o conflicto con explicación, sin declarar viable un escenario imposible.
3. Permitir examinar y confirmar ajustes permitidos. No ampliar ventanas ni mover sesiones fijadas sin permiso.

### FU-05 — Un compromiso cambia: reajuste automático
1. Un evento ocupado nuevo, cambio en plazo/horas o prioridad provoca reevaluación al disponerse de información actualizada.
2. Reubicar solo sesiones flexibles que admitan movimiento; preservar eventos fijos y sesiones fijadas.
5. Mostrar qué cambió y permitir solicitar deshacer movimientos internos; revalidar antes de restaurar para no colisionar con eventos externos nuevos. Permitir editar un bloque individual (queda fijado) o reorganizar una actividad completa (§10.5.4). Si no cabe, reflejarlo en tarjeta y calendario.

### FU-06 — No existe un plan viable
1. Comparar restricciones duras y esfuerzo pendiente.
2. Cuando no haya distribución viable, mostrar horas/obligaciones en riesgo y motivos, no cambiar deadlines ni generar horas libres artificiales.
3. Ofrecer ajustes hipotéticos, dejando claras las condiciones que requerirían autorización.

### FU-07 — Completar actividad y registrar tiempo real
1. Distinguir entre **preparación terminada** y **evaluación fija rendida**, o **trabajo/entrega cumplido**. No marcar como completado automáticamente por deadline o por estimación restante cero; permitir cierre en cualquier fecha, incluso antes del deadline.
2. Solicitar opcionalmente horas efectivas y fecha real; conservarlas para Free y Premium.
3. Actualizar horas restantes y estados sin doble contar correcciones del total real acumulado; conservar la evaluación fija aunque se complete el estudio y gestionar sesiones futuras. Premium usará historial **suficiente y comparable** cuando exista; sin él mantiene sugerencia inicial.

### FU-08 — Continuar entre navegador y aplicación móvil
1. Un estudiante autenticado importa y confirma un Excel/PDF desde navegador.
2. Abre la app móvil con la misma cuenta; se presenta el tablero con tarjetas y sesiones confirmadas, sin importación repetida ni nuevo onboarding.
3. Cambia prioridad/horas desde la app; los ajustes se reflejan en el navegador tras recargar/actualizar.
4. Si no hay conexión o existe conflicto de edición, ver estado de sincronización y resolución, sin afirmar que los datos se guardaron correctamente si no ocurrió.

### FU-09 — Cambio de fecha de examen, práctica o entrega por decisión externa

1. El estudiante conoce un nuevo horario o plazo (por feriado, comunicación docente u otra causa), o importa un Excel/PDF actualizado que propone una modificación.
2. Abre la obligación existente y revisa la **fecha/hora anterior** frente a la **nueva**, junto con curso, tipo y procedencia; confirma que es la misma actividad, no un duplicado.
3. Confirma el nuevo deadline y, si corresponde, el intervalo del evento evaluativo. Si proviene de Google Calendar, realiza la edición en Google y esta aplicación solo lee la nueva ocupación.
4. La aplicación conserva el historial y recalcula capacidad, sesiones internas **flexibles**, estado semanal y posibles conflictos. Las sesiones fijadas o ya realizadas no se trasladan sin decisión del estudiante.
5. Si no se puede completar a tiempo, el tablero muestra horas no ubicadas y opciones parciales, sin desplazar nuevamente el plazo por iniciativa del motor. El estudiante puede revisar los cambios y resolver conflictos manualmente.

## 10. Reglas de negocio

### 10.1 Modelo de esfuerzo, disponibilidad y planificación [D/R]

**Tipos conceptuales:**
- **Trabajo académico individual:** tarea, informe, práctica/proyecto individual, preparación de examen o exposición. Requiere **horas de dedicación estimadas** y genera sesiones de trabajo flexibles.
- **Evento evaluativo fijo:** examen, práctica con horario, clase o exposición en hora concreta; **ocupa el calendario** y no equivale a horas de preparación.
- **Entrega grupal:** deadline confirmado y **actualizable si cambia la fecha real de entrega**, más **reserva tentativa de colaboración** `3×2 h` en fechas próximas anteriores al límite, preferentemente tres días consecutivos si existen ventanas. Se edita/desactiva. **No** implica estimación de esfuerzo individual ni representa trabajo grupal total. No duplicar reuniones Google vinculadas/equivalentes.

**Cuenta, acceso inicial y continuidad [A/R]:**
0. El producto exige cuenta para acceder a su planificación y conservar datos persistentes. Se recomienda registro/inicio de sesión con Google y se ofrece alternativa con correo; Google Login **no** concede permiso a Google Calendar. Tras primer registro se recomienda Calendar opcional y se abre tablero vacío con guía no bloqueante. Con sesión válida se abre directamente el tablero. La información confirmada es común a web y app mediante un backend/repositorio lógico compartido; ninguna tecnología concreta queda impuesta.

**Captura gratuita y completitud [R]:**
1. Admitir importación de **Excel (.xlsx) y PDF** para detectar filas/evaluaciones, curso, tipo, título y fecha/hora en información estructurada reconocible. Confirmar antes de activar. Si el archivo es ambiguo o ilegible, identificar límites y permitir ingresar/corregir manualmente. El plan **Free no consume IA generativa como requisito de extracción**.
2. Después de importar, mostrar **una fila por actividad reconocida**, incluyendo las 5 PC + 2 exámenes del ejemplo (7 filas). Si la evaluación es un examen, sus horas solicitadas son **de estudio**, separadas de su horario oficial.
3. En Free, el estudiante **escribe su duración prevista** para cada actividad individual. En Premium puede solicitar sugerencia inicial mediante análisis semántico del documento y luego confirmar o corregir. Un dato faltante conserva estado `sin_estimar`, no se considera `0`; no se declara una semana completa/controlada con demanda relevante desconocida.
4. El ingreso manual, revisión, reprogramación y registro de horas reales no exige Premium; la automatización de la **estimación del esfuerzo y aprendizaje personalizado** sí pertenece a Premium.

**Estimaciones Premium y personalización [R/D]:**
5. Para sugerir esfuerzo, identificar **solo señales fundamentadas**: tipo, curso/tema, descripción, instrucciones, entregable, cantidad/volumen y complejidad sustentada. El procedimiento/prompt especializado definido en arquitectura será **versionado y probado**. No se exige resultado numérico idéntico entre ejecuciones equivalentes, sí resultados orientativos razonablemente comparables; el prompt aislado no garantiza consistencia ni precisión.
6. Si el enunciado no proporciona base suficiente, preguntar por información relevante o mostrar «no estimable». La **fecha límite, la disponibilidad, la prioridad y el peso en la nota** influyen en urgencia y distribución, pero **no reducen/aumentan arbitrariamente el esfuerzo intrínseco** del trabajo.
7. Mantener separados: `duracion_declarada_usuario`, `sugerencia_base_premium` (si existe), `version_estimacion`, `sugerencia_personalizada_premium` (si procede), `duracion_operativa_confirmada`, `horas_reales_reportadas`, `fecha_finalizacion_real` y `esfuerzo_restante_declarado`.
8. Ambos planes permiten **registrar horas efectivas al completar**, sea antes o después del deadline. La fecha de completitud no implica un número de horas trabajadas. En Premium, cuando exista historial propio suficiente y comparable y consentimiento aplicable, ofrecer una sugerencia personalizada revisable para nuevas actividades. Un registro aislado **no** crea automáticamente un patrón ni se usa la reserva grupal como medición de esfuerzo real. Reglas de suficiencia antes de implementar personalización Premium.

**Prioridades operativas y herencia [R]:**
9. Durante la revisión posterior a importación, permitir definir prioridad predeterminada **Alta, Media o Baja por curso + tipo** y cambios excepcionales **por actividad**. La `prioridad_efectiva` es la sobrescritura individual si existe; de lo contrario el valor del par curso/tipo; si no existe, `sin_prioridad_declarada`.
10. La prioridad **es atributo de programación**: influye en el orden de asignación y decisión de qué trabajo queda sin ubicar cuando los espacios compiten. Cambiar la prioridad base actualiza solo actividades que la heredan; la excepción individual prevalece. Importancia académica, ponderación de nota informada, dificultad y consecuencia de atraso son factores opcionales y distinguibles, sin inventar pesos cuantitativos.
11. **Plazos y eventos fijos vigentes prevalecen durante cada cálculo.** Una prioridad Alta no puede alterar fechas límite ni ocupar eventos fijos; el estudiante puede confirmar un cambio de la fecha académica real mediante RF-28, tras el cual se calcula con el nuevo valor. Para espacios competidos, entre actividades de **igual prioridad efectiva** se prefiere el **plazo más cercano**. Si prioridad y plazo son exactamente iguales, se utiliza un criterio residual estable y documentado en arquitectura, nunca aleatorio ni de valor académico inventado. Si falta prioridad se aplica orden por plazo/restricciones sin atribuir preferencia del estudiante.

**Cálculo de demanda [R]:**
12. Una actividad individual con duración operativa confirmada `E` y tiempo real acumulado y confirmado `T`: `pendiente_orientativo = max(0, E − T)`; el valor cero **no** significa «completado» si el usuario no confirmó la finalización. Si indica esfuerzo restante explícito, prevalece su autorreporte; si `T > E` y continúa pendiente, solicitar revisión del esfuerzo restante en vez de cerrar automáticamente. Las correcciones de `T` sustituyen el total acumulado confirmado, no se suman como una nueva sesión salvo acción expresa. No se presupone progreso lineal.
13. Las horas que el alumno estima para preparar un examen **no incluyen** el evento fijo del examen. Las obligaciones se agrupan visualmente por **semana del deadline**, mientras las sesiones cuentan en **semana de ejecución**; una semana sin deadlines pero con sesiones debe mostrarse como **semana con trabajo programado**, no vacía. Una misma hora se cuenta solo en la semana de ejecución y nunca se duplica por aparecer el vencimiento en otra tarjeta.
14. La reserva grupal predeterminada `3×2 h` es **tentativa** y se presenta como capa de carga diferenciada, con posibilidad de editarla, desactivarla o marcar bloque equivalente ya ocupado en Calendar. No descontar ni sumar dos veces reuniones equivalentes.

**Disponibilidad, planificación y sobrecarga [R]:**
15. `capacidad_usable = duración(unión(ventanas de estudio autorizadas) − unión(ocupaciones externas/locales + sesiones fijadas pertinentes))`. Las sesiones internas flexibles previas se retiran provisionalmente antes de recalcular para no descontarlas dos veces; no restar doble los intervalos solapados.
16. Una hora vacía de Google Calendar **no es automáticamente apta** para estudiar: requiere ventana declarada y respeto a descansos. Conexión Google es voluntaria y de **lectura de ocupación**; se muestra fuente/última actualización. No se escriben sesiones en eventos externos.
17. La distribución y recálculo **Free y Premium usan reglas no generativas** basadas en duraciones confirmadas, prioridades, deadlines, inicio permitido, divisibilidad, dependencias y espacios libres. Preferencia inicial configurable: sesión **60 min**, fragmento mínimo sugerido **30 min**, máximo sugerido **120 min**; valores provisionales de producto, editables y no derivados de entrevistas. Solo dividir actividades divisibles y no ubicar por defecto fragmentos bajo el mínimo; señalar el remanente. Las reservas tentativas grupales 3×2 h tienen regla propia. Repartir sesiones antes del **plazo vigente confirmado**; no mover eventos fijos ni sesiones fijadas automáticamente. Los horarios de evaluaciones pueden **actualizarse explícitamente** por RF-28 cuando cambien por una causa externa. Los cambios internos flexibles muestran movimientos y pueden deshacerse.
18. `déficit_indicativo = max(0, demanda_conocida − capacidad_compatible)` para el horizonte de análisis, con distinción de reservas grupales tentativas y demanda individual. Suma de horas por semana **no reemplaza** verificar factibilidad por deadlines, intervalos, precedencias y sesiones indivisibles.
19. Estado «viable según datos» solo si los datos relevantes están confirmados y se pueden ubicar compromisos que admiten ubicación; cuando faltan horas o una fuente **previamente conectada y necesaria** está desactualizada, el estado es **información insuficiente/parcial**; si nunca se conectó Google y el estudiante completó la disponibilidad manual, el plan puede ser evaluable. Un plan imposible queda marcado como tal; nunca se crean horas adicionales silenciosamente.
20. Ante cambios de horarios/preferencias o de **fecha académica confirmada** se reubican solo sesiones internas flexibles; ampliar ventanas, sacrificar descanso o modificar un dato académico confirmado exige aprobación explícita. Los cambios de fecha se gestionan en RF-28 y nunca como permiso implícito del motor para postergar una entrega. En fallo de sincronización se conserva lo confirmado y se muestra el estado desactualizado.
21. Las **tarjetas semanales** deben distinguir: `sin_actividades`, `pendiente_de_datos`, `viable_segun_datos`, `sobrecarga_prevista`, `conflicto_sin_solucion` y advertencia `fuente_desactualizada` superpuesta cuando corresponda. Ninguna tarjeta vacía equivale a viabilidad calculada; importar una evaluación confirmada la incorpora en su semana de deadline.
22. La **misma cuenta** debe mantener cursos, documentos, tiempos, prioridades y sesiones sincronizables entre navegador y app. Ante dos ediciones conflictivas se exige resolver/conservar cambios; no aplicar sobrescritura silenciosa ni prometer sincronización instantánea fuera de conectividad.

**Casos de estimación por tipo [D]:**

| Actividad | Free | Premium | Particularidad |
|---|---|---|---|
| Tarea, informe, ensayo o proyecto individual | Usuario indica horas previstas | Enunciado suficientemente detallado puede dar sugerencia orientativa | Descripción insuficiente → pedir horas/datos |
| Práctica calificada (PC) | Ingreso de horas para **preparación/trabajo**, no duración del evento fijo | Puede sugerirse preparación a partir de tema/instrucciones si se justifica | PC con horario ocupa evento separado |
| Parcial o final | Usuario indica cuántas horas cree que estudiará | Sugerencia posible si se conocen temas/formato y otros datos relevantes | Fecha/hora del examen ≠ horas de estudio |
| Exposición | Horas para elaborar y ensayar | Sugerencia si alcance y requisitos son claros | Presentación fija separada del trabajo previo |
| Entrega grupal | Deadline + reserva **tentativa** `3×2 h` | Misma convención, **sin estimar horas por integrante** | Reserva editable/desactivable, no es registro real |

La determinación concreta de formatos, prompt, bibliotecas, reglas de desempate, límites de consumo Premium y método de ajuste histórico corresponde a diseño/arquitectura, respetando estos comportamientos de producto.

### 10.2 Estados del análisis [R]

1. **Viable según datos:** demanda conocida con estimaciones explícitas cabe respetando restricciones y el horizonte analizado está suficientemente descrito; indicar estimaciones y reservas tentativas. La ausencia voluntaria de conexión Google **no impide** este estado si las ventanas y ocupaciones manuales necesarias están confirmadas.
2. **Déficit previsto:** demanda calculable excede espacio compatible hasta uno o varios plazos; mostrar horas y obligaciones.
3. **Conflicto de restricciones:** hay horas agregadas, pero no intervalos compatibles con deadline/inicio/fijos/dependencias.
4. **Información insuficiente / parcial:** datos importantes ausentes, estimaciones no disponibles o fuente **anteriormente conectada** que dejó de actualizarse y de la que depende la disponibilidad; no equivale a semana «controlada». **Modo manual sin Google** es una fuente válida, no un error.

**Regla adicional de estados:** sin datos no equivale a «Controlada»; un usuario que acaba de registrarse verá un estado vacío orientativo con CTA a importación, sin horas ficticias. El detalle de representación visual se decidirá en Figma.

### 10.3 Reglas de integridad [R]

- Excel/PDF no confirmado no activa obligaciones; no se inventan fechas, horas ni prioridades ausentes.
- La importación estructural de Excel/PDF, la edición manual y el calendario automático por reglas funcionan en **Free sin IA generativa obligatoria**.
- Una PC/examen con horario fijo y su preparación son entidades distintas; el estudiante ingresa horas de **preparación** para la carga académica.
- Reserva grupal `3×2 h` siempre tentativa; si no cabe, mostrar déficit; no contar reuniones equivalentes dos veces.
- Solo se programa dentro de ventanas de estudio autorizadas, sin superponer eventos ocupados de Google, clases o gimnasio.
- Prioridad heredada por curso+tipo puede ser sobrescrita por actividad; es atributo de planificación y no modifica fechas oficiales. Solo una **actualización académica confirmada** por el estudiante puede cambiar el plazo o el horario local de una evaluación.
- Actividades individuales sin duración tienen estado parcial, no duración cero, y no permiten declarar la semana controlada.
- Hora real se captura gratuitamente al completar o actualizar, sin esperar deadline; no equivale al tiempo agendado.
- Personalización automática futura **solo Premium**, condicionada a historial comparable y suficiente; datos grupales tentativos nunca se consideran horas reales.
- Cambios automáticos auditables y reversibles, limitados a sesiones internas flexibles; no escribir Google Calendar.
- Si Premium no está disponible, el usuario puede continuar Free con los datos confirmados; el cambio de plan no borra obligaciones.

### 10.4 Decisiones vigentes y por cerrar (IDs compartidos con §15)

- **DP-01 a DP-03, DP-12 y DP-16:** PDF/Excel Free, horas manuales Free y sugerencia Premium orientativa, sin precisión garantizada.
- **DP-04 [cerrada a nivel de producto]:** cuenta requerida, login Google recomendado y alternativa por correo, persistencia de datos comunes web/app. La **política de retención/eliminación** pasa a DP-26 y se resuelve antes de piloto.
- **DP-05 [cerrada a nivel UX inicial]:** respetar **fechas/horarios vigentes confirmados** durante el cálculo, permitiendo cambios académicos explícitos por RF-28, además de divisibilidad y precedencias; preferencia editable de sesiones 60 min, mínimo sugerido 30 min y máximo sugerido 120 min.
- **DP-06, DP-15:** distribución/replanificación mediante reglas, solo sesiones internas flexibles, reversibles.
- **DP-07:** intervalos diarios y lectura semanal; fuente y estado de sincronización explícitos.
- **DP-08:** deadline grupal y reserva tentativa `3×2 h`, sin estimación individual.
- **DP-09 a DP-11:** incertidumbre de estimaciones, registro real Free y aprendizaje Premium; éxito no demostrado.
- **DP-13 a DP-14:** diferenciación integrada como hipótesis; Calendar opcional con autorización separada del inicio de sesión.
- **DP-17, DP-20 [desempate cerrado]:** prioridad Alta/Media/Baja heredable por curso+tipo, excepción individual y fecha límite más cercana ante igual prioridad.
- **DP-18, DP-24:** primer ingreso guiado hacia tablero vacío con botón de calendario arriba, selector de semanas, tarjetas y CTA de importación abajo; sesiones válidas posteriores abren tablero directamente.
- **DP-19, DP-21 a DP-23:** importación gratuita estructural, política Free/Premium, lista por lote, registro real al completar.
- **DP-25:** cuenta y datos compartidos entre navegador y app, sin imponer stack de arquitectura ni edición offline completa.
- **DP-26:** retención, eliminación, seguridad y condiciones de cuenta/comercialización siguen abiertos para piloto/implementación.
- **DP-27 a DP-32 [incorporadas v6]:** horizonte semanal, confirmación parcial, campos desconocidos, movilidad/reversión de sesiones, reservas grupales y estados de finalización; reglas funcionales en §10.5 adoptadas para UX, sujetas a pruebas y factibilidad.
- **DP-33 [decisión v6]:** permitir actualizar con confirmación y trazabilidad fechas y horarios académicos por cambios reales; recalcular sesiones sin alterar datos externos ni mover fechas por conveniencia del motor (§10.5.10, RF-28).

Los códigos **DP-01 a DP-33** conservan significado unívoco con §15. Requisitos **RF-01 a RF-28** distinguen dependencias de cálculo, consumidores posteriores y capacidades opcionales para evitar circularidad.

### 10.5 Contratos funcionales para prototipos UX — revisión v6 [A/R]

**10.5.1 Horizonte y tarjetas.** El motor examina desde la fecha actual hasta la **última fecha relevante del periodo académico confirmado** y puede anticipar sesiones en semanas anteriores al vencimiento, respetando la fecha de inicio permitida y los límites del periodo. Cuando falta la fecha final del periodo se usa como límite el último plazo confirmado y se identifica el alcance como provisional. Según el diseño aprobado para F6, el tablero abre en la semana actual y muestra **una semana por página**. El selector da acceso a las demás semanas del horizonte. Las tarjetas separan las obligaciones que vencen de las sesiones programadas en la semana. Una semana con sesiones y sin entregas muestra **trabajo programado** y estado evaluable. Una semana vacía carece de obligaciones y sesiones. El déficit se calcula y se explica a partir de las **ventanas efectivas disponibles hasta cada plazo**.

**10.5.2 Registro candidato, borrador y activación.** Todo registro importado comienza en **borrador revisable** y se conserva para continuar después, incluso si se confirma solo parte del lote. Para activar una obligación como evento de calendario/deadline hacen falta **título reconocible, tipo de obligación y fecha válida confirmada**; curso puede quedar «sin asignar». Si es un evento fijo que debe bloquear horas, también se requiere **hora inicial y final confirmadas**; sin ellas solo consta el vencimiento, no una ocupación inventada. Sin horas de estudio confirmadas, la obligación puede aparecer en la tarjeta de vencimiento, pero su preparación conserva estado **no programable / demanda incompleta**. Una fila sin título, tipo o fecha permanece borrador y **no genera sesiones ni se considera en el cálculo confirmado**. Los cambios en borrador no modifican el plan activo hasta confirmar.

**10.5.3 Restricciones desconocidas.** La información ausente se representa como **no declarada**. No se inventan dependencias ni permisos para fragmentar, mover o adelantar. Antes de programar una actividad que necesita fragmentación, el estudiante confirma si puede dividirse; si no confirma, se trata como **indivisible** y solo se planifica en un bloque compatible. Si falta «inicio permitido» para una obligación sin otras restricciones, el usuario confirma **«puedo empezar desde ahora»** o indica otra fecha; sin confirmación, queda pendiente de programar. Las dependencias solo aplican si están expresamente declaradas/confirmadas. Si un documento describe una limitación, se ofrece para confirmar, nunca se interpreta como permiso automático.

**10.5.4 Movimiento individual, colectivo y reversión.** Editar **una sesión** afecta solo ese bloque y la fija por defecto al confirmar la modificación. «Reorganizar esta actividad» redistribuye sus restantes sesiones flexibles, respetando las fijadas; «Recalcular plan» trata todas las sesiones flexibles alcanzadas. Una modificación que deja horas sin ubicar muestra el nuevo déficit. Deshacer **no es restauración ciega**: se recalcula si el plan anterior sigue siendo válido con las ocupaciones actuales. Si no cabe, conservar el plan vigente y ofrecer vista previa del conflicto; jamás superponer bloques con un nuevo evento de Google.

**10.5.5 Restricciones vigentes y fechas académicas modificables.** Para cada cálculo, la **última fecha límite confirmada**, los intervalos de evaluaciones con horario confirmado, las ocupaciones externas y las sesiones fijadas son restricciones **vigentes que el motor debe respetar**. No son eternamente inmutables: el estudiante puede actualizar un deadline o un horario académico cuando la universidad o el docente lo adelante o postergue, usando RF-28 y guardando su procedencia e historial. El motor **no puede mover plazos oficiales por conveniencia de la planificación**. Las ocupaciones procedentes de Google Calendar se leen, no se editan desde la app. Los tamaños sugeridos de sesión, preferencias de días y posibles ampliaciones de ventanas son **preferencias modificables por el estudiante**; nunca se amplían automáticamente descansos ni horarios excluidos para fingir viabilidad. Si el nuevo plazo no es atendible se muestra déficit, no una fecha inventada.

**10.5.6 Google Calendar y datos manuales.** Estados separados: `no_conectado_modo_manual` (funcional), `conectado_actualizado`, `conectado_desactualizado`, `permiso_revocado` y `error_de_lectura`. El usuario sin Calendar puede introducir bloques ocupados y ventanas de estudio y obtener un plan viable **según esos datos**, con aviso del origen manual. Si una conexión existente falla, el calendario no se presupone vacío: se mantiene la última información con su marca temporal y se pide actualización/confirmación manual antes de declarar viabilidad de las horas afectadas. La conexión no exige acceso a títulos de eventos.

**10.5.7 Proyectos grupales.** Para una entrega grupal confirmada, mostrar deadline y **proponer** hasta tres reservas de dos horas en días consecutivos previos cuando existan tres ventanas compatibles. Si no existen, ofrecer tres días distintos lo más próximos que cumplan restricciones o un resultado parcial marcado como tal; nunca mover fijos. La propuesta se presenta para **aceptar, editar o desactivar** antes de considerarla como reserva de grupo confirmada. Si el estudiante ya tiene una reunión en Google, puede indicar que un **intervalo ocupado** corresponde a la colaboración, sin requerir título externo; el mismo intervalo cuenta una sola vez como ocupación y colaboración cubierta, y se reduce proporcionalmente la reserva tentativa pendiente. Coincidencia horaria por sí sola **no** confirma equivalencia.

**10.5.8 Progreso y finalización.** Una **preparación** puede estar no iniciada, en progreso o completada; su examen/PC con horario fijo es un evento independiente, que sigue visible hasta su celebración y no se marca «rendido» automáticamente por terminar de estudiar. Una tarea/entrega también conserva estado de cumplimiento separado del avance de sus sesiones. El usuario declara de forma opcional **horas reales acumuladas**, fecha de cierre y/o restante estimado y puede corregirlas; no se infieren horas reales del calendario. Al completar preparación o trabajo se cancelan **solo sus sesiones futuras flexibles**, previa notificación; los bloques fijados se conservan hasta que el usuario confirme retirarlos. Un plazo pasado no marca automáticamente la tarea completada. Las reservas grupales no se convierten en horas individuales efectivas por el paso del tiempo.

**10.5.9 Premium y tiempo histórico.** El **MVP Premium** incluye estimación inicial de esfuerzo y contempla sugerencias personalizadas **solo cuando existe historial propio suficiente y comparable** bajo criterios de producto aprobados antes de implementar la función. El usuario sin historial ve únicamente la sugerencia general; no se presenta como personalización. El registro del tiempo real es gratuito. **Aprendizaje avanzado/entrenamiento propio** está fuera del MVP. La experiencia de Figma debe mostrar claramente ambos estados Premium y el estado Free sin sugerencias. No se promete personalización desde el primer día.


**10.5.10 Cambios externos en fechas y horarios académicos [A/R].** Un examen, práctica, exposición, entrega individual o deadline grupal puede cambiar por feriado o instrucción externa. La aplicación admite **cambio manual confirmado** y **propuesta revisable desde un nuevo Excel/PDF**. Distingue entre: (a) horario vigente para programar, (b) fecha anterior guardada como antecedente, (c) propuesta aún no aceptada, que **no reemplaza** la fecha activa. Después de confirmar, actualiza las tarjetas de vencimiento, el intervalo fijo interno si corresponde, sesiones flexibles, sobrecarga y tareas en riesgo. Si se adelanta la fecha, nunca programa trabajo después del nuevo plazo ni crea horas en el pasado; si se posterga, puede redistribuir trabajo pendiente, sin reabrir avances realizados ni trasladar sesiones fijadas sin confirmación. El plazo grupal actualizado reconsidera las reservas **tentativas** `3×2 h`; las reservas confirmadas/fijadas se conservan o se muestran en conflicto hasta revisión. Los cambios de fuentes Google siguen siendo de solo lectura: si el evento está en Google, la fecha se cambia en Google y se vuelve a consultar. El motor nunca autoriza por sí solo un plazo nuevo para resolver sobrecarga.


## 11. Casos límite y manejo de errores

| Escenario | Comportamiento funcional v6 | Referencia |
|---|---|---|
| Excel de 5 PC y 2 exámenes con encabezados claros | Mostrar 7 registros revisables, horas de preparación por fila y prioridad heredada/editable, **sin requerir Premium** | RF-02/03/04/23 |
| Excel con múltiples hojas, encabezados diferentes o fechas ambiguas | Identificar incertidumbre, permitir editar fechas y curso; no inventar datos ni omitir silenciosamente una hoja leída | RF-02/04/17 |
| PDF con texto reconocible | Extraer información estructural básica en Free; indicar qué campos no se identificaron | RF-02/03 |
| PDF escaneado, ilegible o de esquema no reconocido | Informar límites y ofrecer entrada manual; no exigir pago para poder añadir las actividades | RF-02/05/17 |
| Usuario Free no ingresa duración de una de las siete actividades | Mantener fila «horas pendientes», no 0; planificar las otras actividades y mantener semana parcial si es relevante | RF-06/07/10/23 |
| Usuario Premium pide estimación de un documento sin contenido suficiente | Abstenerse o solicitar aclaración, conservar posibilidad de ingresar horas manuales | RF-06/17/24 |
| Usuario Premium deja de tener plan pagado | Mantener obligaciones, sesiones, horas reales y estimaciones operativas previas; deshabilitar nuevas sugerencias IA/personalizadas sin borrar historial | RF-15/24 |
| Se detectan dos prácticas del mismo curso y tipo | Aplicar prioridad heredada por curso+tipo; permitir sobrescritura de una sola práctica | RF-22/23 |
| Cambia prioridad del curso+tipo | Actualizar solo obligaciones que heredan; preservar excepciones y recalcular bloques flexibles | RF-14/22 |
| Prioridad no declarada o ponderación desconocida | Mostrar valor pendiente; usar plazos/restricciones básicas, sin peso académico inventado | RF-09/22 |
| Examen con horario de 2 h y 6 h de preparación | Bloquear evento fijo de 2 h y distribuir 6 h de estudio en sesiones anteriores; no duplicar carga | RF-03/06/10/21 |
| Actividad completada antes del deadline | Permitir registrar fecha real de fin y tiempo efectivo inmediatamente, en ambos planes | RF-15 |
| Tiempo efectivo difiere del estimado | Guardar diferencia y permitir corrección; solo Premium puede generar nueva sugerencia personalizada con suficientes comparables | RF-07/15 |
| Actividad grupal sin reparto de trabajo | Mostrar deadline y reserva 3×2 h tentativa, sin horas individuales inventadas | RF-03/06 |
| Reunión grupal equivalente ya en Google Calendar | El usuario confirma equivalencia y se evita doble conteo de ocupación/reserva | RF-08/10/20 |
| Reserva 3×2 h no cabe antes del plazo vigente | Mostrar faltante y riesgo; el motor no cambia el plazo para acomodarla, pero el estudiante puede confirmar una nueva fecha real si esta fue comunicada | RF-06/21/28 |
| Demanda individual excede capacidad hasta plazo | Mostrar déficit y tareas no ubicadas, no «controlada» | RF-10/11/21 |
| Sesión indivisible no tiene hueco continuo | Señalar conflicto, no dividirla silenciosamente | RF-09/21 |
| Calendario Google nunca conectado | Modo manual válido según ocupaciones y ventanas declaradas, sin estado de error por ausencia de conexión | RF-08/20; §10.5.6 |
| Calendar que ya estuvo conectado falla, caduca o pierde permiso | Señalar fuente desactualizada/revocada y requerir actualización o datos manuales suficientes, no presumir intervalos libres | RF-17/20; §10.5.6 |
| Evento externo ocupado aparece en horario de sesión flexible | Reubicar bloque dentro de ventana permitida y registrar movimiento, si existe sitio | RF-14/21 |
| Evento externo ocupa sesión fijada | No moverla sin permiso; advertir colisión y solicitar decisión | RF-13/14 |
| Examen o práctica adelantados por feriado o decisión docente | Editar/confirmar nueva fecha y horario; pasar a semana correspondiente, replanificar solo sesiones flexibles antes del nuevo plazo y mostrar faltantes si no caben | RF-09/14/28; §10.5.10 |
| Entrega individual o grupal postergada oficialmente | Confirmar nuevo deadline, conservar horas reales y progreso; redistribuir únicamente trabajo pendiente; revisar reservas grupales y fijaciones | RF-06/13/14/28 |
| Excel/PDF actualizado propone otra fecha para evaluación existente | Mostrar comparación entre fecha anterior y propuesta; no sobrescribir ni crear duplicado sin confirmación | RF-04/16/28 |
| Evento externo Google cambia de día u hora | Refrescar ocupación desde Google (solo lectura); revalidar sesiones y conflictos; no escribir el calendario externo | RF-14/20/28 |
| Cambio de fecha o curso tras confirmar importación | Solicitar confirmación si hay conflicto/doble registro, conservar historial y recalcular usando solo la fecha vigente | RF-14/16/28 |
| Cambio de zona horaria o superposición de ventanas | Recalcular unión de intervalos sin doble resta y preservar horarios locales correctos | RF-08/10/20 |
| Ninguna alternativa cumple restricciones | Declarar que no existe plan viable; mostrar obligaciones en riesgo | RF-10/11/12 |
| Intento de acceso Free a sugerencia Premium | No ejecutar IA ni cobrar silenciosamente; explicar disponibilidad y conservar campo manual | RF-06/24 |
| Documento malicioso o error de extracción | No ejecutar instrucciones contenidas en el archivo; conservar datos confirmados | RF-17/18/RNF-09 |
| Usuario nuevo con sesión y sin actividades | Presentar tablero vacío y guía opcional, jamás semana «controlada» por ausencia de registros | RF-19/25/26 |
| Iniciar con Google y rechazar permiso de Calendar | Sesión válida, tablero disponible y modo manual; no asumir autorización Google Calendar | RF-20/25/26 |
| Usuario vuelve con sesión activa | Abrir directamente su tablero, sin repetir registro, bienvenida ni importación | RF-19/25/26 |
| Dos actividades con misma prioridad y deadlines distintos | Asignar primero ventanas competidas a la del deadline anterior sin violar restricciones | RF-21/22 |
| Restante divisible bajo mínimo sugerido de sesión | Combinar con otro bloque autorizado o mostrar remanente; no desaparecer horas | RF-12/21 |
| Archivo importado en web y apertura en app | Mismas evaluaciones y tarjetas confirmadas, sin segundo registro ni duplicación | RF-25/27 |
| Ediciones concurrentes web/app o falla de conectividad | Informar pendiente/conflicto, conservar versiones confirmadas, no ocultar sobrescritura | RF-17/27 |
| Nunca conectó Google Calendar | Modo manual completo: ventanas/compromisos declarados por usuario; puede calcularse viabilidad según estos datos | RF-08/20; §10.5.6 |
| Calendar previamente conectado pierde acceso o actualización | Mostrar fuente obsoleta/permisos revocados, no tratar ocupación desconocida como libre; pedir actualización o confirmación manual | RF-17/20; §10.5.6 |
| Semana sin deadlines pero con sesiones | Mostrar horas/sesiones ejecutables en tarjeta, sin duplicar demanda en la semana del vencimiento | RF-10/19; §10.5.1 |
| Filas importadas incompletas | Guardar borradores; activar solo filas con título, tipo y deadline válido; si faltan horas, mostrar confirmado incompleto | RF-04/23; §10.5.2 |
| Falta inicio permitido o divisibilidad | Solicitar confirmación antes de programar; por defecto no fragmentar y no asumir permiso de adelanto | RF-09; §10.5.3 |
| Deshacer antiguo plan tras nuevo bloqueo Google | Revalidar contra ocupaciones actuales; rechazar restauración inválida y mostrar conflicto | RF-13/14; §10.5.4 |
| Reunión grupal externa de título privado | Solicitar equivalencia por intervalo indicado por usuario, sin leer título ni asumirla automáticamente; evitar doble cómputo | RF-08/10; §10.5.7 |
| Preparación terminada pero examen pendiente | Cancelar únicamente sesiones flexibles de preparación; conservar evaluación fija hasta que el usuario indique su estado | RF-15; §10.5.8 |
| Tiempo real supera estimación y actividad sigue abierta | Solicitar esfuerzo restante revisado; no completar automáticamente ni sumar dos veces correcciones | RF-07/15; §10.5.8 |

## 12. Modelo conceptual de información

Los siguientes son **conceptos de producto**, no tablas, servicios ni elección de almacenamiento.

| Concepto | Información necesaria | Relación / limitación |
|---|---|---|
| **Cuenta de estudiante** | Identidad de acceso, método de registro elegido, estado de cuenta y consentimiento | Base de persistencia y aislamiento; misma cuenta en web/app; proveedor técnico por decidir |
| **Sesión de acceso** | Estado de autenticación, vigencia y salida | Activa → tablero directo; ausente → ingreso/registro; no equivale a permiso Calendar |
| **Estado de bienvenida** | Primer ingreso, guía omitida/completada y posibilidad de reabrirla | Se propone conectar Calendar, pero es opcional y no bloquea tablero |
| **Borrador de importación** | Candidatos por archivo, mínimo de confirmación, estado pendiente y correcciones | Persiste entre visitas; no genera carga activa hasta confirmar mínimos |
| **Estado de obligación** | Borrador, confirmado incompleto, programable, en progreso, preparación terminada, evaluación rendida o entrega cumplida | Evento fijo y preparación son estados distintos; no cierre automático por vencimiento |
| **Estado de sincronización** | Última actualización, cambio pendiente, conflicto y origen de edición | Continuidad entre web y app; datos no sobreescritos silenciosamente |
| Estudiante y preferencias | Periodo, ventanas habituales, límites de descanso, zona horaria y preferencias de planificación | Autoriza cuándo estudiar; no infiere tiempos libres externos |
| Estado de acceso | Free/Premium, derecho vigente a sugerencias, límites y cambios de plan | Política de producto; no fija pasarela ni modelo de suscripción |
| Periodo y curso | Identificadores, curso/tema | Se relaciona con obligaciones y prioridad por curso+tipo |
| Documento fuente | **Excel/PDF**, referencia, hojas/páginas reconocidas, procedencia, estado de extracción/revisión | Un documento genera candidatos, no compromisos activos hasta confirmar |
| Obligación académica | Título, tipo, curso, **fecha/hora/deadline vigente y versiones anteriores**, procedencia y estado | Puede ser tarea, PC, examen, exposición, trabajo individual o entrega grupal; edición confirmada no crea duplicados |
| **Evaluación fija** | Inicio/fin confirmado vigente del examen, PC o exposición que ocupa tiempo | Distinta de la preparación; el estudiante puede actualizar su horario si cambia oficialmente, sin que el motor lo mueva por sí mismo |
| **Historial de fechas académicas** | Identificador de obligación, fecha/hora anterior y vigente, propuesta de cambio, fuente (edición o documento actualizado), momento y confirmación | Solo la última versión confirmada alimenta carga y planificación; versiones previas no duplican actividad |
| **Actividad de preparación/trabajo** | Horas previstas, restantes, inicio permitido, plazo, divisibilidad, dependencias, curso/tipo | Para examen son **horas de estudio**, no duración de evaluación |
| **Lista de revisión de importación** | Relación de candidatos, horas pendientes/confirmadas, prioridad por fila y estado de corrección | Ejemplo 5 PC + 2 exámenes ⇒ 7 filas; sin implicar 7 fechas distintas obligatoriamente |
| **Estimación manual Free** | Horas previstas declaradas por usuario, momento, revisión y fuente | No requiere IA ni suscripción; valor estimado, no tiempo real |
| **Sugerencia Premium inicial** | Atributos del enunciado, valor/rango, incertidumbre, versión del procedimiento y rechazo/aceptación | No genera certeza de horas; su ausencia no bloquea ingreso manual |
| **Sugerencia Premium personalizada** | Registros comparables, criterios de suficiencia, valor y aceptación | Solo Premium con historial suficiente; diferente de estimación base |
| Estimación operativa | Horas confirmadas que alimentan el plan y su origen | Puede proceder de usuario, sugerencia Premium aceptada o corrección |
| Registro de dedicación real | Fecha efectiva de finalización, horas efectivas reportadas, avance, correcciones, restante declarado | Disponible Free y Premium; no se deduce de deadline ni bloques programados |
| **Prioridad base curso+tipo** | Curso, tipo de evaluación/tarea y nivel **Alta/Media/Baja** declarado, información académica opcional | Aplicable salvo excepción; igual prioridad se desempata por menor deadline |
| **Prioridad individual** | Prioridad sobrescrita y factores opcionales conocidos | Prevalece sobre la base, sin modificar deadlines |
| Compromiso fijo | Inicio, fin, origen y estado | Clase, PC/examen presencial, gimnasio; bloquea disponibilidad |
| Entrega grupal | Fecha límite, curso, estado y reserva habilitada/deshabilitada | Sin esfuerzo individual estimado obligatorio |
| Reserva grupal tentativa | 3×2 h predeterminadas, bloques, confirmación y vínculo a reunión equivalente | No son horas reales ni carga individual estimada |
| Ventanas de estudio | Intervalos autorizados, recurrencia, excepciones y zona | Solo dentro de estas ventanas pueden ubicarse sesiones |
| Google Calendar | Conexión autorizada, calendarios elegidos, última actualización, permisos y revocación | Lectura de ocupación; no escribe ni requiere título de eventos |
| Ocupaciones externas | Intervalos de inicio/fin y estado ocupado/libre | Bloqueo visual; unión sin doble resta |
| Preferencia de sesión | Duración preferida inicial 60 min, mínimo sugerido 30 y máximo 120; editable | Condición de fragmentación de actividades divisibles; grupo tiene regla propia |
| Sesión interna | Actividad, inicio/fin, flexible/fijada, estado e historial de reubicación | Programada por reglas o modificada; no modifica evento Google |
| **Horizonte de planificación** | Inicio de análisis, límite final confirmado/provisional, semanas navegables | La vista muestra una semana por página dentro del horizonte calculado |
| **Fuente de disponibilidad** | Manual, conectada/actualizada, conectada/desactualizada, revocada o con error | Desconexión voluntaria inicial no implica falla; fuente previa caída puede invalidar análisis |
| **Cambio individual de sesión** | Sesión editada, nueva ubicación y estado fijado o flexible | Solo bloque seleccionado; la reorganización por actividad trata las demás sesiones flexibles |
| **Versión y reversión de plan** | Propuesta previa, cambios posteriores, restricciones actuales y resultado de revalidación | No restaurar una propuesta incompatible con ocupaciones nuevas |
| Plan y escenario | Compromisos, sesiones, restricciones, resultado, versión y reversible | Distingue propuesta de plan activo y resultado de simulación |
| Estado semanal | Sin obligaciones **ni sesiones**, trabajo programado sin vencimientos, incompleto, viable, sobrecarga, conflicto e indicador de fuente desactualizada, además de deadlines, ejecución, capacidad y déficit | La semana de estudio anticipado no es vacía; no sumar demanda por ejecución y vencimiento |
| Dependencia | Precedencia entre actividades con fuente | Solo si se conoce y se confirma |

**Relaciones principales:** registro con Google/correo → recomendación opcional de autorizar Calendar → tablero vacío + guía → archivo Excel/PDF → lista de actividades candidatas → corrección/confirmación → horas manuales Free o sugerencia Premium confirmada → prioridad heredable (curso+tipo con excepción por actividad) → ventanas + ocupaciones Google → sesiones automáticas por reglas → tarjetas y alertas → cambios/replanificación. Completar actividad → **fecha/hora reales gratuitas** → historial → posible sugerencia Premium futura **con suficientes datos**. Entrega grupal → deadline + reserva provisional, **sin estimación personal del equipo**.

## 13. Exclusiones y límites del producto

- El producto **no gestiona estrés clínico** ni promete notas, sueño o rendimiento; se centra en sobrecarga estudiantil.
- **No cobra por importar/procesar estructuralmente Excel/PDF**: ambos planes pueden obtener curso, tipo y fechas reconocibles y corregirlos. No se garantiza reconocer cualquier esquema, OCR universal o PDF escaneado ilegible; siempre existe respaldo manual.
- **No usa IA generativa obligatoria para Free** en extracción estructurada, duraciones, prioridades, calendario, alertas o replanificación. Free requiere estimación de horas del estudiante.
- **No ofrece automáticamente horas IA ni ajuste histórico al usuario Free**; Premium añade ese servicio sujeto a acceso, datos suficientes y límites transparentes.
- **No presupone horas reales** por completar una evaluación ni por el paso del deadline: la dedicación efectiva es registrada voluntariamente por el estudiante, en **ambos planes**, cuando termina o actualiza actividad.
- **No impide terminar una actividad antes del plazo** ni obliga a esperar el deadline para indicar tiempo real.
- **No exige prioridad inventada**: el usuario puede definirla por curso+tipo y/o actividad; cambiarla afecta sesiones flexibles, no fechas fijas.
- **No escribe en Google Calendar**; el acceso a eventos ocupados es opcional y de solo lectura, con modo manual.
- **No prohíbe actualizar fechas académicas por cambios reales**: el estudiante puede corregir fecha/hora de evaluaciones y entregas confirmadas (RF-28), pero el motor no las modifica automáticamente para resolver una sobrecarga. Las fechas de eventos externos se editan en su fuente, no desde la app.
- **Exige cuenta de producto para acceder y conservar la planificación**, con Google recomendado y alternativa por correo (RF-25). Conectar Google Calendar es un consentimiento adicional, independiente y opcional.
- **No estima esfuerzo individual de proyectos grupales**: deadline + reserva provisional 3×2 h editable, no colaboración ni roles detallados.
- **No reprograma citas, clases, exámenes ni sesiones fijadas**, ni añade horas no autorizadas para «resolver» sobrecarga.
- **No promete estimaciones Premium exactas/idénticas** ni usa un único registro como prueba de patrón; métodos avanzados quedan posteriores.
- **No construye** chat grupal, LMS, gestor integral de notas, coaching, Pomodoro ni gamificación en la primera versión.
- **No fija** precio, cuotas o proveedor generativo en este PRD; requieren política comercial y arquitectura posterior.
- **No requiere** edición completamente offline, sincronización instantánea garantizada ni compartir sesiones mediante escritura a Google Calendar. La cuenta sí es requerida y los datos confirmados sí deben conservarse entre web/app.

## 14. Riesgos y dependencias

| Riesgo/dependencia | Impacto | Tratamiento de producto |
|---|---|---|
| Excel con hojas/columnas no uniformes; PDF con tablas o escaneos | Evaluaciones omitidas o incorrectas | Revisión de filas, procedencia, mensajes claros, entrada manual; no prometer lectura perfecta Free |
| Costo por uso de IA Premium | Márgenes negativos o uso abusivo | Ninguna llamada generativa necesaria en Free; cuotas y controles Premium a aprobar sin inventar cifras |
| Precio o disposición de pago desconocidos | Modelo freemium podría no financiar la operación | Tratar monetización como hipótesis; medir valor de sugerencias, no afirmar conversión |
| Estimación manual insuficiente (PC1: 7/9) | Semanas aparentemente viables pueden estar subestimadas | Señalar «basado en horas declaradas»; revisión editable y tiempo real posterior |
| Premium sugiere horas poco fundadas | Confianza perjudicada | Señales explicables, incertidumbre y abstención; pruebas de casos comparables |
| Variabilidad de un procedimiento generativo | Dos trabajos similares reciben sugerencias muy diferentes | Prompt versionado y evaluación repetida, tolerancia antes de usar producción |
| Prioridades heredadas incorrectas | Programación desalineada con intención del estudiante | Revisión por curso+tipo, excepción por actividad y estado sin prioridad declarado |
| Priorización ignora plazos | Tareas prioritarias desplazan compromisos obligatorios | Restricciones duras primero; la prioridad solo ordena opciones viables |
| Grupo con reuniones distintas del supuesto 3×2 h | Reserva insuficiente/excesiva | Etiquetar tentativa, editar/anular y no atribuir esfuerzo individual |
| Reservas grupales coincidentes con Google | Doble conteo de ocupación/carga | Confirmar equivalencias y unir intervalos |
| Calendario desconectado o desactualizado | Sesiones superpuestas con clases/gym | Mostrar origen y última actualización, modo manual, estados parciales |
| Sesiones internas auto-movidas | Pérdida de control | Solo bloques flexibles, historial, fijación y deshacer |
| Semana realmente imposible | Falsa seguridad | Señalar tareas sin ubicar y no declarar solución |
| Datos de tiempo real insuficientes | Aprendizaje Premium sin fundamento | Historial necesario, comparabilidad y opción manual siempre |
| Downgrade Premium a Free | Pérdida de datos, confianza y adopción | Conservar historial, sesiones y horas operativas; no borrar por cambio de plan |
| Modelo de cuenta y conservación aún indefinido | Pérdida de datos/sesión o uso indebido | Cerrar persistencia, permisos, retención y eliminación antes del MVP con personas reales |
| Diferenciación basada solo en estética | No se valida ventaja competitiva | Medir esfuerzo de captura y decisiones viables sin reclamar superioridad a Shovel |
| Fecha académica reprogramada y no actualizada | La planificación coloca estudio según un plazo obsoleto | Permitir edición confirmada o revisión de nuevo archivo; guardar historial, recalcular y advertir conflictos (RF-28) |
| Contenido documental malicioso | Instrucciones no confiables llegan a procesamiento | Documentos son datos, no autoridad para alterar políticas o ejecutar acciones |

| La cuenta Google se confunde con autorización a Calendar | Privacidad y permisos solicitados incorrectamente | Dos pasos funcionales distintos, Calendar opcional y revocable; pedir alcances mínimos |
| Pérdida de continuidad web/app | Doble registro o planificación divergente | Cuenta única, estado persistente común, errores visibles y resolución de ediciones concurrentes |
| Preferencia de sesiones 60/30/120 no corresponde al hábito del usuario | Bloques incómodos o restos no ubicables | Valores orientativos editables; registrar limitaciones, no asumir respaldo empírico |

## 15. Decisiones pendientes y responsables

**Estados:** **[A]** decisión de dirección expresada por el promotor e incorporada; **[D]** detalle provisional; **[I]** necesita factibilidad/criterios técnicos; **[V]** hipótesis de valor/comercial por validar. **F** = antes de diseño detallado Figma; **M** = antes de implementación afectada; **P** = piloto/validación.

| ID único y decisión | Estado | Evidencia / motivo | Recomendación v6 | Cómo resolver / etapa límite |
|---|---|---|---|---|
| DP-01 Formatos documentales | **[A] actualizado** | Petición expresa de Excel/PDF Free | Admitir Excel `.xlsx` y PDF de anexos/sílabos/enunciados en ambos planes | Ejemplos representativos y esquema de columnas [I,M] |
| DP-02 Fuente de duración | **[A] actualizado** | El usuario propone entrada manual Free, IA Premium | Free = duración declarada; Premium = sugerencia opcional y corregible | Criterios por tipo / pruebas de casos [I,M] |
| DP-03 Datos mínimos de estimación Premium | [D] | Ausencia de duraciones verificadas en PC1 | Señales desde enunciado, abstención cuando falten bases | Corpus de casos y rúbrica de evaluación, sin horas inventadas [I,M] |
| DP-04 Cuenta e identidad | **[A] cerrada UX** | Decisión expresa del promotor de producto multiplataforma | Cuenta requerida, Google recomendado y alternativa por correo; mismo acceso en web/app | Mecanismos seguros, recuperación y autorización en arquitectura [I,M]; retención en DP-26 |
| DP-05 Restricciones y duración de sesiones | **[A] cerrada UX con valores iniciales editables** | Recomendación aceptada; fechas pueden cambiar externamente | Respetar plazos/horarios **vigentes confirmados** durante el cálculo; permitir su actualización explícita (DP-33); sesiones 60 min, mínimo 30, máximo 120; no fragmentar indivisibles | Comprobar factibilidad y preferencias [I,M] |
| DP-06 Automatización de sesiones | **[A] conservado** | Producto debe evitar planificación manual de todos los bloques | Ubicación/reubicación por reglas en Free y Premium; no alterar **automáticamente** fechas/horarios de evaluaciones, solo reaccionar a cambios confirmados | Verificar viabilidad con escenarios [I,M] |
| DP-07 Granularidad de disponibilidad | **[A] UX definida** | Sesiones diarias y tarjeta por semana | Intervalos diarios con resumen semanal y zona horaria coherente; Google no define ventanas de estudio | Casos con horarios y sincronización [I,M] |
| DP-08 Grupo y reservas | **[A] conservado** | Decisión simplificación de trabajos grupales | Deadline y reserva tentativa `3×2 h`, sin esfuerzo individual | Comportamiento ante cambios/concurrencia [I,F/M] |
| DP-09 Expresión de incertidumbre | [D] | Estimaciones manuales o IA pueden fallar | Origen visible «usuario» vs «sugerencia Premium»; estado incompleto | Criterios de comprensión [V,P] |
| DP-10 Historial y personalización | **[A] actualizado** | Usuario confirma registro real y plan Premium | Tiempo real gratuito al completar; ajuste futuro solo Premium y con registros suficientes | Suficiencia/comparabilidad y tratamiento de downgrade [I,M] |
| DP-11 Métricas del MVP | [V] | Sin línea base | Comparar fricción de importación Free, decisiones, correcciones, utilidad Premium | Prueba/piloto, umbrales posteriores [V,P] |
| DP-12 Excel/PDF complejos | [I] | Estructura de archivo variable | Extracción reconocible sin IA obligatoria; fallback manual, no prometer OCR universal | Corpus de archivos y limitaciones comunicadas [I,M] |
| DP-13 Diferenciación frente a Shovel | [V] | Shovel ya ofrece importación/planificación/reajuste | Apostar por experiencia integrada y menor fricción, como hipótesis | Comparación funcional y uso posterior [V,P] |
| DP-14 Google Calendar | **[A] conservado** | No duplicar clases/gym | Lectura opcional de intervalos ocupados, sin escritura | Autorización, actualización y desconexión [I,M] |
| DP-15 Reajuste y deshacer | **[A] conservado** | Imprevistos y planificación automática | Solo sesiones internas flexibles; informar y revertir | Definir qué movimientos requieren confirmación [I,F/M] |
| DP-16 Consistencia de IA Premium | **[A] ajustado** | Estimaciones aproximadamente comparables, no idénticas | Prompt especializado versionado en arquitectura; prueba de variación y abstención | Corpus/tolerancia antes de desarrollar RF-06 Premium [I,M] |
| DP-17 Criterios generales de prioridad | **[A] desempate cerrado** | Petición del promotor: iguales prioridades → menor deadline | Alta > Media > Baja; al empatar, plazo más cercano; restricciones rígidas primero | Solo segundo desempate exacto y casos de prueba [I,M] |
| DP-18 Pantalla principal y multiplataforma | **[A] concretado** | Decisión explícita de flujo y referencia visual | Sesión activa → tablero; arriba acceso a calendario, después semanas, tarjetas centrales y abajo importación; vacío inicialmente | Diseño adaptativo y estados detallados en Figma [F] |
| DP-19 Extracción Excel/PDF gratuita | **[A] nueva** | Petición expresa del promotor | Importación y extracción estructural de campos reconocibles en Free y Premium | Límites reales de Excel/PDF sin IA, errores y gastos fijos [I,M] |
| DP-20 Prioridad heredada curso+tipo | **[A] concretada** | Decisión sobre atributo operativo | Alta/Media/Baja por curso+tipo, excepción individual; impacta sesiones; a igual prioridad vence primero el plazo más cercano | Reglas de desempate exacto en implementación [I,M] |
| DP-21 Política Free/Premium | **[A] nueva** | Controlar costos IA y mantener servicio básico gratis | Free = importación + horas manuales + planificación; Premium = sugerencias y personalización | Límites de uso, precio, prueba, cobro y downgrade antes de comercializar [A/I,M] |
| DP-22 Lista de duraciones después de importar | **[A] nueva** | Ejemplo 5 PC + 2 exámenes | Siete filas editables para registrar horas de preparación/trabajo y prioridades | Revisar flujo de corrección/confirmación parcial en Figma [F] |
| DP-23 Momento de reporte de tiempo real | **[A] nueva** | Solicitud: al completar, no después del deadline | Registro opcional gratuito de fecha real y horas efectivas inmediatamente al finalizar | Aclarar correcciones y finalización parcial [I,F/M] |

| DP-24 Primer acceso y guía contextual | **[A] nueva** | Dirección UX indicada por el promotor | Registro → opción Calendar → tablero vacío; guía no bloqueante; sesión posterior abre tablero directo | Definir interacción visual y accesibilidad en Figma [F] |
| DP-25 Continuidad web/app | **[A] nueva** | Importación cómoda en web y consulta móvil | Backend y datos lógicos compartidos, login común, cambios conservados; sin imponer stack | Seguridad, resolución de conflictos y persistencia [I,M] |
| DP-26 Privacidad, conservación y eliminación de cuentas | [D] pendiente | Cuenta y Calendar implican datos personales | Registros privados, permisos separados, borrado/exportación según política aprobada | Aprobar política de retención, eliminación y cumplimiento antes de piloto [A/I,P] |
| DP-27 Horizonte y vista semanal | **[A] incorporado v6** | Se requieren límites temporales coherentes para avisos | Calcular el horizonte según §10.5.1, mostrar la semana seleccionada y navegar al resto. Una semana con sesiones muestra trabajo programado | Comprobar escenarios [A,F] |
| DP-28 Borradores y confirmación parcial | **[A] incorporado v6** | Importación parcial no debe generar plan falso ni perder trabajo | Mínimos título+tipo+fecha; curso opcional; hora fija debe confirmarse para ocupar calendario; horas pendientes no son cero | Prototipar estados y probar condiciones [A,F] |
| DP-29 Restricciones ausentes | **[A] incorporado v6** | Evitar adelanto/fragmentación no autorizados | Divisibilidad e inicio permitido requieren confirmación; ausencias conservan estado desconocido; dependencias solo declaradas | Aplicar en diseño y probar casos [A,F] |
| DP-30 Reversión y movilidad de sesiones | **[A] incorporado v6** | Nuevos bloqueos podrían invalidar plan previo | Sesión individual editada se fija; reorganización por actividad solo flexibles; deshacer revalida ocupaciones | Prototipar flujos y comprobar factibilidad [A,F/M] |
| DP-31 Reservas grupales equivalentes | **[A] incorporado v6** | Riesgo de doble ocupación y datos privados | Confirmación de hasta 3×2h tentativas; equivalencia externa explícita por intervalo, sin títulos Google | Prototipar experiencia y probar calendario [A,F/M] |
| DP-32 Finalización y progreso parcial | **[A] incorporado v6** | Examen y estudio son objetos distintos | Preparación/entrega/evaluación separadas; horas acumuladas corregibles; no autocompletar | Prototipar reglas y estados UX [A,F] |

| DP-33 Fechas académicas reprogramadas por causas externas | **[A] decisión v6** | El promotor indica que exámenes/entregas cambian por feriados u otras decisiones externas | Permitir actualizar fecha/hora manualmente o desde nueva fuente confirmada; guardar versión anterior, recalcular sin cambiar eventos externos ni inventar tiempo | Diseñar flujo y comprobar cambios adelantados/postergados [F/M] |

**Consistencia de identificadores:** los códigos `DP-01` a `DP-33` tienen el mismo significado en §10.4 y §15. Los códigos `RF-01` a `RF-28` identifican requisitos; las dependencias deben permanecer acíclicas. La dirección Free/Premium es decisión del promotor; su viabilidad económica y los detalles operativos siguen pendientes.

## 16. Trazabilidad de requisitos

| Necesidad / decisión | Evidencia o procedencia | Requisitos | Resultado verificable |
|---|---|---|---|
| Registro y sesión persistente | Decisión del promotor 30/10/2026 | RF-25/26/27 | Acceso con Google recomendado o correo; sesión activa abre tablero; datos de cuenta privados |
| Bienvenida no bloqueante y tarjetas vacías | Decisión UX aceptada 30/10/2026 | RF-19/20/26 | Calendar opcional tras registro; tablero sin actividades, navegación semanal, CTA de importación |
| Prioridades simples y desempate por fecha | Decisión del promotor 30/10/2026 | RF-12/21/22 | Alta/Media/Baja por curso+tipo y excepción; a igual nivel se prefiere vencimiento más cercano |
| Sesiones de duración adaptable | Decisión de producto para comenzar diseño | RF-08/12/21 | Bloques de 60 min por preferencia inicial, 30 mínimo y 120 máximo sugeridos; editables y sin fragmentar indivisibles |
| Continuidad navegadores y app | Decisión expresa de multiplataforma | RF-25/27; RNF-08 | Importar en web, consultar/editar en app con misma cuenta y plan confirmado |
| Subestimación y organización existente | PC1: 9/9 usan método, 7/9 subestiman | RF-06/07/10/11/17 | Demanda basada en horas declaradas o Premium, con riesgo de incertidumbre visible |
| Importación Excel/PDF gratuita | Decisión expresa del promotor v3 | RF-02/03/04/16/23/24 | Excel con cinco PC y dos exámenes genera **7 filas revisables**, sin suscripción |
| Registro manual del esfuerzo en Free | Decisión de control de costo | RF-06/07/23/24 | Usuario consigna duración de estudio por evaluación, sin IA generativa |
| Estimación sugerida Premium | Decisión freemium y tolerancia de variación v2.1 | RF-06/07/24, RNF-10/13 | Sugerencia contextual revisable, similar para casos comparables o abstención |
| Prioridad por curso + tipo con excepción individual | Decisión v3; PC1: 6/9 fecha, 4/9 nota | RF-05/09/12/14/21/22/23 | Herencia, sobrescritura y efecto real en ubicación de sesiones |
| Evaluaciones heterogéneas | PC1 + dirección de producto | RF-03/05/06/10 | Horas de preparación separadas de examen/PC fijo; grupo con deadline y 3×2 h tentativas |
| Disponibilidad sin doble ingreso | Decisión usuario y compromisos Google | RF-08/20/18 | Clases y gimnasio bloqueados con lectura consentida, sin escritura |
| Anticipación de semanas críticas | Hipótesis de valor central | RF-10/11/19 | Tarjetas con deadlines y carga por ejecución, déficit e incertidumbre |
| Bloques automáticos y recálculo Free | Decisión explícita del promotor | RF-12/13/14/21/24 | Genera/reubica sesiones internas por reglas; restricciones respetadas |
| Registro real al completar antes o después de deadline | Decisión del promotor v3 | RF-07/15/24 | Horas efectivas gratuitas, fecha final real, distintas de estimaciones |
| Personalización Premium posterior | Visión previa, beneficio aún no validado | RF-06/07/15/24 | Solo con historial comparable/suficiente; no por un único dato |
| Confiabilidad y consentimiento | Necesidad transversal | RF-16/17/18/20/24; RNF-03/04/09/11/13 | No duplicar, acceso mínimo, fallos y estado de conexión claros |
| No presentar imposibilidad como solución | Restricciones de sobrecarga | RF-09/10/11/12/21 | Déficits y conflictos visibles, sin horas inventadas |
| Cambios oficiales de fecha/hora académica | Decisión explícita 31/10/2026: feriados y motivos externos | RF-05/09/13/14/16/28 | El estudiante confirma fecha nueva; solo la vigente programa; historial conservado, sesiones recalculadas y conflictos visibles |

### Glosario breve

- **Sobrecarga estudiantil:** situación en la que el esfuerzo académico exigido puede superar la capacidad disponible del estudiante.
- **Free:** nivel que permite importación estructural Excel/PDF, duraciones manuales, prioridades, planificación automática por reglas, alertas, Google Calendar opcional y registro real sin IA generativa obligatoria.
- **Premium:** Free más sugerencia orientativa de esfuerzo desde enunciados y personalización histórica cuando exista información suficiente, sujeto a límites de uso.
- **Obligación académica:** evaluación, entrega o actividad de curso; no equivale siempre a sesión de estudio.
- **Evaluación fija:** examen o práctica calificada con fecha/hora que ocupa el calendario.
- **Preparación:** sesiones de estudio o trabajo previas a evento/entrega; su duración se declara manualmente en Free y puede sugerirse en Premium.
- **Lista de revisión de importación:** conjunto de obligaciones reconocidas tras subir Excel/PDF, editable antes de generar sesiones; muestra horas y prioridades pendientes.
- **Prioridad curso+tipo:** preferencia predeterminada que se hereda por todas las actividades de esa combinación, salvo excepción individual.
- **Prioridad individual:** valor explícito de una obligación que prevalece sobre la predeterminada; no altera una fecha oficial.
- **Estimación manual:** horas que el estudiante cree necesitar, no horas efectivamente dedicadas.
- **Sugerencia Premium inicial:** orientación no exacta derivada de contenido académico mediante procedimiento versionado, sin historial individual.
- **Sugerencia Premium personalizada:** estimación posterior basada en suficientes experiencias reales comparables del estudiante.
- **Esfuerzo operativo:** duración confirmada que utiliza el sistema para planificar; puede ser manual o sugerida y aceptada.
- **Tiempo real reportado:** horas efectivas declaradas por el estudiante cuando termina/actualiza; no se infiere del deadline ni del calendario.
- **Fecha efectiva de finalización:** fecha declarada por el estudiante en que realmente concluyó, incluso antes del vencimiento.
- **Entrega grupal:** fecha límite grupal, sin inferencia de esfuerzo individual obligatorio.
- **Reserva tentativa grupal:** 3×2 h de colaboración estimada provisionalmente para hacer visible la carga potencial; no mide trabajo personal.
- **Cuenta de usuario:** identidad registrada para usar el plan desde navegador y app; inicio con Google recomendado y alternativa de correo. No equivale a permiso de Calendar.
- **Primer acceso:** recomendación opcional de Calendar, tablero vacío y guía contextual no bloqueante; posteriores sesiones activas ingresan directamente al tablero.
- **Nivel de prioridad:** Alta, Media o Baja por curso+tipo o excepción individual; ante igualdad de nivel, el deadline más cercano se programa primero en espacios disputados.
- **Preferencia de sesión:** sugerencia inicial editable 60 min, mínimo 30 y máximo 120 min para sesiones automáticas divisibles; no aplica a indivisibles ni reservas grupales 3×2 h sin ajuste.
- **Ventana de estudio:** intervalo autorizado por el estudiante para ubicar sesiones.
- **Sesión flexible/fijada:** bloque que el sistema puede mover automáticamente si es flexible; no puede mover sin permiso si está fijado.
- **Viabilidad:** cabida de sesiones antes de plazos con restricciones conocidas; no garantía de cumplimiento efectivo.

### Fuentes y procedencia

**Documentos originales:**
1. `Proyecto_Emprendimiento_1_PC1_Versión_Final.pdf` (8 páginas), especialmente la síntesis y decisiones, pp. 6–8. Nueve entrevistas resumidas, sin transcripciones completas accesibles.
2. `proyecto-emprendimiento-solucion.pdf` (3 páginas), visión de PDF, anticipación y aprendizaje; sus afirmaciones tecnológicas/comerciales son **hipótesis**.

**Historial de conversación:** análisis de problema, investigación competitiva, síntesis de decisión y PRD original; v2 del 23/10/2026 sobre tarjetas, Google Calendar, prioridades y estimación; decisión del 30/10/2026 de integrar modelo Free/Premium, importación Excel/PDF gratuita, horas manuales Free, prioridad curso+tipo e historial al completar. La imagen ilustrativa orienta la experiencia, no es evidencia de validación con usuarios.

**Fuentes oficiales revisadas al 23/10/2026:**
- https://shovelapp.io/
- https://courses.shovelapp.io/lessons/how-auto-plan-works-in-shovel/
- https://courses.shovelapp.io/lessons/using-shovel-with-ai-assistants/
- https://help.shovelapp.io/en/tasks/create-new-tasks
- https://help.shovelapp.io/en/tasks/tracking-task-progress
- https://help.shovelapp.io/en/analytics/the-cushion
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/events
- https://developers.google.com/identity/openid-connect/openid-connect
- https://flowsavvy.app/ y https://mystudylife.com/msl-plus/

La evidencia de fabricantes confirma funciones publicadas, no resultados de pruebas independientes de su calidad ni ventaja de nuestro producto. Un prompt especializado puede producir estimaciones **aproximadamente comparables**, pero **no garantiza** estabilidad ni exactitud por sí solo; estas propiedades deben examinarse con casos repetidos y evidencia de dedicación real.

### Criterio de salida de este PRD

**Versión v6 con reglas de producto incorporadas para elaborar flujos de Figma**, sin aprobación automática del diseño visual final ni habilitación de arquitectura o implementación. El MVP propuesto integra **acceso registrado y continuo en navegador/app**, bienvenida con Calendar opcional y tablero inicialmente vacío, **Excel/PDF estructurales gratuitos**, lista editable de obligaciones y horas estimadas, prioridades heredables por curso+tipo, Google Calendar opcional en lectura, tarjetas semanales, sesiones internas automáticas por reglas y recálculo de cargas. La **estimación automática mediante IA y la personalización histórica** se ofrecen en Premium, con incertidumbre/abstención. Registrar el **tiempo efectivo al finalizar** sigue siendo gratuito y no exige esperar el deadline.

**Decisiones funcionales incorporadas para Figma:** DP-27 a DP-33, incluido cambio controlado de fechas oficiales por causas externas (RF-28). **Pendiente para revisión UX:** diseño exacto de estados y confirmaciones, no volver a decidir si se permiten cambios reales de fecha. **Decisiones abiertas antes de implementar o lanzar:** formatos reales de documentos aceptados y manejo de escaneos; mecanismo seguro de autenticación y gestión de sesiones; permisos Calendar independientes; segundo desempate residual para plazos exactamente iguales; arquitectura de persistencia y resolución de conflictos; cuotas/precio Premium; casos de prueba y consistencia de estimaciones; suficiencia del historial; retención/eliminación de datos y costos operativos. Las hipótesis de ventaja frente a Shovel y adopción comercial permanecen no demostradas. El PRD define **qué** debe observar el estudiante y qué debe cumplir el producto; Figma y arquitectura decidirán **cómo** materializarlo.
