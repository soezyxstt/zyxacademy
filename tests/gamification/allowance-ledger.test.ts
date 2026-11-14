import { describe, expect, it } from 'bun:test';
import { evaluateAllowance } from '../../lib/usage-budget-policy';

describe('ledger rank allowance', () => {
  it('enforces the same one-time bonus for normal and premium provider turns', () => {
    const usage = { provider: 17, total: 17, premium: 17, minute: 0 };
    const result = evaluateAllowance('murid', usage, { units: 1, premium: true, rankKey: 'presiden' });
    expect(result.accepted).toBe(true);
    expect(result.remaining.providerTurns).toBe(0);
    expect(result.remaining.premiumTurns).toBe(0);
    const exhausted = evaluateAllowance('murid', { ...usage, provider: 18, premium: 18 }, { units: 1, premium: true, rankKey: 'presiden' });
    expect(exhausted.accepted).toBe(false);
    if (!exhausted.accepted) expect(exhausted.reason).toBe('PROVIDER_TURN_LIMIT');
  });

  it('does not grant rank bonus to tutor or free allowance', () => {
    const usage = { provider: 0, total: 0, premium: 0, minute: 0 };
    const tutor = evaluateAllowance('tutor', usage, { units: 1, premium: false, rankKey: 'presiden' });
    expect(tutor.remaining.providerTurns).toBe(49);
    const free = evaluateAllowance('murid', usage, { units: 1, premium: false, accessTier: 'free', rankKey: 'presiden' });
    expect(free.remaining.providerTurns).toBe(4);
  });
});
