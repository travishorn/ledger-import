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

// Takes a transaction object and returns it as a plaintext string used by
// hledger.
export function plainText(tx, locale, currency) {
  // Attempt to line up amounts using spaces. The end of each account string
  // will be padded with spaces
  const accountPadLen = Math.max(43, tx.account1.length, tx.account2.length);

  // Format the amount in the given locale/currency
  const account1Amount = (-tx.amount).toLocaleString(locale, {
    style: "currency",
    currency,
  });

  // Format the matching amount (double entry bookkeeping means theres always
  // an opposite amount taken/given from two accounts)
  const account2Amount = tx.amount.toLocaleString(locale, {
    style: "currency",
    currency,
  });

  // Attend to line up the amounts using spaces
  const amountPadLen = Math.max(account1Amount.length, account2Amount.length);

  // Format the balance amount
  const balanceAmount = tx.balance?.toLocaleString(locale, {
    style: "currency",
    currency,
  });

  // Start this transaction's string with the date and payee
  let output = `${tx.date} ${tx.payee}`;

  // If there's a comment, append it
  if (tx.comment) {
    output += `  ; ${tx.comment}\n`;
  } else {
    output += "\n";
  }

  // Append the first account and its amount
  output += `    ${tx.account1.padEnd(accountPadLen)} ${account1Amount.padStart(amountPadLen).padEnd(11)}`;

  // If there's a balance, append it
  if (tx.balance) {
    output += `= ${balanceAmount.padStart(11)}\n`;
  } else {
    output += "\n";
  }

  // Append the second account and its amount, followed by two newlines so the
  // string/file is ready for another transaction
  output += `    ${tx.account2.padEnd(accountPadLen)} ${account2Amount.padStart(amountPadLen)}\n\n`;

  return output;
}
