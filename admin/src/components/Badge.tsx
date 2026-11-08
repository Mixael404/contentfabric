const LABELS: Record<string, string> = {
  pending: 'в очереди',
  running: 'генерация',
  awaiting_review: 'на модерации',
  publishing: 'публикация',
  published: 'опубликован',
  failed: 'ошибка',
  skipped: 'пропущен',
  draft: 'черновик',
  approved: 'одобрен',
  discarded: 'отклонён',
  sent: 'отправлено',
  on: 'вкл',
  off: 'выкл',
};

export default function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${status}`}>{label ?? LABELS[status] ?? status}</span>;
}
