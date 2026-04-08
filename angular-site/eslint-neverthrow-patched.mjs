import neverthrow from 'eslint-plugin-neverthrow';
import patchedMustUseResult from './eslint-neverthrow-must-use-result.cjs';

export default {
  ...neverthrow,
  rules: {
    ...neverthrow.rules,
    'must-use-result': patchedMustUseResult,
  },
};
