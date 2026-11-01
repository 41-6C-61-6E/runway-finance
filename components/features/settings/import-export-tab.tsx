'use client';

import { useState } from "react";
import { UploadCloud, DownloadCloud } from "lucide-react";
import ImportTab from "./import-tab";
import { ExportTab } from "./data-exchange/export-tab";

export default function ImportExportTab({ refreshSettings }: { refreshSettings?: () => void }) {
  const [subTab, setSubTab] = useState<'import' | 'export'>("import");

  return (
    <div className="space-y-6">
      {/* Top Header Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Import & Export Workspace</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Migrate transaction and snapshot data from CSV/Excel or backup and export your Runway Finance portfolio.
          </p>
        </div>

        {/* Sub-tab segmented pill selector */}
        <div className="flex w-full sm:w-64 items-center rounded-lg bg-muted/60 p-0.5 border border-border/40 text-muted-foreground">
          <button
            type="button"
            onClick={() => setSubTab("import")}
            className={`flex-1 justify-center inline-flex items-center gap-2 rounded-md px-3 py-1 min-h-[30px] text-xs font-medium transition-all ${
              subTab === "import"
                ? "bg-primary/10 text-primary border border-primary/30 font-semibold shadow-xs"
                : "hover:text-foreground border border-transparent"
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Import Data
          </button>
          <button
            type="button"
            onClick={() => setSubTab("export")}
            className={`flex-1 justify-center inline-flex items-center gap-2 rounded-md px-3 py-1 min-h-[30px] text-xs font-medium transition-all ${
              subTab === "export"
                ? "bg-primary/10 text-primary border border-primary/30 font-semibold shadow-xs"
                : "hover:text-foreground border border-transparent"
            }`}
          >
            <DownloadCloud className="h-3.5 w-3.5" />
            Export Data
          </button>
        </div>
      </div>

      {subTab === "import" ? (
        <ImportTab />
      ) : (
        <ExportTab refreshSettings={refreshSettings} />
      )}
    </div>
  );
}
