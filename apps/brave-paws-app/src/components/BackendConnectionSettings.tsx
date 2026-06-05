import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Server, Wifi } from 'lucide-react';
import {
  clearStoredBackendRootUrl,
  getApiBaseUrlForBackendRoot,
  getDefaultCameraUrlForBackendRoot,
  getDeploymentApiBaseUrl,
  getDeploymentDefaultCameraUrl,
  normalizeBackendRootUrl,
  saveStoredBackendRootUrl,
} from '../config';

type Props = {
  currentBackendRootUrl: string | null;
  isBackendAvailable: boolean;
  onBackendRootUrlChange: (backendRootUrl: string | null) => void;
  onBackendVersionChange?: (backendVersion: string | null) => void;
};

type ConnectionStatus = 'idle' | 'testing' | 'saved' | 'error';

export function BackendConnectionSettings({
  currentBackendRootUrl,
  isBackendAvailable,
  onBackendRootUrlChange,
  onBackendVersionChange,
}: Props) {
  const [draftValue, setDraftValue] = useState(currentBackendRootUrl || '');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraftValue(currentBackendRootUrl || '');

    if (!currentBackendRootUrl) {
      setStatus('idle');
      setMessage('');
    }
  }, [currentBackendRootUrl]);

  const normalizedDraftValue = normalizeBackendRootUrl(draftValue);
  const previewBackendRoot = normalizedDraftValue || currentBackendRootUrl || '';
  const previewApiBaseUrl = previewBackendRoot ? getApiBaseUrlForBackendRoot(previewBackendRoot) : getDeploymentApiBaseUrl();
  const previewCameraUrl = previewBackendRoot ? getDefaultCameraUrlForBackendRoot(previewBackendRoot) : getDeploymentDefaultCameraUrl();
  const deploymentHint = useMemo(() => getDeploymentApiBaseUrl(), []);
  const needsFirstRunSetup = !currentBackendRootUrl && !isBackendAvailable;

  const handleTestAndSave = async () => {
    const normalized = normalizeBackendRootUrl(draftValue);
    if (!normalized) {
      setStatus('error');
      setMessage('Enter a full backend root like https://backend.example.com:7447');
      return;
    }

    setStatus('testing');
    setMessage('Testing the backend connection…');

    try {
      const healthUrl = new URL('health', getApiBaseUrlForBackendRoot(normalized)).toString();
      const response = await fetch(healthUrl);
      if (!response.ok) {
        throw new Error(`Backend health check failed (${response.status})`);
      }

      const healthPayload = await response.json() as { version?: string };
      onBackendVersionChange?.(typeof healthPayload.version === 'string' && healthPayload.version ? healthPayload.version : null);

      const saved = saveStoredBackendRootUrl(normalized);
      onBackendRootUrlChange(saved);
      setDraftValue(saved || normalized);
      setStatus('saved');
      setMessage('Connected. Brave Paws will keep using this backend in this browser.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not reach that backend.');
    }
  };

  const handleReset = () => {
    clearStoredBackendRootUrl();
    onBackendRootUrlChange(null);
    onBackendVersionChange?.(null);
    setDraftValue('');
    setStatus('idle');
    setMessage('Reset to the deployment default backend.');
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-sky-100 p-2.5 text-sky-600">
          <Wifi size={18} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Backend connection</h3>
          <p className="mt-1 text-xs text-slate-500">
            If this deployment can already see its backend, you can keep the default. For a separately hosted frontend,
            save your backend root once and Brave Paws will derive the API and suggested camera link from it.
          </p>
        </div>
      </div>

      {needsFirstRunSetup && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Connect to your Brave Paws backend</p>
            <p className="mt-1 text-xs text-amber-800">
              This frontend cannot see a same-origin backend right now. Enter your backend root URL to point this app at the server you want to use.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="backend-root-url" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Backend server URL
        </label>
        <input
          id="backend-root-url"
          type="url"
          value={draftValue}
          disabled={status === 'testing'}
          onChange={(event) => {
            setDraftValue(event.target.value);
            if (status !== 'testing') {
              setStatus('idle');
              setMessage('');
            }
          }}
          placeholder="https://backend.example.com:7447"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="text-xs text-slate-500">
          Current deployment default: <span className="font-mono text-[11px] text-slate-600">{deploymentHint}</span>
        </p>
      </div>

      <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">API base</p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{previewApiBaseUrl}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Suggested camera link</p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{previewCameraUrl}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleTestAndSave()}
          disabled={status === 'testing'}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {status === 'testing' ? <Loader2 size={15} className="animate-spin" /> : <Server size={15} />}
          Test &amp; Save
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={status === 'testing'}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw size={15} />
          Reset to deployment default
        </button>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${
            status === 'saved'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : status === 'error'
                ? 'border border-red-200 bg-red-50 text-red-700'
                : 'border border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {status === 'saved' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : status === 'error' ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
          )}
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
