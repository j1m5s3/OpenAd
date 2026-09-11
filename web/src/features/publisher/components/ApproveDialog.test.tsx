import { describe, expect, it } from 'vitest';

import { approvalActionLabel } from './ApproveDialog';

describe('approvalActionLabel', () => {
  it('names approve vs reject', () => {
    expect(approvalActionLabel(true)).toBe('Approve creative');
    expect(approvalActionLabel(false)).toBe('Reject creative');
  });
});
