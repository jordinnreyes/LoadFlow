# F0 · HTTPS desde el APK

Control técnico opcional de debug; no es una pantalla del producto ni integra el backend. La actividad adicional extiende el mismo BridgeActivity/WebView de Capacitor. Se incluye únicamente al compilar con `-PcwHttpsProbe=true`; los source sets normales/release la excluyen. El prototipo original conserva sus pantallas y datos ficticios.

## Preparar y ejecutar

Desde la raíz, con Node 24 y JDK/SDK de desarrollo configurados:

```powershell
& ./.local/runtime/node_modules/node/bin/node.exe spikes/android-capacitor/https-probe/prepare.mjs
# Si hay varias redes, añadir --host=IP_PRIVADA_DE_LA_PC.
& ./spikes/android-capacitor/android/gradlew.bat -p spikes/android-capacitor/android assembleDebug -PcwHttpsProbe=true --console=plain
& ./.local/runtime/node_modules/node/bin/node.exe spikes/android-capacitor/https-probe/server.mjs
```

`prepare` identifica una IPv4 privada de red física (excluye WSL/Docker/VPN), o valida la indicada. Usa OpenSSL ya instalado (Git para Windows, o `CW_OPENSSL`) para emitir un certificado de dos días con SAN de la IP/localhost. Clave, config e identificador ficticio quedan en `.local/android-https`, ignorado; solo copia el certificado **público** y HTML al source set generado del helper, también ignorado. No sobrescribe .env ni instala certificados en Windows/Android. Antes de regenerar, detener el endpoint anterior y volver a compilar/reinstalar: un cambio de IP/certificado requiere un APK de prueba correspondiente.

El endpoint escucha solo en la IP privada elegida, puerto 38443. Sirve exclusivamente GET `/f0/probe` con el identificador de la prueba y OPTIONS para CORS; no sirve carpetas/APK/archivos, no lee cuentas o datos académicos. CORS restringido a `https://localhost`; sin cookies ni cabeceras de autorización. TLS mínimo 1.2 y validación de certificado permanecen activas.

El certificado público se incorpora como CA adicional mediante **debug-overrides**, que Android ignora en builds no depurables; cleartext permanece deshabilitado y no existe `onReceivedSslError.proceed` ni una aceptación general de certificados. La clave privada nunca entra al APK. [Configuración oficial de seguridad Android](https://developer.android.com/privacy-and-security/security-config). No usar este control ni su certificado como configuración productiva.

## Comprobación local y en teléfono

```powershell
& ./.local/runtime/node_modules/node/bin/node.exe spikes/android-capacitor/https-probe/smoke.mjs
```

El smoke comprueba desde PC certificado válido/respuesta/identificador, CORS, ausencia de ruta `/.env`, método/origen/identificador rechazados y fallo TLS sin confiar en la CA. Se etiqueta `desktop-smoke` en la evidencia; **no cuenta como Android**.

Para la prueba física: actualizar el APK debug en el teléfono por el mismo medio usado para instalarlo; conectar teléfono/PC a la misma Wi-Fi de confianza; dejar el servidor encendido; abrir el acceso **CargaWise HTTPS F0** y pulsar **Probar HTTPS**. Si funciona, muestra **HTTPS correcto · HTTP 200**, requestId y fecha. Contrastar ese requestId con `.local/android-https/evidence.ndjson`; registrar modelo/API que muestra el helper y el resultado manual. No se requiere cable, ADB, certificados instalados globalmente ni cuenta Google.

Si no conecta, no marcar éxito: comprobar servidor, IP, caducidad/correspondencia certificado-APK, misma red y firewall. No desactivar TLS ni el firewall. En esta preparación solo se leyeron reglas existentes de Node, sin modificarlas. La actividad informa fallos y permite reintentar; el botón de volver abre el mismo prototipo.

La variante del 04/11/2026 compiló y pasó firma/inspección estática; endpoint/smoke PC correctos. Se comprobó `:app:processReleaseMainManifest -PcwHttpsProbe=true`: sin actividad o trust de prueba; no se compiló/publicó un APK release.

**Prueba física completada:** promotor, Samsung SM-A546E/API 36, HTTP 200/requestId `ffa26180-6d4e-4f61-8669-dec08f10242c`, `2026-11-04T06:27:08.712Z`. Coincidencia única verificada contra el registro local con identificador de la prueba vigente, origen https://localhost y TLS 1.3, distinto del cliente desktop-smoke. El registro automático lo etiqueta manual-unconfirmed hasta correlacionarlo con el resultado del promotor; esa correlación queda documentada aquí. No se afirma instrumentación ADB. Se detiene el endpoint temporal al finalizar; para repetir se debe reiniciarlo y comprobar vigencia/IP del certificado-APK. T11 pasa a Probado y A0 queda sujeto a revisión del promotor. La autenticación Google/Calendar móvil sigue en AM-01.
