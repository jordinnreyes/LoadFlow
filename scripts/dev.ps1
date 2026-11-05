param([Parameter(ValueFromRemainingArguments=$true)][string[]]$NpmArguments)
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskPortable = Join-Path $taskRepo '.local/runtime/node_modules/node/bin/node.exe'
if (Test-Path -LiteralPath $taskPortable) { $taskNode = $taskPortable } else { $taskNode = (Get-Command node -ErrorAction Stop).Source }
$taskVersion = & $taskNode -p 'process.versions.node.split(".")[0]'
if ($taskVersion -ne '24') { throw 'Se requiere Node 24. Consulta .node-version y README.' }
$taskNpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$taskNpmCli = Join-Path (Split-Path -Parent $taskNpmCommand) 'node_modules/npm/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $taskNpmCli)) { throw 'No se encontró npm-cli.js junto a npm.cmd; usa una instalación estándar de Node/npm.' }
$env:Path = (Split-Path -Parent $taskNode) + ';' + $env:Path
& $taskNode $taskNpmCli @NpmArguments
exit $LASTEXITCODE
