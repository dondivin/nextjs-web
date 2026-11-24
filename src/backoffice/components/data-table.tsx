'use client'
import { useState } from 'react'
import { flexRender } from '@tanstack/react-table'
// TanStack Table v9 — the "legacy" entry keeps the familiar v8-style API (row-model getters) on top of v9.
import {
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useLegacyTable, type LegacyColumnDef,
} from '@tanstack/react-table/legacy'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/backoffice/components/ui/table'
import { Input } from '@/backoffice/components/ui/input'
import { Button } from '@/backoffice/components/ui/button'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Col<T> = LegacyColumnDef<T & object, any>
type SortingState = { id: string; desc: boolean }[]

/** Sortable, searchable, paginated table (TanStack Table + shadcn/ui). */
export function DataTable<T extends object>({
  columns, data, searchPlaceholder = 'Search…', toolbar, empty, pageSize = 20,
}: {
  columns: Col<T>[]
  data: T[]
  searchPlaceholder?: string
  toolbar?: React.ReactNode
  empty?: React.ReactNode
  pageSize?: number
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const table = useLegacyTable<T>({
    data, columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize } },
  })
  const rows = table.getRowModel().rows
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label={searchPlaceholder} />
        </div>
        {toolbar}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} style={{ width: h.column.columnDef.size !== 150 ? h.column.columnDef.size : undefined }}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span className="text-[10px] text-muted-foreground">{{ asc: '▲', desc: '▼' }[h.column.getIsSorted() as string] ?? ''}</span>
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((r) => (
              <TableRow key={r.id}>
                {r.getVisibleCells().map((c) => <TableCell key={c.id} className="align-top">{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">{empty || 'No results.'}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{table.getFilteredRowModel().rows.length} rows · page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft />Previous</Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next<ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
