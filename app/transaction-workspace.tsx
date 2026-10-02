"use client";

import { useState } from "react";
import { ArrowLeft, Bell, Plus, ShieldCheck } from "lucide-react";
import ValidatedForm from "./validated-form";
import type { Alert, Customer, Transaction } from "../lib/compliance";

type Props = {
  transactions: Transaction[];
  customers: Customer[];
  alerts: Alert[];
  busy: boolean;
  canWrite: boolean;
  onScreen: (draft: Record<string, string>) => Promise<Transaction | null>;
  onInvestigate: (alert: Alert) => void;
  onCreateCustomer: () => void;
};
const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export default function TransactionWorkspace(props: Props) {
  const [view, setView] = useState<
    "register" | "create" | "review" | "details"
  >("register");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("All results");
  const [reviewFilter, setReviewFilter] = useState("All reviews");
  const [customerQuery, setCustomerQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const customer = props.customers.find((c) => c.id === draft.customerId);
  const resultLabel = (t: Transaction) =>
    t.screened === false
      ? "Not screened"
      : t.flag
        ? "Alert generated"
        : "No alert generated";
  const linked = (t: Transaction) =>
    props.alerts.filter((a) => !!t.id && a.transactionId === t.id);
  const reviewLabel = (t: Transaction) => {
    const items = linked(t);
    if (!items.length)
      return t.flag ? "Legacy review unavailable" : "Not required";
    return items.every((a) => a.status === "Closed")
      ? "Closed"
      : items.some((a) => a.status === "In review")
        ? "In review"
        : "Open";
  };
  const rows = props.transactions.filter(
    (t) =>
      `${t.reference || t.id || ""} ${t.name} ${t.beneficiary || ""} ${t.destination}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (resultFilter === "All results" || resultLabel(t) === resultFilter) &&
      (reviewFilter === "All reviews" || reviewLabel(t) === reviewFilter),
  );
  const details = (t: Transaction | Record<string, string>, name?: string) => (
    <dl className="transaction-summary">
      {[
        ["Reference", t.reference || t.id],
        ["Customer", name || t.name],
        ["Beneficiary", t.beneficiary],
        ["Beneficiary account / reference", t.beneficiaryAccount],
        [
          "Amount",
          `₹${Number(t.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} ${t.currency || "INR"}`,
        ],
        ["Destination country", t.destination],
        [
          "Transaction date",
          t.transactionDate
            ? new Date(t.transactionDate).toLocaleString()
            : t.at
              ? new Date(t.at).toLocaleString()
              : "—",
        ],
        ["Channel", t.channel],
        ["Purpose", t.purpose],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
  function start() {
    setDraft({
      reference: "",
      customerId: "",
      beneficiary: "",
      beneficiaryAccount: "",
      amount: "",
      currency: "INR",
      destination: "",
      transactionDate: localDate(),
      channel: "Bank transfer",
      purpose: "",
      idempotencyKey: crypto.randomUUID(),
    });
    setCustomerQuery("");
    setView("create");
  }
  async function screen() {
    if (submitting || props.busy) return;
    setSubmitting(true);
    try {
      const transaction = await props.onScreen({
        ...draft,
        transactionDate: new Date(draft.transactionDate).toISOString(),
      });
      if (transaction) {
        setSelected(transaction);
        setView("details");
      }
    } finally {
      setSubmitting(false);
    }
  }
  if (view === "register")
    return (
      <section className="panel transaction-register">
        <div className="panel-heading">
          <h2>
            Transactions{" "}
            <span className="count">{props.transactions.length}</span>
          </h2>
          <button
            className="primary"
            disabled={!props.canWrite || props.busy}
            onClick={start}
          >
            <Plus size={17} />
            New transaction
          </button>
        </div>
        <div className="table-toolbar">
          <input
            aria-label="Search transactions"
            placeholder="Search reference, customer or beneficiary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Screening result filter"
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
          >
            {[
              "All results",
              "Alert generated",
              "No alert generated",
              "Not screened",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Review status filter"
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
          >
            {["All reviews", "Open", "In review", "Closed", "Not required"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Reference",
                  "Customer",
                  "Beneficiary",
                  "Amount",
                  "Date",
                  "Screening result",
                  "Review status",
                  "",
                ].map((v, i) => (
                  <th key={i}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id || i}>
                  <td>
                    <strong>
                      {t.reference || t.id || "Legacy transaction"}
                    </strong>
                  </td>
                  <td>{t.name}</td>
                  <td>{t.beneficiary || "—"}</td>
                  <td>
                    ₹
                    {Number(t.amount).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td>
                    {t.transactionDate || t.at
                      ? new Date(
                          t.transactionDate || t.at!,
                        ).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`transaction-alert-badge ${t.flag ? "generated" : "not-generated"}`}
                    >
                      {resultLabel(t)}
                    </span>
                  </td>
                  <td>{reviewLabel(t)}</td>
                  <td>
                    <button
                      aria-label={`View transaction ${t.reference || t.id || i}`}
                      onClick={() => {
                        setSelected(t);
                        setView("details");
                      }}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            <h3>No transactions</h3>
          </div>
        )}
      </section>
    );
  return (
    <div className="transaction-workflow">
      <button
        className="text-button"
        disabled={props.busy || submitting}
        onClick={() => setView("register")}
      >
        <ArrowLeft size={17} />
        Back to transactions
      </button>
      {view === "create" && (
        <section className="panel form-panel">
          <h2>New transaction</h2>
          {!props.customers.length ? (
            <div className="empty">
              <h3>Add a customer first</h3>
              <button className="primary" onClick={props.onCreateCustomer}>
                Add customer
              </button>
            </div>
          ) : (
            <ValidatedForm
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(
                  new FormData(e.currentTarget),
                ) as Record<string, string>;
                setDraft({ ...draft, ...f });
                setView("review");
              }}
            >
              <h3>Customer</h3>
              <div className="fields">
                <label>
                  Search customers
                  <input
                    aria-label="Search customers"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                </label>
                <label>
                  Customer
                  <select
                    aria-label="Customer"
                    name="customerId"
                    required
                    value={draft.customerId}
                    onChange={(e) =>
                      setDraft({ ...draft, customerId: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      Select a customer
                    </option>
                    {props.customers
                      .filter(
                        (c) =>
                          c.id === draft.customerId ||
                          `${c.name} ${c.id}`
                            .toLowerCase()
                            .includes(customerQuery.toLowerCase()),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.id?.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {customer && (
                <dl
                  className="transaction-customer-details"
                  aria-label="Customer details"
                >
                  {[
                    ["Name", customer.name],
                    ["Country", customer.country],
                    ["Date of birth", customer.dob],
                    ["Location", customer.location],
                    ["Profession", customer.profession],
                    ["Risk score", `${customer.risk}/100`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <h3>Beneficiary</h3>
              <div className="fields">
                <label>
                  Beneficiary name
                  <input
                    name="beneficiary"
                    required
                    maxLength={200}
                    defaultValue={draft.beneficiary}
                  />
                </label>
                <label>
                  Beneficiary account / reference
                  <input
                    name="beneficiaryAccount"
                    required
                    maxLength={100}
                    defaultValue={draft.beneficiaryAccount}
                  />
                </label>
                <label>
                  Destination country
                  <input
                    name="destination"
                    required
                    maxLength={100}
                    defaultValue={draft.destination}
                  />
                </label>
              </div>
              <h3>Transaction</h3>
              <div className="fields">
                <label>
                  Transaction reference
                  <input
                    name="reference"
                    required
                    maxLength={100}
                    defaultValue={draft.reference}
                  />
                </label>
                <label>
                  Amount (INR)
                  <input
                    name="amount"
                    type="number"
                    required
                    min="0.01"
                    max="1000000000000"
                    step="0.01"
                    defaultValue={draft.amount}
                  />
                </label>
                <label>
                  Currency
                  <select name="currency" defaultValue="INR">
                    <option>INR</option>
                  </select>
                </label>
                <label>
                  Transaction date
                  <input
                    name="transactionDate"
                    type="datetime-local"
                    min="1970-01-02T00:00"
                    required
                    max={localDate()}
                    defaultValue={draft.transactionDate}
                  />
                </label>
                <label>
                  Channel
                  <select name="channel" defaultValue={draft.channel}>
                    {["Bank transfer", "UPI", "Card", "Cash"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Purpose
                  <input
                    name="purpose"
                    required
                    maxLength={500}
                    defaultValue={draft.purpose}
                  />
                </label>
              </div>
              <div className="screening-actions">
                <button type="button" onClick={() => setView("register")}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={props.busy || !props.canWrite}
                >
                  Review transaction
                </button>
              </div>
            </ValidatedForm>
          )}
        </section>
      )}
      {view === "review" && (
        <section className="panel form-panel">
          <h2>Review transaction</h2>
          {details(draft, customer?.name)}
          <div className="screening-actions">
            <button
              disabled={props.busy || submitting}
              onClick={() => setView("create")}
            >
              Edit details
            </button>
            <button
              className="primary"
              disabled={props.busy || submitting || !props.canWrite}
              onClick={screen}
            >
              {submitting ? "Screening…" : "Screen transaction"}
            </button>
          </div>
        </section>
      )}
      {view === "details" && selected && (
        <section className="panel form-panel">
          <h2>Transaction details</h2>
          <section
            className={`evaluation-result ${selected.flag ? "generated" : "not-generated"}`}
            aria-label="Transaction result"
            aria-live="polite"
          >
            {selected.flag ? <Bell size={24} /> : <ShieldCheck size={24} />}
            <div>
              <h2>{resultLabel(selected)}</h2>
              <p>{selected.reference || selected.id}</p>
            </div>
          </section>
          {details(selected)}
          <h3>Screening evidence</h3>
          <dl className="transaction-summary">
            <div>
              <dt>Screened at</dt>
              <dd>
                {selected.at ? new Date(selected.at).toLocaleString() : "—"}
              </dd>
            </div>
            <div>
              <dt>Transfers in preceding 24 hours</dt>
              <dd>{selected.count}</dd>
            </div>
            <div>
              <dt>Triggered rules</dt>
              <dd>
                {selected.reasons?.join(", ") ||
                  (selected.flag ? "See linked alert" : "None")}
              </dd>
            </div>
            <div>
              <dt>Review status</dt>
              <dd>{reviewLabel(selected)}</dd>
            </div>
          </dl>
          {selected.screeningRules && (
            <dl className="transaction-summary">
              <div>
                <dt>Amount threshold</dt>
                <dd>
                  {selected.screeningRules.transaction
                    ? `₹${selected.screeningRules.amount.toLocaleString("en-IN")}`
                    : "Disabled"}
                </dd>
              </div>
              <div>
                <dt>Velocity threshold</dt>
                <dd>
                  {selected.screeningRules.transaction
                    ? `${selected.screeningRules.velocity} transfers / 24h`
                    : "Disabled"}
                </dd>
              </div>
              <div>
                <dt>Beneficiary name threshold</dt>
                <dd>
                  {selected.screeningRules.screen
                    ? `${selected.screeningRules.threshold}%`
                    : "Disabled"}
                </dd>
              </div>
            </dl>
          )}
          {!!selected.beneficiaryMatches?.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Matched name</th>
                    <th>Source</th>
                    <th>Match score</th>
                    <th>Matching method</th>
                    <th>Text similarity</th>
                    <th>Country</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.beneficiaryMatches.map((m, i) => (
                    <tr key={m.id || i}>
                      <td>{m.name}</td>
                      <td>{m.source}</td>
                      <td>{m.score}%</td>
                      <td>{m.matchMethod || "Fuzzy name"}</td>
                      <td>{m.textScore ?? m.score}%</td>
                      <td>{m.country}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3>Linked alerts and review history</h3>
          {linked(selected).map((a) => (
            <div className="transaction-linked-alert" key={a.id}>
              <div>
                <strong>{a.id}</strong>
                <span>{a.status}</span>
              </div>
              <p>{a.detail}</p>
              <button onClick={() => props.onInvestigate(a)}>
                Open investigation
              </button>
              {a.reviews?.map((r, i) => (
                <div className="transaction-review" key={i}>
                  <strong>
                    {r.status} · {r.reviewer || "Reviewer"}
                  </strong>
                  <span>{new Date(r.at).toLocaleString()}</span>
                  <p>{r.note}</p>
                </div>
              ))}
            </div>
          ))}
          {!linked(selected).length && <p>No linked alerts</p>}
        </section>
      )}
    </div>
  );
}
