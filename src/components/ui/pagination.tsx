import type { Pagination } from "@/lib/api/types";

/** Pie de paginación. Solo se muestra si hay más de una página. */
export function PaginationBar({ pagination, onPage }: { pagination: Pagination; onPage: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  const button =
    "h-8 cursor-pointer rounded-lg border border-button bg-white px-3 text-[12.5px] font-semibold text-ink-2 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex items-center justify-between border-t border-line-2 px-[18px] py-3 text-[12.5px] text-muted">
      <span>
        Página {page} de {totalPages} · {total} resultados
      </span>
      <div className="flex gap-2">
        <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <button type="button" className={button} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
