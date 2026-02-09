export default function TaskTitleTag({ title }: { title: string | null | undefined }) {
  if (!title) return null;
  return <span className="mr-1 font-medium text-(--ant-color-primary)">[{title}]</span>;
}
