import type { TreeDataNode } from 'antd';
import type { Folder, Id } from '../_types';

type FolderTreeOptions = {
  searchText: string;
  visibleIds: Set<Id> | null;
};

export function buildFolderTree(folders: Folder[], options: FolderTreeOptions) {
  const folderById = new Map<Id, Folder>();
  const childrenByParent = new Map<Id | null, Folder[]>();

  for (const folder of folders) {
    folderById.set(folder.id, folder);
    const parent = folder.parent_id ?? null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(folder);
    childrenByParent.set(parent, list);
  }

  for (const list of childrenByParent.values()) {
    list.sort((a, b) => {
      if (a.order_index !== null && b.order_index !== null) {
        return a.order_index - b.order_index;
      }
      if (a.order_index !== null) return -1;
      if (b.order_index !== null) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  const q = options.searchText.trim().toLowerCase();
  const highlight = (name: string) => {
    if (!q) return name;
    const idx = name.toLowerCase().indexOf(q);
    if (idx < 0) return name;
    const before = name.slice(0, idx);
    const hit = name.slice(idx, idx + q.length);
    const after = name.slice(idx + q.length);
    return (
      <span>
        {before}
        <span className="bg-(--ant-color-primary-bg) px-0.5">{hit}</span>
        {after}
      </span>
    );
  };

  const renderNodeTitle = (folder: Folder) => (
    <span className="-my-1 -ml-1 flex min-h-[28px] w-full items-center justify-between gap-2 py-1 pr-2 pl-1">
      <span className="min-w-0 flex-1 truncate">{highlight(folder.name)}</span>
      <span className="text-xs text-(--ant-color-text-secondary)">{folder.task_count}</span>
    </span>
  );

  const build = (parentId: Id | null): TreeDataNode[] => {
    const children = childrenByParent.get(parentId) ?? [];
    return children
      .filter((child) => !options.visibleIds || options.visibleIds.has(child.id))
      .map((child) => ({
        key: child.id,
        title: renderNodeTitle(child),
        children: build(child.id),
      }));
  };

  return { treeData: build(null), folderById };
}
