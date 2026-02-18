import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

import makeWASocket, {
  Browsers,
  DisconnectReason,
  WASocket,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import { STORE_DIR } from '../config.js';
import { transcribeAudio } from '../transcription.js';
import {
  getLastGroupSync,
  setLastGroupSync,
  updateChatName,
} from '../db.js';
import { logger } from '../logger.js';
import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup } from '../types.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface WhatsAppChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class WhatsAppChannel implements Channel {
  name = 'whatsapp';
  prefixAssistantName = true;

  private sock!: WASocket;
  private connected = false;
  private lidToPhoneMap: Record<string, string> = {};
  private outgoingQueue: Array<{ jid: string; text: string }> = [];
  private flushing = false;
  private groupSyncTimerStarted = false;

  private opts: WhatsAppChannelOpts;

  constructor(opts: WhatsAppChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connectInternal(resolve).catch(reject);
    });
  }

  private async connectInternal(onFirstOpen?: () => void): Promise<void> {
    const authDir = path.join(STORE_DIR, 'auth');
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Chrome'),
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const msg =
          'WhatsApp authentication required. Run /setup in Claude Code.';
        logger.error(msg);
        exec(
          `osascript -e 'display notification "${msg}" with title "NanoClaw" sound name "Basso"'`,
        );
        setTimeout(() => process.exit(1), 1000);
      }

      if (connection === 'close') {
        this.connected = false;
        const reason = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        logger.info({ reason, shouldReconnect, queuedMessages: this.outgoingQueue.length }, 'Connection closed');

        if (shouldReconnect) {
          logger.info('Reconnecting...');
          this.connectInternal().catch((err) => {
            logger.error({ err }, 'Failed to reconnect, retrying in 5s');
            setTimeout(() => {
              this.connectInternal().catch((err2) => {
                logger.error({ err: err2 }, 'Reconnection retry failed');
              });
            }, 5000);
          });
        } else {
          logger.info('Logged out. Run /setup to re-authenticate.');
          process.exit(0);
        }
      } else if (connection === 'open') {
        this.connected = true;
        logger.info('Connected to WhatsApp');

        // Announce availability so WhatsApp relays subsequent presence updates (typing indicators)
        this.sock.sendPresenceUpdate('available').catch(() => {});

        // Build LID to phone mapping from auth state for self-chat translation
        if (this.sock.user) {
          const phoneUser = this.sock.user.id.split(':')[0];
          const lidUser = this.sock.user.lid?.split(':')[0];
          if (lidUser && phoneUser) {
            this.lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
            logger.debug({ lidUser, phoneUser }, 'LID to phone mapping set');
          }
        }

        // Flush any messages queued while disconnected
        this.flushOutgoingQueue().catch((err) =>
          logger.error({ err }, 'Failed to flush outgoing queue'),
        );

        // Sync group metadata on startup (respects 24h cache)
        this.syncGroupMetadata().catch((err) =>
          logger.error({ err }, 'Initial group sync failed'),
        );
        // Set up daily sync timer (only once)
        if (!this.groupSyncTimerStarted) {
          this.groupSyncTimerStarted = true;
          setInterval(() => {
            this.syncGroupMetadata().catch((err) =>
              logger.error({ err }, 'Periodic group sync failed'),
            );
          }, GROUP_SYNC_INTERVAL_MS);
        }

        // Signal first connection to caller
        if (onFirstOpen) {
          onFirstOpen();
          onFirstOpen = undefined;
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message) continue;
        const rawJid = msg.key.remoteJid;
        if (!rawJid || rawJid === 'status@broadcast') continue;

        // Translate LID JID to phone JID if applicable
        const chatJid = await this.translateJid(rawJid);

        const timestamp = new Date(
          Number(msg.messageTimestamp) * 1000,
        ).toISOString();

        // Always notify about chat metadata for group discovery
        this.opts.onChatMetadata(chatJid, timestamp);

        // Only deliver full message for registered groups
        const groups = this.opts.registeredGroups();
        if (groups[chatJid]) {
          // Extract text content from all known message types
          // Forwarded messages may be wrapped in contextInfo but use the same fields
          const m = msg.message || {};
          let content =
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.imageMessage?.caption ||
            m.videoMessage?.caption ||
            m.documentMessage?.caption ||
            m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
            m.listResponseMessage?.title ||
            m.buttonsResponseMessage?.selectedDisplayText ||
            m.templateButtonReplyMessage?.selectedDisplayText ||
            '';

          // Handle ephemeral (disappearing) messages — content is nested one level deeper
          if (!content && m.ephemeralMessage?.message) {
            const em = m.ephemeralMessage.message;
            content =
              em.conversation ||
              em.extendedTextMessage?.text ||
              em.imageMessage?.caption ||
              em.videoMessage?.caption ||
              em.documentMessage?.caption ||
              '';
          }

          // Handle viewOnce messages
          if (!content && (m.viewOnceMessage?.message || m.viewOnceMessageV2?.message)) {
            const vom = m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || {};
            content =
              vom.imageMessage?.caption ||
              vom.videoMessage?.caption ||
              '';
          }

          // Tag forwarded messages so the agent knows the context
          const ephMsg = m.ephemeralMessage?.message;
          const contextInfo =
            m.extendedTextMessage?.contextInfo ||
            m.imageMessage?.contextInfo ||
            m.videoMessage?.contextInfo ||
            m.documentMessage?.contextInfo ||
            m.audioMessage?.contextInfo ||
            ephMsg?.extendedTextMessage?.contextInfo ||
            ephMsg?.imageMessage?.contextInfo ||
            ephMsg?.documentMessage?.contextInfo ||
            null;
          const isForwarded = contextInfo?.isForwarded || (contextInfo?.forwardingScore ?? 0) > 0;
          if (isForwarded && content) {
            content = `[Forwarded message]\n${content}`;
          }

          // Handle voice messages (ptt = push-to-talk)
          if (m.audioMessage?.ptt || m.ephemeralMessage?.message?.audioMessage?.ptt) {
            content = await this.transcribeVoiceMessage(msg);
          }

          // Handle media messages (images, documents) — download and describe
          // This catches forwarded images/docs that have no caption
          const mediaMsg = m.imageMessage || m.documentMessage
            || m.documentWithCaptionMessage?.message?.documentMessage
            || m.ephemeralMessage?.message?.imageMessage
            || m.ephemeralMessage?.message?.documentMessage
            || m.viewOnceMessage?.message?.imageMessage
            || m.viewOnceMessageV2?.message?.imageMessage
            || null;

          if (mediaMsg && !content) {
            // Save media to the group's folder so it's accessible inside the container
            // at /workspace/group/media/
            const groupFolder = groups[chatJid]?.folder;
            content = await this.extractMediaContent(msg, mediaMsg, isForwarded, groupFolder);
          }

          const sender = msg.key.participant || msg.key.remoteJid || '';
          const senderName = msg.pushName || sender.split('@')[0];

          this.opts.onMessage(chatJid, {
            id: msg.key.id || '',
            chat_jid: chatJid,
            sender,
            sender_name: senderName,
            content,
            timestamp,
            is_from_me: msg.key.fromMe || false,
          });
        }
      }
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.connected) {
      this.outgoingQueue.push({ jid, text });
      logger.info({ jid, length: text.length, queueSize: this.outgoingQueue.length }, 'WA disconnected, message queued');
      return;
    }
    try {
      await this.sock.sendMessage(jid, { text });
      logger.info({ jid, length: text.length }, 'Message sent');
    } catch (err) {
      // If send fails, queue it for retry on reconnect
      this.outgoingQueue.push({ jid, text });
      logger.warn({ jid, err, queueSize: this.outgoingQueue.length }, 'Failed to send, message queued');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.sock?.end(undefined);
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    try {
      const status = isTyping ? 'composing' : 'paused';
      logger.debug({ jid, status }, 'Sending presence update');
      await this.sock.sendPresenceUpdate(status, jid);
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to update typing status');
    }
  }

  /**
   * Sync group metadata from WhatsApp.
   * Fetches all participating groups and stores their names in the database.
   * Called on startup, daily, and on-demand via IPC.
   */
  async syncGroupMetadata(force = false): Promise<void> {
    if (!force) {
      const lastSync = getLastGroupSync();
      if (lastSync) {
        const lastSyncTime = new Date(lastSync).getTime();
        if (Date.now() - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
          logger.debug({ lastSync }, 'Skipping group sync - synced recently');
          return;
        }
      }
    }

    try {
      logger.info('Syncing group metadata from WhatsApp...');
      const groups = await this.sock.groupFetchAllParticipating();

      let count = 0;
      for (const [jid, metadata] of Object.entries(groups)) {
        if (metadata.subject) {
          updateChatName(jid, metadata.subject);
          count++;
        }
      }

      setLastGroupSync();
      logger.info({ count }, 'Group metadata synced');
    } catch (err) {
      logger.error({ err }, 'Failed to sync group metadata');
    }
  }

  private async translateJid(jid: string): Promise<string> {
    if (!jid.endsWith('@lid')) return jid;
    const lidUser = jid.split('@')[0].split(':')[0];

    // Check local cache first
    const cached = this.lidToPhoneMap[lidUser];
    if (cached) {
      logger.debug({ lidJid: jid, phoneJid: cached }, 'Translated LID to phone JID (cached)');
      return cached;
    }

    // Query Baileys' signal repository for the mapping
    try {
      const pn = await this.sock.signalRepository?.lidMapping?.getPNForLID(jid);
      if (pn) {
        const phoneJid = `${pn.split('@')[0].split(':')[0]}@s.whatsapp.net`;
        this.lidToPhoneMap[lidUser] = phoneJid;
        logger.info({ lidJid: jid, phoneJid }, 'Translated LID to phone JID (signalRepository)');
        return phoneJid;
      }
    } catch (err) {
      logger.debug({ err, jid }, 'Failed to resolve LID via signalRepository');
    }

    return jid;
  }

  private async extractMediaContent(msg: any, mediaMsg: any, isForwarded: boolean, groupFolder?: string): Promise<string> {
    const mimetype = mediaMsg.mimetype || '';
    const fileName = mediaMsg.fileName || '';
    const isImage = mimetype.startsWith('image/');
    const isDocument = mimetype.startsWith('application/') || mimetype.startsWith('text/');
    const prefix = isForwarded ? '[Forwarded message]\n' : '';

    // Save media to the group's folder so it's accessible inside the container
    // at /workspace/group/media/ (groups/{folder}/ is mounted as /workspace/group/)
    let mediaDir = '/tmp';
    let containerMediaDir = '/tmp';
    if (groupFolder) {
      const { GROUPS_DIR } = await import('../config.js');
      mediaDir = path.join(GROUPS_DIR, groupFolder, 'media');
      containerMediaDir = '/workspace/group/media';
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger,
        reuploadRequest: this.sock.updateMediaMessage,
      });

      if (isImage) {
        const ext = mimetype.includes('png') ? 'png' : 'jpg';
        const imgFile = `${msg.key.id}.${ext}`;
        const imgPath = path.join(mediaDir, imgFile);
        fs.writeFileSync(imgPath, buffer);
        const containerPath = `${containerMediaDir}/${imgFile}`;
        logger.info({ msgId: msg.key.id, path: imgPath, size: buffer.length }, 'Image saved for agent');
        return `${prefix}[Image: ${containerPath}]`;
      }

      if (isDocument) {
        const ext = fileName.split('.').pop() || 'bin';
        const docFile = `${msg.key.id}.${ext}`;
        const docPath = path.join(mediaDir, docFile);
        fs.writeFileSync(docPath, buffer);

        // Try to extract text from text-based documents
        if (mimetype.includes('text') || ['txt', 'csv', 'json', 'html', 'xml', 'md'].includes(ext)) {
          const text = buffer.toString('utf-8').slice(0, 5000);
          logger.info({ msgId: msg.key.id, chars: text.length }, 'Text document extracted');
          return `${prefix}[Document: ${fileName}]\n${text}`;
        }

        const containerDocPath = `${containerMediaDir}/${docFile}`;
        logger.info({ msgId: msg.key.id, path: docPath, fileName, mimetype }, 'Document saved for agent');
        return `${prefix}[Document: ${fileName} (${mimetype}), saved to ${containerDocPath}]`;
      }

      // Unknown media type — describe what we got
      return `${prefix}[Media: ${mimetype}${fileName ? `, ${fileName}` : ''}]`;
    } catch (err) {
      logger.error({ err, msgId: msg.key.id, mimetype }, 'Failed to download media');
      return `${prefix}[Media: ${mimetype}${fileName ? `, ${fileName}` : ''} — download failed]`;
    }
  }

  private async transcribeVoiceMessage(msg: any): Promise<string> {
    const tempPath = `/tmp/nanoclaw-voice-${msg.key.id}.ogg`;
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger,
        reuploadRequest: this.sock.updateMediaMessage,
      });
      fs.writeFileSync(tempPath, buffer);
      const text = await transcribeAudio(tempPath);
      if (text) {
        logger.info({ msgId: msg.key.id, chars: text.length }, 'Voice message transcribed');
        return `[Voice: ${text}]`;
      }
      logger.warn({ msgId: msg.key.id }, 'Voice transcription returned empty');
      return '[Voice message - transcription failed]';
    } catch (err) {
      logger.error({ err, msgId: msg.key.id }, 'Failed to process voice message');
      return '[Voice message - transcription failed]';
    } finally {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  private async flushOutgoingQueue(): Promise<void> {
    if (this.flushing || this.outgoingQueue.length === 0) return;
    this.flushing = true;
    try {
      logger.info({ count: this.outgoingQueue.length }, 'Flushing outgoing message queue');
      while (this.outgoingQueue.length > 0) {
        const item = this.outgoingQueue.shift()!;
        await this.sendMessage(item.jid, item.text);
      }
    } finally {
      this.flushing = false;
    }
  }
}
