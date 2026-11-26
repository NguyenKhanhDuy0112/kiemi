import { describe, expect, it } from 'vitest';
import { changedMessages } from './catalog-edit';

describe('changedMessages [R-10]', () => {
  it('keeps only messages that differ from the default', () => {
    expect(
      changedMessages({
        required: 'Vui lòng nhập {field}',
        unique: '{field} đã tồn tại',
        pattern: '   ',
      }),
    ).toEqual({ required: 'Vui lòng nhập {field}' });
  });
});
