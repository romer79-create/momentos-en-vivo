# Legacy PowerShell entry point. When scripts are disabled, run directly:
# node "D:\momentos en vivo\scripts\configure-mail.cjs"
# Never paste the password in chat, command arguments or Git.
$ErrorActionPreference = 'Stop'
if ([Console]::IsInputRedirected) { throw 'Abri este script en una terminal interactiva para ingresar la clave de forma oculta.' }
$taskRoot = Split-Path -Parent $PSScriptRoot
Write-Host 'Momentos en Vivo - correo de Sylar.soluciones'
Write-Host 'Cuenta: sylar.soluciones@gmail.com. Proyecto: momentos-en-vivo.'
Write-Host 'Usa una contrasena de aplicacion de Google, no la contrasena principal.'
Write-Host 'Este paso solo guarda el secreto; no publica ni envia correos.'
Push-Location -LiteralPath $taskRoot
try {
  $mailSecret = Read-Host 'Pega la contrasena de aplicacion de 16 caracteres y presiona Enter (ingreso oculto)' -AsSecureString
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mailSecret)
  $secretProcess = $null
  try {
    $secretValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) -replace '\s', ''
    if ($secretValue -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Se esperan los 16 caracteres de la contrasena de aplicacion de Google.' }
    $firebaseScript = Join-Path $taskRoot 'node_modules/firebase-tools/lib/bin/firebase.js'
    $redactionScript = Join-Path $PSScriptRoot 'secret-log-redaction.cjs'
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $startInfo.Arguments = '--require "{0}" "{1}" functions:secrets:set SMTP_PASSWORD --data-file - --non-interactive --project momentos-en-vivo --account sylar.soluciones@gmail.com' -f $redactionScript, $firebaseScript
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $secretProcess = [System.Diagnostics.Process]::Start($startInfo)
    # Only the pipe carries the secret: never command arguments, files or logs.
    $secretProcess.StandardInput.Write($secretValue)
    $secretProcess.StandardInput.Close()
    $secretValue = $null
    $secretProcess.WaitForExit()
    if ($secretProcess.ExitCode -ne 0) { throw 'No se pudo guardar el secreto. No se habilitaron los correos.' }
  } finally {
    $secretValue = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $mailSecret.Dispose()
    if ($secretProcess) { $secretProcess.Dispose() }
  }
  Write-Host 'Secreto guardado. Falta comprobar el envio antes de habilitarlo en produccion.'
} finally { Pop-Location }
