#!/usr/bin/env node

import { readFile, appendFile, writeFile } from "node:fs/promises";
import { parse as pathParse, join } from "node:path";
import { program } from "commander";
import { DateTime } from "luxon";
import Papa from "papaparse";
import { parseCurrencyString, parseAmount, plainText } from "./lib.js";

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

  const transformed = toBeImported
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
      const output = {
        ...tx,
        payee: tx.description,
        account1: rules.account1,
        account2: rules.account2,
      };

      // Loop through the transaction rules in the rules file
      rules.txRules.forEach((rule) => {
        // Create a regular expression from the pattern string
        const descriptionPattern = new RegExp(rule.pattern, "g");

        // Look for a matching pattern in the current transaction's description
        const match = tx.description.match(descriptionPattern);

        // If the description matches the pattern, set the payee, comment, and
        // accounts according to the rule
        if (match) {
          if (rule.payee) output.payee = rule.payee;
          if (rule.comment) output.comment = rule.comment;
          if (rule.account1) output.account1 = rule.account1;
          if (rule.account2) output.account2 = rule.account2;
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
    await writeFile(
      latestFilePath,
      JSON.stringify(parsed.data[parsed.data.length - 1]),
    );
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
