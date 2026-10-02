export type Person = {
  id?: string;
  customerId?: string;
  first?: string;
  middle?: string;
  last?: string;
  location?: string;
  profession?: string;
  countryRisk?: number;
  locationRisk?: number;
  professionRisk?: number;
  name: string;
  country: string;
  dob: string;
  source: string;
};
export type Review = {
  at: string;
  status: string;
  note: string;
  reviewer?: string;
};
export type MatchEvidence = {
  score: number;
  textScore?: number;
  matchMethod?: string;
  matchedTokens?: { input: string; watchlist: string; code: string }[];
};
export type Alert = {
  evidence?: Person & MatchEvidence;
  transactionId?: string;
  customerId?: string;
  id: string;
  name: string;
  type: string;
  score: number;
  risk: string;
  status: string;
  date: string;
  detail: string;
  reviews?: Review[];
};
export type Customer = {
  id?: string;
  first?: string;
  middle?: string;
  last?: string;
  location?: string;
  profession?: string;
  countryRisk?: number;
  locationRisk?: number;
  professionRisk?: number;
  name: string;
  country: string;
  dob: string;
  risk: number;
};
export type Transaction = {
  reference?: string;
  beneficiary?: string;
  beneficiaryAccount?: string;
  currency?: string;
  transactionDate?: string;
  channel?: string;
  purpose?: string;
  reasons?: string[];
  beneficiaryMatches?: (Person & MatchEvidence)[];
  screened?: boolean;
  screeningRules?: Rules;
  customerId?: string;
  id?: string;
  name: string;
  amount: string;
  destination: string;
  count: string;
  flag: boolean;
  at?: string;
};
export type Rules = {
  threshold: number;
  amount: number;
  velocity: number;
  countryWeight: number;
  locationWeight: number;
  professionWeight: number;
  screen: boolean;
  transaction: boolean;
};
export type Workspace = {
  alerts: Alert[];
  watch: Person[];
  customers: Customer[];
  transactions: Transaction[];
  rules: Rules;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 500): v is string =>
  typeof v === "string" && v.length <= max;
