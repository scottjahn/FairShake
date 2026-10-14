// Parse pasted or uploaded roster text: one student per line, "name, tickets".
// Accepts CSV, tab-separated (copied straight from a spreadsheet) or
// "name: tickets". The tickets are the last field; everything before is the
// name, so "Smith, Jane, 4" keeps "Smith, Jane". A header row is skipped.

export interface RosterRow {
  name: string;
  tickets: number;
}

export interface RosterParse {
  rows: RosterRow[];
  errors: string[];
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"').trim();

export function parseRoster(text: string): RosterParse {
  const rows: RosterRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\t|,|:|;/);
    const ticketField = unquote(parts.pop() ?? "");
    const name = unquote(parts.join(line.includes("\t") ? " " : ", ")).replace(/\s+/g, " ");
    const tickets = Number(ticketField);

    if (!Number.isInteger(tickets) || tickets < 0 || ticketField === "") {
      // A first line without a number is a header ("Name,Tickets").
      if (rows.length === 0 && errors.length === 0 && i === lines.findIndex((l) => l.trim())) return;
      errors.push(`Line ${i + 1}: "${line}" — tickets must be a whole number.`);
      return;
    }
    if (!name) {
      errors.push(`Line ${i + 1}: missing a name.`);
      return;
    }
    const existing = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      errors.push(`Line ${i + 1}: "${name}" is listed more than once.`);
      return;
    }
    rows.push({ name, tickets });
  });

  return { rows, errors };
}
