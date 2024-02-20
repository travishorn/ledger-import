export function parseCurrencyString(string, locale, currency) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });

  const parts = formatter.formatToParts(0);
  const decimal = parts.find((part) => part.type === "decimal").value;
  const pattern = new RegExp(`[^0-9-${decimal}]`, "g");
  const stripped = string.replace(pattern, "");
  const normalized = stripped.replace(decimal, ".");

  return Number(normalized);
}

export function parseAmount(tx, locale, currency) {
  if (tx.amount) return parseCurrencyString(tx.amount, locale, currency);
  if (tx["amount-in"])
    return -parseCurrencyString(tx["amount-in"], locale, currency);
  if (tx["amount-out"])
    return parseCurrencyString(tx["amount-out"], locale, currency);
  return 0;
}

export function plainText(tx, locale, currency) {
  const accountPadLen = Math.max(43, tx.account1.length, tx.account2.length);
  const account1Amount = (-tx.amount).toLocaleString(locale, {
    style: "currency",
    currency,
  });
  const account2Amount = tx.amount.toLocaleString(locale, {
    style: "currency",
    currency,
  });
  const amountPadLen = Math.max(account1Amount.length, account2Amount.length);
  const balanceAmount = tx.balance.toLocaleString(locale, {
    style: "currency",
    currency,
  });

  let output = `${tx.date} ${tx.payee}`;

  if (tx.comment) {
    output += `  ; ${tx.comment}\n`;
  } else {
    output += "\n";
  }

  output +=
    `    ${tx.account1.padEnd(accountPadLen)} ${account1Amount.padStart(amountPadLen)} = ${balanceAmount}\n` +
    `    ${tx.account2.padEnd(accountPadLen)} ${account2Amount.padStart(amountPadLen)}\n\n`;

  return output;
}
