import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchBackendCapabilities,
  setCameraStreamingEnabled,
  UNSUPPORTED_CAMERA_STREAMING_CAPABILITY,
  type CameraStreamingCapability,
} from '../utils/backendCapabilities';
import { isBackendUnavailableError } from '../utils/backendRequests';

export type CameraStreamingControlState = {
  capability: CameraStreamingCapability;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  refresh: () => Promise<CameraStreamingCapability>;
  setEnabled: (enabled: boolean, options?: { silent?: boolean }) => Promise<CameraStreamingCapability>;
  toggle: () => Promise<CameraStreamingCapability>;
};

const CAMERA_UNAVAILABLE_MESSAGE = 'Live camera controls are unavailable because Brave Paws cannot reach the server from this network.';

export function useCameraStreamingControl(): CameraStreamingControlState {
  const [capability, setCapability] = useState<CameraStreamingCapability>(UNSUPPORTED_CAMERA_STREAMING_CAPABILITY);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capabilityRef = useRef(capability);
  const refreshInFlightRef = useRef(false);

  capabilityRef.current = capability;

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return capabilityRef.current;
    }

    refreshInFlightRef.current = true;
    setIsLoading(true);

    try {
      const next = (await fetchBackendCapabilities()).cameraStreaming;
      setCapability(next);
      setError(null);
      return next;
    } catch (refreshError) {
      const message = isBackendUnavailableError(refreshError)
        ? CAMERA_UNAVAILABLE_MESSAGE
        : refreshError instanceof Error
          ? refreshError.message
          : 'Camera streaming control unavailable';
      setCapability(UNSUPPORTED_CAMERA_STREAMING_CAPABILITY);
      setError(message);
      throw refreshError;
    } finally {
      refreshInFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const setEnabled = useCallback(async (enabled: boolean, options?: { silent?: boolean }) => {
    const current = capabilityRef.current;
    if (!current.canSetEnabled) {
      return current;
    }

    setIsUpdating(true);
    try {
      const next = await setCameraStreamingEnabled(enabled);
      setCapability(next);
      setError(null);
      return next;
    } catch (updateError) {
      const message = isBackendUnavailableError(updateError)
        ? CAMERA_UNAVAILABLE_MESSAGE
        : updateError instanceof Error
          ? updateError.message
          : 'Could not update camera streaming';
      if (!options?.silent) {
        setError(message);
      }
      throw updateError;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const toggle = useCallback(async () => {
    const current = capabilityRef.current;
    return setEnabled(!(current.enabled === true));
  }, [setEnabled]);

  useEffect(() => {
    void refresh().catch(() => {
      // The dashboard can show a graceful unavailable state.
    });

    const handleResume = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      void refresh().catch(() => {
        // The dashboard can show a graceful unavailable state.
      });
    };

    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [refresh]);

  return {
    capability,
    isLoading,
    isUpdating,
    error,
    refresh,
    setEnabled,
    toggle,
  };
}
