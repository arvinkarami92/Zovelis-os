// Creator payments. Amounts are integer cents. The split is shown to the
// payer before they pay: creators keep 90%.

export const PLATFORM_FEE_RATE = 0.1;
export const TIP_PRESETS = [100, 300, 500, 1000];
export const MIN_TIP_CENTS = 100;
export const MAX_TIP_CENTS = 50_000;
export const MIN_SUPPORT_CENTS = 100;
export const MAX_SUPPORT_CENTS = 10_000;
export const PLUS_PRICE_CENTS = 499;
/** Test-mode wallet top-up limit (no real money moves in this version). */
export const MAX_TOPUP_CENTS = 20_000;

export interface Split {
  grossCents: number;
  feeCents: number;
  netCents: number;
}

export function splitPayment(grossCents: number): Split {
  const feeCents = Math.round(grossCents * PLATFORM_FEE_RATE);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
