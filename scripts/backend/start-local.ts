import { execFileSync } from 'node:child_process';
import { assertRuntime } from '../../server/config.js';
assertRuntime();
try {
  // CLI status/start can print local credentials. Keep its output in memory, not CI logs.
  execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'start', '--yes'], {
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024,
  });
  console.log('Supabase local cargawise-f0 iniciado; credenciales omitidas. Consulta los puertos en docs/DEVELOPMENT.md.');
} catch {
  console.error('No se pudo iniciar Supabase local. Comprueba Docker Linux, conectividad de descarga y puertos 54320–54324. No se vuelca salida con credenciales.');
  process.exitCode = 1;
}
