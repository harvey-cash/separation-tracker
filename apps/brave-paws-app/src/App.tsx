import { useState, useEffect, useCallback } from 'react';
import { useSessions } from './store';
import { Session, Step } from './types';
import { Dashboard } from './components/Dashboard';
import { SessionConfig } from './components/SessionConfig';
import { ActiveSession } from './components/ActiveSession';
import { SessionComplete } from './components/SessionComplete';
import { GraphView } from './components/GraphView';
import { HistoryList } from './components/HistoryList';
import { SessionView } from './components/SessionView';
import { InfoView } from './components/InfoView';
import { StorageSync } from './components/StorageSync';
import { useStorageSync } from './hooks/useStorageSync';
import { exportToCSV, parseCSV } from './utils/export';
import { CAMERA_URL_STORAGE_KEY, getCameraUrlFromSearch } from './utils/cameraUrl';
import { installGlobalClientDiagnostics } from './utils/clientDiagnostics';
import {
  ActiveSessionState,
  clearActiveSessionState,
  createActiveSessionState,
  loadActiveSessionState,
  saveActiveSessionState,
} from './utils/activeSessionStorage';
import { ArrowLeft } from 'lucide-react';

type View = 'dashboard' | 'config' | 'active' | 'complete' | 'graph' | 'history' | 'session-view' | 'info';

const DEFAULT_STEPS: Step[] = [
  { id: crypto.randomUUID(), durationSeconds: 30, status: 'pending' },
  { id: crypto.randomUUID(), durationSeconds: 10, status: 'pending' },
  { id: crypto.randomUUID(), durationSeconds: 60, status: 'pending' },
  { id: crypto.randomUUID(), durationSeconds: 480, status: 'pending' },
  { id: crypto.randomUUID(), durationSeconds: 20, status: 'pending' },
  { id: crypto.randomUUID(), durationSeconds: 45, status: 'pending' },
];

