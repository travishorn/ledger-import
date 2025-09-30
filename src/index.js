#!/usr/bin/env node

import { readFile, appendFile, writeFile } from "node:fs/promises";
import { parse as pathParse, join } from "node:path";
import { program } from "commander";
import { DateTime } from "luxon";
import jsonLogic from "json-logic-js";
import Papa from "papaparse";
import { parseCurrencyString, parseAmount, plainText } from "./lib.js";

jsonLogic.add_operation("contains", (subject, pattern) => {
  return new RegExp(pattern).test(subject);
});

async function main(txFilePath, rulesFilePath, journalFilePath) {
  // Read the transactions from CSV file (provided by financial institution)
  const txString = await readFile(txFilePath, "utf-8");

  // Read the rules that define how to parse the transactions (written by user)
  const rules = JSON.parse(await readFile(rulesFilePath, "utf-8"));

  // If user didn't specify a time zone, assume UTC
  const timeZone = rules.timeZone ?? "utc";

  // Given an index number, return the field name in the rules file
  function transformHeader(_, i) {
    return rules.fields[i];
  }

  // Parse the CSV transactions. Skip empty lines, recognize the header, and
  // transform the header column (property) names according to the fields in the
  // rules file
  const parsed = Papa.parse(txString, {
    skipEmptyLines: true,
    header: true,
    transformHeader,
  });

  // If there were errors parsing, throw an error to discontinue the process
  if (parsed.errors.length > 0) {
    throw new Error(JSON.stringify(parsed.errors));
  }

  // Transactions are listed latest-first in the source CSV file. Reverse them
  // so the order is consistent with journal when appended (oldest-first)
  const reversed = parsed.data.reverse();

  // Determine the file path to the rules file
  const rulesFileParts = pathParse(rulesFilePath);

  // Build a file path for the "latest" file. This file will be named the same
  // as the rules file, but with the extension ".latest" instead of ".json". Its
  // purpose is to store the most recently imported transaction
  const latestFilePath = join(
    rulesFileParts.dir,
    `${rulesFileParts.name}.latest`,
  );

  // Get the latest imported transaction, if it exists.
  let latestTx;
  try {
    latestTx = await readFile(latestFilePath, "utf-8");
  } catch (err) {}

  // Find that same transaction in the CSV transaction file
  const latestTxIndex = reversed.findIndex(
    (tx) => JSON.stringify(tx) === latestTx,
  );

  // Remove any transactions that are on or before that latest transaction.
  // Those have already been imported so they should be ignored.
  const toBeImported =
    latestTxIndex >= 0 ? reversed.slice(latestTxIndex + 1) : reversed;

  // Filter out transactions with "PENDING" dates
  const filteredTransactions = toBeImported.filter(
    (tx) => tx.date !== "PENDING",
  );

  const transformed = filteredTransactions
    .map((tx) => {
      // Transform the date into an ISO date, trim the description, and parse
      // the amount into a number
      const output = {
        date: DateTime.fromFormat(tx.date, rules.dateFormat, {
          zone: timeZone,
        }).toISODate(),
        description: tx.description.trim(),
        amount: parseAmount(tx, rules.locale, rules.currency),
      };

      // If the file contains balance information, parse that into a number, as
      // well.
      if (tx.balance) {
        output.balance = parseCurrencyString(
          tx.balance,
          rules.locale,
          rules.currency,
        );
      }

      return output;
    })
    .map((tx) => {
      // Set the payee equal to the description (for now) and set the accounts
      // to the default defined in the rules
      let output = {
        ...tx,
        payee: tx.description,
        account1: rules.account1,
        account2: rules.account2,
      };

      // Loop through the transaction transformers in the rules file
      rules.transformers.forEach((transformer) => {
        // If the tranformer's rule matches...
        if (jsonLogic.apply(transformer.rule, tx)) {
          // Merge the transformer's new values with the output
          output = Object.assign(output, transformer.newValues);
        }
      });

      return output;
    });

  // Build a string containing plaintext transactions. It's a very specific
  // format for use with hledger
  const plaintextTransactions = transformed.reduce((prev, curr) => {
    return prev + plainText(curr, rules.locale, rules.currency);
  }, "");

  if (journalFilePath) {
    // If the user provided a journal file path, append the transactions to the
    // journal
    await appendFile(journalFilePath, plaintextTransactions);

    // and store the latest transaction that was just imported
    // Use the last transaction from the filtered list (excluding PENDING)
    if (filteredTransactions.length > 0) {
      await writeFile(
        latestFilePath,
        JSON.stringify(filteredTransactions[filteredTransactions.length - 1]),
      );
    }
  } else {
    // If no journal file was specified, just show the plaintext transactions
    console.log(plaintextTransactions);
  }
}

// Set the arguments and parse the command-line command
program
  .argument(
    "<transactions file>",
    "Path to the CSV file containing financial transaction data",
  )
  .argument("<rules file>", "Path to the JSON file containing parsing rules.")
  .argument(
    "[journal file]",
    "Path to the journal to which the transactions should be appended",
  )
  .action(main)
  .parse();
