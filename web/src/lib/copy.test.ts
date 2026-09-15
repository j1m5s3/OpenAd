import { describe, expect, it } from 'vitest';

import { FIELD_HINTS, GUIDE_PATHS, WIZARD_COPY, guideUrl } from './copy';

const PATH_SET = new Set<string>(GUIDE_PATHS);

describe('copy registry', () => {
  it('keeps every hint short, non-empty, and pointed at a known guide path', () => {
    for (const [key, hint] of Object.entries(FIELD_HINTS)) {
      expect(hint.tip.trim().length, key).toBeGreaterThan(0);
      expect(hint.tip.length, key).toBeLessThanOrEqual(280);
      if (hint.guidePath) {
        expect(PATH_SET.has(hint.guidePath), `${key} → ${hint.guidePath}`).toBe(true);
      }
    }
  });

  it('never calls CPC occupancy an auction', () => {
    for (const [key, hint] of Object.entries(FIELD_HINTS)) {
      if (!('cpc' in hint) || !hint.cpc) continue;
      expect(hint.tip, key).not.toMatch(/auction/i);
    }
    const cpcStages = [WIZARD_COPY.openCampaign.slotCreative, WIZARD_COPY.openCampaign.bidBudget, WIZARD_COPY.openCampaign.fund];
    for (const stage of cpcStages) {
      expect(`${stage.title} ${stage.description} ${stage.whatNext}`).not.toMatch(/auction/i);
    }
    expect(WIZARD_COPY.slotSetup.termsCpcWhatNext).not.toMatch(/auction/i);
  });

  it('names wizard stages with glossary-facing headings', () => {
    expect(WIZARD_COPY.slotSetup.mint.title).toBe('Mint slot');
    expect(WIZARD_COPY.slotSetup.calendar.title).toBe('Calendar');
    expect(WIZARD_COPY.slotSetup.terms.title).toBe('Terms');
    expect(WIZARD_COPY.creativeSetup.registerMedia.title).toBe('Register media');
    expect(WIZARD_COPY.creativeSetup.requestApproval.title).toBe('Request approval');
    expect(WIZARD_COPY.slotSetup.mint.title.toLowerCase()).toContain('slot');
    expect(WIZARD_COPY.creativeSetup.registerMedia.description.toLowerCase()).toContain('creative');
  });

  it('hides guide URLs when VITE_GUIDE_URL is unset', () => {
    expect(guideUrl('publisher/terms')).toBeUndefined();
    expect(guideUrl()).toBeUndefined();
  });
});