export default function App() {
  const { sessions, addSession, updateSession, deleteSession, replaceSessions, upsertSessions } = useSessions();
  const [restoredActiveSessionState] = useState<ActiveSessionState | null>(() => loadActiveSessionState());
  const [currentView, setCurrentView] = useState<View>(restoredActiveSessionState ? 'active' : 'dashboard');
  const [previousView, setPreviousView] = useState<View>('dashboard');
  const [activeSession, setActiveSession] = useState<Session | null>(restoredActiveSessionState?.session ?? null);
  const [activeSessionState, setActiveSessionState] = useState<ActiveSessionState | null>(restoredActiveSessionState);
  const [cameraUrl, setCameraUrl] = useState(() => getCameraUrlFromSearch(window.location.search) || localStorage.getItem(CAMERA_URL_STORAGE_KEY) || '');

  useEffect(() => {
    installGlobalClientDiagnostics();

    const pairedCameraUrl = getCameraUrlFromSearch(window.location.search);
    if (!pairedCameraUrl) {
      return;
    }

    setCameraUrl((currentUrl) => (currentUrl === pairedCameraUrl ? currentUrl : pairedCameraUrl));

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('cameraUrl');
    currentUrl.searchParams.delete('cameraProfile');
    currentUrl.searchParams.delete('cameraMode');
    window.history.replaceState({}, document.title, currentUrl.toString());
  }, []);

  // Keep cameraUrl in sync with local storage
  useEffect(() => {
    localStorage.setItem(CAMERA_URL_STORAGE_KEY, cameraUrl);
  }, [cameraUrl]);

  useEffect(() => {
    if (activeSessionState) {
      saveActiveSessionState(activeSessionState);
      return;
    }

    clearActiveSessionState();
  }, [activeSessionState]);

  const handleImportSessions = useCallback((imported: Session[]) => {
    replaceSessions(imported);
  }, [replaceSessions]);

  const storageSync = useStorageSync(sessions, handleImportSessions);

  const handleStartNew = () => {
    let initialSteps = DEFAULT_STEPS;
    
    // If there's a previous session, copy its steps
    if (sessions.length > 0) {
      const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastSession = sorted[0];
      initialSteps = lastSession.steps.map(s => ({
        ...s,
        id: crypto.randomUUID(),
        status: 'pending',
      }));
    }

    const newSession: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      steps: initialSteps,
      totalDurationSeconds: 0,
      status: 'pending',
    };
    
    setActiveSession(newSession);
    setActiveSessionState(null);
    setCurrentView('config');
  };

  const handleStartSession = (session: Session) => {
    setActiveSession(session);
    setActiveSessionState(createActiveSessionState(session));
    setCurrentView('active');
  };

  const handleCompleteSession = (session: Session) => {
    setActiveSession(session);
    setActiveSessionState(null);
    setCurrentView('complete');
  };

  const handleSaveSession = (session: Session) => {
    addSession(session);
    setActiveSession(null);
    setActiveSessionState(null);
    setCurrentView('dashboard');
  };

  const handleCancelSession = () => {
    if (window.confirm('Are you sure you want to cancel this session? Progress will not be saved.')) {
      setActiveSession(null);
      setActiveSessionState(null);
      setCurrentView('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {currentView === 'dashboard' && (
        <Dashboard
          sessions={sessions}
          onStartNew={handleStartNew}
          onViewGraph={() => setCurrentView('graph')}
          onViewHistory={() => setCurrentView('history')}
          onViewInfo={() => setCurrentView('info')}
          onViewSession={(session) => {
            setActiveSession(session);
            setPreviousView('dashboard');
            setCurrentView('session-view');
          }}
          storageSync={
            <StorageSync
              provider={storageSync.provider}
            />
          }
        />
      )}

      {currentView === 'config' && activeSession && (
        <SessionConfig
          initialSession={activeSession}
          cameraUrl={cameraUrl}
          onCameraUrlChange={setCameraUrl}
          onStart={handleStartSession}
          onCancel={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'active' && activeSession && (
        <ActiveSession
          session={activeSession}
          initialState={activeSessionState ?? undefined}
          cameraUrl={cameraUrl}
          onCameraUrlChange={setCameraUrl}
          onStateChange={setActiveSessionState}
          onCompleteSession={handleCompleteSession}
          onCancel={handleCancelSession}
        />
      )}

      {currentView === 'complete' && activeSession && (
        <SessionComplete
          session={activeSession}
          onSave={handleSaveSession}
        />
      )}

      {currentView === 'graph' && (
        <GraphView
          sessions={sessions}
          onBack={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'history' && (
        <div className="max-w-3xl mx-auto p-4 space-y-6">
          <header className="flex items-center justify-between py-4">
            <button
              onClick={() => setCurrentView('dashboard')}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold text-slate-800">History</h1>
            <div className="w-10" />
          </header>
          <HistoryList
            sessions={sessions}
            onDelete={deleteSession}
            onEdit={updateSession}
            onAddHistorical={addSession}
            onExportCSV={() => exportToCSV(sessions)}
            onImportCSV={(csvContent) => {
              const importedSessions = parseCSV(csvContent);
              upsertSessions(importedSessions);
            }}
            onViewSession={(session) => {
              setActiveSession(session);
              setPreviousView('history');
              setCurrentView('session-view');
            }}
          />
        </div>
      )}

      {currentView === 'session-view' && activeSession && (
        <SessionView
          session={activeSession}
          allSessions={sessions}
          onBack={() => {
            setActiveSession(null);
            setCurrentView(previousView);
          }}
          onNavigate={(session) => setActiveSession(session)}
          onSave={(updatedSession) => {
            updateSession(updatedSession);
            setActiveSession(updatedSession);
          }}
        />
      )}

      {currentView === 'info' && (
        <InfoView onBack={() => setCurrentView('dashboard')} />
      )}
    </div>
  );
}
