import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, ExternalLink, Keyboard, Link2, ScanLine, X } from 'lucide-react';
import { buildCameraStreamUrl, getCameraUrlValidationMessage, isCameraUrlValid, normalizeCameraUrlValue } from '../utils/cameraUrl';

type Props = {
  cameraUrl: string;
  onCameraUrlChange: (url: string) => void;
  onDone?: () => void;
  onCancel?: () => void;
  compact?: boolean;
  initialMode?: ScanMode;
};

type ScanMode = 'scan' | 'manual';

type DetectedCode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<DetectedCode[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

export function CameraLinkInput({
  cameraUrl,
  onCameraUrlChange,
  onDone,
  onCancel,
  compact = false,
  initialMode,
}: Props) {
  const [mode, setMode] = useState<ScanMode>(initialMode ?? (cameraUrl ? 'manual' : 'scan'));
  const [manualUrl, setManualUrl] = useState(cameraUrl);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedUrl, setScannedUrl] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const supportsLiveQrScan =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    getBarcodeDetector() !== null;

  useEffect(() => {
    setManualUrl(cameraUrl);
  }, [cameraUrl]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isScannerActive) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      return;
    }

    const BarcodeDetectorApi = getBarcodeDetector();

    if (!BarcodeDetectorApi) {
      setScanError('Live QR scanning is not available in this browser yet. Use manual entry instead.');
      setIsScannerActive(false);
      return;
    }

    let cancelled = false;
    let isDetecting = false;
    const detector = new BarcodeDetectorApi({ formats: ['qr_code'] });

    const scanFrame = () => {
      if (cancelled) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;

      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d');
        if (context && !isDetecting) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          isDetecting = true;

          detector
            .detect(canvas)
            .then((codes) => {
              const detected = codes.find((code) => typeof code.rawValue === 'string' && code.rawValue.trim());
              if (!detected?.rawValue) {
                return;
              }

              const nextUrl = normalizeCameraUrlValue(detected.rawValue);
              if (!nextUrl) {
                setScanError('That QR code did not contain a usable Brave Paws camera link.');
                return;
              }

              setScannedUrl(nextUrl);
              setScanError('');
              setIsScannerActive(false);
            })
            .catch(() => {
              setScanError('Unable to decode the QR code yet. Hold steady and try again.');
            })
            .finally(() => {
              isDetecting = false;
            });
        }
      }

      frameRef.current = requestAnimationFrame(scanFrame);
    };

    const startScanner = async () => {
      setIsRequestingCamera(true);
      setScanError('');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        scanFrame();
      } catch {
        setScanError('Camera access was blocked. Use manual entry or allow camera access and try again.');
        setIsScannerActive(false);
      } finally {
        setIsRequestingCamera(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isScannerActive]);

  const commitManualUrl = () => {
    const sanitized = normalizeCameraUrlValue(manualUrl);
    if (!sanitized) {
      return;
    }

    onCameraUrlChange(sanitized);
    onDone?.();
  };

  const applyScannedUrl = () => {
    if (!scannedUrl) {
      return;
    }

    onCameraUrlChange(scannedUrl);
    onDone?.();
  };

  const clearLink = () => {
    setManualUrl('');
    setScannedUrl('');
    setScanError('');
    onCameraUrlChange('');
  };

  const savedPreviewUrl = buildCameraStreamUrl(cameraUrl);
  const contentPadding = compact ? 'p-4' : 'p-5 sm:p-6';
  const descriptionClass = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${contentPadding} space-y-4`}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('scan');
            setScanError('');
          }}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'scan'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-200 hover:text-emerald-600'
          }`}
        >
          <ScanLine size={16} />
          Scan QR Code
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('manual');
            setIsScannerActive(false);
            setScanError('');
          }}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800'
          }`}
        >
          <Keyboard size={16} />
          Manual Entry
        </button>
      </div>

      {mode === 'scan' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-white p-4 border border-slate-200">
            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
              <Camera size={18} />
            </div>
            <div>
              <p className="font-medium text-slate-800">Point your phone at the QR code shown by Brave Paws Streamer.</p>
              <p className={`${descriptionClass} text-slate-500 mt-1`}>Brave Paws will save the paired stream automatically after scanning.</p>
            </div>
          </div>

          {supportsLiveQrScan ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 aspect-video relative">
                {isScannerActive ? (
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center">
                    <ScanLine size={28} />
                    <p className="font-medium">Start the camera when you're ready to scan.</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScannedUrl('');
                    setScanError('');
                    setIsScannerActive((current) => !current);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
                >
                  <ScanLine size={16} />
                  {isScannerActive ? 'Stop Scanning' : isRequestingCamera ? 'Starting Camera...' : 'Start Scanning'}
                </button>
                {onCancel && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsScannerActive(false);
                      onCancel();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800 transition-colors"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              Live QR scanning is not available in this browser yet. Use Manual Entry on this device after opening the helper link in a browser once.
            </div>
          )}

          {scanError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}

          {scannedUrl && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-start gap-2 text-emerald-700">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Stream link detected</p>
                  <p className="text-xs sm:text-sm break-all font-mono mt-1">{scannedUrl}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyScannedUrl}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  <Link2 size={16} />
                  Use This Stream
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Camera URL</label>
            <input
              type="url"
              value={manualUrl}
              onChange={(event) => setManualUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && isCameraUrlValid(manualUrl)) {
                  event.preventDefault();
                  commitManualUrl();
                }
              }}
              placeholder="https://demo.trycloudflare.com"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-700 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-mono text-sm"
            />
            <p className={`${descriptionClass} ${isCameraUrlValid(manualUrl) ? 'text-emerald-700' : 'text-slate-500'}`}>
              {getCameraUrlValidationMessage(manualUrl)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={commitManualUrl}
              disabled={!isCameraUrlValid(manualUrl)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              <Link2 size={16} />
               {onDone ? 'Use Camera URL' : 'Save Camera URL'}
            </button>
            {(manualUrl || cameraUrl) && (
              <button
                type="button"
                onClick={clearLink}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800 transition-colors"
              >
                <X size={16} />
                Clear
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800 transition-colors"
              >
                <X size={16} />
                Cancel
              </button>
            )}
          </div>

          {savedPreviewUrl && (
            <a
              href={savedPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <ExternalLink size={16} />
              Open current camera preview
            </a>
          )}
        </div>
      )}
    </div>
  );
}
