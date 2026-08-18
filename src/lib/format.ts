export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Deposits can be in any currency (task examples use MYR), unlike rent/utilities which are USD-only so far. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
  } catch {
    // Unknown/invalid currency code — fall back to a plain prefix rather than throwing.
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** 'YYYY-MM' -> 'August 2026' */
export function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** 'YYYY-MM-DD' -> 'Aug 15, 2026' */
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
