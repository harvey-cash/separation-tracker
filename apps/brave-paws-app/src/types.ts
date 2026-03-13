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
  exercisedLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  anyoneHome?: string;
  notes?: string;
  completed: boolean;
};
