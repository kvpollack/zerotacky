'use client';

import {
  ClipboardCheck,
  Dumbbell,
  Settings,
  Trophy,
} from 'lucide-react';

export default function BottomNav({
  activeTab,
  roleLock,
  setActiveTab,
}) {
  return (
        <nav className="fixed bottom-0 inset-x-0 bg-zt-surface/95 backdrop-blur border-t border-zt-border z-30">
          <div className="max-w-xl mx-auto flex justify-around">
            {[
              { id: 'judge', label: 'Judge Pad', icon: ClipboardCheck, roles: ['admin', 'judge'] },
              // 10/19 (Kurt): spectators see the floor view too (read-only in PitCrew), labelled for them
              { id: 'pitcrew', label: roleLock === 'spectator' ? 'Next Up' : 'Pit Crew', icon: Dumbbell, roles: ['admin', 'pitcrew', 'judge', 'spectator'] },
              {
                id: 'standings',
                label: 'Standings',
                icon: Trophy,
                roles: ['admin', 'judge', 'pitcrew', 'spectator'],
              },
              { id: 'setup', label: 'Meet Setup', icon: Settings, roles: ['admin'] },
            ]
              .filter((tab) => tab.roles.includes(roleLock))
              .map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 transition ${
                      active
                        ? 'text-zt-primary border-t-2 border-zt-primary bg-zt-inset/60'
                        : 'text-zt-muted hover:text-zt-text-2'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-extrabold uppercase tracking-wider">
                      {label}
                    </span>
                  </button>
                );
              })}
          </div>
        </nav>
  );
}
