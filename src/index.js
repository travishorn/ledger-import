#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { program } from "commander";
import { DateTime } from "luxon";
import Papa from "papaparse";
import { parseCurrencyString, parseAmount, plainText } from "./lib.js";

async function main(txFilePath, rulesFilePath) {
  const txString = await readFile(txFilePath, "utf-8");
  const rules = JSON.parse(await readFile(rulesFilePath, "utf-8"));
  const timeZone = rules.timeZone ?? "utc";

  function transformHeader(_, i) {
    return rules.fields[i];
  }

  const parsed = Papa.parse(txString, {
    skipEmptyLines: true,
    header: true,
    transformHeader,
  });

  if (parsed.errors.length > 0) {
    throw new Error(JSON.stringify(parsed.errors));
  }

  const transformed = parsed.data
    .map((tx) => {
      const output = {
        date: DateTime.fromFormat(tx.date, rules.dateFormat, {
          zone: timeZone,
        }).toISODate(),
        description: tx.description,
        amount: parseAmount(tx, rules.locale, rules.currency),
      };

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
      const output = {
        ...tx,
        account1: rules.account1,
        account2: rules.account2,
      };

      rules.txRules.forEach((rule) => {
        const descriptionPattern = new RegExp(rule.pattern, "g");
        const match = tx.description.match(descriptionPattern);

        if (match) {
          if (rule.payee) output.payee = rule.payee;
          if (rule.comment) output.comment = rule.comment;
          if (rule.account1) output.account1 = rule.account1;
          if (rule.account2) output.account2 = rule.account2;
        }
      });

      return output;
    });

  const pt = transformed.reduce((prev, curr) => {
    return prev + plainText(curr, rules.locale, rules.currency);
  }, "");

  console.log(pt);
}

program
  .argument(
    "<transactions file>",
    "Path to the CSV file containing financial transaction data",
  )
  .argument("<rules file>", "Path to the JSON file containing parsing rules.")
  .action(main)
  .parse();
