import { ArrowLeft, ShieldCheck, Shuffle, EyeOff, TrendingUp, CalendarCheck, BarChart2 } from 'lucide-react';

type Props = {
  onBack: () => void;
};

export function InfoView({ onBack }: Props) {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between py-6">
        <button
          onClick={onBack}
          className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-serif font-bold text-slate-800">About Brave Paws</h1>
          <p className="text-sm text-slate-500 mt-1 italic">Understanding the training method.</p>
        </div>
        <div className="w-12" />
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-lg font-serif font-bold text-slate-800 mb-3">Canine Separation Anxiety</h2>
          <p className="text-slate-600 leading-relaxed">
            Separation anxiety is one of the most common behavioural problems in pet dogs. A dog with separation anxiety becomes distressed whenever it is left alone — barking, pacing, destroying furniture, or attempting to escape. The condition is not a training-obedience issue; it is an involuntary panic response that the dog cannot simply "learn to stop."
          </p>
        </div>

        <div>
          <h2 className="text-lg font-serif font-bold text-slate-800 mb-3">Gradual Desensitisation</h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            The most effective, welfare-friendly treatment is <strong>gradual desensitisation</strong> — a structured programme of planned absences designed around four key principles:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
              <div className="bg-rose-100 text-rose-500 p-2 rounded-xl shrink-0 mt-0.5">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Below threshold</p>
                <p className="text-slate-500 text-sm mt-0.5">Every departure stays short enough that the dog does not become distressed.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
              <div className="bg-rose-100 text-rose-500 p-2 rounded-xl shrink-0 mt-0.5">
                <EyeOff size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Cue-less departures</p>
                <p className="text-slate-500 text-sm mt-0.5">Remove predictable cues so the dog cannot anticipate the absence and panic in advance.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
              <div className="bg-rose-100 text-rose-500 p-2 rounded-xl shrink-0 mt-0.5">
                <Shuffle size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Randomised durations</p>
                <p className="text-slate-500 text-sm mt-0.5">Steps vary up and down so the dog never learns "it only gets worse."</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
              <div className="bg-rose-100 text-rose-500 p-2 rounded-xl shrink-0 mt-0.5">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Gradual extension</p>
                <p className="text-slate-500 text-sm mt-0.5">Maximum absence time creeps upward across sessions only when the dog stays calm.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-6">
        <h2 className="text-lg font-serif font-bold text-slate-800 mb-3">How Brave Paws Helps</h2>
        <div className="space-y-3">
          {[
            { num: '1', title: 'Plan', desc: 'Create a list of timed steps for each session (e.g. 30 s → 10 s → 1 min → 15 s → 2 min).' },
            { num: '2', title: 'Run', desc: 'A per-step countdown timer guides each departure while a stopwatch tracks total training time.' },
            { num: '3', title: 'Rate', desc: 'Record whether your dog was Calm, Coping, or Panicking, and add notes.' },
            { num: '4', title: 'Review', desc: 'Browse past sessions, chart your dog\'s progress over weeks, and export data to CSV.' },
          ].map((item) => (
            <div key={item.num} className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="bg-rose-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                {item.num}
              </div>
              <div>
                <p className="font-bold text-slate-800">{item.title}</p>
                <p className="text-slate-500 text-sm mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8">
        <h2 className="text-lg font-serif font-bold text-slate-800 mb-4">Key Principles</h2>
        <div className="space-y-3">
          {[
            { principle: 'Stay below threshold', reason: 'A single over-threshold absence can set progress back days.' },
            { principle: 'Remove departure cues', reason: 'Predictability fuels anticipation anxiety.' },
            { principle: 'Vary step durations', reason: 'Monotonically increasing times teach the dog "it only gets worse."' },
            { principle: 'Train frequently', reason: 'Short daily sessions beat long infrequent ones.' },
            { principle: 'Trust the data', reason: 'Progress can feel invisible day-to-day — the chart shows the real trend.' },
          ].map((item) => (
            <div key={item.principle} className="flex items-start gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
              <div className="bg-rose-100 text-rose-500 p-1.5 rounded-lg shrink-0 mt-0.5">
                <CalendarCheck size={16} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{item.principle}</p>
                <p className="text-slate-500 text-sm">{item.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 text-center">
        <p className="text-amber-700 text-sm font-medium italic">
          Brave Paws does not replace professional advice. If your dog's anxiety is severe, consult a certified separation-anxiety trainer (CSAT) or veterinary behaviourist.
        </p>
      </div>

      <div className="h-8" />
    </div>
  );
}
