# F5 · Estimaciones Premium

F5-01 a F5-03 preparan el backend local. F5-04 es la evaluación con OpenAI y requiere aprobación de la prueba y su gasto. Personalización y aceptación de sugerencias corresponden a F5-05 y F5-06.

## Derechos y consentimiento

El servidor calcula Free o Premium en `GET /api/v1/me/capabilities`. La concesión local usa el rol de migraciones, separado del runtime, con operador, motivo y vencimiento obligatorio. Se registra la revocación y se conserva la concesión anterior para auditoría. El usuario solo administra el consentimiento específico de estimación mediante `GET/PUT /api/v1/me/estimate-consent`. El PUT requiere la versión de política, ETag, clave de idempotencia, sesión, Origin y CSRF.

Ejemplo local con un ID de cuenta del piloto autorizado y un vencimiento futuro en UTC.

```powershell
& ./.local/runtime/node_modules/node/bin/node.exe --env-file=.env --import tsx scripts/backend/premium.ts grant ID_CUENTA VENCIMIENTO_ISO OPERADOR "Motivo del acceso"
```

El comando `revoke ID_CUENTA OPERADOR MOTIVO` retira Premium. La estimación manual, el tiempo real y el plan siguen disponibles desde las APIs existentes.

## Solicitud y registro de consumo

`POST /api/v1/activities/{id}/estimates` recibe un fragmento académico revisado y la revisión de actividad. Verifica propietario, acceso y consentimiento, y registra una reserva antes de llamar al adaptador. Una repetición reutiliza el resultado o la solicitud en curso. La reserva y su conciliación comparten un bloqueo de base de datos para que dos cuentas no excedan el límite configurado. El registro distingue ambientes, mes UTC, moneda, tarifa, modelo, versión del prompt, tokens, reserva y consumo estimado en microdólares.

El fragmento viaja en memoria dentro de la petición y queda separado de las instrucciones del sistema. La normalización y el filtro de correos, enlaces, números largos y claves reducen exposición obvia. La revisión humana del fragmento sigue siendo necesaria para identificar nombres u otros datos personales. El servidor numera las oraciones y exige que cada factor señale un segmento existente. Solo se persisten huella privada, factores tipados, rango y metadatos. La API no acepta archivos en esta etapa. El flujo de análisis documental deberá usar la verificación de nueva subida documentada en F3.

La espera HTTP está acotada y devuelve un recurso consultable mediante `GET /api/v1/estimates/{id}`. Una interrupción después del despacho conserva la reserva y bloquea repetir automáticamente esa misma solicitud. El operador puede conciliarla con `reconcile ID_ESTIMACION MICRODOLARES OPERADOR MOTIVO` tras verificar el consumo. Una respuesta con uso superior al techo se registra y bloquea nuevas solicitudes en ese ambiente durante el mes. El costo registrado con uso conocido se calcula conservadoramente con las tasas de la política y puede diferir del importe de la factura.

