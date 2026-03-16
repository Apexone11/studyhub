param(
  [Parameter(Mandatory = $true)]
  [string]$KeyHex,
  [string]$VaultPath = "docs/project-access-vault.enc.txt",
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Convert-HexToBytes([string]$Hex) {
  $cleanHex = ($Hex -replace "\s+", "").Trim()
  if ($cleanHex.Length -ne 64) {
    throw "KeyHex must be exactly 64 hex characters (32 bytes)."
  }

  $bytes = New-Object byte[] 32
  for ($i = 0; $i -lt 32; $i += 1) {
    $bytes[$i] = [Convert]::ToByte($cleanHex.Substring($i * 2, 2), 16)
  }
  return $bytes
}

function Get-Sha256Bytes([byte[]]$InputBytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return $sha.ComputeHash($InputBytes)
  } finally {
    $sha.Dispose()
  }
}

function Get-HmacBytes([byte[]]$KeyBytes, [byte[]]$InputBytes) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256 -ArgumentList (, $KeyBytes)
  try {
    return $hmac.ComputeHash($InputBytes)
  } finally {
    $hmac.Dispose()
  }
}

$resolvedVaultPath = if ([System.IO.Path]::IsPathRooted($VaultPath)) {
  $VaultPath
} else {
  Join-Path (Get-Location) $VaultPath
}

$masterKey = Convert-HexToBytes $KeyHex
$utf8 = [System.Text.Encoding]::UTF8
$encKey = Get-Sha256Bytes ($masterKey + $utf8.GetBytes("enc"))
$macKey = Get-Sha256Bytes ($masterKey + $utf8.GetBytes("mac"))

$payload = Get-Content -Raw $resolvedVaultPath | ConvertFrom-Json
$iv = [Convert]::FromBase64String($payload.iv_b64)
$cipherBytes = [Convert]::FromBase64String($payload.ciphertext_b64)
$storedHmac = [Convert]::FromBase64String($payload.hmac_b64)
$computedHmac = Get-HmacBytes $macKey ($iv + $cipherBytes)

if ([Convert]::ToBase64String($storedHmac) -ne [Convert]::ToBase64String($computedHmac)) {
  throw "HMAC verification failed. The vault file or key is invalid."
}

$aes = New-Object System.Security.Cryptography.AesManaged
try {
  $aes.KeySize = 256
  $aes.BlockSize = 128
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $encKey
  $aes.IV = $iv

  $decryptor = $aes.CreateDecryptor()
  try {
    $plainBytes = $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)
  } finally {
    $decryptor.Dispose()
  }
} finally {
  $aes.Dispose()
}

$plainText = $utf8.GetString($plainBytes)

if ($OutputPath) {
  $resolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
  } else {
    Join-Path (Get-Location) $OutputPath
  }
  Set-Content -Path $resolvedOutputPath -Value $plainText -Encoding utf8
  Write-Output "Vault decrypted to $resolvedOutputPath"
} else {
  Write-Output $plainText
}
