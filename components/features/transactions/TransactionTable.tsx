"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  VisibilityState,
  RowSelectionState,
} from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Settings2,
  Check,
  GripVertical,
  Search,
  Sparkles,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type Transaction = {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  amount: string;
  pending: boolean;
  postedDate: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  reviewed: boolean | null;
  categorizedByAi: boolean;
  tags?: { id: string; name: string; color: string }[];
};

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
};

async function readErrorMessage(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return `Request failed with status ${res.status}`;

  try {
    const data = JSON.parse(text);
    return data?.message || data?.error || text;
  } catch {
    return text;
  }
}

interface TransactionTableProps {
  filters: Record<string, string | null>;
  onSelectAll: (ids: string[]) => void;
  onTransactionClick?: (tx: Transaction) => void;
  onTotalChange?: (total: number) => void;
}

const ALL_COLUMNS: string[] = [
  "select",
  "date",
  "postedDate",
  "description",
  "ai",
  "account",
  "category",
  "tags",
  "amount",
];

const COLUMN_LABELS: Record<string, string> = {
  select: "",
  date: "Date",
  postedDate: "Posted",
  description: "Description",
  ai: "AI",
  account: "Account",
  category: "Category",
  tags: "Tags",
  amount: "Amount",
};

const COLUMN_MIN_WIDTHS: Record<string, number> = {
  select: 40,
  date: 90,
  postedDate: 90,
  description: 80,
  ai: 40,
  account: 60,
  category: 90,
  amount: 80,
};

