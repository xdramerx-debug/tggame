import type { AuraInfo } from './types';

/**
 * «Дневник странника» (14.5): short lore entries unlocked by progress.
 * Each unlocked entry is a small passive bonus; the full collection grants
 * +10% to all stats and the title «Странник Эха».
 */

export type DiaryUnlock =
  | { kind: 'stage'; value: number } // clear campaign stage N
  | { kind: 'tower'; value: number } // clear tower floor N
  | { kind: 'labyrinth' } // full labyrinth clear
  | { kind: 'summons'; value: number }
  | { kind: 'ascension'; value: number }
  | { kind: 'rank'; value: string } // any hero reaches rank
  | { kind: 'forgeLegendary' };

export interface DiaryEntry {
  id: string;
  title: string;
  text: string;
  unlock: DiaryUnlock;
  bonusLabel: string;
  /** applied as an aura-like mod to the whole team */
  mod: Partial<AuraInfo['mods']>;
}

export const DIARY: DiaryEntry[] = [
  { id: 'd01', title: 'Первая тропа', text: 'Странник вышел из долины, когда рассвет ещё спорил с ночью. Он не знал, что эхо пойдёт за ним.', unlock: { kind: 'stage', value: 1 }, bonusLabel: '+1% атака', mod: { atk: 0.01 } },
  { id: 'd02', title: 'Тень над лесом', text: 'Странник видел, как тень поглотила лес. Деревья молчали — но корни запомнили.', unlock: { kind: 'stage', value: 5 }, bonusLabel: '+2% HP', mod: { hp: 0.02 } },
  { id: 'd03', title: 'Молчаливый страж', text: 'У врат стоял каменный страж. Он не пропустил странника — но и не остановил. Эхо прошло сквозь него.', unlock: { kind: 'stage', value: 10 }, bonusLabel: '+2% защита', mod: { def: 0.02 } },
  { id: 'd04', title: 'Шёпот бездны', text: 'Из разлома доносился шёпот на языке, которого нет. Странник понял половину — и этого хватило, чтобы не ответить.', unlock: { kind: 'stage', value: 15 }, bonusLabel: '+2% вампиризм', mod: { lifesteal: 0.02 } },
  { id: 'd05', title: 'Первый босс', text: 'Гурр пал, и долина выдохнула. Эхо его падения странник забрал с собой — оно ещё пригодится.', unlock: { kind: 'stage', value: 10 }, bonusLabel: '+2% атака', mod: { atk: 0.02 } },
  { id: 'd06', title: 'Башня на горизонте', text: 'Башня Эха меняла высоту каждый раз, когда странник моргал. «Она растёт вместе с тобой», — сказал он себе.', unlock: { kind: 'tower', value: 1 }, bonusLabel: '+2% HP', mod: { hp: 0.02 } },
  { id: 'd07', title: 'Пятый этаж', text: 'На пятом этаже башни ветер пел имена героев, которых странник никогда не встречал. Пока не встречал.', unlock: { kind: 'tower', value: 5 }, bonusLabel: '+1% крит', mod: { crit: 0.01 } },
  { id: 'd08', title: 'Рассветный хор', text: 'Свет и Тьма пели один и тот же гимн — на два голоса. Странник записал слова, но чернила выцвели к утру.', unlock: { kind: 'stage', value: 20 }, bonusLabel: '+3% атака', mod: { atk: 0.03 } },
  { id: 'd09', title: 'Корни и камни', text: 'Лес и Крепость спорили тысячу лет: что сильнее — то, что растёт, или то, что стоит. Эхо ответило: «то, что помнит».', unlock: { kind: 'stage', value: 25 }, bonusLabel: '+3% HP', mod: { hp: 0.03 } },
  { id: 'd10', title: 'Зеркальный зал', text: 'В лабиринте отражений странник встретил себя. Отражение атаковало первым — значит, у них всё-таки разные роли.', unlock: { kind: 'labyrinth' }, bonusLabel: '+2% ко всем статам', mod: { hp: 0.02, atk: 0.02, def: 0.02 } },
  { id: 'd11', title: 'Жатва', text: 'Чернобог вышел в поле ночью. Урожай он собирал не серпом, а тишиной.', unlock: { kind: 'stage', value: 30 }, bonusLabel: '+2% пробитие брони', mod: { armorBreak: 0.02 } },
  { id: 'd12', title: 'Десятая башня', text: 'С десятого этажа башни был виден край мира. Край оказался краем карты — и это успокаивало.', unlock: { kind: 'tower', value: 10 }, bonusLabel: '+3% защита', mod: { def: 0.03 } },
  { id: 'd13', title: 'Призыватели', text: 'У врат стояли сотни свитков. Каждый — чья-то судьба, свёрнутая в трубочку. Странник тянул осторожно.', unlock: { kind: 'summons', value: 10 }, bonusLabel: '+1% крит. урон', mod: { critDmg: 0.05 } },
  { id: 'd14', title: 'Сотня имён', text: 'После сотни призывов странник перестал запоминать имена — и начал запоминать лица. Так надёжнее.', unlock: { kind: 'summons', value: 100 }, bonusLabel: '+2% крит', mod: { crit: 0.02 } },
  { id: 'd15', title: 'Пепел богов', text: 'Боги сгорели до странника. Пепел оказался тёплым — и немного говорящим.', unlock: { kind: 'stage', value: 40 }, bonusLabel: '+4% атака', mod: { atk: 0.04 } },
  { id: 'd16', title: 'Вознесение', text: 'Странник отпустил долину, чтобы вернуться сильнее. Эхо не отпускало ничего — оно просто становилось глубже.', unlock: { kind: 'ascension', value: 1 }, bonusLabel: '+3% HP', mod: { hp: 0.03 } },
  { id: 'd17', title: 'Звёздный кузнец', text: 'Кузница душ не спрашивает, готов ли ты. Она спрашивает, сколько ты готов потерять. Ответ всегда: «больше».', unlock: { kind: 'forgeLegendary' }, bonusLabel: '+2% крит. урон', mod: { critDmg: 0.1 } },
  { id: 'd18', title: 'Середина пути', text: 'На 50-м этапе странник сел отдохнуть и понял: усталость — тоже часть эха. Она повторяется, но тише.', unlock: { kind: 'stage', value: 50 }, bonusLabel: '+3% ко всем статам', mod: { hp: 0.03, atk: 0.03, def: 0.03 } },
  { id: 'd19', title: 'Полночь', text: 'Морена правит ночью, но ночь не принадлежит ей. Странник видел, как она делится ею с рассветом.', unlock: { kind: 'stage', value: 60 }, bonusLabel: '+3% вампиризм', mod: { lifesteal: 0.03 } },
  { id: 'd20', title: 'Двадцатый этаж', text: 'Башня на 20-м этаже открыла окно. За ним была та же долина — но с другой стороны эха.', unlock: { kind: 'tower', value: 20 }, bonusLabel: '+4% HP', mod: { hp: 0.04 } },
  { id: 'd21', title: 'E5', text: 'Когда герой достигает E5, его имя начинают шептать даже враги. Особенно враги.', unlock: { kind: 'rank', value: 'E5' }, bonusLabel: '+4% атака', mod: { atk: 0.04 } },
  { id: 'd22', title: 'Врата Эха', text: 'Последние врата не запираются. Они просто спрашивают: «Ты принёс своё эхо или чужое?»', unlock: { kind: 'stage', value: 90 }, bonusLabel: '+5% HP', mod: { hp: 0.05 } },
  { id: 'd23', title: 'Конец долины', text: 'Странник дошёл до края карты и нашёл там чистую страницу. Чернила он приберёг — для продолжения.', unlock: { kind: 'stage', value: 100 }, bonusLabel: '+5% ко всем статам', mod: { hp: 0.05, atk: 0.05, def: 0.05 } },
  { id: 'd24', title: 'Трансцендентность', text: 'T1 — это когда эхо героя звучит раньше, чем герой успевает сделать шаг. Враги слышат это. И отступают.', unlock: { kind: 'rank', value: 'T1' }, bonusLabel: '+5% атака', mod: { atk: 0.05 } },
];

export const DIARY_FULL_BONUS: AuraInfo = {
  id: 'diary-full',
  name: 'Странник Эха',
  desc: 'Дневник собран полностью: +10% ко всем статам и уникальный титул «Странник Эха»',
  mods: { hp: 0.1, atk: 0.1, def: 0.1, spd: 0.05, crit: 0.02 },
};

export function diaryAuras(unlocked: string[]): AuraInfo[] {
  const auras: AuraInfo[] = [];
  for (const entry of DIARY) {
    if (unlocked.includes(entry.id)) {
      auras.push({ id: `diary-${entry.id}`, name: entry.title, desc: entry.bonusLabel, mods: entry.mod });
    }
  }
  if (unlocked.length >= DIARY.length) auras.push(DIARY_FULL_BONUS);
  return auras;
}
