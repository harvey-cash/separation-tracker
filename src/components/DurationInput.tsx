import React from 'react';

type Props = {
  valueSeconds: number;
  onChange: (seconds: number) => void;
  className?: string;
};

export function DurationInput({ valueSeconds, onChange, className = '' }: Props) {
  const h = Math.floor(valueSeconds / 3600);
  const m = Math.floor((valueSeconds % 3600) / 60);
  const s = valueSeconds % 60;

  const handleChange = (type: 'h' | 'm' | 's', val: string) => {
    const num = val === '' ? 0 : parseInt(val, 10);
    if (isNaN(num)) return;
    
    let newH = h;
    let newM = m;
    let newS = s;

    if (type === 'h') newH = Math.max(0, num);
    if (type === 'm') newM = Math.max(0, num);
    if (type === 's') newS = Math.max(0, num);

    onChange(newH * 3600 + newM * 60 + newS);
  };

  return (
    <div className={`flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 ${className}`}>
      <input
        type="number"
        min="0"
        value={h || ''}
        placeholder="0"
        onChange={(e) => handleChange('h', e.target.value)}
        className="w-10 text-right outline-none bg-transparent text-slate-700 font-mono"
      />
      <span className="text-slate-400 text-sm font-medium">h</span>
      
      <input
        type="number"
        min="0"
        value={m || ''}
        placeholder="0"
        onChange={(e) => handleChange('m', e.target.value)}
        className="w-10 text-right outline-none bg-transparent text-slate-700 font-mono"
      />
      <span className="text-slate-400 text-sm font-medium">m</span>
      
      <input
        type="number"
        min="0"
        value={s || ''}
        placeholder="0"
        onChange={(e) => handleChange('s', e.target.value)}
        className="w-10 text-right outline-none bg-transparent text-slate-700 font-mono"
      />
      <span className="text-slate-400 text-sm font-medium">s</span>
    </div>
  );
}
