import { config } from '../config.js';
import { logger } from '../logger.js';
import { getSetting, setSetting, upsertMaxChat } from '../db/repo.js';
import { MaxClient } from '../publishers/max.js';

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { message?: string; code?: string } }).cause;
  return cause?.message ? `${err.message}: ${cause.message}${cause.code ? ` (${cause.code})` : ''}` : err.message;
}

/**
 * Learns the chat_id of channels the Max bot was added to. The Max API has no
 * method to resolve a public link into an id, so we long-poll GET /updates and
 * record bot_added / bot_removed / message events into the max_chats table.
 */

const MARKER_KEY = 'max_updates_marker';
let running = false;
let client: MaxClient | null = null;
let botName: string | null = null;

export function getMaxClient(): MaxClient | null {
  return client;
}

export function maxPollerStatus() {
  return { running, botName };
}

async function rememberChat(chatId: number, hint: { isChannel?: boolean; type?: string }) {
  const id = String(chatId);
  let info: { title?: string | null; type?: string; link?: string | null } = {};
  try {
    const chat = await client!.getChat(id);
    info = { title: chat.title ?? null, type: chat.type, link: chat.link ?? null };
  } catch (err) {
    logger.debug({ err, chatId }, 'max getChat failed, storing without title');
  }
  const type = info.type ?? hint.type ?? (hint.isChannel ? 'channel' : 'chat');
  upsertMaxChat({ chatId: id, title: info.title, type, link: info.link, status: 'active' });
  logger.info({ chatId: id, type, title: info.title }, 'max chat remembered');
}

export function startMaxPoller(): void {
  if (!config.maxEnabled || !config.MAX_BOT_TOKEN) return;
  client = new MaxClient(config.MAX_BOT_TOKEN, config.MAX_API_BASE_URL, config.MAX_INSECURE_TLS);
  running = true;
  void (async () => {
    try {
      const me = await client!.getMe();
      botName = me.username ? `@${me.username}` : me.name;
      logger.info({ bot: botName }, 'max bot initialised');
    } catch (err) {
      logger.error({ error: describeError(err) }, 'max getMe failed: check MAX_BOT_TOKEN; a TLS/certificate error means the Russian root CA is not trusted (see certs/README.md)');
    }
    let marker: number | null = Number(getSetting(MARKER_KEY) ?? '') || null;
    let backoff = 2000;
    while (running) {
      try {
        const res = await client!.getUpdates(marker, 30);
        backoff = 2000;
        for (const u of res.updates ?? []) {
          if (u.update_type === 'bot_added' && u.chat_id !== undefined) {
            await rememberChat(u.chat_id, { isChannel: u.is_channel });
          } else if (u.update_type === 'bot_removed' && u.chat_id !== undefined) {
            upsertMaxChat({ chatId: String(u.chat_id), status: 'removed' });
          } else if (u.update_type === 'message_created') {
            const r = u.message?.recipient;
            if (r?.chat_id !== undefined && (r.chat_type === 'channel' || r.chat_type === 'chat')) {
              await rememberChat(r.chat_id, { type: r.chat_type });
            }
          }
        }
        if (res.marker !== null && res.marker !== undefined && res.marker !== marker) {
          marker = res.marker;
          setSetting(MARKER_KEY, String(marker));
        }
      } catch (err) {
        if (!running) break;
        logger.warn({ error: describeError(err), backoff }, 'max updates poll failed');
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  })();
}

export function stopMaxPoller(): void {
  running = false;
}
