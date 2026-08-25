// Centralized currency formatter for Super Admin
// Handles multiple currencies with proper formatting

export interface CurrencyOptions {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  MAD: 'MAD',
  SAR: 'SAR',
  AED: 'AED',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  BRL: 'R$',
  MXN: 'MX$',
};

const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  MAD: 'ar-MA',
  SAR: 'ar-SA',
  AED: 'ar-AE',
  CAD: 'en-CA',
  AUD: 'en-AU',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  INR: 'en-IN',
  BRL: 'pt-BR',
  MXN: 'es-MX',
};

export function formatCurrency(
  amount: number,
  options: CurrencyOptions = {}
): string {
  const {
    currency = 'USD',
    locale = CURRENCY_LOCALES[currency] || 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch (error) {
    // Fallback to simple format if Intl fails
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${amount.toFixed(2)}`;
  }
}

export function formatCurrencyCompact(
  amount: number,
  options: CurrencyOptions = {}
): string {
  const {
    currency = 'USD',
    locale = CURRENCY_LOCALES[currency] || 'en-US',
  } = options;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      compactDisplay: 'short',
    }).format(amount);
  } catch (error) {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    if (amount >= 1000000) return `${symbol}${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}K`;
    return `${symbol}${amount.toFixed(2)}`;
  }
}

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

export function getCurrencyLocale(currency: string): string {
  return CURRENCY_LOCALES[currency] || 'en-US';
}