El adaptador usa Responses por REST de Node con salida estructurada, sin herramientas ni estado conversacional. La composición normal del servidor deja las estimaciones deshabilitadas. El proveedor simulado se inyecta en pruebas. La prueba de F5-04 tiene una entrada explícita separada para un corpus sintético. Referencias: [Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses), [salida estructurada](https://developers.openai.com/api/docs/guides/structured-outputs) y [controles de datos](https://developers.openai.com/api/docs/guides/your-data).

## Prueba real propuesta para aprobación

Usar un proyecto de desarrollo de OpenAI para CargaWise y la clave local `OPENAI_API_KEY`. El plan ensaya cuatro casos sintéticos con `gpt-6-luna`, un tope acumulado de USD 1 en el registro de CargaWise y una solicitud simultánea. La reserva por llamada es USD 0.525768, calculada con todo el contexto de 1 050 000 tokens, un máximo de salida de 768 y tasas superiores conservadoras para contexto largo y escritura de caché. El corpus es mucho más corto y la prueba registrará tokens, duración, rango y costo estimado. La cifra de USD 1 es un límite para la evaluación, independiente de las condiciones de facturación del proveedor. Consultar [modelo](https://developers.openai.com/api/docs/models/gpt-6-luna), [precios](https://developers.openai.com/api/docs/pricing) y [disponibilidad en Perú](https://developers.openai.com/api/docs/supported-countries).

```powershell
& ./.local/runtime/node_modules/node/bin/node.exe --import tsx scripts/backend/evaluate-estimates.ts --preview
```

Tras aprobación y configuración del secreto local, la evaluación se ejecuta con `--env-file=.env` y `--run-approved`. El script crea una cuenta local sintética y revoca su acceso al finalizar. Los casos envían solo tipo y fragmentos ficticios. La retención y el consentimiento de datos reales del piloto siguen pendientes de revisión. OpenAI puede retener registros de supervisión de abuso bajo sus controles de datos, incluso cuando se solicita `store: false`. [Guía oficial de claves](https://developers.openai.com/api/docs/guides/api-keys).

## Resultado de la evaluación inicial

El promotor autorizó hasta USD 1.50 y el evaluador conservó su tope interno de USD 1. Los primeros dos intentos del laboratorio SQL recibieron uso confirmado de OpenAI, pero la aplicación rechazó las referencias literales por no coincidir con el texto. El segundo intento confirmó la causa mediante metadatos de validación. La versión `effort-range-es-v2` reemplazó las citas de texto libre por índices de segmentos. La validación comprueba que los índices existan y que cada tipo de factor aparezca una sola vez. La relevancia de un segmento aún requiere revisión humana en una evaluación más amplia.

| Caso sintético | Estado observado | Rango | Tokens entrada / salida |
| --- | --- | --- | --- |
| Laboratorio SQL | `estimated` | 30–60 min | 415 / 133 |
| Informe corto | `estimated` | 60–120 min | 419 / 167 |
| Enunciado insuficiente | `needs_context` | — | 394 / 109 |
| Enunciado con instrucción ajena | `estimated` | 60–120 min | 423 / 188 |

El registro local calculó USD 0.001424 para los cuatro casos finales y USD 0.000731 para los dos intentos iniciales. El total conservador de USD 0.002155 utiliza las tasas de la política de CargaWise y puede diferir del importe facturado por OpenAI. La evaluación inicial acredita la integración con `gpt-6-luna` y los estados esperados de este corpus sintético. Personalización, aceptación de sugerencias y uso con datos reales del piloto conservan sus requisitos propios.

## Personalización local y confirmación de esfuerzo

La política candidata `local-d10-v1` pide tres actividades individuales propias terminadas con tiempo real positivo y confirmadas a partir de una sugerencia previa a la primera observación de tiempo o cierre. Compara por ID de curso, tipo, tamaño declarado (`small`, `medium`, `large`), modelo, versión del prompt y ambiente. Considera cierres de los últimos 180 días y hasta los cien más recientes. Usa un solo punto por actividad y toma el total real vigente aunque el usuario lo haya corregido. La mediana de las razones en escala logarítmica usa el punto medio de la sugerencia base como referencia, se atenúa con `n/(n+5)` y se limita a ±25 %. Ese punto medio sirve para calibrar y el usuario sigue eligiendo sus minutos operativos.

El historial requiere consentimiento independiente en `GET/PUT /api/v1/me/estimate-personalization-consent`. El cálculo se hace en CargaWise. OpenAI recibe el enunciado revisado y el tipo de actividad. El registro local conserva la sugerencia base y los datos agregados del ajuste. Las sugerencias sin comparables suficientes se presentan con origen `base`. Revocar el consentimiento vuelve al rango base y una confirmación que enviaba el origen anterior pide revisar el cambio. La política candidata se verifica con datos sintéticos mediante una opción interna del servicio. Su activación para cuentas del piloto requiere resolver D-10 y la política de datos de D-15.

`POST /api/v1/estimates/{id}/apply` recibe `decision` (`accept` o `correct`), `selectedMinutes` positivos y el `origin` de la sugerencia mostrada. El `If-Match` corresponde a la actividad. Aceptar exige un valor dentro del rango. Corregir permite elegir otro valor. El servidor verifica la revisión, el propietario, la autorización y el consentimiento en la misma transacción que el historial de esfuerzo. Un replay con la misma clave devuelve la misma confirmación. Los valores aceptados llevan procedencia `suggested` o `personalized` y las correcciones se registran como `corrected`. La captura manual y el tiempo real siguen disponibles mediante las APIs académicas.

Cuando existe un plan, la confirmación marca la distribución como desactualizada y encola una propuesta para revisión. El trabajo conserva el requisito de revisión hasta que el usuario aplica una distribución. Se conserva el tiempo restante explícito como dato separado del nuevo esfuerzo operativo. El flujo de la demo se conectará en F6.
