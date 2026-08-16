export interface CategoryBase {
  id: string;
  name: string;
  color?: string;
  icon?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  parentColor?: string | null;
  isIncome?: boolean;
  categoryType?: string;
  order?: number;
}

export interface CategoryTreeItem extends CategoryBase {
  children?: CategoryTreeItem[];
}
