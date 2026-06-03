'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { 
  Settings, 
  Landmark, 
  LayoutGrid, 
  GitBranch, 
  Tag, 
  BarChart3, 
  Sparkles, 
  UploadCloud, 
  FileText, 
  Users2,
  ShieldAlert 
} from 'lucide-react';

const settingsSections = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
  { id: 'categories', label: 'Categories', icon: LayoutGrid },
  { id: 'rules', label: 'Rules', icon: GitBranch },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'ai', label: 'AI Suggestions', icon: Sparkles },
  { id: 'import', label: 'Import', icon: UploadCloud },
  { id: 'payroll', label: 'Payroll', icon: FileText },
  { id: 'sharing', label: 'Sharing', icon: Users2 },
  { id: 'advanced', label: 'Advanced', icon: ShieldAlert },
] as const;

export default function SettingsDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-card border border-border rounded-lg shadow-lg z-50">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/settings?tab=${section.id}`);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                {section.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
