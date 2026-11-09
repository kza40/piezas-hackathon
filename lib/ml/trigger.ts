// R-024, step 2: a suggested soil-moisture trigger, from the measured field capacity, the soil type's
// wilting point and how much of the available water the crop can use (FAO-56 Tables 19 and 22):
//
//   wilting point = field capacity × (θWP / θFC for the texture)
//   trigger       = field capacity − p × (field capacity − wilting point)
//
// It is only a suggestion: the farmer saves it (or their own number) before the app uses it.
import { depletionFor, textureOf, TEXTURE_NAMES } from './agronomy';
import type { FieldCapacity } from './capacity';
import { round1 } from './types';

export interface TriggerSuggestion {
  value: number;
  fieldCapacity: number;
  wiltingPoint: number;
  depletion: number; // p
  basis: string;
}

export function suggestTrigger(
  capacity: FieldCapacity | null,
  soil: string,
  cropKey: string,
): { suggestion: TriggerSuggestion | null; needs: string | null } {
  if (!capacity) return { suggestion: null, needs: null }; // the capacity step says what it is waiting for
  const texture = textureOf(soil);
  if (!texture) return { suggestion: null, needs: `a soil type (one of: ${TEXTURE_NAMES.join(', ')})` };
  const crop = depletionFor(cropKey);
  if (!crop) return { suggestion: null, needs: 'a crop with a known allowable depletion' };
  const fc = capacity.value;
  const wp = round1(fc * (texture.wp / texture.fc));
  const value = Math.round(fc - crop.p * (fc - wp));
  return {
    suggestion: {
      value,
      fieldCapacity: fc,
      wiltingPoint: wp,
      depletion: crop.p,
      basis: `field capacity ${fc}% after ${capacity.basis}; ${texture.name} wilting point; ${crop.row} can use ${crop.p * 100}% of the available water (FAO-56)`,
    },
    needs: null,
  };
}
