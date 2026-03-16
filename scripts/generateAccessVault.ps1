param(
  [string]$OutputPath = "docs/project-access-vault.enc.txt"
)

$ErrorActionPreference = "Stop"

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

function Get-HexString([byte[]]$InputBytes) {
  return (($InputBytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

$vaultPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path (Get-Location) $OutputPath
}

$plainText = @"
StudyHub Project Access Vault
Generated: $(Get-Date -Format o)
Purpose: Offline recovery and trusted-maintainer access template.

Repository:
- Root workspace: c:\Users\Abdul PC\OneDrive\Desktop\studyhub
- Frontend path: frontend/studyhub-app
- Backend path: backend
- Main docs: README.md and docs/railway-deployment-checklist.md

Fill these manually in your private copy before relying on it for recovery:
- GitHub repository URL:
- Railway project name:
- Railway frontend service:
- Railway backend service:
- Railway database service:
- Production frontend URL:
- Production backend URL:
- Production uploads volume mount:
- Admin username:
- Admin email:
- Primary maintainer:
- Backup maintainer:
- Emergency contact:
- Location of JWT secret:
- Location of database password:
- Location of SMTP credentials:
- Location of Sentry keys:
- Location of domain or DNS control:
- Last credential rotation date:

Critical recovery commands:
- docker compose up -d --build
- docker compose ps
- docker compose logs -f backend frontend db
- npm --prefix frontend/studyhub-app run build
- npm --prefix backend run load:test
- docker exec studyhub-backend-1 sh -lc "cd /app && ADMIN_USERNAME=studyhub_owner ADMIN_PASSWORD=AdminPass123 node scripts/smokeRoutes.js"

Rules:
- Never commit plaintext secrets to git.
- Use a persistent UPLOADS_DIR in production.
- If this vault key is exposed, rotate production credentials immediately.
- Re-encrypt a fresh private copy after adding real recovery values.
"@

$utf8 = [System.Text.Encoding]::UTF8
$masterKey = New-Object byte[] 32
$iv = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($masterKey)
  $rng.GetBytes($iv)
} finally {
  $rng.Dispose()
}

$encKey = Get-Sha256Bytes ($masterKey + $utf8.GetBytes("enc"))
$macKey = Get-Sha256Bytes ($masterKey + $utf8.GetBytes("mac"))
$plainBytes = $utf8.GetBytes($plainText)

$aes = New-Object System.Security.Cryptography.AesManaged
try {
  $aes.KeySize = 256
  $aes.BlockSize = 128
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $encKey
  $aes.IV = $iv

  $encryptor = $aes.CreateEncryptor()
  try {
    $cipherBytes = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
  } finally {
    $encryptor.Dispose()
  }
} finally {
  $aes.Dispose()
}

$macBytes = Get-HmacBytes $macKey ($iv + $cipherBytes)
$payload = [ordered]@{
  version = 1
  algorithm = "AES-256-CBC + HMAC-SHA256"
  createdAt = (Get-Date).ToString("o")
  iv_b64 = [Convert]::ToBase64String($iv)
  ciphertext_b64 = [Convert]::ToBase64String($cipherBytes)
  hmac_b64 = [Convert]::ToBase64String($macBytes)
}

New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($vaultPath)) | Out-Null
$payload | ConvertTo-Json -Depth 4 | Set-Content -Path $vaultPath -Encoding utf8

$stored = Get-Content -Raw $vaultPath | ConvertFrom-Json
$storedIv = [Convert]::FromBase64String($stored.iv_b64)
$storedCipher = [Convert]::FromBase64String($stored.ciphertext_b64)
$storedHmac = [Convert]::FromBase64String($stored.hmac_b64)
$checkHmac = Get-HmacBytes $macKey ($storedIv + $storedCipher)
$hmacOk = ([Convert]::ToBase64String($storedHmac) -eq [Convert]::ToBase64String($checkHmac))

$aesCheck = New-Object System.Security.Cryptography.AesManaged
try {
  $aesCheck.KeySize = 256
  $aesCheck.BlockSize = 128
  $aesCheck.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aesCheck.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aesCheck.Key = $encKey
  $aesCheck.IV = $storedIv

  $decryptor = $aesCheck.CreateDecryptor()
  try {
    $roundTripBytes = $decryptor.TransformFinalBlock($storedCipher, 0, $storedCipher.Length)
  } finally {
    $decryptor.Dispose()
  }
} finally {
  $aesCheck.Dispose()
}

$roundTripText = $utf8.GetString($roundTripBytes)
$fileHash = (Get-FileHash -Path $vaultPath -Algorithm SHA256).Hash

Write-Output "VAULT_PATH=$vaultPath"
Write-Output "VAULT_KEY_HEX=$(Get-HexString $masterKey)"
Write-Output "VAULT_SHA256=$fileHash"
Write-Output "HMAC_OK=$hmacOk"
Write-Output "ROUNDTRIP_OK=$($roundTripText -eq $plainText)"
