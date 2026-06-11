export function quoteShell(value: string | number) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
