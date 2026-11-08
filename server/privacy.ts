export function privacyPage(contact: string) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacidad · WiseLoad</title>
  <style>
    body { max-width: 44rem; margin: 3rem auto; padding: 0 1.25rem; font: 1rem/1.65 system-ui, sans-serif; color: #e9edf6; background: #0f141c; }
    a { color: #a9c7ff; }
    h2 { margin-top: 2rem; }
  </style>
</head>
<body><main>
  <a href="/">WiseLoad</a>
  <h1>Privacidad</h1>
  <p>WiseLoad te ayuda a organizar actividades académicas, revisar tu carga semanal y planificar sesiones de estudio.</p>
  <h2>Cuenta y planificación</h2>
  <p>Al iniciar sesión, Google y Supabase verifican tu identidad. WiseLoad guarda un perfil asociado a esa cuenta y los cursos, actividades, horarios y registros de estudio que ingresas. Usa estos datos para mostrar y guardar tu planificación.</p>
  <h2>Google Calendar</h2>
  <p>Si habilitas la integración y das tu consentimiento, WiseLoad lee la lista de calendarios y consulta los tramos ocupados de los calendarios que selecciones. Puedes elegir si se muestran los títulos de eventos. WiseLoad usa esta información para mostrar tu calendario y evitar que la planificación se solape con tu ocupación. El acceso es de lectura.</p>
  <p>Puedes desconectar Calendar desde Ajustes y retirar el permiso en tu cuenta de Google. WiseLoad protege las credenciales de acceso cifrándolas en el servidor.</p>
  <h2>Proveedores y contacto</h2>
  <p>Render aloja la aplicación, Supabase presta los servicios de cuenta y base de datos, y Google verifica la identidad y proporciona Calendar cuando lo conectas. WiseLoad no vende los datos de Google ni los usa para publicidad.</p>
  <p>Para consultas sobre privacidad o para solicitar la eliminación de tu cuenta y datos, escribe a <a href="mailto:${contact}">${contact}</a>. El plazo de atención es de hasta 15 días. Las copias de seguridad bajo control de WiseLoad caducan a los siete días.</p>
  <p>El uso y la transferencia de información obtenida de las API de Google se ajustan a la <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Datos de Usuario de los Servicios de API de Google</a>, incluidos los requisitos de Uso Limitado.</p>
</main></body>
</html>`;
}
