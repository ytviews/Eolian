import { AbsRangeArgument, RangeArgument } from './@types';

export function shuffleList<T>(list: T[]): T[] {
  for (let i = 0; i < list.length; i++) {
    const rand = Math.floor(Math.random() * list.length);
    const temp = list[rand];
    list[rand] = list[i];
    list[i] = temp;
  }
  return list;
}

export function truthySum(...values: unknown[]): number {
  return values.map(value => +!!value).reduce((prev, curr) => prev + curr, 0);
}

export function convertRangeToAbsolute(range: RangeArgument, max: number, reverse?: boolean): AbsRangeArgument {
  let newStart = 0;
  let newStop = max;

  if (range.stop) {
    newStart = Math.min(max - 1, Math.max(1, range.start) - 1);
    newStop = (range.stop < 0)
      ? max + range.stop + 1
      : Math.min(max - 1, Math.max(1, range.stop) - 1);

    if (reverse) {
      newStart = max - newStart;
      if (range.stop) {
        newStop = max - newStop;
      }
    }
  } else if (reverse) {
    newStart = max - Math.min(max, Math.max(1, range.start));
  } else {
    newStop = range.start;
  }

  return { start: Math.min(newStart, newStop), stop: Math.max(newStart, newStop) };
}

export function applyRangeToList<T>(range: RangeArgument, list: T[], reverse?: boolean): T[] {
  const absRange = convertRangeToAbsolute(range, list.length, reverse);
  return list.slice(absRange.start, absRange.stop);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}