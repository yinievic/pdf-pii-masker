import type { MaskBox } from './maskingTypes';

export type FinalMaskOptions = {
  includeAutoCandidates: boolean;
  includeManualMasks: boolean;
  excludeRejected: boolean;
};

export const defaultFinalMaskOptions: FinalMaskOptions = {
  includeAutoCandidates: true,
  includeManualMasks: true,
  excludeRejected: true
};

export function getFinalMasks(masks: MaskBox[], options: FinalMaskOptions = defaultFinalMaskOptions) {
  return masks.filter((mask) => {
    if (options.excludeRejected && mask.status === 'rejected') {
      return false;
    }

    if (mask.source === 'manual') {
      return options.includeManualMasks && mask.status === 'accepted';
    }

    return options.includeAutoCandidates;
  });
}
