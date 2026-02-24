export type Step = {
  id: string;
  durationSeconds: number;
  completed: boolean;
};

export type Session = {
  id: string;
  date: string; // ISO string
  steps: Step[];
  totalDurationSeconds: number;
  anxietyScore?: 0 | 1 | 2;
  notes?: string;
  completed: boolean;
};
