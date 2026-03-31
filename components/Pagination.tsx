import PrefetchLink from "@/components/PrefetchLink";

function makeHref(basePath: string, query: Record<string, string | undefined>, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  if (page > 1) q.set("page", String(page)); else q.delete("page");
  const s = q.toString();
  return `${basePath}${s ? `?${s}` : ""}`;
}

export default function Pagination({
  basePath,
  query,
  currentPage,
  totalPages,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const window = 2;
  const start = Math.max(1, currentPage - window);
  const end = Math.min(totalPages, currentPage + window);
  const pages = [] as number[];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      <PrefetchLink
        href={makeHref(basePath, query, Math.max(1, currentPage - 1))}
        prefetch={currentPage > 1}
        aria-disabled={currentPage === 1}
        className={`rounded border px-3 py-1 text-sm ${currentPage === 1 ? "pointer-events-none opacity-50" : "hover:bg-gray-50"}`}
      >
        Prev
      </PrefetchLink>
      {start > 1 && (
        <PrefetchLink href={makeHref(basePath, query, 1)} prefetch={true} className="rounded border px-3 py-1 text-sm hover:bg-gray-50">1</PrefetchLink>
      )}
      {start > 2 && <span className="px-1 text-gray-500">…</span>}
      {pages.map((p) => (
        <PrefetchLink
          key={p}
          href={makeHref(basePath, query, p)}
          prefetch={true}
          aria-current={p === currentPage ? "page" : undefined}
          className={`rounded border px-3 py-1 text-sm ${p === currentPage ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          {p}
        </PrefetchLink>
      ))}
      {end < totalPages - 1 && <span className="px-1 text-gray-500">…</span>}
      {end < totalPages && (
        <PrefetchLink href={makeHref(basePath, query, totalPages)} prefetch={true} className="rounded border px-3 py-1 text-sm hover:bg-gray-50">{totalPages}</PrefetchLink>
      )}
      <PrefetchLink
        href={makeHref(basePath, query, Math.min(totalPages, currentPage + 1))}
        prefetch={currentPage < totalPages}
        aria-disabled={currentPage === totalPages}
        className={`rounded border px-3 py-1 text-sm ${currentPage === totalPages ? "pointer-events-none opacity-50" : "hover:bg-gray-50"}`}
      >
        Next
      </PrefetchLink>
    </nav>
  );
}


