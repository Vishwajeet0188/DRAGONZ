export function AdminHeader({ title, desc, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {desc && <p className="mt-1 text-sm text-ink-400">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}

export function Table({ head, children, empty }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-ink-700 text-xs uppercase tracking-wider text-ink-400">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-700/70">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