function SortableHeader({
  column,
  title,
  dragHandleProps,
}: {
  column: any;
  title: string;
  dragHandleProps?: any;
}) {
  const canSort = column.getCanSort();
  return (
    <div className="flex items-center gap-1">
      {dragHandleProps && (
        <span
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      {canSort ? (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {title}
          {column.getIsSorted() === "asc" ? (
            <ChevronUp className="ml-0.5 h-3 w-3" />
          ) : column.getIsSorted() === "desc" ? (
            <ChevronDown className="ml-0.5 h-3 w-3" />
          ) : (
            <ChevronsUpDown className="ml-0.5 h-3 w-3 opacity-50" />
          )}
        </button>
      ) : (
        <span>{title}</span>
      )}
    </div>
  );
}

export default function TransactionTable({
  filters,
  onSelectAll,
  onTransactionClick,
  onTotalChange,
}: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const lastTotalParamsRef = useRef<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [prevFilters, setPrevFilters] = useState(filters);
  if (JSON.stringify(prevFilters) !== JSON.stringify(filters)) {
    setPrevFilters(filters);
    setPage(0);
  }
  const [sorting, setSorting] = useState<SortingState>(
    filters.sort
      ? [{ id: filters.sort as string, desc: (filters.order ?? 'desc') === 'desc' }]
      : [{ id: 'date', desc: true }]
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    select: true,
    account: true,
    category: true,
    postedDate: false,
    ai: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openCategoryTx, setOpenCategoryTx] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [proposedRule, setProposedRule] = useState<{
    payee: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);
  const [creatingAndRunningRule, setCreatingAndRunningRule] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(ALL_COLUMNS);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState<number | string>("100%");
  const limit = 50;

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(
    null,
  );
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [creatingCategoryLoading, setCreatingCategoryLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setColumnVisibility((prev) => ({
        ...prev,
        account: false,
      }));
    }
  }, []);

  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { credentials: "include" });
      const data = await res.json();
      const catList = Array.isArray(data) ? data : [];
      setCategories(catList);
      return catList;
    } catch {
      setCategories([]);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const calculateSizes = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const clientWidth = el.clientWidth;
    if (clientWidth <= 0) return;

    const isMobileSize = clientWidth < 768;
    const containerWidth = isMobileSize
      ? Math.max(clientWidth, 480)
      : clientWidth;
    setTableWidth(containerWidth);

    // Calculate dynamic column sizes based on actual content
    const hasPending = transactions.some((tx) => tx.pending);
    const dateWidth = hasPending ? 110 : 95;

    let maxCategoryWidth = 90;
    for (const tx of transactions) {
      const name = tx.categoryName || "Uncategorized";
      const charWidth = 6.5;
      const paddingAndIcons = 55 + (tx.categorizedByAi ? 15 : 0);
      const estimatedWidth = Math.ceil(
        name.length * charWidth + paddingAndIcons,
      );
      if (estimatedWidth > maxCategoryWidth) {
        maxCategoryWidth = estimatedWidth;
      }
    }
    const categoryWidth = Math.min(180, maxCategoryWidth);

    let maxAmountWidth = 80;
    for (const tx of transactions) {
      const num = parseFloat(tx.amount);
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        signDisplay: "exceptZero",
      }).format(num);
      const estimatedWidth = Math.ceil(formatted.length * 8.5 + 24);
      if (estimatedWidth > maxAmountWidth) {
        maxAmountWidth = estimatedWidth;
      }
    }
    const amountWidth = Math.min(150, maxAmountWidth);

    const visibleCols = columnOrder.filter(
      (id) => columnVisibility[id] !== false,
    );
    const fixedSizes: Record<string, number> = {
      select: 40,
      date: dateWidth,
      postedDate: 90,
      ai: 40,
      category: categoryWidth,
      amount: amountWidth,
    };
    if (isMobileSize) {
      const hasDesc = visibleCols.includes("description");
      const hasAccount = visibleCols.includes("account");

      // Calculate total fixed width of all other columns
      const otherFixedTotal =
        40 +
        dateWidth +
        (visibleCols.includes("postedDate") ? 90 : 0) +
        (visibleCols.includes("ai") ? 40 : 0) +
        categoryWidth +
        amountWidth;
      const availableForFlex = containerWidth - otherFixedTotal;

      if (hasDesc && hasAccount) {
        // Both description and account are visible on mobile, share the space
        const flexSpace = Math.max(140, availableForFlex); // 80 (desc min) + 60 (account min) = 140
        fixedSizes.account = Math.max(60, Math.floor(flexSpace * (0.6 / 1.8)));
        fixedSizes.description = Math.max(
          80,
          Math.floor(flexSpace * (1.2 / 1.8)),
        );
      } else if (hasDesc) {
        fixedSizes.description = Math.max(80, Math.min(200, availableForFlex));
      } else if (hasAccount) {
        fixedSizes.account = Math.max(60, Math.min(150, availableForFlex));
      }
    }
    const flexibleCols = visibleCols.filter((id) => !(id in fixedSizes));

    const fixedTotal = visibleCols
      .filter((id) => id in fixedSizes)
      .reduce((s, id) => s + fixedSizes[id], 0);

    const remaining = Math.max(containerWidth - fixedTotal - 8, 300);

    const flexRatios: Record<string, number> = {
      date: 1,
      postedDate: 1,
      description: clientWidth < 1024 ? (clientWidth < 900 ? 1.2 : 1.6) : 2.5,
      account: clientWidth < 1024 ? (clientWidth < 900 ? 0.6 : 0.8) : 1.2,
      category: 1.5,
      amount: 1,
    };

    const sizes: Record<string, number> = { ...fixedSizes };
    if (flexibleCols.length > 0) {
      // Initialize with min widths to ensure no alignment mismatch
      const flexSizes: Record<string, number> = {};
      let allocated = 0;
      for (const id of flexibleCols) {
        const minW = COLUMN_MIN_WIDTHS[id] || 60;
        flexSizes[id] = minW;
        allocated += minW;
      }

      const extraSpace = remaining - allocated;
      if (extraSpace > 0) {
        const totalRatio = flexibleCols.reduce(
          (s, id) => s + (flexRatios[id] || 1),
          0,
        );
        let distributedExtra = 0;
        flexibleCols.forEach((id, index) => {
          const ratio = flexRatios[id] || 1;
          if (index === flexibleCols.length - 1) {
            flexSizes[id] += extraSpace - distributedExtra;
          } else {
            const extra = Math.floor((extraSpace * ratio) / totalRatio);
            flexSizes[id] += extra;
            distributedExtra += extra;
          }
        });
      }
      for (const id of flexibleCols) {
        sizes[id] = flexSizes[id];
      }
    }

    setColumnSizing((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(sizes)) return prev;
      return sizes;
    });
  }, [columnOrder, columnVisibility, transactions]);

  useEffect(() => {
    calculateSizes();
  }, [calculateSizes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => calculateSizes());
    ro.observe(el);
    return () => ro.disconnect();
  }, [calculateSizes]);

  const handleSetCategory = useCallback(
    async (
      txId: string,
      categoryId: string | null,
      categoryName?: string | null,
      categoryColor?: string | null,
    ) => {
      const prevTx = transactions.find((t) => t.id === txId);
      const wasUncategorized = prevTx && !prevTx.categoryId;

      const res = await fetch(`/api/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryId }),
      });
      if (res.ok) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === txId
              ? {
                  ...t,
                  categoryId,
                  categoryName: categoryName ?? null,
                  categoryColor: categoryColor ?? null,
                }
              : t,
          ),
        );

        if (
          wasUncategorized &&
          categoryId &&
          (prevTx?.payee || prevTx?.description)
        ) {
          setProposedRule({
            payee: prevTx.payee || prevTx.description,
            categoryId,
            categoryName: categoryName || "",
          });
        }
      }
      setOpenCategoryTx(null);
      setDropdownPos(null);
      setCategoryFilter("");
    },
    [transactions],
  );

  const handleCreateCategory = useCallback(
    async (txId: string) => {
      if (!newCategoryName.trim()) return;
      setCreatingCategoryLoading(true);
      try {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: newCategoryName.trim(),
            parentId: newCategoryParentId || null,
            color: newCategoryColor,
            isIncome: newCategoryIsIncome,
          }),
        });

        if (res.ok) {
          const createdData = await res.json();
          const updatedCats = await fetchCategories();
          const matchingCat =
            updatedCats.find(
              (c) =>
                c.name.toLowerCase() === newCategoryName.trim().toLowerCase(),
            ) || updatedCats.find((c) => c.id === createdData.id);

          if (matchingCat) {
            await handleSetCategory(
              txId,
              matchingCat.id,
              matchingCat.name,
              matchingCat.color,
            );
          } else {
            await handleSetCategory(
              txId,
              createdData.id,
              newCategoryName.trim(),
              newCategoryColor,
            );
          }
          setIsCreatingCategory(false);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setCreatingCategoryLoading(false);
      }
    },
    [
      newCategoryName,
      newCategoryParentId,
      newCategoryColor,
      newCategoryIsIncome,
      fetchCategories,
      handleSetCategory,
    ],
  );

  const handleCreateRule = useCallback(async () => {
    if (!proposedRule) return;
    await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: `Auto-rule: ${proposedRule.payee}`,
        conditionField: "payee",
        conditionOperator: "contains",
        conditionValue: proposedRule.payee,
        setCategoryId: proposedRule.categoryId,
      }),
    });
    setProposedRule(null);
  }, [proposedRule]);

  const handleCreateAndRunRule = useCallback(async () => {
    if (!proposedRule) return;
    setCreatingAndRunningRule(true);
    try {
      // Create the rule
      const createRes = await fetch("/api/category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `Auto-rule: ${proposedRule.payee}`,
          conditionField: "payee",
          conditionOperator: "contains",
          conditionValue: proposedRule.payee,
          setCategoryId: proposedRule.categoryId,
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to create rule");
      }

      const rule = await createRes.json();

      // Apply the rule to all transactions
      const applyRes = await fetch(`/api/category-rules/${rule.id}/apply`, {
        method: "POST",
        credentials: "include",
      });

      if (!applyRes.ok) {
        throw new Error("Failed to apply rule");
      }

      // Refresh the transactions table
      setPage(0);
      setProposedRule(null);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingAndRunningRule(false);
    }
  }, [proposedRule]);


  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      if (sorting.length > 0) {
        const sort = sorting[0];
        params.set("sort", sort.id);
        params.set("order", sort.desc ? "desc" : "asc");
      }
      const totalParams = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        // sort and order are handled by the sorting state above
        if (key === 'sort' || key === 'order') continue;
        if (value) {
          params.set(key, value);
          totalParams.set(key, value);
        }
      }
      const res = await fetch(`/api/transactions?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const data = await res.json();
      setTransactions(
        (data.data || []).map((tx: any) => ({
          ...tx,
          categoryName: tx.category?.name ?? null,
          categoryColor: tx.category?.color ?? null,
        })),
      );
      setTotal(data.total ?? 0);
      onTotalChange?.(data.total ?? 0);

      // Lazy load total amount
      if (data.totalAmount !== null && data.totalAmount !== undefined) {
        setTotalAmount(data.totalAmount);
      } else {
        const totalParamsStr = totalParams.toString();
        const filtersChanged = totalParamsStr !== lastTotalParamsRef.current;
        if (filtersChanged || totalAmount === null) {
          lastTotalParamsRef.current = totalParamsStr;
          setTotalAmount(null); // Show "Calculating..."
          totalParams.set("totalAmountOnly", "true");
          fetch(`/api/transactions?${totalParams.toString()}`, {
            credentials: "include",
          })
            .then(async (res) => {
              if (!res.ok) {
                throw new Error(await readErrorMessage(res));
              }
              return res.json();
            })
            .then((totalData) => {
              setTotalAmount(totalData.totalAmount ?? 0);
            })
            .catch((err) => {
              console.error("Failed to fetch transaction total amount", err);
              setTotalAmount(0);
            });
        }
      }
    } catch (err) {
      console.error("Failed to fetch transactions", err);
      setTransactions([]);
      setTotal(0);
      setTotalAmount(0);
      onTotalChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, sorting]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const selected = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    setSelectedIds(new Set(selected));
  }, [rowSelection]);

  useEffect(() => {
    onSelectAll(Array.from(selectedIds));
  }, [selectedIds, onSelectAll]);

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return {
      text: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        signDisplay: "exceptZero",
      }).format(num),
    };
  };

  const totalPages = Math.ceil(total / limit);

  const handleDragStart = useCallback((e: React.DragEvent, colId: string) => {
    setDragColId(colId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", colId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(colId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetColId: string) => {
      e.preventDefault();
      const sourceColId = dragColId || e.dataTransfer.getData("text/plain");
      if (!sourceColId || sourceColId === targetColId) {
        setDragColId(null);
        setDropTargetId(null);
        return;
      }
      setColumnOrder((prev) => {
        const copy = [...prev];
        const srcIdx = copy.indexOf(sourceColId);
        const tgtIdx = copy.indexOf(targetColId);
        if (srcIdx === -1 || tgtIdx === -1) return prev;
        copy.splice(srcIdx, 1);
        copy.splice(tgtIdx, 0, sourceColId);
        return copy;
      });
      setDragColId(null);
      setDropTargetId(null);
    },
    [dragColId],
  );

  const handleDragEnd = useCallback(() => {
    setDragColId(null);
    setDropTargetId(null);
  }, []);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="rounded border-border bg-background text-primary focus:ring-ring"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-border bg-background text-primary focus:ring-ring"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "date",
        header: ({ column }) => <SortableHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const tx = row.original;
          const isPending = tx.pending;
          return (
            <div className="whitespace-nowrap truncate flex items-center">
              <span className="text-foreground text-sm">
                {new Date(row.getValue("date")).toLocaleDateString()}
              </span>
              {isPending && (
                <span
                  className="ml-1.5 inline-flex items-center text-chart-3"
                  title="Pending"
                >
                  <svg
                    className="h-2 w-2 animate-pulse"
                    fill="currentColor"
                    viewBox="0 0 8 8"
                  >
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "postedDate",
        accessorKey: "postedDate",
        header: ({ column }) => (
          <SortableHeader column={column} title="Posted" />
        ),
        cell: ({ row }) => {
          const val = row.getValue("postedDate") as string | null;
          return (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {val ? new Date(val).toLocaleDateString() : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "description",
        header: ({ column }) => (
          <SortableHeader column={column} title="Description" />
        ),
        cell: ({ row }) => {
          const tx = row.original;
          const isPending = tx.pending;
          const searchQuery =
            tx.payee && tx.description && tx.payee !== tx.description
              ? `${tx.payee} ${tx.description}`
              : tx.payee || tx.description;

          return (
            <div className="flex items-center justify-between w-full min-w-0 pr-1 group-hover:pr-0">
              <span
                className={`text-sm truncate min-w-0 flex-1 max-w-[10ch] sm:max-w-[15ch] md:max-w-[20ch] lg:max-w-[28ch] xl:max-w-[36ch] 2xl:max-w-none ${isPending ? "text-muted-foreground" : "text-foreground"}`}
              >
                {tx.payee || tx.description}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-primary transition-all p-1 -m-1 rounded-md text-muted-foreground/60 hover:bg-muted flex-shrink-0 ml-1.5"
                title="Search on Google"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
      {
        id: "ai",
        accessorFn: (row) => row.categorizedByAi,
        header: ({ column }) => <SortableHeader column={column} title="AI" />,
        cell: ({ row }) => {
          const categorizedByAi = row.getValue("ai") as boolean;
          if (!categorizedByAi) return null;
          return (
            <div
              className="flex items-center justify-center"
              title="Categorized by AI"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary/70" />
            </div>
          );
        },
      },
      {
        id: "account",
        accessorKey: "accountName",
        header: ({ column }) => (
          <SortableHeader column={column} title="Account" />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate block max-w-[10ch] sm:max-w-[15ch] md:max-w-[20ch] lg:max-w-[25ch] xl:max-w-[30ch] 2xl:max-w-none">
            {row.original.accountName || "—"}
          </span>
        ),
      },
      {
        id: "category",
        accessorKey: "categoryName",
        header: ({ column }) => (
          <SortableHeader column={column} title="Category" />
        ),
        meta: { className: "overflow-visible" },
        cell: ({ row }) => {
          const tx = row.original;
          const isOpen = openCategoryTx === tx.id;
          const parents = categories.filter((c) => !c.parentId);
          const getChildren = (parentId: string) =>
            categories.filter((c) => c.parentId === parentId);

          return (
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  const dropdownWidth = 224;
                  let left = rect.left;
                  if (left + dropdownWidth > window.innerWidth - 8) {
                    left = window.innerWidth - dropdownWidth - 8;
                  }
                  if (left < 8) left = 8;

                  const dropdownHeight = 320; // max-h-80 is 320px
                  let top = rect.bottom + 4;
                  if (rect.bottom + dropdownHeight > window.innerHeight - 16) {
                    top = rect.top - dropdownHeight - 4;
                  }
                  setDropdownPos({ top, left });
                  setOpenCategoryTx(isOpen ? null : tx.id);
                }}
                className="flex items-center gap-1 max-w-full group/cat"
              >
                {tx.categoryName ? (
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-medium inline-flex items-center gap-1 whitespace-nowrap truncate max-w-full"
                    style={{
                      backgroundColor: `${tx.categoryColor}22`,
                      color: tx.categoryColor || "var(--color-primary)",
                    }}
                  >
                    {tx.categorizedByAi && (
                      <Sparkles className="h-3 w-3 flex-shrink-0 opacity-60" />
                    )}
                    {tx.categoryName}
                    <ChevronDown className="h-3 w-3 opacity-40 group-hover/cat:opacity-100 transition-opacity flex-shrink-0" />
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs rounded-full inline-flex items-center gap-1 whitespace-nowrap bg-muted text-muted-foreground group-hover/cat:text-foreground transition-colors">
                    Uncategorized
                    <ChevronDown className="h-3 w-3 opacity-40 group-hover/cat:opacity-100 transition-opacity flex-shrink-0" />
                  </span>
                )}
              </button>
              {isOpen && dropdownPos && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenCategoryTx(null);
                      setDropdownPos(null);
                      setCategoryFilter("");
                      setIsCreatingCategory(false);
                    }}
                  />
                  <div
                    className="fixed z-50 w-56 bg-card border border-border rounded-lg shadow-xl max-h-80 flex flex-col"
                    style={{ top: dropdownPos.top, left: dropdownPos.left }}
                  >
                    {isCreatingCategory ? (
                      <div className="p-3 space-y-2 flex flex-col text-xs">
                        <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-0.5">
                          New Category
                        </div>
                        <div>
                          <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">
                            Name
                          </label>
                          <input
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Category name"
                            className="w-full px-2 py-1 bg-background border border-input rounded text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">
                            Parent Category
                          </label>
                          <select
                            value={newCategoryParentId || ""}
                            onChange={(e) =>
                              setNewCategoryParentId(e.target.value || null)
                            }
                            className="w-full px-2 py-1 bg-background border border-input rounded text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">None (top-level)</option>
                            {categories
                              .filter((c) => !c.parentId)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="color"
                              value={newCategoryColor}
                              onChange={(e) =>
                                setNewCategoryColor(e.target.value)
                              }
                              className="w-5 h-5 rounded cursor-pointer border border-input"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {newCategoryColor}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              id={`table-new-category-income-${tx.id}`}
                              checked={newCategoryIsIncome}
                              onChange={(e) =>
                                setNewCategoryIsIncome(e.target.checked)
                              }
                              className="rounded border-border text-primary focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <label
                              htmlFor={`table-new-category-income-${tx.id}`}
                              className="text-[9px] font-medium text-muted-foreground"
                            >
                              Income
                            </label>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-border/50">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsCreatingCategory(false);
                            }}
                            className="flex-1 py-1 text-[10px] text-foreground bg-muted hover:bg-accent rounded transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateCategory(tx.id);
                            }}
                            disabled={
                              creatingCategoryLoading || !newCategoryName.trim()
                            }
                            className="flex-1 py-1 text-[10px] font-semibold text-primary-foreground bg-primary rounded hover:opacity-90 disabled:opacity-50 transition-all"
                          >
                            {creatingCategoryLoading ? "Saving..." : "Create"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="relative p-2 border-b border-border">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <input
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            placeholder="Search categories..."
                            className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-56">
                          {(() => {
                            const filter = categoryFilter.toLowerCase();
                            const filteredParents = filter
                              ? parents.filter(
                                  (p) =>
                                    p.name.toLowerCase().includes(filter) ||
                                    getChildren(p.id).some((c) =>
                                      c.name.toLowerCase().includes(filter),
                                    ),
                                )
                              : parents;

                            const noResults = filteredParents.length === 0;
                            return (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetCategory(tx.id, null, null, null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors text-left"
                                >
                                  None
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCreatingCategory(true);
                                    setNewCategoryName("");
                                    setNewCategoryParentId(null);
                                    setNewCategoryColor("#6366f1");
                                    setNewCategoryIsIncome(false);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-muted font-medium border-b border-border/50 transition-colors text-left"
                                >
                                  + Create new category
                                </button>
                                {filteredParents.map((parent) => {
                                  const childList = filter
                                    ? getChildren(parent.id).filter((c) =>
                                        c.name.toLowerCase().includes(filter),
                                      )
                                    : getChildren(parent.id);
                                  if (
                                    filter &&
                                    childList.length === 0 &&
                                    !parent.name.toLowerCase().includes(filter)
                                  )
                                    return null;
                                  return (
                                    <div key={parent.id}>
                                      <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30">
                                        <div
                                          className="w-1.5 h-1.5 rounded-full"
                                          style={{
                                            backgroundColor: parent.color,
                                          }}
                                        />
                                        {parent.name}
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSetCategory(
                                            tx.id,
                                            parent.id,
                                            parent.name,
                                            parent.color,
                                          );
                                        }}
                                        className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs transition-colors text-left ${
                                          tx.categoryId === parent.id
                                            ? "text-primary bg-primary/10"
                                            : "text-foreground/80 hover:bg-muted"
                                        }`}
                                      >
                                        <div
                                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                          style={{
                                            backgroundColor: parent.color,
                                          }}
                                        />
                                        {parent.name}
                                      </button>
                                      {childList.map((child) => (
                                        <button
                                          key={child.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSetCategory(
                                              tx.id,
                                              child.id,
                                              child.name,
                                              child.color,
                                            );
                                          }}
                                          className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs transition-colors text-left ${
                                            tx.categoryId === child.id
                                              ? "text-primary bg-primary/10"
                                              : "text-foreground/80 hover:bg-muted"
                                          }`}
                                        >
                                          <div
                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{
                                              backgroundColor: child.color,
                                            }}
                                          />
                                          {child.name}
                                          {tx.categoryId === child.id && (
                                            <Check className="ml-auto h-3 w-3" />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })}
                                {noResults && (
                                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                                    No categories found
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <SortableHeader column={column} title="Amount" />
        ),
        cell: ({ row }) => {
          const { text } = formatAmount(row.getValue("amount"));
          return (
            <span className="text-right text-sm font-mono font-medium text-foreground block financial-value">
              {text}
            </span>
          );
        },
        meta: { className: "text-right" },
      },
      {
        id: "tags",
        accessorFn: (row) => row.tags?.map((t) => t.name).join(', ') ?? '',
        header: 'Tags',
        enableSorting: false,
        cell: ({ row }) => {
          const txTags = row.original.tags ?? [];
          if (txTags.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1">
              {txTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
                  style={{
                    backgroundColor: `${tag.color}22`,
                    color: tag.color,
                    border: `1px solid ${tag.color}44`,
                  }}
                  title={tag.name}
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          );
        },
      },
    ],
    [
      categories,
      openCategoryTx,
      handleSetCategory,
      categoryFilter,
      dropdownPos,
      isCreatingCategory,
      newCategoryName,
      newCategoryParentId,
      newCategoryColor,
      newCategoryIsIncome,
      creatingCategoryLoading,
      handleCreateCategory,
    ],
  );

  const table = useReactTable({
    data: transactions,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    enableSortingRemoval: false,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  return (
    <>
      <div
        className="bg-card border border-border rounded-xl overflow-hidden"
        ref={containerRef}
      >
        {loading ? (
          <LoadingSpinner category="transactions" className="p-12" />
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-base mb-4">
              No transactions found.
            </p>
            <a
              href="/settings"
              className="inline-block px-5 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              Connect a Financial Institution
            </a>
          </div>
        ) : (
          <>
            {/* Column config toolbar */}
            <div className="flex items-center justify-end px-3 py-1.5 border-b border-border">
              <div className="relative">
                <button
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Columns
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                      Toggle columns
                    </div>
                    {ALL_COLUMNS.map((colId) => {
                      const col = table.getColumn(colId);
                      const isVisible = col?.getIsVisible() ?? true;
                      return (
                        <button
                          key={colId}
                          onClick={() => {
                            const col = table.getColumn(colId);
                            if (col) col.toggleVisibility(!col.getIsVisible());
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors"
                        >
                          {isVisible ? (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3 w-3 text-muted-foreground/50" />
                          )}
                          <span className={isVisible ? "" : "opacity-50"}>
                            {COLUMN_LABELS[colId]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto no-scrollbar">
              <table
                className="text-sm border-collapse"
                style={{ tableLayout: "fixed", width: tableWidth }}
              >
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-border">
                      {headerGroup.headers.map((header) => {
                        const colId = header.id;
                        const isVisible = header.column.getIsVisible();
                        if (!isVisible) return null;

                        const size =
                          columnSizing[colId] ||
                          header.getSize() ||
                          COLUMN_MIN_WIDTHS[colId] ||
                          80;
                        const isDropTarget =
                          dropTargetId === colId && dragColId !== colId;

                        return (
                          <th
                            key={header.id}
                            className={`px-3 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider relative select-none ${
                              colId !== "select" ? "cursor-pointer" : ""
                            } ${isDropTarget ? "border-l-2 border-l-primary" : ""} ${
                              header.column.columnDef.meta?.className ||
                              "text-left"
                            }`}
                            style={{
                              width: size,
                              minWidth: COLUMN_MIN_WIDTHS[colId] || 60,
                              maxWidth: 500,
                            }}
                          >
                            <div
                              className={`flex items-center ${header.column.columnDef.meta?.className?.includes("text-right") ? "justify-end" : ""}`}
                            >
                              {colId !== "select" && (
                                <span
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, colId)}
                                  onDragOver={(e) => handleDragOver(e, colId)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, colId)}
                                  onDragEnd={handleDragEnd}
                                  className="flex items-center gap-1 min-w-0 flex-1"
                                >
                                  {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                                </span>
                              )}
                              {colId === "select" &&
                                flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                            </div>
                            {/* Resize handle */}
                            {colId !== "select" && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-ring active:bg-ring transition-colors ${
                                  header.column.getIsResizing() ? "bg-ring" : ""
                                }`}
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => {
                    const isPending = row.original.pending;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer group ${
                          isPending ? "bg-chart-3/[0.02]" : ""
                        }`}
                        onClick={() => onTransactionClick?.(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={`px-3 py-1.5 overflow-hidden truncate ${cell.column.columnDef.meta?.className || ""}`}
                            style={{
                              width:
                                columnSizing[cell.column.id] ||
                                cell.column.getSize(),
                              minWidth: COLUMN_MIN_WIDTHS[cell.column.id] || 60,
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination & Summary */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {total > 0
                  ? `${page * limit + 1}–${Math.min((page + 1) * limit, total)} of ${total}`
                  : "0 transactions"}
                {totalAmount === null ? (
                  <span className="ml-3 pl-3 border-l border-border text-muted-foreground animate-pulse">
                    Total: Calculating...
                  </span>
                ) : totalAmount > 0 ? (
                  <span className="ml-3 pl-3 border-l border-border font-medium text-foreground">
                    Total:{" "}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 2,
                    }).format(totalAmount)}
                  </span>
                ) : null}
              </span>
              {totalPages > 1 && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-muted"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Proposed Rule Dialog */}
      <AlertDialog
        open={!!proposedRule}
        onOpenChange={(open) => !open && setProposedRule(null)}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Auto-Tag Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Automatically assign this category to future transactions with the
              same payee?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {proposedRule && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    When payee contains
                  </label>
                  <input
                    value={proposedRule.payee}
                    onChange={(e) =>
                      setProposedRule((prev) =>
                        prev ? { ...prev, payee: e.target.value } : null,
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
                <div className="flex items-center justify-between text-xs pt-2.5 border-t border-border/50">
                  <span className="text-muted-foreground">Set category to</span>
                  <span className="text-foreground font-medium">
                    {proposedRule.categoryName}
                  </span>
                </div>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <button
              onClick={handleCreateRule}
              disabled={creatingAndRunningRule}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Create Rule
            </button>
            <button
              onClick={handleCreateAndRunRule}
              disabled={creatingAndRunningRule}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {creatingAndRunningRule ? "Running..." : "Add and Run Now"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
