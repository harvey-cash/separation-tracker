$ErrorActionPreference = "Stop"
$baseDir = $PSScriptRoot
Set-Location $baseDir

Clear-Host
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Setting up Brave Paws Camera and Secure Remote Tunnel" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Ensure required binaries exist or download them
$go2rtcUrl = "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.zip"
$cloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

# 1.1 Force TLS 1.2 for GitHub downloads (prevents "connection was closed unexpectedly" errors)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-Not (Test-Path "$baseDir\go2rtc.exe")) {
    Write-Host "Downloading go2rtc (WebRTC Server)..."
    Invoke-WebRequest -Uri $go2rtcUrl -OutFile "$baseDir\go2rtc.zip"
    Expand-Archive -Path "$baseDir\go2rtc.zip" -DestinationPath "$baseDir" -Force
    Remove-Item -Path "$baseDir\go2rtc.zip"
}

if (-Not (Test-Path "$baseDir\cloudflared.exe")) {
    Write-Host "Downloading cloudflared (Secure Tunnel)..."
    Invoke-WebRequest -Uri $cloudflaredUrl -OutFile "$baseDir\cloudflared.exe"
}

# 2. Check for FFmpeg (Required for go2rtc to access the local webcam on Windows)
if (-Not (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue) -and -Not (Test-Path "$baseDir\ffmpeg.exe")) {
    Write-Host "WARNING: FFmpeg not found in system PATH." -ForegroundColor Yellow
    Write-Host "go2rtc uses FFmpeg to access the Windows default webcam." -ForegroundColor Yellow
    Write-Host "If the camera stream fails, please download FFmpeg (ffmpeg.exe) and place it in this folder." -ForegroundColor Yellow
    Write-Host ""
}

# 3. Create the minimal configuration for go2rtc
$yamlContent = @"
streams:
  camera:
    # Captures the default Windows webcam and microphone
    - ffmpeg:device?video=0&audio=0
"@
Set-Content -Path "$baseDir\go2rtc.yaml" -Value $yamlContent
Write-Host "Written default config (go2rtc.yaml)"

# 4. Clean up previous runs
Write-Host "Cleaning up old background processes..."
Stop-Process -Name "go2rtc" -ErrorAction SilentlyContinue
Stop-Process -Name "cloudflared" -ErrorAction SilentlyContinue

if (Test-Path "$baseDir\cloudflared.log") {
    Remove-Item "$baseDir\cloudflared.log" -Force
}

# 5. Start the processes
Write-Host "Starting WebRTC server..."
$go2rtcProc = Start-Process -FilePath "$baseDir\go2rtc.exe" -WindowStyle Hidden -PassThru

Write-Host "Starting Cloudflare remote tunnel..."
$cfProc = Start-Process -FilePath "$baseDir\cloudflared.exe" -ArgumentList "tunnel --url http://127.0.0.1:1984" -RedirectStandardError "$baseDir\cloudflared.log" -WindowStyle Hidden -PassThru

# 6. Extract the generated TryCloudflare URL
Write-Host "Waiting for securing public URL (this usually takes 5-15 seconds)..."
$secureUrl = $null
$timeout = 30
$elapsed = 0

while ($null -eq $secureUrl -and $elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed++
    if (Test-Path "$baseDir\cloudflared.log") {
        # Read the log safely without locking the file
        $logContent = Get-Content "$baseDir\cloudflared.log" -ErrorAction SilentlyContinue
        foreach ($line in $logContent) {
            if ($line -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
                $secureUrl = $matches[0]
                break
            }
        }
    }
}

# 7. Present the result
if ($secureUrl) {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " BRAVE PAWS CAMERA IS LIVE! " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your temporary, secure link for this session is:" -ForegroundColor White
    Write-Host ""
    Write-Host "  $secureUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Instructions:" -ForegroundColor Yellow
    Write-Host "1. Keep your laptop open and pointing at your dog's bed."
    Write-Host "2. IMPORTANT: First visit the link in your phone's browser and click 'I Agree' on the Cloudflare warning page." -ForegroundColor Red
    Write-Host "3. Open Brave Paws on your phone and start a session."
    Write-Host "4. Tap 'Link Camera' and paste the URL from above."
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Keep this window open. Close it to shut down the feed and " -ForegroundColor White
    Write-Host "destroy the secure tunnel when you return home." -ForegroundColor White
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press CTRL+C to politely stop services and exit..."
    
    try {
        # Wait indefinitely until user cancels via Ctrl+C
        while ($true) {
            Start-Sleep -Seconds 1
        }
    } finally {
        # Cleanup upon user exit
        Write-Host "Shutting down camera and closing tunnel..."
        Stop-Process -Id $cfProc.Id -ErrorAction SilentlyContinue
        Stop-Process -Id $go2rtcProc.Id -ErrorAction SilentlyContinue
        Write-Host "Goodbye!"
    }
} else {
    Write-Host "Failed to establish secure tunnel. Output from cloudflared.log:" -ForegroundColor Red
    if (Test-Path "$baseDir\cloudflared.log") {
        Get-Content "$baseDir\cloudflared.log" | Select-Object -Last 10
    }
    Start-Sleep -Seconds 10
    
    # Cleanup upon user exit
    Write-Host "Shutting down camera and closing tunnel..."
    Stop-Process -Id $cfProc.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $go2rtcProc.Id -ErrorAction SilentlyContinue
    Write-Host "Goodbye!"
}