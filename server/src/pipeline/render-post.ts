import { getMedia } from '../db/repo.js';
import type { Post } from '../db/schema.js';
import { mediaPreviewUrl, readMediaBuffer } from '../media/storage.js';
import type { RenderedPost } from '../publishers/publisher.js';
import type { TelegramMode } from '../content/compose.js';

/** Loads the stored image (if any) and assembles the payload publishers understand. */
export async function buildRenderedPost(post: Post): Promise<RenderedPost> {
  let image: RenderedPost['image'] = null;
  if (post.mediaId) {
    const m = getMedia(post.mediaId);
    if (m) {
      image = { buffer: await readMediaBuffer(m), previewUrl: mediaPreviewUrl(m), fileName: m.fileName };
    }
  }
  let telegramMode = post.telegramMode as TelegramMode;
  if (!image) telegramMode = 'text_only';
  else if (telegramMode === 'text_preview' && !image.previewUrl) {
    // Without a public URL Telegram cannot render a preview: fall back to a photo with a short caption.
    telegramMode = 'photo_caption';
  }
  return { telegramHtml: post.telegramHtml, maxHtml: post.maxHtml, plainText: post.plainText, telegramMode, image };
}
