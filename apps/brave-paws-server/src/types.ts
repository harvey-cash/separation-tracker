export type StepStatus = 'pending' | 'completed' | 'aborted';

export type Step = {
  id: string;
  durationSeconds: number;
  actualDurationSeconds?: number | null;
  status: StepStatus;
};

export type SessionStatus = 'pending' | 'completed' | 'aborted';
export type SessionRecordingStatus = 'idle' | 'recording' | 'completed' | 'discarded' | 'failed';

export type SessionTimelineEventType =
  | 'session_started'
  | 'session_paused'
  | 'session_resumed'
  | 'session_finished'
  | 'session_cancelled'
  | 'step_started'
  | 'step_paused'
  | 'step_resumed'
  | 'step_completed'
  | 'step_aborted';

export type SessionTimelineEvent = {
  sequence: number;
  type: SessionTimelineEventType;
  occurredAt: string;
  sessionElapsedSeconds: number;
  sessionRunning: boolean;
  currentStepIndex: number | null;
  stepId: string | null;
  stepStatus: StepStatus | null;
  stepRunning: boolean;
  stepElapsedSeconds: number | null;
  stepDurationSeconds: number | null;
};

export type SessionRecording = {
  status: SessionRecordingStatus;
  sessionId: string | null;
  provider: string;
  startedAt?: string | null;
  stoppedAt?: string | null;
  hasAudio?: boolean;
  relativeFilePath?: string | null;
  downloadPath?: string | null;
  metadataRelativeFilePath?: string | null;
  metadataDownloadPath?: string | null;
  durationSeconds?: number | null;
  sizeBytes?: number | null;
  chapterCount?: number | null;
  chaptersEmbedded?: boolean | null;
  detail?: string | null;
};

export type Session = {
  id: string;
  date: string;
  steps: Step[];
  totalDurationSeconds: number;
  anxietyScore?: 0 | 1 | 2;
  exercisedLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  anyoneHome?: string;
  notes?: string;
  status: SessionStatus;
  recording?: SessionRecording;
};
