# F0-07 · Spike Android

**Spike F0-07 probado en Samsung SM-A546E/API 36 el 04/11/2026; revisión del promotor pendiente.** Este contenedor reutiliza el build del frontend React. No implementa login Google real, Calendar, backend móvil, app completa ni distribución. Sus datos siguen siendo ficticios y locales; no proporciona identidad ni almacenamiento seguro de un producto real. Las inspecciones anteriores se conservan como historial; el resultado vigente está al final.

## Entorno y procedimiento

En la inspección inicial del 03/11/2026 no se encontraron Java, `adb` ni Gradle en PATH ni Android Studio en la ruta estándar comprobada. No se ha compilado, generado ni instalado un APK por esa inspección. Gradle se ejecutará mediante el wrapper del proyecto, no requiere una instalación global. Registrar por separado scaffolding, sync, compilación, instalación y comprobaciones.

1. Usar Node 24 fijado por el repositorio. En esta carpeta: `npm ci` y `npm run web`. El modo `android-spike` compila la demostración del frontend React directamente en `www/`, ignorado por Git.
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

## Continuación · 4 de noviembre de 2026

El promotor instaló la toolchain y eligió un Samsung A54 5G. Al no disponer de USB y no conectar aún el teléfono, indicó expresamente **por ahora solo preparar el APK**. No se emparejó ningún dispositivo ni se realizaron instalación, navegación o HTTPS desde Android. La depuración inalámbrica permite una comprobación posterior sin cable en Android 11 o superior, en la misma red y con emparejamiento autorizado: [procedimiento oficial](https://developer.android.com/studio/run/device).

Entorno localizado en este equipo: Microsoft JDK 21.0.13.0.2 en `C:\Users\Jordinn\.jdks\ms-21.0.13.0.2`; SDK en `C:\Users\Jordinn\AppData\Local\Android\Sdk`; plataforma 36, Build-Tools 36.0.0, platform-tools y emulator disponibles. Se usó Gradle wrapper 8.14.3 y AGP 8.13.0 del proyecto existente. AGP seleccionó e instaló adicionalmente Build-Tools 35.0.0 con licencia ya aceptada; esto no cambia compile/target SDK 36. JAVA_HOME/ANDROID_HOME se definen únicamente para el proceso de compilación, sin alterar la configuración global.

Comandos reproducibles desde la raíz (ajustar las rutas de JDK/SDK en otro equipo):

```powershell
$env:JAVA_HOME = 'C:\Users\Jordinn\.jdks\ms-21.0.13.0.2'
$env:ANDROID_HOME = 'C:\Users\Jordinn\AppData\Local\Android\Sdk'
& ./scripts/dev.ps1 --prefix spikes/android-capacitor run web
& ./scripts/dev.ps1 --prefix spikes/android-capacitor run sync
& ./spikes/android-capacitor/android/gradlew.bat -p spikes/android-capacitor/android assembleDebug --console=plain
```

`cap sync android` debe ejecutarse desde la carpeta del spike, como hace el script npm con `--prefix`; ejecutarlo dentro de su subcarpeta `android` no encuentra la plataforma. No repetir `cap add` ni crear otro proyecto para resolver esa ruta.

Auditoría del 04/11: 3 avisos moderados en herramientas (`glob`, `minimatch`, `rimraf`), cero altos/críticos. Diagnóstico local en `.local/android-audit-20261104.json`, no versionado. Se conserva su corrección compatible pendiente antes de validar/distribuir Android; no se modificaron las versiones npm durante la compilación. No se procesa contenido no confiable mediante esas herramientas en esta prueba local. El APK de desarrollo no equivale a un release ni cierra F0-07.

### APK generado y verificado estáticamente

`assembleDebug` terminó con **BUILD SUCCESSFUL**, 93 tareas ejecutadas en la primera compilación (7 min 21 s). La inspección encontró un bundle anterior sin uso; `prepare-web.mjs` ahora verifica la ruta absoluta y rechaza enlaces antes de limpiar exclusivamente el directorio generado www. Nuevo build web/sync y empaquetado Gradle correctos (12 s, 27 tareas ejecutadas/66 actualizadas).

- Artefacto Gradle: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Copia final local: `.local/artifacts/CargaWise-spike-debug-2026-11-04-fca8c01727d3.apk` desde la raíz del repositorio, ignorada y no subida a Git.
- Tamaño: **4.465.311 bytes**.
- SHA-256: `fca8c01727d37c4c932b2b7ddc6808588c0ca2c3cdd199afc76bbaf14cbd31c6`.
- Paquete `com.cargawise.spike`, versión 1.0/1, actividad `com.cargawise.spike.MainActivity`, mínimo API 24, compile/target API 36.
- `apksigner verify --verbose`: correcto, firma de desarrollo APK v2. No es firma de distribución.
- Inspección ZIP: los tres archivos de dist coinciden por SHA-256; solo un bundle JS; sin rutas de .env, node_modules, backend, .git, claves/keystores. Búsqueda de patrones JWT/API key en assets de texto sin coincidencias; no sustituye una auditoría exhaustiva. El frontend y sus rutas permanecen intactos.

| Comprobación T11 | Resultado al 04/11/2026 |
|---|---|
| Reutilización del frontend y build web | Correcto |
| Sincronización Capacitor Android | Correcto |
| Generación de APK debug | Correcto |
| Firma, metadatos y assets del artefacto | Correcto; inspección estática |
| Instalación y arranque en Samsung A54 5G | Correcto según prueba manual reportada por el promotor |
| Navegación/flujo y presentación del prototipo en APK | Promotor reportó flujo correcto; sin instrumentación ADB |
| Petición/respuesta HTTPS desde APK | Correcto, con variante de prueba c56bb27eab3c y evidencia correlacionada inferior |
| Identidad Google/Calendar en Android | Fuera de este spike; AM-01 pendiente |

En ese punto solo se había preparado el artefacto solicitado. Ni el esquema https de los assets de Capacitor ni un build exitoso demuestran comunicación HTTPS real desde el teléfono; la verificación física posterior se registra al final. La revisión del promotor permanece separada de las pruebas.

### Comprobaciones posteriores del 04/11

El promotor instaló el APK normal y reportó correcto el flujo demo en su Samsung A54 5G. Google/correos con perfiles ficticios corresponden al prototipo: no prueban identidad móvil real ni continuidad backend. No se exige cable ni conexión a Android Studio para reportar esa prueba manual.

Los avisos de herramientas anteriores quedaron **resueltos**: `npm audit fix --package-lock-only --ignore-scripts`, seguido de `npm ci --ignore-scripts`, terminó con **0 vulnerabilidades**. Actualizaciones compatibles: glob 14.0.3, minimatch 11.0.4 y rimraf 6.1.4; Capacitor sigue 8.6.0. `cap sync android` correcto tras la instalación. No se cambió el frontend.

Para HTTPS se preparó una variante debug opcional con un acceso separado **CargaWise HTTPS F0**. Procedimiento y límites en [https-probe/README.md](./https-probe/README.md). APK local: `.local/artifacts/CargaWise-HTTPS-F0-2026-11-04-c56bb27eab3c.apk` desde la raíz, 4.756.193 bytes, SHA-256 `c56bb27eab3c011f2d4fe3f76db1189cf8a0eebd4ff6ed7bb8a2b1164389c3ad`; firma v2 verificada. Debug `assembleDebug -PcwHttpsProbe=true` correcto en 1 min 12 s. El manifest release se procesó y comprobó sin actividad ni configuración TLS de prueba, sin generar un release.

El endpoint local pasó el smoke de PC (TLS con CA explícita, CORS y respuesta esperada; rechazo de certificado no confiable, identificador/origen/método inválidos y rutas de archivos). La ejecución posterior desde Samsung fue confirmada y correlacionada abajo. El helper no modifica navegación ni lógica de la aplicación normal, ni inicia sesión, Calendar o IA.

### T11 completada en dispositivo

Samsung A54 5G **SM-A546E**, **Android API 36**. El promotor instaló/probó manualmente el prototipo y luego actualizó a la variante HTTPS: **HTTPS correcto · HTTP 200**, petición `ffa26180-6d4e-4f61-8669-dec08f10242c` a `2026-11-04T06:27:08.712Z`. Se verificó coincidencia única en el registro local, identificador vigente, origen https://localhost y **TLS 1.3**; distinto del evento desktop-smoke. La comprobación no requirió USB, emulador o emparejamiento Android Studio. No se atribuye automatización ADB.

F0-07/T11 queda **Probado** en el alcance de viabilidad del contenedor, flujo demo y comunicación HTTPS; A0 requiere revisión del promotor y no se autoaprueba. El servidor HTTPS temporal se detiene tras la comprobación. AM-01 y la app móvil completa/distribución siguen pendientes en sus etapas. Estado vinculante y CI en PLAN §15.
