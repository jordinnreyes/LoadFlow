function publicPage(title: string, content: string) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { max-width: 44rem; margin: 3rem auto; padding: 0 1.25rem; font: 1rem/1.65 system-ui, sans-serif; color: #e9edf6; background: #0f141c; }
    a { color: #a9c7ff; }
    h2 { margin-top: 2rem; }
  </style>
</head>
<body><main>
${content}
</main></body>
</html>`;
}

export function homePage() {
  return publicPage(
    "WiseLoad · Planificador académico",
    `  <h1>WiseLoad</h1>
  <p>WiseLoad es un planificador académico para estudiantes. Organiza tus cursos, tareas y evaluaciones, compara la carga semanal con tu tiempo disponible y planifica sesiones de estudio antes de cada entrega.</p>
  <h2>Acceso con Google</h2>
  <p>WiseLoad usa tu identidad de Google para iniciar sesión y guardar tu planificación en tu cuenta.</p>
  <h2>Conexión opcional con Google Calendar</h2>
  <p>Puedes definir tu disponibilidad manualmente o conectar Google Calendar. Con tu permiso, WiseLoad enumera tus calendarios y consulta la ocupación de los que selecciones para evitar programar estudio en esos bloques. Si activas la visualización de títulos, puedes ver los nombres de los eventos junto a tu planificación. La integración es de solo lectura.</p>
  <p><a href="/#/acceso">Entrar a WiseLoad</a></p>
  <footer><a href="/privacidad">Política de privacidad de WiseLoad</a></footer>`,
  );
}

export function privacyPage(contact: string) {
  return publicPage(
    "Política de privacidad · WiseLoad",
    `  <a href="/inicio">WiseLoad</a>
  <h1>Política de privacidad de WiseLoad</h1>
  <p>Esta política describe qué datos usa WiseLoad para ofrecer su planificador académico y cómo puedes controlar el acceso o solicitar su eliminación.</p>
  <h2>Cuenta y planificación</h2>
  <p>Al entrar con Google, Supabase procesa tu identidad y tu correo electrónico para autenticarte. WiseLoad asocia tu perfil a esa cuenta y guarda los cursos, actividades, fechas, horarios y registros de estudio que ingresas para que puedas consultar y actualizar tu planificación.</p>
  <h2>Datos de Google Calendar</h2>
  <ul>
    <li>WiseLoad lee los identificadores, nombres y zonas horarias de tus calendarios para mostrarte cuáles puedes seleccionar.</li>
    <li>Consulta y guarda los intervalos ocupados de los calendarios seleccionados para mostrar la disponibilidad y evitar solapamientos en tu planificación.</li>
    <li>Si activas los títulos, consulta los nombres y horarios de los eventos del intervalo visible para mostrarlos en el calendario. Los títulos se consultan cuando los pides y no se guardan en la base de datos de WiseLoad.</li>
  </ul>
  <p>La integración requiere tu consentimiento y es de solo lectura. WiseLoad cifra en el servidor las credenciales que permiten renovar la conexión. Puedes ocultar los títulos, cambiar la selección o desconectar Calendar desde WiseLoad. También puedes retirar el acceso desde <a href="https://myaccount.google.com/connections">las conexiones de tu cuenta de Google</a>.</p>
  <h2>Proveedores y uso de los datos</h2>
  <p>Render aloja WiseLoad y Supabase presta los servicios de autenticación y base de datos. Google verifica tu identidad y proporciona los datos de Calendar cuando autorizas la conexión. WiseLoad no vende los datos de Google ni los utiliza para publicidad.</p>
  <p>El uso y la transferencia de la información obtenida de las API de Google se ajustan a la <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Datos de Usuario de los Servicios de API de Google</a>, incluidos los requisitos de Uso Limitado.</p>
  <h2>Conservación, eliminación y contacto</h2>
  <p>WiseLoad conserva tu perfil y la planificación asociada mientras mantengas la cuenta. Desconectar Calendar detiene la sincronización. Para solicitar la eliminación de tu cuenta y sus datos asociados, incluidos los datos guardados de Calendar, o para consultas sobre privacidad, escribe a <a href="mailto:${contact}">${contact}</a>. El plazo de atención es de hasta 15 días. Las copias de seguridad bajo control de WiseLoad caducan a los siete días.</p>`,
  );
}
