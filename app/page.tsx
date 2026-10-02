"use client";
import ValidatedForm from "./validated-form";
import TransactionWorkspace from "./transaction-workspace";
import { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  ScanSearch,
  Users,
  Database,
  ArrowLeftRight,
  SlidersHorizontal,
  Bell,
  Search,
  Plus,
  ChevronRight,
  ArrowUpRight,
  Upload,
  X,
  Check,
  Download,
  Filter,
  FileText,
} from "lucide-react";
import {
  nameMatch,
  parseWorkspace,
  parseWatchlist,
  mergeWatchlist,
  validateRules,
  velocityCount,
  type Person,
  type Alert,
  type Customer,
  type Transaction,
  validDate,
} from "../lib/compliance";
const initialWatch: Person[] = [
  {
    name: "Alexander Petrov",
    country: "Russia",
    dob: "1982-04-16",
    source: "Demo sanctions",
  },
  {
    name: "Mohamed Al Rashid",
    country: "United Arab Emirates",
    dob: "1975-09-22",
    source: "Demo PEP",
  },
  {
    name: "Daniel Morgan",
    country: "United Kingdom",
    dob: "1988-01-12",
    source: "Internal watchlist",
  },
  {
    name: "Viktor Ivanov",
    country: "Russia",
    dob: "1969-11-03",
    source: "Demo sanctions",
  },
];
const initialAlerts: Alert[] = [
  {
    id: "ALT-1024",
    name: "Alexandr Petrov",
    type: "Name screening",
    score: 94,
    risk: "High",
    status: "Open",
    date: "Today, 10:42",
    detail:
      "Similar name to Alexander Petrov • Demo sanctions. Country matches; date of birth requires review.",
  },
  {
    id: "ALT-1023",
    name: "Olivia Bennett",
    type: "Transaction",
    score: 91,
    risk: "High",
    status: "Open",
    date: "Today, 10:36",
    detail:
      "A ₹1,250,000 transfer exceeded the demo high-value threshold of ₹1,000,000.",
  },
  {
    id: "ALT-1022",
    name: "Mohammed Al Rashid",
    type: "Name screening",
    score: 88,
    risk: "Medium",
    status: "In review",
    date: "Today, 10:18",
    detail:
      "Similar name to Mohamed Al Rashid • Demo PEP. Identity is unconfirmed.",
  },
  {
    id: "ALT-1021",
    name: "Northstar Trading Ltd.",
    type: "Transaction",
    score: 85,
    risk: "High",
    status: "Open",
    date: "Today, 09:54",
    detail:
      "Six transfers in 24 hours exceeded the demo velocity threshold of five.",
  },
  {
    id: "ALT-1020",
    name: "Daniel Morgan",
    type: "Name screening",
    score: 100,
    risk: "Medium",
    status: "In review",
    date: "Today, 09:31",
    detail:
      "Exact name match on the internal demo watchlist. Compare identifiers before disposition.",
  },
  {
    id: "ALT-1019",
    name: "Emma Wilson",
    type: "Transaction",
    score: 72,
    risk: "Low",
    status: "Closed",
    date: "Yesterday",
    detail: "Reviewed demo transaction. No further action required.",
  },
];
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Alerts", Bell],
  ["Customer screening", ScanSearch],
  ["Customers", Users],
  ["Watchlists", Database],
  ["Transaction monitoring", ArrowLeftRight],
  ["Rule engine", SlidersHorizontal],
  ["Audit trail", FileText],
  ["Access management", Users],
  ["Account", ShieldCheck],
] as const;
export default function Home() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [screeningOutcome, setScreeningOutcome] = useState<{
    generated: boolean;
    name: string;
    count: number;
  } | null>(null);
  const [transactionOutcome, setTransactionOutcome] = useState<{
    generated: boolean;
    name: string;
  } | null>(null);
  const [page, setPage] = useState("Dashboard"),
    [alerts, setAlerts] = useState(initialAlerts),
    [watch, setWatch] = useState(initialWatch),
    [customers, setCustomers] = useState<Customer[]>([]),
    [rules, setRules] = useState({
      threshold: 80,
      amount: 1000000,
      velocity: 5,
      countryWeight: 40,
      locationWeight: 25,
      professionWeight: 35,
      screen: true,
      transaction: true,
    }),
    [ready, setReady] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All alerts"),
    [riskFilter, setRiskFilter] = useState(""),
    [selected, setSelected] = useState<Alert | null>(null),
    [notice, setNotice] = useState(""),
    [reviewNote, setReviewNote] = useState(""),
    [reviewError, setReviewError] = useState(""),
    [storageError, setStorageError] = useState(""),
    [transactions, setTransactions] = useState<Transaction[]>([]);
  const [serverMode, setServerMode] = useState(false);
  const revision = useRef(0);
  const [loginRequired, setLoginRequired] = useState(false),
    [loginError, setLoginError] = useState(""),
    [user, setUser] = useState<{
      id: string;
      username: string;
      role: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [editingCustomer, setEditingCustomer] = useState<Customer | null>(null),
    [auditRows, setAuditRows] = useState<
      {
        id: number;
        actor: string;
        action: string;
        subject: string;
        at: string;
      }[]
    >([]),
    [users, setUsers] = useState<
      { id: string; username: string; role: string; active: boolean }[]
    >([]);
  const [editingWatch, setEditingWatch] = useState<Person | null>(null);
  const busyRef = useRef(false);
  function applyWorkspace(v: ReturnType<typeof parseWorkspace>) {
    setAlerts(v.alerts);
    setWatch(v.watch);
    setCustomers(v.customers);
    setRules(v.rules);
    setTransactions(v.transactions);
    setSelected((previous) =>
      previous ? v.alerts.find((a) => a.id === previous.id) || null : null,
    );
  }
  async function refresh() {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = await response.json();
      if (result.mode === "server") setServerMode(true);
      if (response.status === 401) {
        setLoginRequired(true);
        setReady(false);
        return;
      }
      if (!response.ok)
        throw Error(result.error || "Workspace could not be loaded.");
      let v;
      if (result.mode === "server") {
        const auth = await fetch("/api/auth/me");
        const identity = await auth.json();
        if (!auth.ok) throw Error("Sign in to continue.");
        setUser(identity.user);
        revision.current = result.revision;
        v = parseWorkspace(result.workspace);
      } else {
        const raw =
          localStorage.getItem("ifound-v1") ??
          localStorage.getItem("sentinel-v1");
        if (raw) v = parseWorkspace(JSON.parse(raw));
      }
      if (v) applyWorkspace(v);
      setLoginRequired(false);
      setReady(true);
      setStorageError("");
    } catch (error) {
      setStorageError(
        "Saved data could not be loaded. " +
          (error instanceof Error
            ? error.message
            : "Storage requires recovery."),
      );
      setReady(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (!ready || serverMode) return;
    try {
      localStorage.setItem(
        "ifound-v1",
        JSON.stringify({ alerts, watch, customers, rules, transactions }),
      );
      setStorageError("");
    } catch {
      setStorageError(
        "Changes are not saved: browser storage is unavailable or full.",
      );
    }
  }, [alerts, watch, customers, rules, transactions, ready, serverMode]);
  async function command(
    path: string,
    method = "POST",
    body: Record<string, unknown> = {},
  ) {
    if (!ready || busyRef.current) {
      setNotice("Wait for the workspace to be ready.");
      return null;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const endpoint =
        method === "DELETE" ? `${path}?revision=${revision.current}` : path;
      const response = await fetch(`/api/${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body:
          method === "DELETE"
            ? undefined
            : JSON.stringify({ ...body, revision: revision.current }),
      });
      const result = await response.json();
      if (response.status === 401) {
        setLoginRequired(true);
        setReady(false);
      }
      if (response.status === 409) {
        setStorageError(
          (result.error || "Workspace changed.") +
            " Use Refresh workspace before retrying.",
        );
        setReady(false);
      }
      if (!response.ok) throw Error(result.error || "Operation failed.");
      if (result.workspace) {
        applyWorkspace(parseWorkspace(result.workspace));
        revision.current = result.revision;
      }
      setStorageError("");
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operation failed.");
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setLoginError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Sign in failed.");
      setUser(result.user);
      await refresh();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setLoginRequired(true);
    setReady(false);
    setLoginError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      setLoginError(
        "The server could not be reached. Please retry when it is available.",
      );
    } finally {
      setUser(null);
      setPage("Dashboard");
      setScreeningOutcome(null);
      setEditingCustomer(null);
      setEditingWatch(null);
      setAlerts([]);
      setWatch([]);
      setCustomers([]);
      setTransactions([]);
      setAuditRows([]);
      setUsers([]);
      setSelected(null);
      setBusy(false);
    }
  }
  async function loadAdminPage() {
    if (!serverMode || user?.role !== "Admin") return;
    try {
      if (page === "Audit trail") {
        const r = await fetch("/api/audit?limit=200");
        if (!r.ok) throw Error("Audit history could not be loaded.");
        setAuditRows(await r.json());
      }
      if (page === "Access management") {
        const r = await fetch("/api/users");
        if (!r.ok) throw Error("Users could not be loaded.");
        setUsers(await r.json());
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    }
  }
  useEffect(() => {
    loadAdminPage();
  }, [page, serverMode, user?.role]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".drawer");
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
      if (e.key === "Tab") {
        const items = dialog?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [selected?.id]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const go = (s: string) => {
    setPage(s);
    setNotificationsOpen(false);
    setScreeningOutcome(null);
    setQuery("");
    setFilter("All alerts");
    setRiskFilter("");
  };
  const open = alerts.filter((a) => a.status !== "Closed");
  const visible = alerts.filter(
    (a) =>
      (filter === "All alerts" || a.status === filter) &&
      (!riskFilter || a.risk === riskFilter) &&
      `${a.name} ${a.id} ${a.type}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function screen(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setScreeningOutcome(null);
    const f = Object.fromEntries(
      Array.from(new FormData(e.currentTarget), ([k, v]) => [
        k,
        String(v).trim(),
      ]),
    );
    if (serverMode) {
      const result = await command(
        editingCustomer ? `customers/${editingCustomer.id}` : "customers",
        editingCustomer ? "PUT" : "POST",
        f,
      );
      if (result) {
        setScreeningOutcome({
          generated: result.result.alertCount > 0,
          name: [f.first, f.middle, f.last].filter(Boolean).join(" "),
          count: result.result.alertCount,
        });
        setEditingCustomer(null);
        setNotice(
          result.result.alertCount
            ? "Customer saved. Screening alert created."
            : "Customer saved. No alert generated.",
        );
      }
      return;
    }
    const name = [f.first, f.middle, f.last].filter(Boolean).join(" ");
    if (!ready) {
      setNotice("Storage needs recovery before adding records.");
      return;
    }
    if (!/\p{L}/u.test(name) || name.length > 200) {
      setNotice("Enter a name of up to 200 characters.");
      return;
    }
    if (customers.length >= 20000 || alerts.length >= 20000) {
      setNotice("Workspace record limit reached.");
      return;
    }
    if (!validDate(f.dob) || !f.country || f.country.length > 100) {
      setNotice("Enter a valid country and past date of birth.");
      return;
    }
    const score = Math.round(
      (Number(f.countryRisk) * rules.countryWeight +
        Number(f.locationRisk) * rules.locationWeight +
        Number(f.professionRisk) * rules.professionWeight) /
        Math.max(
          1,
          rules.countryWeight + rules.locationWeight + rules.professionWeight,
        ),
    );
    const results = watch
      .map((w) => ({ ...w, ...nameMatch(name, w.name) }))
      .sort((a, b) => b.score - a.score);
    const customerId = crypto.randomUUID();
    setWatch((w) => [
      ...w,
      {
        id: `customer-${customerId}`,
        customerId,
        name,
        country: f.country,
        dob: f.dob,
        source: "Customer screening",
      },
    ]);
    setCustomers((c) => [
      {
        id: customerId,
        name,
        country: f.country,
        dob: f.dob,
        location: f.location,
        profession: f.profession,
        risk: score,
      },
      ...c,
    ]);
    const hits = results.filter((w) => w.score >= rules.threshold);
    if (hits.length && rules.screen) {
      setAlerts((a) => [
        {
          id: `ALT-${crypto.randomUUID()}`,
          name,
          type: "Name screening",
          evidence: hits[0],
          score: hits[0].score,
          risk: score >= 70 ? "High" : score >= 35 ? "Medium" : "Low",
          status: "Open",
          date: new Date().toISOString(),
          detail: `Matched ${hits[0].name} (${hits[0].source}). ${hits[0].matchMethod}; match score ${hits[0].score}%; text similarity ${hits[0].textScore}%. Country: ${f.country === hits[0].country ? "match" : "different / unknown"}; DOB: ${!!f.dob && f.dob === hits[0].dob ? "match" : "different / unknown"}. Threshold ${rules.threshold}%.`,
        },
        ...a,
      ]);
    }
    setScreeningOutcome({
      generated: !!hits.length && rules.screen,
      name,
      count: hits.length && rules.screen ? 1 : 0,
    });
    setNotice(
      hits.length && rules.screen
        ? "Customer saved. Screening alert created."
        : "Customer saved. No alert generated.",
    );
  }
  async function submitTransaction(
    f: Record<string, string>,
  ): Promise<Transaction | null> {
    if (serverMode) {
      const result = await command("transactions", "POST", f);
      if (!result) return null;
      setNotice(
        result.result.flag
          ? "Transaction saved and alert generated."
          : "Transaction saved. No active rule triggered.",
      );
      return result.result as Transaction;
    }
    if (!ready || transactions.length >= 20000 || alerts.length >= 20000) {
      setNotice("Workspace is unavailable or at its record limit.");
      return null;
    }
    const customer = customers.find(
      (c, i) => (c.id || `local-${i}`) === f.customerId,
    );
    if (!customer) {
      setNotice("Select an existing customer.");
      return null;
    }
    if (
      transactions.some(
        (t) =>
          t.reference?.toLowerCase() === f.reference.toLowerCase() ||
          t.id === f.idempotencyKey,
      )
    ) {
      setNotice("Transaction reference already exists.");
      return null;
    }
    const count = velocityCount(transactions, customer.name);
    const matches = rules.screen
      ? watch
          .map((w) => ({ ...w, ...nameMatch(f.beneficiary, w.name) }))
          .filter((w) => w.score >= rules.threshold)
      : [];
    const reasons = [
      rules.transaction && Number(f.amount) >= rules.amount
        ? "High-value transfer"
        : null,
      rules.transaction && count >= rules.velocity
        ? "Transaction velocity"
        : null,
      matches.length ? "Beneficiary watchlist match" : null,
    ].filter((r): r is string => !!r);
    const transaction: Transaction = {
      ...f,
      id: f.idempotencyKey,
      name: customer.name,
      amount: Number(f.amount).toFixed(2),
      destination: f.destination,
      count: String(count),
      at: new Date().toISOString(),
      flag: !!reasons.length,
      screened: rules.screen || rules.transaction,
      reasons,
      screeningRules: { ...rules },
      beneficiaryMatches: matches,
    };
    setTransactions((t) => [transaction, ...t]);
    if (transaction.flag)
      setAlerts((a) => [
        {
          id: `ALT-${crypto.randomUUID()}`,
          customerId: f.customerId,
          transactionId: transaction.id,
          name: customer.name,
          type: "Transaction",
          score: matches[0]?.score || (reasons.length > 1 ? 95 : 85),
          risk: "High",
          status: "Open",
          date: transaction.at!,
          detail: `${reasons.join(" and ")}. Reference ${f.reference}; beneficiary ${f.beneficiary}; amount ₹${transaction.amount}; ${count} transfers in 24 hours.`,
          reviews: [],
        },
        ...a,
      ]);
    setNotice(
      transaction.flag
        ? "Transaction saved and alert generated."
        : "Transaction saved. No active rule triggered.",
    );
    return transaction;
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!ready) throw Error("Storage needs recovery first.");
      if (file.size > 2_000_000) throw Error("File must be smaller than 2 MB.");
      const records = parseWatchlist(JSON.parse(await file.text()));
      if (serverMode) {
        const result = await command("watchlists/import", "POST", { records });
        if (result)
          setNotice(
            `${result.result.imported} records imported; duplicates skipped.`,
          );
        return;
      }
      const merged = mergeWatchlist(watch, records);
      setWatch(merged);
      setNotice(
        `${merged.length - watch.length} records imported; duplicates skipped.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invalid JSON.");
    }
    e.target.value = "";
  }
  function template() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            [
              {
                name: "Sample Person",
                country: "India",
                dob: "1980-01-01",
                source: "Internal watchlist",
              },
            ],
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    a.download = "watchlist-template.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const badge = (s: string) => (
    <span className={`badge ${s.toLowerCase().replace(" ", "-")}`}>
      {s === "Open" && <span className="dot" />}
      {s}
    </span>
  );
  const table = () => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Alert / Customer</th>
            <th>Alert type</th>
            <th>Match / Rule score</th>
            <th>Risk level</th>
            <th>Status</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((a) => (
            <tr
              key={a.id}
              onClick={() => (
                setReviewNote(""),
                setReviewError(""),
                setSelected(a)
              )}
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                (setReviewNote(""), setReviewError(""), setSelected(a))
              }
            >
              <td>
                <strong>{a.name}</strong>
                <small>{a.id}</small>
              </td>
              <td>
                <span className="type-icon">
                  {a.type === "Transaction" ? (
                    <ArrowLeftRight size={14} />
                  ) : (
                    <ScanSearch size={14} />
                  )}
                </span>
                {a.type}
              </td>
              <td>
                <div className="score">
                  <b>{a.score}%</b>
                  <span>
                    <i
                      style={{
                        width: `${a.score}%`,
                        background: a.score >= 90 ? "#da7265" : "#d9a44c",
                      }}
                    />
                  </span>
                </div>
              </td>
              <td>{badge(a.risk)}</td>
              <td>{badge(a.status)}</td>
              <td className="muted">{a.date}</td>
              <td>
                <ChevronRight size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!visible.length && (
        <div className="empty">No alerts match these filters.</div>
      )}
    </div>
  );
  if (loginRequired)
    return (
      <main className="login-page">
        <section className="panel form-panel">
          <div className="brand">
            <div className="brand-icon">
              <ShieldCheck size={25} />
            </div>
            ifound<span className="brand-dot">.</span>
          </div>
          <h1>Sign in</h1>

          {loginError && (
            <p className="validation-summary" role="alert">
              {loginError}
            </p>
          )}
          <ValidatedForm onSubmit={login}>
            <div className="fields">
              <label>
                Username
                <input
                  name="username"
                  required
                  autoComplete="username"
                  maxLength={64}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  maxLength={200}
                />
              </label>
            </div>
            <button className="primary" disabled={busy}>
              Sign in
            </button>
          </ValidatedForm>
        </section>
      </main>
    );
  return (
    <div className="app" aria-busy={busy}>
      <aside>
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={25} />
          </div>
          ifound<span className="brand-dot">.</span>
        </div>
        <nav>
          {nav
            .filter(
              ([label]) =>
                (label !== "Account" || serverMode) &&
                (!["Audit trail", "Access management"].includes(label) ||
                  (serverMode && user?.role === "Admin")),
            )
            .map(([label, Icon]) => (
              <button
                key={label}
                className={page === label ? "active" : ""}
                aria-current={page === label ? "page" : undefined}
                onClick={() => go(label)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {label === "Alerts" && (
                  <em className="alert-count">{open.length}</em>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar user">AA</div>
            <div>
              <b>{user?.username || "Local reviewer"}</b>
              <small>{user?.role || "Workspace admin"}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="header-right">
            {serverMode && (
              <button onClick={logout} disabled={busy}>
                Sign out
              </button>
            )}
            <div
              className="notifications"
              onKeyDown={(event) => {
                if (event.key === "Escape") setNotificationsOpen(false);
              }}
            >
              <button
                className="icon-button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                aria-controls="notifications-panel"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={20} />
              </button>
              {notificationsOpen && (
                <section
                  id="notifications-panel"
                  className="notifications-panel"
                  role="dialog"
                  aria-label="Notifications"
                >
                  <div>
                    <h2>Notifications</h2>
                    <button
                      className="icon-button"
                      aria-label="Close notifications"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <p>No notifications</p>
                </section>
              )}
            </div>
            <div className="avatar user">AA</div>
          </div>
        </header>
        <main
          className={
            page === "Customer screening" ? "screening-page" : undefined
          }
        >
          {storageError && (
            <div className="info" role="alert">
              {storageError}
              {serverMode && (
                <button disabled={busy} onClick={refresh}>
                  Refresh workspace
                </button>
              )}
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>{page === "Dashboard" ? "Dashboard" : page}</h1>
            </div>
            {page === "Dashboard" || page === "Customers" ? (
              <button
                className="primary"
                onClick={() => go("Customer screening")}
              >
                <Plus size={17} />
                Screen customer
              </button>
            ) : page === "Watchlists" ? (
              <label className="primary">
                <Upload size={17} />
                Import watchlist
                <input hidden type="file" accept=".json" onChange={upload} />
              </label>
            ) : null}
          </div>
          {page === "Dashboard" && (
            <>
              <div className="stats">
                {[
                  {
                    label: "Customers screened",
                    value: customers.length,
                    icon: Users,
                    note: "Customer records in this workspace",
                    color: "green",
                  },
                  {
                    label: "Open alerts",
                    value: open.length,
                    icon: Bell,
                    note: `${open.filter((a) => a.risk === "High").length} high-risk alerts need attention`,
                    color: "red",
                  },
                  {
                    label: "Transactions monitored",
                    value: transactions.length,
                    icon: ArrowLeftRight,
                    note: "Run a transaction to get started",
                    color: "blue",
                  },
                  {
                    label: "Watchlist records",
                    value: watch.length,
                    icon: Database,
                    note: "Available for customer screening",
                    color: "purple",
                  },
                ].map((s) => (
                  <section className="stat" key={s.label}>
                    <div>
                      <span>{s.label}</span>
                      <s.icon size={19} />
                    </div>
                    <strong>{s.value.toLocaleString()}</strong>
                  </section>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel activity">
                  <div className="panel-heading">
                    <div>
                      <h2>Alert activity</h2>
                    </div>
                    <span className="subtle">{alerts.length} total alerts</span>
                  </div>
                  <div className="bar-chart">
                    {["Open", "In review", "Closed"].map((s, i) => (
                      <div className="bar-column" key={s}>
                        <b>{alerts.filter((a) => a.status === s).length}</b>
                        <div
                          className="bar"
                          style={{
                            height: Math.max(
                              8,
                              (alerts.filter((a) => a.status === s).length /
                                Math.max(alerts.length, 1)) *
                                200,
                            ),
                            background: ["#163481", "#7789b7", "#c3cadc"][i],
                          }}
                        />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="chart-footer">
                    <span className="legend-dot" />
                    Live totals from your demo workspace
                  </div>
                </section>
                <section className="panel risk-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Alert risk distribution</h2>
                    </div>
                    <ShieldCheck size={20} className="muted" />
                  </div>
                  <div className="risk-body">
                    <div
                      className="donut"
                      style={{
                        background: `conic-gradient(#da786b 0 ${(alerts.filter((a) => a.risk === "High").length / Math.max(alerts.length, 1)) * 100}%,#e6b963 0 ${(alerts.filter((a) => a.risk === "High" || a.risk === "Medium").length / Math.max(alerts.length, 1)) * 100}%,#5d71a4 0)`,
                      }}
                    >
                      <div>
                        <b>{alerts.length}</b>
                        <span>total alerts</span>
                      </div>
                    </div>
                    <div className="risk-legend">
                      {["High", "Medium", "Low"].map((s) => (
                        <div key={s}>
                          <span>
                            <i className={s.toLowerCase()} />
                            {s} risk
                          </span>
                          <b>{alerts.filter((a) => a.risk === s).length}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    className="text-button risk-link"
                    onClick={() => {
                      go("Alerts");
                      setRiskFilter("High");
                    }}
                  >
                    Review high-risk alerts <ChevronRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {(page === "Dashboard" || page === "Alerts") && (
            <section className="panel alerts-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {page === "Dashboard" ? "Recent alerts" : "Alert queue"}{" "}
                    <span className="count alert-count">{alerts.length}</span>
                  </h2>
                </div>
                {page === "Dashboard" && (
                  <button className="text-button" onClick={() => go("Alerts")}>
                    View all alerts <ChevronRight size={16} />
                  </button>
                )}
              </div>
              <div className="table-toolbar">
                <div className="tabs">
                  {["All alerts", "Open", "In review", "Closed"].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search alerts"
                    placeholder="Search name or alert ID…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Risk filter"
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                >
                  <option value="">All risk levels</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              {table()}
              <div className="table-footer">
                Showing {visible.length} of {alerts.length} alerts
                <span>Click an alert to investigate</span>
              </div>
            </section>
          )}
          {page === "Customer screening" && (
            <div className="customer-screening-layout">
              {screeningOutcome && (
                <section
                  className={`evaluation-result ${screeningOutcome.generated ? "generated" : "not-generated"}`}
                  aria-label="Screening result"
                  aria-live="polite"
                >
                  {screeningOutcome.generated ? (
                    <Bell size={24} />
                  ) : (
                    <ShieldCheck size={24} />
                  )}
                  <div>
                    <h2>
                      {screeningOutcome.generated
                        ? "Alert generated"
                        : "No alert generated"}
                    </h2>
                    <p>
                      {screeningOutcome.name}
                      {screeningOutcome.generated
                        ? ` · ${screeningOutcome.count} ${screeningOutcome.count === 1 ? "alert" : "alerts"}`
                        : ""}
                    </p>
                  </div>
                </section>
              )}
              <section className="panel form-panel">
                <h2>Customer details</h2>

                <ValidatedForm
                  key={editingCustomer?.id || "new-customer"}
                  onSubmit={screen}
                >
                  <div className="fields screening-details">
                    <label>
                      First name
                      <input
                        name="first"
                        defaultValue={editingCustomer?.first || ""}
                        required
                        maxLength={200}
                        placeholder="e.g. Alexander"
                      />
                    </label>
                    <label>
                      Middle name <small>optional</small>
                      <input
                        name="middle"
                        defaultValue={editingCustomer?.middle || ""}
                        maxLength={200}
                        placeholder="Middle name"
                      />
                    </label>
                    <label>
                      Last name <small>optional</small>
                      <input
                        aria-label="Last name"
                        name="last"
                        defaultValue={editingCustomer?.last || ""}
                        maxLength={200}
                        placeholder="e.g. Petrov"
                      />
                    </label>
                    <label>
                      Date of birth
                      <input
                        name="dob"
                        defaultValue={editingCustomer?.dob || ""}
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                      />
                    </label>
                    <label>
                      Country
                      <input
                        name="country"
                        defaultValue={editingCustomer?.country || ""}
                        maxLength={100}
                        placeholder="e.g. Russia"
                        required
                      />
                    </label>
                    <label>
                      Location
                      <input
                        name="location"
                        defaultValue={editingCustomer?.location || ""}
                        maxLength={200}
                        placeholder="City or region"
                        required
                      />
                    </label>
                    <label>
                      Profession
                      <input
                        name="profession"
                        defaultValue={editingCustomer?.profession || ""}
                        maxLength={200}
                        placeholder="e.g. Business owner"
                      />
                    </label>
                  </div>
                  <div className="screening-risk-heading">
                    <h3>Risk assessment</h3>
                  </div>
                  <div className="fields screening-risk">
                    {["country", "location", "profession"].map((k) => (
                      <label key={k}>
                        {k.charAt(0).toUpperCase() + k.slice(1)} risk
                        <select
                          name={`${k}Risk`}
                          defaultValue={
                            editingCustomer?.[
                              `${k}Risk` as
                                | "countryRisk"
                                | "locationRisk"
                                | "professionRisk"
                            ] || 20
                          }
                        >
                          <option value="20">Low</option>
                          <option value="50">Medium</option>
                          <option value="90">High</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="screening-actions">
                    <button
                      className="primary"
                      type="submit"
                      disabled={busy || (serverMode && user?.role === "Viewer")}
                    >
                      <ScanSearch size={17} />
                      {editingCustomer
                        ? "Update & screen customer"
                        : "Save & screen customer"}
                    </button>
                    {editingCustomer && (
                      <button
                        type="button"
                        onClick={() => setEditingCustomer(null)}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </ValidatedForm>
              </section>
            </div>
          )}
          {page === "Watchlists" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Watchlist records{" "}
                    <span className="count">{watch.length}</span>
                  </h2>
                </div>
                <button onClick={template}>
                  <Download size={16} />
                  Download template
                </button>
              </div>
              {serverMode && user?.role === "Admin" && (
                <ValidatedForm
                  className="watchlist-editor"
                  key={editingWatch?.id || "new-watch"}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(e.currentTarget));
                    const result = await command(
                      editingWatch
                        ? `watchlists/${editingWatch.id}`
                        : "watchlists",
                      editingWatch ? "PUT" : "POST",
                      f,
                    );
                    if (result) {
                      setEditingWatch(null);
                      setNotice("Watchlist saved.");
                    }
                  }}
                >
                  <h3>
                    {editingWatch
                      ? "Edit watchlist record"
                      : "Add watchlist record"}
                  </h3>
                  <div className="fields">
                    <label>
                      Full name
                      <input
                        name="name"
                        required
                        maxLength={200}
                        defaultValue={editingWatch?.name || ""}
                      />
                    </label>
                    {["first", "middle", "last", "location", "profession"].map(
                      (field) => (
                        <label key={field}>
                          {
                            {
                              first: "First name",
                              middle: "Middle name",
                              last: "Last name",
                              location: "Location",
                              profession: "Profession",
                            }[field]
                          }
                          <input
                            name={field}
                            maxLength={200}
                            defaultValue={
                              editingWatch?.[
                                field as
                                  | "first"
                                  | "middle"
                                  | "last"
                                  | "location"
                                  | "profession"
                              ] || ""
                            }
                          />
                        </label>
                      ),
                    )}
                    <label>
                      Country
                      <input
                        name="country"
                        maxLength={100}
                        defaultValue={editingWatch?.country || ""}
                      />
                    </label>
                    <label>
                      Date of birth
                      <input
                        type="date"
                        name="dob"
                        max={new Date().toISOString().slice(0, 10)}
                        defaultValue={editingWatch?.dob || ""}
                      />
                    </label>
                    <label>
                      Source
                      <input
                        name="source"
                        required
                        maxLength={200}
                        defaultValue={
                          editingWatch?.source || "Internal watchlist"
                        }
                      />
                    </label>
                  </div>
                  <div className="fields watchlist-risk-fields">
                    {["country", "location", "profession"].map((field) => (
                      <label key={field}>
                        {field.charAt(0).toUpperCase() + field.slice(1)} risk
                        <select
                          name={`${field}Risk`}
                          defaultValue={
                            editingWatch?.[
                              `${field}Risk` as
                                | "countryRisk"
                                | "locationRisk"
                                | "professionRisk"
                            ] || 20
                          }
                        >
                          <option value="20">Low</option>
                          <option value="50">Medium</option>
                          <option value="90">High</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <button className="primary" disabled={busy}>
                    {editingWatch ? "Update record" : "Add record"}
                  </button>
                  {editingWatch && (
                    <button type="button" onClick={() => setEditingWatch(null)}>
                      Cancel edit
                    </button>
                  )}
                </ValidatedForm>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Full name</th>
                      <th>Country</th>
                      <th>Date of birth</th>
                      <th>Source</th>
                      <th>Location</th>
                      <th>Profession</th>
                      {serverMode && user?.role === "Admin" && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {watch.map((w, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{w.name}</strong>
                        </td>
                        <td>{w.country}</td>
                        <td>{w.dob}</td>
                        <td>
                          <span className="badge neutral">{w.source}</span>
                        </td>
                        <td>{w.location || "—"}</td>
                        <td>{w.profession || "—"}</td>
                        {serverMode && user?.role === "Admin" && (
                          <td className="row-actions">
                            <button onClick={() => setEditingWatch(w)}>
                              Edit
                            </button>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    `Delete ${w.name} from the watchlist?`,
                                  )
                                ) {
                                  const result = await command(
                                    `watchlists/${w.id}`,
                                    "DELETE",
                                  );
                                  if (result)
                                    setNotice("Watchlist record deleted.");
                                }
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Customers" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  Customer directory{" "}
                  <span className="count">{customers.length}</span>
                </h2>
              </div>
              {customers.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Country</th>
                        <th>Date of birth</th>
                        <th>Risk score</th>
                        {serverMode && user?.role !== "Viewer" && (
                          <th>Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>{c.country}</td>
                          <td>{c.dob || "Not provided"}</td>
                          <td>
                            {badge(
                              c.risk >= 70
                                ? "High"
                                : c.risk >= 35
                                  ? "Medium"
                                  : "Low",
                            )}{" "}
                            <b>{c.risk}/100</b>
                          </td>
                          {serverMode && user?.role !== "Viewer" && (
                            <td className="row-actions">
                              <button
                                onClick={() => {
                                  setEditingCustomer(c);
                                  go("Customer screening");
                                }}
                              >
                                Edit
                              </button>
                              <button
                                disabled={busy}
                                onClick={async () => {
                                  const result = await command(
                                    `customers/${c.id}/screen`,
                                  );
                                  if (result) setNotice("Customer screened.");
                                }}
                              >
                                Rescreen
                              </button>
                              {user?.role === "Admin" && (
                                <button
                                  disabled={busy}
                                  onClick={async () => {
                                    if (
                                      window.confirm(
                                        `Delete customer ${c.name}? Customers with transactions cannot be deleted.`,
                                      )
                                    ) {
                                      const result = await command(
                                        `customers/${c.id}`,
                                        "DELETE",
                                      );
                                      if (result)
                                        setNotice("Customer deleted.");
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <Users size={34} />
                  <h3>No customers yet</h3>

                  <button
                    className="primary"
                    onClick={() => go("Customer screening")}
                  >
                    Screen customer
                  </button>
                </div>
              )}
            </section>
          )}
          {page === "Transaction monitoring" && (
            <TransactionWorkspace
              transactions={transactions}
              customers={customers.map((c, i) => ({
                ...c,
                id: c.id || `local-${i}`,
              }))}
              alerts={alerts}
              busy={busy}
              canWrite={!serverMode || user?.role !== "Viewer"}
              onScreen={submitTransaction}
              onInvestigate={setSelected}
              onCreateCustomer={() => go("Customer screening")}
            />
          )}
          {page === "Rule engine" && (
            <ValidatedForm
              className="rules-form"
              key={`rules-${revision.current}`}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const nextRules = {
                  threshold: Number(f.get("threshold")),
                  amount: Number(f.get("amount")),
                  velocity: Number(f.get("velocity")),
                  countryWeight: Number(f.get("countryWeight")),
                  locationWeight: Number(f.get("locationWeight")),
                  professionWeight: Number(f.get("professionWeight")),
                  screen: f.get("screen") === "on",
                  transaction: f.get("transaction") === "on",
                };
                if (!ready || !validateRules(nextRules)) {
                  setNotice("Invalid rules or unavailable storage.");
                  return;
                }
                if (serverMode) {
                  const result = await command("rules", "PUT", {
                    rules: nextRules,
                  });
                  if (result)
                    setNotice(
                      "Rules saved. Changes apply to future evaluations.",
                    );
                  return;
                }
                setRules(nextRules);
                setNotice("Rules saved. Changes apply to future evaluations.");
              }}
            >
              <div className="form-layout">
                <section className="panel form-panel">
                  <div className="rule-title">
                    <span className="rule-icon">
                      <ScanSearch />
                    </span>
                    <div>
                      <h2>Name screening</h2>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        name="screen"
                        defaultChecked={rules.screen}
                      />{" "}
                      Enabled
                    </label>
                  </div>
                  <label className="block-label">
                    Alert threshold (%)
                    <input
                      name="threshold"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      required
                      defaultValue={rules.threshold}
                    />
                  </label>

                  <h3>Customer risk weights</h3>
                  <div className="fields">
                    {["country", "location", "profession"].map((k) => (
                      <label key={k}>
                        {k.charAt(0).toUpperCase() + k.slice(1)} weight
                        <input
                          name={`${k}Weight`}
                          type="number"
                          min="1"
                          max="100"
                          required
                          defaultValue={
                            rules[`${k}Weight` as keyof typeof rules] as number
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="panel form-panel">
                  <div className="rule-title">
                    <span className="rule-icon">
                      <ArrowLeftRight />
                    </span>
                    <div>
                      <h2>Transaction monitoring</h2>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        name="transaction"
                        defaultChecked={rules.transaction}
                      />{" "}
                      Enabled
                    </label>
                  </div>
                  <label className="block-label">
                    High-value amount (INR)
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max="1000000000000"
                      required
                      defaultValue={rules.amount}
                    />
                  </label>
                  <label className="block-label">
                    24-hour transfer count
                    <input
                      name="velocity"
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      required
                      defaultValue={rules.velocity}
                    />
                  </label>
                </section>
              </div>
              <div className="save-bar">
                <button
                  className="primary"
                  disabled={busy || (serverMode && user?.role !== "Admin")}
                >
                  <Check size={17} />
                  Save rules
                </button>
              </div>
            </ValidatedForm>
          )}
          {page === "Audit trail" && serverMode && user?.role === "Admin" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Audit history</h2>
                <button onClick={loadAdminPage}>Refresh audit history</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Subject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.at).toLocaleString()}</td>
                        <td>{r.actor}</td>
                        <td>{r.action}</td>
                        <td>{r.subject}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Access management" &&
            serverMode &&
            user?.role === "Admin" && (
              <section className="panel form-panel">
                <h2>Users & roles</h2>
                <ValidatedForm
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const values = Object.fromEntries(new FormData(form));
                    const result = await command("users", "POST", values);
                    if (result) {
                      form.reset();
                      await loadAdminPage();
                      setNotice("User created.");
                    }
                  }}
                >
                  <div className="fields">
                    <label>
                      Username
                      <input
                        name="username"
                        required
                        minLength={3}
                        maxLength={64}
                        pattern="[A-Za-z0-9._-]+"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Initial password
                      <input
                        name="password"
                        required
                        type="password"
                        minLength={12}
                        maxLength={200}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      Role
                      <select aria-label="Role" name="role">
                        <option>Reviewer</option>
                        <option>Viewer</option>
                        <option>Admin</option>
                      </select>
                    </label>
                  </div>
                  <button className="primary" disabled={busy}>
                    Create user
                  </button>
                </ValidatedForm>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.username}</td>
                          <td>
                            <select
                              aria-label={`Role for ${u.username}`}
                              disabled={busy || u.id === user.id}
                              value={u.role}
                              onChange={async (e) => {
                                const result = await command(
                                  `users/${u.id}`,
                                  "PUT",
                                  { role: e.target.value, active: u.active },
                                );
                                if (result) {
                                  await loadAdminPage();
                                  setNotice("User role updated.");
                                }
                              }}
                            >
                              <option>Admin</option>
                              <option>Reviewer</option>
                              <option>Viewer</option>
                            </select>
                          </td>
                          <td>{u.active ? "Active" : "Disabled"}</td>
                          <td>
                            <button
                              disabled={busy || u.id === user.id}
                              onClick={async () => {
                                const result = await command(
                                  `users/${u.id}`,
                                  "PUT",
                                  { role: u.role, active: !u.active },
                                );
                                if (result) {
                                  await loadAdminPage();
                                  setNotice("User access updated.");
                                }
                              }}
                            >
                              {u.active ? "Disable" : "Enable"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          {page === "Account" && serverMode && (
            <section className="panel form-panel account-panel">
              <h2>Change password</h2>

              <ValidatedForm
                onSubmit={async (e) => {
                  e.preventDefault();
                  const values = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  const result = await command("auth/password", "POST", values);
                  if (result) {
                    await logout();
                    setNotice("Password changed. Sign in again.");
                  }
                }}
              >
                <div className="fields">
                  <label>
                    Current password
                    <input
                      name="currentPassword"
                      type="password"
                      required
                      maxLength={200}
                      autoComplete="current-password"
                    />
                  </label>
                  <label>
                    New password
                    <input
                      name="newPassword"
                      type="password"
                      required
                      minLength={12}
                      maxLength={200}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <button className="primary" disabled={busy}>
                  Change password
                </button>
              </ValidatedForm>
            </section>
          )}
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Alert investigation"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close alert"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <div className="eyebrow">ALERT INVESTIGATION</div>
            <h1>{selected.name}</h1>
            <p className="muted">
              <span>{selected.id}</span> · {selected.type}
            </p>
            <div className="detail-badges">
              {badge(selected.risk)}
              {badge(selected.status)}
            </div>
            <div className="big-score">
              {selected.score}
              <span>%</span>
              <small>
                {selected.type === "Transaction"
                  ? "Rule score"
                  : "Name match score"}
              </small>
            </div>
            <h3>Why this alert was created</h3>
            <p className="detail-text">{selected.detail}</p>
            {selected.evidence?.matchMethod && (
              <dl className="transaction-summary">
                <div>
                  <dt>Matching method</dt>
                  <dd>{selected.evidence.matchMethod}</dd>
                </div>
                <div>
                  <dt>Text similarity</dt>
                  <dd>{selected.evidence.textScore}%</dd>
                </div>
                {!!selected.evidence.matchedTokens?.length && (
                  <div>
                    <dt>Matched name parts</dt>
                    <dd>
                      {selected.evidence.matchedTokens
                        .map((t) => `${t.input} → ${t.watchlist} (${t.code})`)
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <label className="block-label">
              Review notes
              <textarea
                value={reviewNote}
                onChange={(e) => {
                  setReviewNote(e.target.value);
                  if (e.target.value.trim()) setReviewError("");
                }}
                aria-invalid={!!reviewError}
                aria-describedby={reviewError ? "review-note-error" : undefined}
                maxLength={2000}
                placeholder="Evidence and reason for this decision"
              />
            </label>
            {reviewError && (
              <p className="field-error" id="review-note-error" role="alert">
                {reviewError}
              </p>
            )}
            <label className="block-label">
              Review status
              <select
                value={selected.status}
                disabled={busy || (serverMode && user?.role === "Viewer")}
                onChange={async (e) => {
                  if (!ready) return;
                  if (!reviewNote.trim()) {
                    setReviewError(
                      "Review notes are required before changing status.",
                    );
                    setNotice("Add review notes before changing status.");
                    return;
                  }
                  if (serverMode) {
                    const result = await command(
                      `alerts/${selected.id}/reviews`,
                      "POST",
                      { status: e.target.value, note: reviewNote.trim() },
                    );
                    if (result) {
                      setReviewNote("");
                      setNotice("Review decision recorded.");
                    }
                    return;
                  }
                  const updated = {
                    ...selected,
                    status: e.target.value,
                    reviews: [
                      ...(selected.reviews || []),
                      {
                        at: new Date().toISOString(),
                        status: e.target.value,
                        note: reviewNote.trim(),
                      },
                    ],
                  };
                  setSelected(updated);
                  setAlerts((a) =>
                    a.map((x) => (x.id === updated.id ? updated : x)),
                  );
                  setReviewNote("");
                  setNotice("Review decision recorded.");
                }}
              >
                <option>Open</option>
                <option>In review</option>
                <option>Closed</option>
              </select>
            </label>
            <h3>Review history</h3>
            {selected.reviews?.length
              ? selected.reviews.map((r, i) => (
                  <div className="match" key={i}>
                    <div>
                      <b>
                        {r.status} · {new Date(r.at).toLocaleString()}
                      </b>
                      {r.reviewer && <small>Reviewed by {r.reviewer}</small>}
                      <p>{r.note}</p>
                    </div>
                  </div>
                ))
              : null}
          </section>
        </div>
      )}
    </div>
  );
}
