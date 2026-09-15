import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import type { Persona } from '../fixtures/accounts';
import { installMockWallet } from '../fixtures/mock-wallet';

type Step = { visit?: string; expect?: string; click?: string };
type Scenario = {
  id: string;
  persona: Persona;
  generation: number;
  viewport?: 'mobile';
  steps: Step[];
};

const scenarioDir = fileURLToPath(new URL('../scenarios', import.meta.url));
const files = fs
  .readdirSync(scenarioDir)
  .filter((f) => f.endsWith('.yaml'))
  .sort();

for (const file of files) {
  const scenario = yaml.load(fs.readFileSync(path.join(scenarioDir, file), 'utf8')) as Scenario;
  test(scenario.id, async ({ page }) => {
    if (scenario.viewport === 'mobile') {
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await installMockWallet(page, scenario.persona);
    for (const step of scenario.steps) {
      if (step.visit) await page.goto(step.visit);
      if (step.expect) {
        const needle = step.expect;
        const loc = page
          .getByText(needle, { exact: false })
          .or(page.getByPlaceholder(needle, { exact: false }))
          .or(page.getByLabel(needle, { exact: false }));
        await expect(loc.locator('visible=true').first()).toBeVisible();
      }
      if (step.click) {
        await page
          .getByRole('button', { name: step.click, exact: false })
          .locator('visible=true')
          .first()
          .click();
      }
    }
  });
}
