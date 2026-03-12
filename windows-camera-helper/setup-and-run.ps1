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

$ffmpegCmd = "ffmpeg"
if (Test-Path "$baseDir\ffmpeg.exe") {
    $ffmpegCmd = "$baseDir\ffmpeg.exe"
}

# Fix encoding issues for devices with trademarks/symbols in their name (like "Intel®")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$videoDevices = @()
$audioDevices = @()

if (Get-Command $ffmpegCmd -ErrorAction SilentlyContinue) {
    Write-Host "Scanning for available cameras and microphones..." -ForegroundColor Cyan
    $output = cmd.exe /c "`"$ffmpegCmd`" -list_devices true -f dshow -i dummy 2>&1"
    $currentType = "none"

    foreach ($line in $output) {
        if ($line -match "DirectShow video devices") { 
            $currentType = "video" 
        } elseif ($line -match "DirectShow audio devices") { 
            $currentType = "audio" 
        } elseif ($line -match '\]\s*"([^"]+)" \((video|audio)\)') {
            $name = $matches[1]
            if ($matches[2] -eq "video") { $videoDevices += $name }
            if ($matches[2] -eq "audio") { $audioDevices += $name }
        } elseif ($line -match '\]\s*"([^"]+)"' -and $line -notmatch "Alternative name") {
            $name = $matches[1]
            if ($currentType -eq "video") { $videoDevices += $name }
            if ($currentType -eq "audio") { $audioDevices += $name }
        }
    }
}

$selectedVideo = "0"
$selectedAudio = "0"

if ($videoDevices.Length -gt 0) {
    Write-Host "`nAvailable Video Devices:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $videoDevices.Length; $i++) {
        Write-Host "  $($i + 1). $($videoDevices[$i])"
    }
    $vIndex = Read-Host "Select Video Device (1-$($videoDevices.Length)) [Default: 1]"
    if ([string]::IsNullOrWhiteSpace($vIndex)) { $vIndex = 1 }
    $vIndex = [int]$vIndex - 1
    if ($vIndex -ge 0 -and $vIndex -lt $videoDevices.Length) {
        $selectedVideo = $videoDevices[$vIndex]
    }
}

if ($audioDevices.Length -gt 0) {
    Write-Host "`nAvailable Audio Devices:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $audioDevices.Length; $i++) {
        Write-Host "  $($i + 1). $($audioDevices[$i])"
    }
    $aIndex = Read-Host "Select Audio Device (1-$($audioDevices.Length)) [Default: 1]"
    if ([string]::IsNullOrWhiteSpace($aIndex)) { $aIndex = 1 }
    $aIndex = [int]$aIndex - 1
    if ($aIndex -ge 0 -and $aIndex -lt $audioDevices.Length) {
        $selectedAudio = $audioDevices[$aIndex]
    }
}

# 3. Create the minimal configuration for go2rtc
$yamlContent = @"
streams:
  camera:
    # Captures the selected Windows webcam and microphone, transcoded to H.264 so MSE can play it
    # We use software encoding because hardware encoding (NVENC/AMF) can fail on some systems depending on driver/GPU support
    - "ffmpeg:device?video=$selectedVideo&audio=$selectedAudio#video=h264#audio=aac"
"@
Set-Content -Path "$baseDir\go2rtc.yaml" -Value $yamlContent -Encoding UTF8
Write-Host "`nWritten default config (go2rtc.yaml)"
Write-Host "Selected Video: $selectedVideo"
Write-Host "Selected Audio: $selectedAudio`n"


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