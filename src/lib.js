// Takes a string representing an amount of currency, a locale, and the name of
// a currency. Returns the amount as a number
export function parseCurrencyString(string, locale, currency) {
  // Use Intl NumberFormat to create a formatter for the given locale/currency
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });

  // Get the parts of this currency's format
  const parts = formatter.formatToParts(0);

  // Get the decimal character (usually `.` but sometimes `,`)
  const decimal = parts.find((part) => part.type === "decimal").value;

  // Create a pattern that matches any **except** a digit, a negative sign, or
  // the decimal mark
  const pattern = new RegExp(`[^0-9-${decimal}]`, "g");

  // Strip everything but digits, negative sign, and decimal mark from the
  // string
  const stripped = string.replace(pattern, "");

  // Convert the decimal mark to a period `.` since JS numbers use period to
  // indicate a decimal mark
  const normalized = stripped.replace(decimal, ".");

  // Return the amount as a number
  return Number(normalized);
}

// Takes a transaction, a locale, and a currency. Returns the transaction amount
// as a number.
export function parseAmount(tx, locale, currency) {
  // If there's an `amount` field, just return the amount in that.
  if (tx.amount) return parseCurrencyString(tx.amount, locale, currency);

  // However, some institutions use separate columns for "amount in" and
  // "amount out". If this transaction has something in the `amount-in` field,
  // return that number as a negative
  if (tx["amount-in"])
    return -parseCurrencyString(tx["amount-in"], locale, currency);

  // If this transaction has something in the `amount-out` field, return that
  // number
  if (tx["amount-out"])
    return parseCurrencyString(tx["amount-out"], locale, currency);

  // Otherwise, no amounts were found anywere. Return 0
  return 0;
}

// Try to parse an amount using `toLocaleString`. If it fails, just return the
// number with the currency symbol after it.
function currencyString(amount, locale, currency) {
  try {
    return amount.toLocaleString(locale, { style: 'currency', currency });
  } catch (error) {
    return `${amount} ${currency}`;
  }
}

// Takes a transaction object and returns it as a plaintext string used by
// hledger.
export function plainText(tx, locale, currency) {
  const date = tx.date;
  const payee = tx.payee;
  const comment = tx.comment ? `  ; ${tx.comment}` : '';
  const account1 = tx.account1;
  const account1Amount = currencyString(-tx.amount, locale, currency);
  const balance = tx.balance ? ` = ${currencyString(tx.balance, locale, currency).padStart(12)}` : '';
  const account2 = tx.account2;
  const account2Amount = currencyString(tx.amount, locale, currency);

  return `${date} ${payee}${comment}\n    ${account1.padEnd(49)}${account1Amount.padStart(12)}${balance}\n    ${account2.padEnd(49)}${account2Amount.padStart(12)}\n`;
}