const number = (v: unknown, min = 0, max = 100): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validDate(v: unknown): v is string {
  return (
    text(v, 10) &&
    (v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v &&
        v <= new Date().toISOString().slice(0, 10)))
  );
}
export function validateRules(v: unknown): v is Rules {
  return (
    object(v) &&
    number(v.threshold, 1) &&
    Number.isInteger(v.threshold) &&
    number(v.amount, 1, 1e12) &&
    number(v.velocity, 1, 100000) &&
    Number.isInteger(v.velocity) &&
    ["countryWeight", "locationWeight", "professionWeight"].every(
      (k) => number(v[k], 1) && Number.isInteger(v[k]),
    ) &&
    typeof v.screen === "boolean" &&
    typeof v.transaction === "boolean"
  );
}
export function parseWatchlist(v: unknown): Person[] {
  if (!Array.isArray(v) || !v.length || v.length > 10000)
    throw Error("Use a JSON array of 1–10,000 records.");
  return v.map((r) => {
    if (
      !object(r) ||
      !text(r.name, 200) ||
      !r.name.trim() ||
      !text(r.country, 100) ||
      !validDate(r.dob) ||
      (r.source !== undefined && !text(r.source, 200))
    )
      throw Error(
        "Each record needs a name, country, valid past DOB (or empty string), and optional text source.",
      );
    for (const key of ["first", "middle", "last", "location", "profession"]) {
      if (r[key] !== undefined && !text(r[key], 200))
        throw Error(`${key} must be text with at most 200 characters.`);
    }
    for (const key of ["countryRisk", "locationRisk", "professionRisk"]) {
      if (r[key] !== undefined && ![20, 50, 90].includes(Number(r[key])))
        throw Error(`${key} must be 20, 50 or 90.`);
    }
    return {
      ...Object.fromEntries(
        ["first", "middle", "last", "location", "profession"]
          .filter((k) => typeof r[k] === "string")
          .map((k) => [k, String(r[k]).trim()]),
      ),
      ...Object.fromEntries(
        ["countryRisk", "locationRisk", "professionRisk"]
          .filter((k) => r[k] !== undefined)
          .map((k) => [k, Number(r[k])]),
      ),
      ...(typeof r.id === "string" ? { id: r.id } : {}),
      ...(typeof r.customerId === "string" ? { customerId: r.customerId } : {}),
      name: r.name.trim(),
      country: r.country.trim(),
      dob: r.dob,
      source:
        typeof r.source === "string" ? r.source.trim() : "Uploaded watchlist",
    };
  });
}
export function mergeWatchlist(existing: Person[], incoming: Person[]) {
  const key = (r: Person) =>
    [
      r.name.toLocaleLowerCase(),
      r.country.toLocaleLowerCase(),
      r.dob,
      r.source.toLocaleLowerCase(),
    ].join("|");
  const seen = new Set(existing.map(key));
  const added = incoming.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (existing.length + added.length > 10000)
    throw Error("Watchlist limit is 10,000 records.");
  return [...existing, ...added];
}
export function parseWorkspace(v: unknown): Workspace {
  if (!object(v) || !validateRules(v.rules))
    throw Error("Invalid workspace rules.");
  const list = (
    key: string,
    check: (r: Record<string, unknown>) => boolean,
  ) => {
    const a = v[key];
    if (
      !Array.isArray(a) ||
      a.length > 20000 ||
      !a.every((r) => object(r) && check(r))
    )
      throw Error(`Invalid ${key} records.`);
    return a;
  };
  const alerts = list(
    "alerts",
    (r) =>
      text(r.id, 100) &&
      text(r.name, 200) &&
      ["Name screening", "Transaction"].includes(String(r.type)) &&
      number(r.score) &&
      ["High", "Medium", "Low"].includes(String(r.risk)) &&
      ["Open", "In review", "Closed"].includes(String(r.status)) &&
      text(r.date, 100) &&
      text(r.detail, 4000) &&
      (r.reviews === undefined ||
        (Array.isArray(r.reviews) &&
          r.reviews.every(
            (x) =>
              object(x) &&
              text(x.at, 100) &&
              Number.isFinite(Date.parse(x.at)) &&
              ["Open", "In review", "Closed"].includes(String(x.status)) &&
              text(x.note, 2000),
          ))),
  );
  if (new Set(alerts.map((r) => r.id)).size !== alerts.length)
    throw Error("Duplicate alert IDs.");
  const customers = list(
    "customers",
    (r) =>
      text(r.name, 200) &&
      text(r.country, 100) &&
      validDate(r.dob) &&
      number(r.risk),
  );
  const transactions = list(
    "transactions",
    (r) =>
      text(r.name, 200) &&
      text(r.destination, 100) &&
      text(r.amount, 100) &&
      number(Number(r.amount), 0.01, 1e12) &&
      text(r.count, 100) &&
      number(Number(r.count), 1, 100000) &&
      typeof r.flag === "boolean" &&
      (r.at === undefined ||
        (text(r.at, 100) && Number.isFinite(Date.parse(r.at)))),
  );
  const watch =
    Array.isArray(v.watch) && v.watch.length === 0
      ? []
      : parseWatchlist(v.watch);
  return {
    alerts,
    customers,
    transactions,
    watch,
    rules: v.rules,
  } as Workspace;
}
export function similarity(a: string, b: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  a = norm(a);
  b = norm(b);
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return Math.round(100 * (1 - prev[b.length] / Math.max(a.length, b.length)));
}
// Soundex groups similar English consonant sounds. Full-name edit distance remains separate.
function nameTokens(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}
function soundex(token: string) {
  if (!/^[a-z]{3,}$/.test(token)) return "";
  const codes = "01230120022455012623010202";
  let result = token[0].toUpperCase();
  let previous = codes[token.charCodeAt(0) - 97];
  for (const letter of token.slice(1)) {
    if (letter === "h" || letter === "w") continue;
    const code = codes[letter.charCodeAt(0) - 97];
    if (code !== "0" && code !== previous) result += code;
    previous = code;
    if (result.length === 4) break;
  }
  return result.padEnd(4, "0");
}
export function nameMatch(input: string, watchlist: string) {
  const textScore = similarity(input, watchlist);
  const original = {
    score: textScore,
    textScore,
    matchMethod: textScore === 100 ? "Exact name" : "Fuzzy name",
    matchedTokens: [] as { input: string; watchlist: string; code: string }[],
  };
  const entered = nameTokens(input).sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
  const candidates = nameTokens(watchlist);
  if (
    !entered.length ||
    entered.length > candidates.length ||
    textScore === 100
  )
    return original;
  const used = new Set<number>();
  const matchedTokens = [];
  for (const token of entered) {
    const code = soundex(token);
    if (!code || code.endsWith("000")) return original;
    const options = candidates
      .map((candidate, index) => ({
        candidate,
        index,
        score: similarity(token, candidate),
      }))
      .filter(
        (c) =>
          !used.has(c.index) && soundex(c.candidate) === code && c.score >= 60,
      )
      .sort((a, b) => b.score - a.score);
    if (!options.length) return original;
    used.add(options[0].index);
    matchedTokens.push({ input: token, watchlist: options[0].candidate, code });
  }
  const phoneticScore = entered.length === candidates.length ? 92 : 90;
  return phoneticScore > textScore
    ? {
        score: phoneticScore,
        textScore,
        matchMethod: "Phonetic token match",
        matchedTokens,
      }
    : original;
}
export function velocityCount(
  transactions: Transaction[],
  name: string,
  now = Date.now(),
) {
  return (
    1 +
    transactions.filter(
      (t) =>
        t.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase() &&
        t.at &&
        Date.parse(t.at) > now - 86400000 &&
        Date.parse(t.at) <= now,
    ).length
  );
}
