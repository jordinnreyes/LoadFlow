# F0-07 · Spike Android

**Pendiente de verificación Android.** Este contenedor reutiliza el build del frontend React. No implementa login Google real, Calendar, backend móvil, app completa ni distribución. Sus datos siguen siendo ficticios y locales; no proporciona identidad ni almacenamiento seguro de un producto real.

## Entorno y procedimiento

En la inspección inicial del 03/11/2026 no se encontraron Java, `adb` ni Gradle en PATH ni Android Studio en la ruta estándar comprobada. No se ha compilado, generado ni instalado un APK por esa inspección. Gradle se ejecutará mediante el wrapper del proyecto, no requiere una instalación global. Registrar por separado scaffolding, sync, compilación, instalación y comprobaciones.

1. Usar Node 24 fijado por el repositorio. En esta carpeta: `npm ci` y `npm run web`. Se compila la misma raíz y se copian assets generados a `www/`, ignorado por Git.
2. Si todavía no existe `android/`, ejecutar `npx cap add android`; después `npm run sync`. No repetir `add` sobre el proyecto generado ni crear otra copia del frontend.
3. Instalar/configurar Android Studio y SDK/JDK compatibles con Capacitor 8, siguiendo [la documentación oficial](https://capacitorjs.com/docs/getting-started/environment-setup). No fijar una compatibilidad por intuición: registrar versiones y errores. Definir `ANDROID_HOME`/SDK local en `local.properties` ignorado según la instalación; usar emulador o dispositivo autorizado.
4. Abrir `npm run open` o, desde `android/`, ejecutar `.\gradlew.bat assembleDebug` en PowerShell (`./gradlew assembleDebug` en Linux). Salida esperada solo si el build pasa: `app/build/outputs/apk/debug/app-debug.apk`. Registrar SHA-256; no confundir archivo existente con prueba de ejecución.
5. Instalar debug APK en emulador/dispositivo. Registrar versión/API Android y arrancar. Comprobar acceso demo, tablero, calendario, importación, disponibilidad, prioridades, ajustes, detalle; rutas hash, Atrás, reanudación y teclado/reflujo. Verificar acciones de datos demo, sin cuentas reales. Registrar fallos antes de modificar la UI compartida.
6. Para HTTPS, usar un endpoint simulado/de pruebas controlado y alcanzable desde Android. Registrar URL, certificado válido y respuesta real usando inspección de WebView o harness de prueba aislado. Configurar CORS restringido al origen local del contenedor si corresponde; no `*` con credenciales. No desactivar TLS, no HTTP global y no suponer que el localhost del teléfono es el PC. No se crea un hosting para esta comprobación.

Si falta toolchain/dispositivo o falla un paso, conservarlo como Pendiente/no verificado con comando y causa. No afirmar APK probado. Estas limitaciones no bloquean F1.

## Investigación de autenticación y retorno

Google deberá usar SDK nativo/mecanismo permitido, nunca una WebView propia de OAuth. Evaluar plugin con soporte de Capacitor 8, audiencia/ID token y nonce, firma de desarrollo e identificadores OAuth. No seleccionar ni instalar un plugin no evaluado ni introducir secretos Google en esta tarea. [Google Android](https://developers.google.com/identity/android-credential-manager), [política OAuth](https://developers.google.com/identity/protocols/oauth2/policies), [Supabase Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

Calendar exige autorización independiente mediante interfaz segura del SO/proveedor, estado/PKCE aplicable y retorno permitido con transacción/ticket de un solo uso. Investigar enlaces verificados y ciclo de vida; nunca refresh tokens en enlaces, logs o localStorage de WebView. Necesita almacenamiento seguro del SO validado en la etapa posterior.

**AM-01**, después de F1/F2 y cliente web de prueba, verificará esas integraciones reales, persistencia/revocación y misma cuenta/datos web. Un `cap sync` exitoso no valida plugins, Google, Calendar, HTTPS desde dispositivo ni distribución.

## Evidencia de esta ejecución

Registrar aquí únicamente comandos efectivamente ejecutados. Compilación APK, instalación, navegación en dispositivo y HTTPS desde APK permanecen **Pendiente** hasta contar con sus evidencias. No hay claves ni firma de producción.

03/11/2026: dependencias Capacitor 8.6.0 instaladas de forma aislada; `prepare-web.mjs` compiló/copia el frontend compartido; `cap add android` y `cap sync android` finalizaron correctamente. `android/gradlew.bat assembleDebug` falló antes de compilar: `JAVA_HOME is not set and no 'java' command could be found in your PATH`. No existe APK verificado. No se realizaron instalación, navegación ni HTTPS en dispositivo. No se instaló un JDK/SDK global ni se atribuye éxito a las comprobaciones pendientes.

Auditoría separada del spike: cuatro avisos moderados en la cadena de herramientas CLI (`glob`/`minimatch`/`rimraf`), sin hallazgos altos/críticos en esa consulta. No pertenecen al backend de ejecución; requieren revisión/actualización compatible y repetición de auditoría antes de validar o distribuir Android. No se aplicó `audit fix --force` ni se cambió Capacitor por otra plataforma.
