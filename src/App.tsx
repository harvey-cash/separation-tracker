import { useState } from 'react';
import { useSessions } from './store';
import { Session, Step } from './types';
import { Dashboard } from './components/Dashboard';
import { SessionConfig } from './components/SessionConfig';
import { ActiveSession } from './components/ActiveSession';
import { SessionComplete } from './components/SessionComplete';
import { GraphView } from './components/GraphView';
import { HistoryList } from './components/HistoryList';
import { exportToCSV, exportToHTML } from './utils/export';
import { ArrowLeft } from 'lucide-react';

type View = 'dashboard' | 'config' | 'active' | 'complete' | 'graph' | 'history';

const DEFAULT_STEPS: Step[] = [
  { id: crypto.randomUUID(), durationSeconds: 30, completed: false },
  { id: crypto.randomUUID(), durationSeconds: 10, completed: false },
  { id: crypto.randomUUID(), durationSeconds: 60, completed: false },
  { id: crypto.randomUUID(), durationSeconds: 480, completed: false },
  { id: crypto.randomUUID(), durationSeconds: 20, completed: false },
  { id: crypto.randomUUID(), durationSeconds: 45, completed: false },
];

export default function App() {
  const { sessions, addSession, updateSession, deleteSession } = useSessions();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const handleStartNew = () => {
    let initialSteps = DEFAULT_STEPS;
    
    // If there's a previous session, copy its steps
    if (sessions.length > 0) {
      const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastSession = sorted[0];
      initialSteps = lastSession.steps.map(s => ({
        ...s,
        id: crypto.randomUUID(),
        completed: false
      }));
    }

    const newSession: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      steps: initialSteps,
      totalDurationSeconds: 0,
      completed: false,
    };
    
    setActiveSession(newSession);
    setCurrentView('config');
  };

  const handleStartSession = (session: Session) => {
    setActiveSession(session);
    setCurrentView('active');
  };

  const handleCompleteSession = (session: Session) => {
    setActiveSession(session);
    setCurrentView('complete');
  };

  const handleSaveSession = (session: Session) => {
    addSession(session);
    setActiveSession(null);
    setCurrentView('dashboard');
  };

  const handleCancelSession = () => {
    if (window.confirm('Are you sure you want to cancel this session? Progress will not be saved.')) {
      setActiveSession(null);
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
          onExportCSV={() => exportToCSV(sessions)}
          onExportHTML={() => exportToHTML(sessions)}
        />
      )}

      {currentView === 'config' && activeSession && (
        <SessionConfig
          initialSession={activeSession}
          onStart={handleStartSession}
          onCancel={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'active' && activeSession && (
        <ActiveSession
          session={activeSession}
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
          />
        </div>
      )}
    </div>
  );
}
