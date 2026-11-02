// The two judge keys. GOOD LIFT is an ink fill (sport's convention: white light = good). NO LIFT is a LIGHT key,
// sheet ground with a 3 px red-pen border, red label and an X glyph, so it survives direct sun (study finding
// 10/31: a dark red fill vanishes outdoors). Neither ever takes the promoter's colour.
import React from 'react';

type KeyProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string };

export function GoodLiftKey({ label = 'Good lift', className = '', ...rest }: KeyProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`font-sheet uppercase font-bold bg-ink text-sheet rounded-none flex items-center justify-center gap-2 select-none disabled:opacity-40 ${className}`}
    >
      {label}
    </button>
  );
}

export default function NoLiftKey({ label = 'No lift', className = '', ...rest }: KeyProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`font-sheet uppercase font-bold bg-sheet text-redpen border-[3px] border-redpen rounded-none flex items-center justify-center gap-2 select-none disabled:opacity-40 ${className}`}
    >
      <span aria-hidden="true" className="text-[1.4em] leading-none font-normal">&#x2715;</span>
      {label}
    </button>
  );
}
