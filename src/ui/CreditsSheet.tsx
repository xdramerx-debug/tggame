import type { ReactElement } from 'react';
import { Sheet } from './components/Sheet';

/** Credits sheet. Every asset is generated in-repo; external CC0 entries appear here. */
export function CreditsSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): ReactElement {
  return (
    <Sheet open={open} title="Титры" onClose={onClose}>
      <div className="space-y-4 pb-4 text-sm leading-relaxed text-[#c8ccd2]">
        <section>
          <h3 className="mb-1 font-semibold text-gold">Движок и библиотеки</h3>
          <p className="text-xs text-[#9aa3ae]">
            Three.js (MIT) · React (MIT) · Rapier3D (Apache-2.0) · Zustand, Dexie, Framer Motion, Howler (MIT) ·
            @telegram-apps/sdk (MIT)
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold">Модели, текстуры, звук</h3>
          <p className="text-xs text-[#9aa3ae]">
            Все ассеты сгенерированы скриптами этого репозитория (Blender headless + Canvas2D + процедурный синтез).
            Внешних ассет-паков нет.
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold">Шрифты</h3>
          <p className="text-xs text-[#9aa3ae]">Только системные шрифты. Внешние шрифты не загружаются.</p>
        </section>
        <p className="text-[11px] text-[#5a6470]">Полный список: CREDITS.md в репозитории.</p>
      </div>
    </Sheet>
  );
}
