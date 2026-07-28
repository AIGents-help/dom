// Shared visual primitives for the admin console. Extracted from
// AdminDashboardClient so dedicated full-page workspaces (e.g. /admin/leads)
// can reuse the exact same look without duplicating markup.

export const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent/60 focus:outline-none";
export const labelCls = "mb-1 block text-xs text-slate-500";

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-medium text-slate-300">
      {children}
    </span>
  );
}

export function Section({
  title,
  desc,
  children,
  action,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {action}
      </div>
      <p className="mb-6 text-sm text-slate-400">{desc}</p>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-white transition hover:border-accent/60 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: { key: string; onClick?: () => void; cells: React.ReactNode[] }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => (
              <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              onClick={row.onClick}
              className={`border-b border-border/60 last:border-0 ${row.onClick ? "cursor-pointer hover:bg-surface2/60" : ""}`}
            >
              {row.cells.map((cell, j) => (
                <td key={j} className="py-4 pr-4 text-slate-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
