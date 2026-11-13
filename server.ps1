$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $PSScriptRoot).Path
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse('127.0.0.1'), 4173)
$listener.Start()
Write-Host "TrendCad Solid: http://127.0.0.1:4173"

function Get-ContentType([string]$extension) {
  switch ($extension.ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8'; break }
    '.js' { 'text/javascript; charset=utf-8'; break }
    '.css' { 'text/css; charset=utf-8'; break }
    '.wasm' { 'application/wasm'; break }
    '.dxf' { 'application/dxf'; break }
    default { 'application/octet-stream' }
  }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    try {
      $buffer = New-Object byte[] 8192
      $read = $stream.Read($buffer, 0, $buffer.Length)
      $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $read)
      $target = (($request -split "`r?`n")[0] -split ' ')[1]
      $pathOnly = ($target -split '\?')[0]
      $relative = [Uri]::UnescapeDataString($pathOnly.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $root ($relative -replace '/', '\')))
      if (-not $candidate.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        $header = "HTTP/1.1 403 Forbidden`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
        $stream.Write([Text.Encoding]::ASCII.GetBytes($header), 0, $header.Length)
        $client.Close()
        continue
      }
      if (-not [System.IO.File]::Exists($candidate)) {
        $header = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
        $stream.Write([Text.Encoding]::ASCII.GetBytes($header), 0, $header.Length)
        $client.Close()
        continue
      }
      $bytes = [System.IO.File]::ReadAllBytes($candidate)
      $contentType = Get-ContentType ([System.IO.Path]::GetExtension($candidate))
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)
      $client.Close()
    } catch {
      try { $client.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
