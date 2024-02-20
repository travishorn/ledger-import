import { readFile } from 'node:fs/promises';
import { program } from 'commander';
import { DateTime } from 'luxon';
import Papa from 'papaparse';

async function main(txFilePath, rulesFilePath) {
  const txString = await readFile(txFilePath, 'utf-8');
  const rules = JSON.parse(await readFile(rulesFilePath, 'utf-8'));

  function transformHeader(_, i) {
    return rules.fields[i];
  }

  const parsed = Papa.parse(txString, {
    skipEmptyLines: true,
    header: true,
    transformHeader
  });

  if (parsed.errors.length > 0) {
    throw new Error(JSON.stringify(parsed.errors));
  }

  // TODO: Use luxon to parse the date string so we can later output as an ISO
  // date.

  // TODO: Create a schema for encoding conditional tx parsing in the JSON rules
  // file.

  // TODO: Based on the tx data and the rules, build a string by looping through
  // transactions and appending ledger-structured transactions.

  console.log(rules);
  console.log(parsed);
}

program
  .argument('<transactions file>', 'Path to the CSV file containing financial transaction data')
  .argument('<rules file>', 'Path to the JSON file containing parsing rules.')
  .action(main)
  .parse();
