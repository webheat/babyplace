$envFile = Join-Path $PSScriptRoot '..\.env.local'

if (-not (Test-Path $envFile)) {
  throw "env file not found: $envFile"
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) {
    return
  }
  $parts = $line.Split('=', 2)
  if ($parts.Length -ne 2) {
    return
  }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim()
  if ($name) {
    [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
