import type { ReactElement } from 'react';
import { Sheet } from './components/Sheet';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ButtonScale, Handedness, QualityPreference } from '@/store/useSettingsStore';
import { hapticSelection } from '@/telegram/haptic';
import { gameHost } from '@/game/GameHost';
import { useGameStore } from '@/store/useGameStore';
import { QUALITY_PRESETS } from '@/game/core/Quality';
import { audio } from '@/game/audio';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
}): ReactElement {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`hud-panel min-h-[48px] flex-1 px-2 text-sm ${
              active ? 'border-gold text-gold' : 'border-white/10 text-[#9aa3ae]'
            }`}
            onPointerDown={() => hapticSelection()}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({ title, children, hint }: { readonly title: string; readonly hint?: string; readonly children: ReactElement }): ReactElement {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-[#e8e3d6]">{title}</h3>
        {hint ? <span className="text-xs text-[#9aa3ae]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Settings sheet — every control is ≥48 px and uses PointerEvents (no hover states). */
export function SettingsSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): ReactElement {
  const settings = useSettingsStore();
  const setQuality = useGameStore((state) => state.setQuality);

  const changeQuality = (quality: QualityPreference): void => {
    settings.setQuality(quality);
    hapticSelection();
    if (quality !== 'auto') {
      gameHost.setQuality(quality);
      setQuality(quality);
    }
  };

  return (
    <Sheet open={open} title="Настройки" onClose={onClose}>
      <div className="pb-2">
        <Row title="Качество графики" hint={settings.quality === 'auto' ? 'авто по FPS' : QUALITY_PRESETS[settings.quality].label}>
          <Segmented<QualityPreference>
            label="Качество"
            value={settings.quality}
            onChange={changeQuality}
            options={[
              { value: 'auto', label: 'Авто' },
              { value: 'high', label: 'Высокое' },
              { value: 'medium', label: 'Среднее' },
              { value: 'low', label: 'Низкое' },
            ]}
          />
        </Row>

        <Row title="Чувствительность камеры" hint={`${settings.cameraSensitivity.toFixed(2)}°/px`}>
          <input
            type="range"
            min={0.1}
            max={0.5}
            step={0.05}
            value={settings.cameraSensitivity}
            onChange={(event) => settings.setCameraSensitivity(Number(event.target.value))}
            onPointerDown={() => hapticSelection()}
            className="h-12 w-full accent-[#c9a227]"
            aria-label="Чувствительность камеры"
          />
        </Row>

        <Row title="Размер кнопок">
          <Segmented<ButtonScale>
            label="Размер кнопок"
            value={settings.buttonScale}
            onChange={(value) => {
              settings.setButtonScale(value);
              hapticSelection();
            }}
            options={[
              { value: 'S', label: 'S' },
              { value: 'M', label: 'M' },
              { value: 'L', label: 'L' },
            ]}
          />
        </Row>

        <Row title="Расположение HUD">
          <Segmented<Handedness>
            label="Расположение HUD"
            value={settings.handedness}
            onChange={(value) => {
              settings.setHandedness(value);
              hapticSelection();
            }}
            options={[
              { value: 'right', label: 'Правша' },
              { value: 'left', label: 'Левша' },
            ]}
          />
        </Row>

        <Row title="Тап по камере = быстрый удар" hint={settings.autoAttack ? 'вкл' : 'выкл'}>
          <button
            type="button"
            aria-pressed={settings.autoAttack}
            className={`hud-panel min-h-[48px] px-4 text-sm ${
              settings.autoAttack ? 'border-gold text-gold' : 'border-white/10 text-[#9aa3ae]'
            }`}
            onPointerDown={() => hapticSelection()}
            onClick={() => settings.setAutoAttack(!settings.autoAttack)}
          >
            {settings.autoAttack ? 'Включено' : 'Выключено'}
          </button>
        </Row>

        <Row title="Звук" hint={settings.soundEnabled ? 'вкл' : 'выкл'}>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              aria-pressed={settings.soundEnabled}
              className={`hud-panel min-h-[48px] px-4 text-sm ${
                settings.soundEnabled ? 'border-gold text-gold' : 'border-white/10 text-[#9aa3ae]'
              }`}
              onPointerDown={() => hapticSelection()}
              onClick={() => {
                settings.setSoundEnabled(!settings.soundEnabled);
                // A confirmation blip after enabling proves the mixer is alive.
                if (!settings.soundEnabled) audio.playSound('ui', { force: true });
                hapticSelection();
              }}
            >
              {settings.soundEnabled ? 'Включён' : 'Выключен'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              disabled={!settings.soundEnabled}
              onPointerUp={() => audio.playSound('hit', { force: true })}
              onChange={(event) => settings.setSfxVolume(Number(event.target.value))}
              className="h-12 w-full accent-[#c9a227] disabled:opacity-40"
              aria-label="Громкость эффектов"
            />
            <span className="text-xs text-[#9aa3ae]">Эффекты: {Math.round(settings.sfxVolume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              disabled={!settings.soundEnabled}
              onChange={(event) => settings.setMusicVolume(Number(event.target.value))}
              className="h-12 w-full accent-[#c9a227] disabled:opacity-40"
              aria-label="Громкость атмосферы"
            />
            <span className="text-xs text-[#9aa3ae]">Атмосфера: {Math.round(settings.musicVolume * 100)}%</span>
          </div>
        </Row>

        <Row title="Прозрачность HUD" hint={`${Math.round(settings.hudOpacity * 100)}%`}>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={settings.hudOpacity}
            onChange={(event) => settings.setHudOpacity(Number(event.target.value))}
            onPointerDown={() => hapticSelection()}
            className="h-12 w-full accent-[#c9a227]"
            aria-label="Прозрачность HUD"
          />
        </Row>

        <Row title="Виброотклик" hint={settings.hapticsEnabled ? `${Math.round(settings.hapticIntensity * 100)}%` : 'выкл'}>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              aria-pressed={settings.hapticsEnabled}
              className={`hud-panel min-h-[48px] px-4 text-sm ${
                settings.hapticsEnabled ? 'border-gold text-gold' : 'border-white/10 text-[#9aa3ae]'
              }`}
              onPointerDown={() => hapticSelection()}
              onClick={() => settings.setHapticsEnabled(!settings.hapticsEnabled)}
            >
              {settings.hapticsEnabled ? 'Включён' : 'Выключен'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={settings.hapticIntensity}
              disabled={!settings.hapticsEnabled}
              onChange={(event) => settings.setHapticIntensity(Number(event.target.value))}
              className="h-10 w-full accent-[#c9a227] disabled:opacity-40"
              aria-label="Интенсивность вибрации"
            />
          </div>
        </Row>

        <Row title="Инверсия камеры по Y">
          <button
            type="button"
            aria-pressed={settings.invertCameraY}
            className={`hud-panel min-h-[48px] px-4 text-sm ${
              settings.invertCameraY ? 'border-gold text-gold' : 'border-white/10 text-[#9aa3ae]'
            }`}
            onPointerDown={() => hapticSelection()}
            onClick={() => settings.setInvertCameraY(!settings.invertCameraY)}
          >
            {settings.invertCameraY ? 'Инвертирована' : 'Обычная'}
          </button>
        </Row>
      </div>
    </Sheet>
  );
}
