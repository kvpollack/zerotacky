'use client';
// Unsubscribe landing (042, feature gaps #10): one confirm key so a scanner prefetching the link opts nobody out.
import React from 'react';
import Link from 'next/link';
import { Cap, KeyButton, textLink } from './sheet';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = { step: 'ask' } | { step: 'busy' } | { step: 'done'; meet: string } | { step: 'error'; message: string };

export default function UnsubscribeClient({ reg, token }: { reg: string; token: string }) {
  const valid = UUID.test(reg) && UUID.test(token);
  const [state, setState] = React.useState<State>(valid ? { step: 'ask' } : { step: 'error', message: 'This link is missing its code. Open the link from the email again, or reply to the promoter and ask them to take you off the list.' });

  const confirm = async () => {
    setState({ step: 'busy' });
    try {
      const res = await fetch(`/api/unsubscribe?r=${encodeURIComponent(reg)}&t=${encodeURIComponent(token)}`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; meet?: string; error?: string };
      if (!res.ok || !j.ok) {
        setState({ step: 'error', message: /not valid|bad link/i.test(j.error ?? '') ? 'That link is not valid any more. Reply to the promoter and ask them to take you off the list.' : (j.error || `Something went wrong (${res.status}).`) });
        return;
      }
      setState({ step: 'done', meet: j.meet || 'this show' });
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[42rem]">
      <header>
        <Cap>Show emails</Cap>
        <h1 className="text-[28px] sm:text-[34px] font-bold leading-tight text-ink mt-1">
          {state.step === 'done' ? 'You are off the list' : 'Stop emails for this show?'}
        </h1>
      </header>

      {state.step === 'done' ? (
        <div className="border-2 border-rule px-5 py-5 flex flex-col gap-3 text-[15px] text-ink">
          <p>You will not get messages or reminders for <span className="font-bold">{state.meet}</span>.</p>
          <p className="text-ink-muted text-[13px]">Your registration stands. Confirmation and accepted/declined emails about it still reach you. To hear from the promoter again, ask them directly.</p>
          <p className="text-[13px]"><Link href="/shows" className={textLink}>Back to shows</Link></p>
        </div>
      ) : state.step === 'error' ? (
        <div role="alert" className="border-2 border-rule px-5 py-5 flex flex-col gap-3 text-[15px] text-ink">
          <p className="text-redpen font-bold">That did not work</p>
          <p>{state.message}</p>
          <p className="text-[13px]"><Link href="/shows" className={textLink}>Back to shows</Link></p>
        </div>
      ) : (
        <div className="border-2 border-rule px-5 py-5 flex flex-col gap-4 text-[15px] text-ink">
          <p>This stops the promoter&rsquo;s messages and the automatic reminders (one week out, the day before) for the show you registered for. Your registration stands, and emails about the registration itself still reach you.</p>
          <div className="flex flex-wrap gap-2">
            <KeyButton variant="ink" onClick={confirm} disabled={state.step === 'busy'}>{state.step === 'busy' ? 'Working\u2026' : 'Stop emails for this show'}</KeyButton>
            <Link href="/shows" className="inline-flex"><span className={textLink + ' self-center text-[13px]'}>Keep them, back to shows</span></Link>
          </div>
        </div>
      )}
    </div>
  );
}
