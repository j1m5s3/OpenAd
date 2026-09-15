import { OpenAdElement } from './open-ad';

export { OpenAdElement };
export type {
  OpenAdRenderDetail,
  ServeCampaign,
  ServeCreative,
  ServeLease,
  ServeResponse,
  ServeStatus,
} from './types';

export function define(tagName: string = OpenAdElement.tagName): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, OpenAdElement);
  }
}

define();
