const STREAMER_EXE_NAME = 'BravePawsStreamer.exe';

const STREAMER_DEPENDENCIES = [
  {
    name: 'go2rtc',
    fileName: 'go2rtc.exe',
    downloadUrl: 'https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.zip',
    archiveFileName: 'go2rtc.zip',
    extractedFileName: 'go2rtc.exe',
    logLabel: 'go2rtc',
  },
  {
    name: 'cloudflared',
    fileName: 'cloudflared.exe',
    downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
    logLabel: 'cloudflared',
  },
  {
    name: 'ffmpeg',
    fileName: 'ffmpeg.exe',
    downloadUrl: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
    archiveFileName: 'ffmpeg.zip',
    extractedFileName: 'ffmpeg.exe',
    checkSystemPath: true,
    logLabel: 'FFmpeg',
  },
];

const STREAMER_SUPPORT_FILES = ['README.md', 'go2rtc.yaml'];

function getPortableBundleReadmeLines(exeName = STREAMER_EXE_NAME) {
  return [
    '# Brave Paws Streamer Portable Bundle',
    '',
    'This folder contains Brave Paws Streamer as a single executable entry point.',
    '',
    '## Run',
    '',
    `1. Double-click ${exeName}.`,
    '2. Wait for the hosted Brave Paws Streamer page at https://harvey.cash/separation/streamer/ to open in your browser.',
    '',
    'On first launch, Brave Paws Streamer creates a brave-paws-streamer helper subfolder next to the executable and downloads go2rtc, cloudflared, and ffmpeg there if they are missing.',
    '',
  ];
}

module.exports = {
  STREAMER_DEPENDENCIES,
  STREAMER_EXE_NAME,
  STREAMER_SUPPORT_FILES,
  getPortableBundleReadmeLines,
};
