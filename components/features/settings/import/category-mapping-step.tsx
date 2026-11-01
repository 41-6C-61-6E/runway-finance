'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ClickOutsideBackdrop } from '@/components/ui/modal-overlay';

export interface CategoryItem {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

interface CategoryMappingStepProps {
  unmappedCategoriesWarnings: string[];
  uniqueCategoryNames: string[];
  categoryFuzzyScores: Record<string, number>;
  categoryMapping: Record<string, string>;
  newCategories: Record<string, { name: string; color?: string; isIncome: boolean; parentId?: string | null }>;
  allCategories: CategoryItem[];
  activeCategoryDropdown: string | null;
  setActiveCategoryDropdown: (val: string | null) => void;
  categorySearch: string;
  setCategorySearch: (val: string) => void;
  handleCategoryMappingChange: (csvName: string, categoryId: string) => void;
  handleNewCategoryChange: (csvName: string, field: string, value: string | boolean | null) => void;
  setStep: (step: any) => void;
}

export function CategoryMappingStep({
  unmappedCategoriesWarnings,
  uniqueCategoryNames,
  categoryFuzzyScores,
  categoryMapping,
  newCategories,
  allCategories,
  activeCategoryDropdown,
  setActiveCategoryDropdown,
  categorySearch,
  setCategorySearch,
  handleCategoryMappingChange,
  handleNewCategoryChange,
  setStep,
}: CategoryMappingStepProps) {
  return (
    
        
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map each category from your CSV to an existing category or create a new one.
            </p>

            {unmappedCategoriesWarnings.length > 0 && (
              <div className="p-3 rounded-lg border border-chart-3/20 bg-chart-3/10 text-sm text-chart-3">
                <div className="font-medium mb-1">⚠ Unmapped categories</div>
                <p>{unmappedCategoriesWarnings[0]}. You can go back and map them, or leave them as-is.</p>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto pb-56">
              {uniqueCategoryNames.map((csvName) => {
                const fuzzyScore = categoryFuzzyScores[csvName];
                const isFuzzyMatch = fuzzyScore !== undefined && fuzzyScore < 1.0;
                return (
                <div key={csvName} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground">CSV Category: {csvName}</span>
                    {isFuzzyMatch && (
                      <span
                        title={`Fuzzy match — ${Math.round(fuzzyScore * 100)}% confidence. Click the dropdown to change.`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-default select-none"
                      >
                        ~{Math.round(fuzzyScore * 100)}% match
                      </span>
                    )}
                  </div>

                  <div className="relative mb-2">
                    <button
                      onClick={() => {
                        if (activeCategoryDropdown === csvName) {
                          setActiveCategoryDropdown(null);
                        } else {
                          setActiveCategoryDropdown(csvName);
                          setCategorySearch('');
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground hover:bg-muted transition-colors text-left"
                    >
                      {(() => {
                        const mappedId = categoryMapping[csvName];
                        if (mappedId === 'new') {
                          return (
                            <>
                              <span className="text-primary font-medium">+ Create new category</span>
                            </>
                          );
                        }
                        const selectedCat = mappedId ? allCategories.find((c) => c.id === mappedId) : null;
                        return selectedCat ? (
                          <>
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color }} />
                            <span>{selectedCat.name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Select category...</span>
                        );
                      })()}
                      <span className="ml-auto text-muted-foreground">▼</span>
                    </button>

                    {activeCategoryDropdown === csvName && (
                      <>
                        <ClickOutsideBackdrop
                          onClose={() => {
                            setActiveCategoryDropdown(null);
                            setCategorySearch('');
                          }}
                        />
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-80 flex flex-col">
                          <div className="relative p-2 border-b border-border">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                              value={categorySearch}
                              onChange={(e) => setCategorySearch(e.target.value)}
                              placeholder="Search categories..."
                              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex-1 overflow-y-auto max-h-56">
                            {(() => {
                              const filter = categorySearch.toLowerCase();
                              const parents = allCategories.filter((c) => !c.parentId);
                              const getChildren = (pId: string) => allCategories.filter((c) => c.parentId === pId);

                              const filteredParents = filter
                                ? parents.filter((p) =>
                                    p.name.toLowerCase().includes(filter) ||
                                    getChildren(p.id).some((c) => c.name.toLowerCase().includes(filter))
                                  )
                                : parents;

                              const noResults = filteredParents.length === 0;
                              const mappedId = categoryMapping[csvName];

                              return (
                                <>
                                  <button
                                    onClick={() => {
                                      handleCategoryMappingChange(csvName, '');
                                      setActiveCategoryDropdown(null);
                                      setCategorySearch('');
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors text-left"
                                  >
                                    None (uncategorized)
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleCategoryMappingChange(csvName, 'new');
                                      setActiveCategoryDropdown(null);
                                      setCategorySearch('');
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted font-medium transition-colors text-left"
                                  >
                                    + Create new category
                                  </button>
                                  {filteredParents.map((parent) => {
                                    const childList = filter
                                      ? getChildren(parent.id).filter((c) => c.name.toLowerCase().includes(filter))
                                      : getChildren(parent.id);
                                    if (filter && childList.length === 0 && !parent.name.toLowerCase().includes(filter)) return null;
                                    return (
                                      <div key={parent.id}>
                                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: parent.color }} />
                                          {parent.name}
                                        </div>
                                        <button
                                          onClick={() => {
                                            handleCategoryMappingChange(csvName, parent.id);
                                            setActiveCategoryDropdown(null);
                                            setCategorySearch('');
                                          }}
                                          className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                            mappedId === parent.id
                                              ? 'text-primary bg-primary/10'
                                              : 'text-foreground/80 hover:bg-muted'
                                          }`}
                                        >
                                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                                          {parent.name}
                                        </button>
                                        {childList.map((child) => (
                                          <button
                                            key={child.id}
                                            onClick={() => {
                                              handleCategoryMappingChange(csvName, child.id);
                                              setActiveCategoryDropdown(null);
                                              setCategorySearch('');
                                            }}
                                            className={`w-full flex items-center gap-2 px-6 py-2 text-sm transition-colors text-left ${
                                              mappedId === child.id
                                                ? 'text-primary bg-primary/10'
                                                : 'text-foreground/80 hover:bg-muted'
                                            }`}
                                          >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                                            {child.name}
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
                        </div>
                      </>
                    )}
                  </div>

                  {categoryMapping[csvName] === 'new' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 p-2 rounded bg-background border border-border">
                      <div>
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          size={1}
                          value={newCategories[csvName]?.name || csvName}
                          onChange={(e) => handleNewCategoryChange(csvName, 'name', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Parent Category</label>
                        <Select
                          className="h-8 rounded-lg"
                          value={newCategories[csvName]?.parentId || ''}
                          onChange={(e) => handleNewCategoryChange(csvName, 'parentId', e.target.value || null)}
                        >
                          <option value="">None (top-level)</option>
                          {allCategories.filter((c) => !c.parentId).map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={newCategories[csvName]?.color || '#6366f1'}
                            onChange={(e) => handleNewCategoryChange(csvName, 'color', e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground">{newCategories[csvName]?.color || '#6366f1'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`income-${csvName}`}
                          checked={newCategories[csvName]?.isIncome || false}
                          onChange={(e) => handleNewCategoryChange(csvName, 'isIncome', e.target.checked)}
                          className="rounded border-border"
                        />
                        <label htmlFor={`income-${csvName}`} className="text-xs text-muted-foreground">Income category</label>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}

            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(5)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep(7)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
  );
}
