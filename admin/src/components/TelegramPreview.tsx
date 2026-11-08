import type { Post } from '../types';

const MODE_LABEL: Record<Post['telegramMode'], string> = {
  photo_caption: 'фото + подпись (до 1024 символов)',
  text_preview: 'текст с картинкой-превью сверху (до 4096 символов)',
  text_only: 'только текст',
};

export default function TelegramPreview({ post }: { post: Post }) {
  return (
    <div className="tg-preview">
      {post.media && <img src={post.media.url} alt={post.imageAlt ?? ''} />}
      {/* The HTML is produced by our own renderer from a strict whitelist of tags. */}
      <div className="tg-text" dangerouslySetInnerHTML={{ __html: post.telegramHtml }} />
      <div className="tg-meta">
        {MODE_LABEL[post.telegramMode]} · {post.plainText.length} символов
        {post.media?.author && (
          <>
            {' '}
            · фото: {post.media.authorUrl ? <a href={post.media.authorUrl} target="_blank" rel="noreferrer">{post.media.author}</a> : post.media.author} ({post.media.provider === 'article' ? 'из источника' : post.media.provider})
          </>
        )}
      </div>
    </div>
  );
}
