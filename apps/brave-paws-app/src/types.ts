export type StepStatus = 'pending' | 'completed' | 'aborted';

export type Step = {
  id: string;
  durationSeconds: number;
  status: StepStatus;
};

export type SessionStatus = 'pending' | 'completed' | 'aborted';
export type SessionRecordingStatus = 'idle' | 'recording' | 'completed' | 'discarded' | 'failed';

export type SessionRecording = {
  status: SessionRecordingStatus;
  sessionId: string | null;
  provider: string;
  startedAt?: string | null;
  stoppedAt?: string | null;
  hasAudio?: boolean;
  relativeFilePath?: string | null;
  downloadPath?: string | null;
  durationSeconds?: number | null;
  sizeBytes?: number | null;
  detail?: string | null;
};

export type Session = {
  id: string;
  date: string; // ISO string
  steps: Step[];
  totalDurationSeconds: number;
  anxietyScore?: 0 | 1 | 2;
  exercisedLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  anyoneHome?: string;
  notes?: string;
  status: SessionStatus;
  recording?: SessionRecording;
};
