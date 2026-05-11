import Link from "next/link";

export default function BaseHeader() {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-background/80 border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center group-hover:shadow-md transition-shadow">
              <div className="w-3.5 h-3.5 rounded-full bg-primary" />
            </div>
            <span className="font-semibold text-base text-foreground">
              Runway
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
