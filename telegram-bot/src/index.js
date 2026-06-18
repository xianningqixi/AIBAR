import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

const ENV_WRITE_ORDER = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_USER_IDS',
  'ST_BASE_URL',
  'AIBAR_MODEL_PROFILE_ID',
  'AIBAR_MAX_COMPLETION_TOKENS',
  'POLL_TIMEOUT_SECONDS',
  'DATA_DIR',
  'ADMIN_HOST',
  'ADMIN_PORT',
  'ADMIN_TOKEN',
];

let config = loadConfig();
let statePath = '';
let state = { offset: 0, sessions: {} };
let st;
let adminServer;
let adminServerInfo = null;
let pollAbortController = null;

const activeUsers = new Set();
const polling = {
  desired: false,
  running: false,
  promise: null,
  startedAt: '',
  stoppedAt: '',
  lastUpdateAt: '',
  lastError: '',
  bot: null,
};

async function main() {
  reloadRuntime();
  startAdminServer();
  startPolling();
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.chat || !message.from) return;

  const userId = String(message.from.id);
  const chatId = message.chat.id;
  const text = String(message.text || '').trim();

  if (message.chat.type !== 'private') {
    await sendMessage(chatId, '当前版本只支持私聊。');
    return;
  }
  if (!isAllowed(userId)) {
    await sendMessage(chatId, '未授权使用这个 AIBAR bot。请把你的 Telegram 数字 ID 加入 TELEGRAM_ALLOWED_USER_IDS。');
    return;
  }
  if (!text) {
    await sendMessage(chatId, '当前版本只处理文字消息。');
    return;
  }

  const session = getSession(userId, chatId);
  if (text.startsWith('/')) {
    await handleCommand(text, session, message.from);
    saveState(statePath, state);
    return;
  }

  if (activeUsers.has(userId)) {
    await sendMessage(chatId, '上一条消息还在生成中，请稍等。');
    return;
  }

  activeUsers.add(userId);
  try {
    await handleChatText(text, session, message.from);
  } finally {
    activeUsers.delete(userId);
    saveState(statePath, state);
  }
}

async function handleCommand(text, session, from) {
  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim();

  switch (command) {
    case '/start':
    case '/help':
      return sendHelp(session.chatId);
    case '/characters':
      return listCharacters(session);
    case '/use':
      return useCharacter(session, arg);
    case '/chats':
      return listChats(session);
    case '/recent':
      return listRecentChats(session);
    case '/resume':
      return resumeChat(session, arg);
    case '/history':
      return showHistory(session, arg);
    case '/retry':
      return retryLastUserMessage(session, from);
    case '/current':
      return showCurrent(session);
    case '/new':
      return newChat(session);
    case '/reset':
      delete state.sessions[session.userId];
      return sendMessage(session.chatId, '已清空 Telegram 会话绑定。发送 /characters 重新选择角色。');
    default:
      return sendMessage(session.chatId, '未知命令。发送 /help 查看可用命令。');
  }
}

async function sendHelp(chatId) {
  await sendMessage(chatId, [
    'AIBAR Telegram Bot',
    '',
    '/characters - 列出角色',
    '/use 1 - 选择角色，并接续该角色最近聊天',
    '/chats - 当前角色的聊天记录',
    '/recent - 最近全部聊天',
    '/resume 1 - 接续 /chats 或 /recent 里的聊天',
    '/history - 查看当前聊天最近几条',
    '/retry - 重试当前聊天最后一条用户消息',
    '/current - 当前角色和聊天',
    '/new - 当前角色新开聊天',
    '/reset - 清空绑定',
    '',
    '选择角色后，直接发送文字就会开始聊天。',
  ].join('\n'));
}

async function listCharacters(session) {
  const characters = await st.post('/api/characters/all');
  const list = Array.isArray(characters) ? characters.filter((item) => item?.name && item?.avatar) : [];
  session.lastCharacters = list.slice(0, 30).map((item) => ({ name: item.name, avatar: item.avatar }));
  if (!session.lastCharacters.length) {
    await sendMessage(session.chatId, '角色库为空。请先在 AIBAR/ST 里导入或创建角色。');
    return;
  }
  const lines = session.lastCharacters.map((item, index) => `${index + 1}. ${item.name}`);
  await sendMessage(session.chatId, `选择角色：\n\n${lines.join('\n')}\n\n发送 /use 编号，例如 /use 1`);
}

async function useCharacter(session, arg) {
  if (!arg) {
    await sendMessage(session.chatId, '用法：/use 1。先发送 /characters 获取编号。');
    return;
  }
  let selected;
  const index = Number(arg);
  if (Number.isInteger(index) && index >= 1) {
    selected = session.lastCharacters?.[index - 1];
  }
  if (!selected) {
    const characters = await st.post('/api/characters/all');
    selected = (Array.isArray(characters) ? characters : []).find((item) => (
      item?.name === arg || item?.avatar === arg
    ));
  }
  if (!selected?.avatar) {
    await sendMessage(session.chatId, '没有找到这个角色。发送 /characters 重新查看列表。');
    return;
  }

  const character = await st.post('/api/characters/get', { avatar_url: selected.avatar });
  session.characterAvatar = character.avatar;
  session.characterName = character.name;
  const chats = await fetchCharacterChatEntries(character);
  if (chats.length) {
    const entry = chats[0];
    session.chatFile = normalizeChatFileName(entry.fileName);
    session.lastChats = chats.slice(0, 30);
    await setDefaultCharacterChat(character.avatar, session.chatFile);
    await sendMessage(session.chatId, [
      `已选择：${character.name}`,
      `接续最近聊天：${entryTitle(entry)}`,
      '',
      '直接发消息即可继续。发送 /chats 可切换其他记录，/new 可新开聊天。',
    ].join('\n'));
    return;
  }

  session.chatFile = createChatName(character, 'Telegram');
  await saveNewChat(character, session.chatFile, session.userId);
  await setDefaultCharacterChat(character.avatar, session.chatFile);
  await sendMessage(session.chatId, `已选择：${character.name}\n还没有历史聊天，已新建一条。现在可以直接发消息。`);
}

async function showCurrent(session) {
  if (!session.characterAvatar) {
    await sendMessage(session.chatId, '还没有选择角色。发送 /characters 开始。');
    return;
  }
  await sendMessage(session.chatId, [
    `当前角色：${session.characterName || session.characterAvatar}`,
    `聊天：${session.chatFile || '(未创建)'}`,
    `Web 同步：保存在 ST JSONL，可在 Web 聊天记录里继续打开`,
  ].join('\n'));
}

async function newChat(session) {
  if (!session.characterAvatar) {
    await sendMessage(session.chatId, '还没有选择角色。发送 /characters 开始。');
    return;
  }
  const character = await st.post('/api/characters/get', { avatar_url: session.characterAvatar });
  session.characterName = character.name;
  session.chatFile = createChatName(character, 'Telegram');
  await saveNewChat(character, session.chatFile, session.userId);
  await setDefaultCharacterChat(character.avatar, session.chatFile);
  await sendMessage(session.chatId, `已为 ${character.name} 新开聊天。Web 端也能在聊天记录里看到。`);
}

async function listChats(session) {
  if (!session.characterAvatar) {
    await sendMessage(session.chatId, '还没有选择角色。发送 /recent 查看最近全部聊天，或发送 /characters 选择角色。');
    return;
  }
  const character = await st.post('/api/characters/get', { avatar_url: session.characterAvatar });
  session.characterName = character.name;
  const chats = await fetchCharacterChatEntries(character);
  session.lastChats = chats.slice(0, 30);
  if (!session.lastChats.length) {
    await sendMessage(session.chatId, `「${character.name}」还没有聊天记录。发送 /new 新建一条。`);
    return;
  }
  await sendMessage(session.chatId, [
    `「${character.name}」的聊天记录：`,
    '',
    ...formatChatEntryLines(session.lastChats),
    '',
    '发送 /resume 编号 接续，例如 /resume 1。',
  ].join('\n'));
}

async function listRecentChats(session) {
  const chats = await fetchRecentChatEntries();
  session.lastChats = chats.slice(0, 30);
  if (!session.lastChats.length) {
    await sendMessage(session.chatId, '还没有聊天记录。先在 Web 或 TG 里开始一段对话。');
    return;
  }
  await sendMessage(session.chatId, [
    '最近聊天记录：',
    '',
    ...formatChatEntryLines(session.lastChats),
    '',
    '发送 /resume 编号 接续，例如 /resume 1。',
  ].join('\n'));
}

async function resumeChat(session, arg) {
  const entry = await resolveChatEntry(session, arg);
  if (!entry) {
    await sendMessage(session.chatId, '没有找到这条聊天。先发送 /chats 或 /recent，再发送 /resume 编号。');
    return;
  }

  const avatar = entry.avatar || session.characterAvatar;
  if (!avatar) {
    await sendMessage(session.chatId, '这条聊天缺少角色头像信息，无法恢复。请先 /use 选择角色后再试。');
    return;
  }

  const character = await st.post('/api/characters/get', { avatar_url: avatar });
  session.characterAvatar = character.avatar;
  session.characterName = character.name;
  session.chatFile = normalizeChatFileName(entry.fileName);
  await setDefaultCharacterChat(character.avatar, session.chatFile);

  const current = await fetchChatSafe(character, session.chatFile);
  await sendMessage(session.chatId, [
    `已接续：${character.name}`,
    `聊天：${entryTitle(entry)}`,
    `消息数：${current.messages.length}`,
    '',
    '现在可以直接发消息。Web 端打开同一角色/聊天记录会看到同一份内容。',
  ].join('\n'));
}

async function showHistory(session, arg) {
  if (!session.characterAvatar || !session.chatFile) {
    await sendMessage(session.chatId, '还没有当前聊天。发送 /recent 后用 /resume 编号接续，或发送 /characters 选择角色。');
    return;
  }
  const count = Math.min(20, Math.max(1, Number(arg) || 8));
  const character = await st.post('/api/characters/get', { avatar_url: session.characterAvatar });
  const current = await fetchChatSafe(character, session.chatFile);
  const recent = current.messages.slice(-count);
  if (!recent.length) {
    await sendMessage(session.chatId, '当前聊天还没有消息。');
    return;
  }
  const lines = recent.map((message, index) => {
    const role = message.role === 'assistant' ? (character.name || '角色') : '你';
    return `${index + 1}. ${role}：${compactText(message.content, 700)}`;
  });
  await sendLongMessage(session.chatId, [
    `最近 ${recent.length} 条：`,
    '',
    ...lines,
  ].join('\n\n'));
}

async function handleChatText(text, session, from) {
  if (!session.characterAvatar) {
    await sendMessage(session.chatId, '还没有选择角色。发送 /characters 开始。');
    return;
  }

  await telegram('sendChatAction', { chat_id: session.chatId, action: 'typing' });

  const character = await st.post('/api/characters/get', { avatar_url: session.characterAvatar });
  session.characterName = character.name;
  const createdChatFile = !session.chatFile;
  if (!session.chatFile) {
    session.chatFile = createChatName(character, 'Telegram');
  }

  const current = await fetchChatSafe(character, session.chatFile);
  const now = new Date().toISOString();
  const messages = [
    ...current.messages,
    { role: 'user', content: text, date: now },
  ];
  await saveChat(character, session.chatFile, messages, current.metadata);
  if (createdChatFile) {
    await setDefaultCharacterChat(character.avatar, session.chatFile);
  }

  const reply = await generateAssistantReply(character, messages, current.metadata, from);
  if (!reply) return;

  const nextMessages = [
    ...messages,
    { role: 'assistant', content: reply.trim(), date: new Date().toISOString() },
  ];
  await saveChat(character, session.chatFile, nextMessages, current.metadata);
  await sendLongMessage(session.chatId, reply.trim());
}

async function retryLastUserMessage(session, from) {
  if (!session.characterAvatar || !session.chatFile) {
    await sendMessage(session.chatId, '还没有当前聊天。发送 /recent 后用 /resume 编号接续，或发送 /characters 选择角色。');
    return;
  }
  await telegram('sendChatAction', { chat_id: session.chatId, action: 'typing' });
  const character = await st.post('/api/characters/get', { avatar_url: session.characterAvatar });
  session.characterName = character.name;
  const current = await fetchChatSafe(character, session.chatFile);
  const last = current.messages[current.messages.length - 1];
  if (!last || last.role !== 'user') {
    await sendMessage(session.chatId, '当前聊天最后一条不是用户消息，不需要重试。');
    return;
  }

  const reply = await generateAssistantReply(character, current.messages, current.metadata, from);
  if (!reply) return;

  await saveChat(character, session.chatFile, [
    ...current.messages,
    { role: 'assistant', content: reply.trim(), date: new Date().toISOString() },
  ], current.metadata);
  await sendLongMessage(session.chatId, reply.trim());
}

async function generateAssistantReply(character, messages, metadata, from) {
  try {
    const generationConfig = await loadAibarGenerationConfig(metadata);
    const payload = buildGeneratePayload(
      generationConfig.profile,
      character,
      messages,
      telegramUserName(from),
      metadata,
      generationConfig.preset,
    );
    const reply = await generateReply(payload);
    if (!reply.trim()) {
      await sendMessage(from.id, '模型没有返回内容。可以发送 /retry 重试。');
      return '';
    }
    return reply.trim();
  } catch (error) {
    await sendMessage(from.id, `模型生成失败：${error?.message || error}\n可以调整模型参数后发送 /retry 重试。`);
    return '';
  }
}

async function loadAibarGenerationConfig(metadata = {}) {
  const raw = await st.post('/api/settings/get');
  const settings = parseSettings(raw?.settings);
  const aibar = settings.aibar || {};
  const profiles = Array.isArray(aibar.simple_ui_model_profiles) ? aibar.simple_ui_model_profiles : [];
  const presets = Array.isArray(aibar.simple_ui_presets) ? aibar.simple_ui_presets : [];
  const metadataAibar = getMetadataAibar(metadata);
  const profileId = config.modelProfileId || stringValue(metadataAibar.profileId) || aibar.simple_ui_active_profile || '';
  const presetId = stringValue(metadataAibar.presetId) || aibar.simple_ui_active_preset || '';
  const selected = profileId
    ? profiles.find((item) => item.id === profileId) || profiles[0]
    : profiles[0];

  if (!selected) {
    throw new Error('没有找到 AIBAR 模型 Profile。请先在 AIBAR 设置里配置模型连接。');
  }
  return {
    profile: selected,
    preset: presetId ? presets.find((item) => item.id === presetId) || null : null,
  };
}

async function generateReply(payload) {
  const data = await st.post('/api/backends/chat-completions/generate', payload);
  if (data?.error) {
    const message = typeof data.error === 'string'
      ? data.error
      : data.error?.message || data.message || '模型接口返回错误';
    throw new Error(message);
  }
  return String(
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    data?.content ||
    data?.response ||
    '',
  );
}

async function fetchChatSafe(character, fileName) {
  try {
    const data = await st.post('/api/chats/get', {
      ch_name: character.name,
      file_name: fileName,
      avatar_url: character.avatar,
    });
    const arr = Array.isArray(data) ? data : [];
    const header = arr.find((item) => item?.chat_metadata);
    return {
      metadata: {
        simple_ui: true,
        ...(header?.chat_metadata || {}),
      },
      messages: arr
        .filter((item) => item && !item.chat_metadata && item.mes)
        .map((item) => ({
          role: item.is_user || item.role === 'user' ? 'user' : 'assistant',
          content: item.mes || '',
          date: item.send_date || item.date || new Date().toISOString(),
        })),
    };
  } catch {
    return {
      metadata: {
        simple_ui: true,
        aibar: {
          kind: 'telegram_session',
          createdAt: new Date().toISOString(),
        },
      },
      messages: [],
    };
  }
}

async function saveChat(character, fileName, messages, metadata = {}) {
  const chatHeader = {
    chat_metadata: {
      simple_ui: true,
      ...(metadata || {}),
    },
    user_name: 'Telegram',
    character_name: character.name,
  };
  await st.post('/api/chats/save', {
    ch_name: character.name,
    file_name: fileName,
    avatar_url: character.avatar,
    chat: [chatHeader, ...messages.map((message) => ({
      name: message.role === 'user' ? 'Telegram' : character.name,
      is_user: message.role === 'user',
      send_date: message.date || new Date().toISOString(),
      mes: message.content,
      extra: { aibar: {} },
      swipes: [],
    }))],
    force: true,
  });
}

async function saveNewChat(character, fileName, telegramUserId) {
  await saveChat(character, fileName, [], {
    simple_ui: true,
    aibar: {
      kind: 'telegram_session',
      telegramUserId,
      createdAt: new Date().toISOString(),
    },
  });
}

async function fetchCharacterChatEntries(character) {
  const result = await st.post('/api/characters/chats', {
    avatar_url: character.avatar,
    metadata: true,
  });
  const chats = Array.isArray(result) ? result : [];
  return chats
    .filter((entry) => entry?.file_name)
    .map((entry) => normalizeChatEntry(entry, character))
    .sort(compareChatEntries);
}

async function fetchRecentChatEntries() {
  const result = await st.post('/api/chats/recent', {
    max: 30,
    metadata: true,
    pinned: [],
  });
  const chats = Array.isArray(result) ? result : [];
  return chats
    .filter((entry) => entry?.file_name)
    .map((entry) => normalizeChatEntry(entry))
    .sort(compareChatEntries);
}

function normalizeChatEntry(entry, fallbackCharacter = null) {
  const fileName = normalizeChatFileName(entry.file_name || entry.fileName || '');
  return {
    fileName,
    fileId: String(entry.file_id || fileName),
    avatar: String(entry.avatar || fallbackCharacter?.avatar || ''),
    characterName: String(entry.character_name || fallbackCharacter?.name || ''),
    message: String(entry.mes || ''),
    itemCount: Number(entry.chat_items || 0),
    fileSize: String(entry.file_size || ''),
    lastMessageAt: entry.last_mes || entry.date || entry.updatedAt || '',
  };
}

function compareChatEntries(a, b) {
  return chatEntryTime(b) - chatEntryTime(a);
}

function chatEntryTime(entry) {
  const value = entry?.lastMessageAt;
  if (typeof value === 'number') return value;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatChatEntryLines(entries) {
  return entries.map((entry, index) => {
    const title = entryTitle(entry);
    const character = entry.characterName ? ` · ${entry.characterName}` : '';
    const count = entry.itemCount ? ` · ${entry.itemCount} 条` : '';
    const time = formatEntryTime(entry.lastMessageAt);
    const preview = entry.message ? `\n   ${compactText(entry.message, 90)}` : '';
    return `${index + 1}. ${title}${character}${count}${time ? ` · ${time}` : ''}${preview}`;
  });
}

async function resolveChatEntry(session, arg) {
  const text = String(arg || '').trim();
  if (!text) return null;
  const index = Number(text);
  if (Number.isInteger(index) && index >= 1) {
    return session.lastChats?.[index - 1] || null;
  }

  const candidates = session.lastChats?.length
    ? session.lastChats
    : session.characterAvatar
      ? await fetchCharacterChatEntries(await st.post('/api/characters/get', { avatar_url: session.characterAvatar }))
      : await fetchRecentChatEntries();

  const normalizedText = normalizeChatFileName(text);
  return candidates.find((entry) => (
    normalizeChatFileName(entry.fileName) === normalizedText
    || normalizeChatFileName(entry.fileId) === normalizedText
    || entry.fileName.includes(text)
    || entry.fileId.includes(text)
  )) || null;
}

function entryTitle(entry) {
  return String(entry.fileId || entry.fileName || '未命名聊天').replace(/\.jsonl$/i, '');
}

function normalizeChatFileName(fileName) {
  return String(fileName || '').replace(/\.jsonl$/i, '');
}

function formatEntryTime(value) {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function compactText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

async function setDefaultCharacterChat(avatar, fileName) {
  try {
    await st.post('/api/characters/merge-attributes', {
      avatar,
      chat: normalizeChatFileName(fileName),
    });
  } catch (error) {
    console.warn('Failed to set character default chat:', error?.message || error);
  }
}

function buildGeneratePayload(profile, character, sourceMessages, userName, metadata = {}, preset = null) {
  const recentMessages = sourceMessages.slice(-24).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
  }));
  const messages = [
    { role: 'system', content: getSystemPrompt(character, metadata, preset?.systemPrompt || '') },
    ...recentMessages,
  ];
  const payload = {
    type: 'normal',
    messages,
    model: profile.model,
    temperature: preset?.temperature ?? profile.temperature ?? 0.7,
    max_tokens: resolveMaxCompletionTokens(preset?.maxTokens ?? profile.maxTokens),
    top_p: preset?.topP ?? profile.topP ?? 1,
    presence_penalty: preset?.presencePenalty ?? profile.presencePenalty ?? 0,
    frequency_penalty: preset?.frequencyPenalty ?? profile.frequencyPenalty ?? 0,
    chat_completion_source: profile.source,
    user_name: userName || 'Telegram',
    char_name: character.name || 'Character',
  };
  if (profile.secretId) payload.secret_id = profile.secretId;
  if (profile.source === 'custom') payload.custom_url = profile.endpoint;
  if (profile.endpoint && reverseProxySources.has(profile.source)) payload.reverse_proxy = profile.endpoint;
  return payload;
}

const reverseProxySources = new Set([
  'openai',
  'openrouter',
  'deepseek',
  'mistral',
  'groq',
  'cohere',
  'ai21',
  'electronhub',
]);

function getSystemPrompt(character, metadata = {}, presetSystemPrompt = '') {
  const data = character.data || {};
  const aibar = getMetadataAibar(metadata);
  const storyParts = [
    stringValue(aibar.storyTitle) ? `故事标题：${stringValue(aibar.storyTitle)}` : '',
    stringValue(aibar.storySummary) ? `故事简介：${stringValue(aibar.storySummary)}` : '',
    stringValue(aibar.storyScenario) ? `故事场景：${stringValue(aibar.storyScenario)}` : '',
  ].filter(Boolean);
  const scenario = [
    data.scenario || character.scenario || '',
    ...storyParts,
  ].filter(Boolean).join('\n\n');
  const systemPrompt = [
    data.system_prompt || '',
    stringValue(aibar.storySystemAppend),
  ].filter(Boolean).join('\n\n');
  const memory = aibar.memory && typeof aibar.memory === 'object' ? aibar.memory : null;
  const memorySummary = memory ? stringValue(memory.summary) : '';
  const pieces = [
    memorySummary ? `长期记忆 / 背景信息：\n${memorySummary}` : '',
    `你正在扮演角色：${character.name || '未命名角色'}。`,
    textBlock('角色描述', character.description || data.description),
    textBlock('性格', data.personality || character.personality),
    textBlock('场景', scenario),
    textBlock('对话示例', data.mes_example || character.mes_example),
    presetSystemPrompt ? `额外指令：\n${presetSystemPrompt}` : '',
    systemPrompt || '保持角色口吻，直接回应用户，不要解释你是模型。',
  ].filter(Boolean);
  return pieces.join('\n\n');
}

function textBlock(label, value) {
  const text = String(value || '').trim();
  return text ? `${label}：\n${text}` : '';
}

function createChatName(character, source) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/[.TZ]/g, '').slice(0, 14);
  const base = sanitizeFileBase(character.name || character.avatar || 'AIBAR Chat');
  return `${base} - ${source} - ${stamp}`;
}

function sanitizeFileBase(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'AIBAR Chat';
}

function telegramUserName(from) {
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram';
}

async function sendMessage(chatId, text) {
  await telegram('sendMessage', {
    chat_id: chatId,
    text: String(text).slice(0, 4096),
    disable_web_page_preview: true,
  });
}

async function sendLongMessage(chatId, text) {
  const chunks = chunkText(text, 3900);
  for (const chunk of chunks) {
    await sendMessage(chatId, chunk);
  }
}

function chunkText(text, maxLength) {
  const chunks = [];
  let rest = String(text || '');
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf('\n', maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function telegram(method, body = {}, options = {}) {
  const token = String(options.token || config.token || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 未配置');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || response.statusText}`);
  }
  return data.result;
}

class StClient {
  constructor(baseUrl) {
    this.baseUrl = normalizeBaseUrl(baseUrl || 'http://127.0.0.1:8001');
    this.csrfToken = '';
    this.cookie = '';
  }

  async boot() {
    const response = await fetch(`${this.baseUrl}/csrf-token`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
    });
    this.captureCookie(response);
    if (!response.ok) {
      throw new Error(`ST /csrf-token failed (${response.status}): ${await response.text()}`);
    }
    const data = await response.json();
    this.csrfToken = data.token;
  }

  async post(url, body = {}) {
    if (!this.csrfToken) await this.boot();
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    this.captureCookie(response);
    if (response.status === 403) {
      await this.boot();
      return this.post(url, body);
    }
    if (!response.ok) {
      throw new Error(`ST ${url} failed (${response.status}): ${await response.text()}`);
    }
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('json') ? response.json() : response.text();
  }

  captureCookie(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    this.cookie = setCookie
      .split(/,(?=\s*[^;,]+=[^;,]+)/)
      .map((part) => part.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }
}

function startPolling() {
  if (!config.token) {
    polling.desired = false;
    polling.running = false;
    polling.bot = null;
    polling.lastError = 'TELEGRAM_BOT_TOKEN 未配置，轮询未启动';
    console.log(`AIBAR Telegram admin API is ready at ${adminServerUrl()}`);
    console.log('Telegram polling is idle until TELEGRAM_BOT_TOKEN is configured.');
    return;
  }
  if (polling.promise) return;
  polling.desired = true;
  polling.lastError = '';
  polling.promise = pollingLoop().finally(() => {
    polling.promise = null;
    polling.running = false;
    polling.stoppedAt = new Date().toISOString();
  });
}

async function stopPolling(timeoutMs = 3000) {
  polling.desired = false;
  if (pollAbortController) {
    pollAbortController.abort();
    pollAbortController = null;
  }
  if (!polling.promise) return;
  await Promise.race([
    polling.promise.catch(() => undefined),
    sleep(timeoutMs),
  ]);
}

async function restartPolling() {
  await stopPolling();
  startPolling();
}

async function pollingLoop() {
  polling.running = true;
  polling.startedAt = new Date().toISOString();
  polling.stoppedAt = '';

  try {
    const me = await telegram('getMe');
    polling.bot = normalizeTelegramBot(me);
    console.log(`AIBAR Telegram bot started: @${me.username || me.first_name || 'unknown'}`);
    console.log(`ST backend: ${config.stBaseUrl}`);
    console.log(`Admin API: ${adminServerUrl()}`);
    if (!config.allowedUserIds.size) {
      console.warn('WARNING: TELEGRAM_ALLOWED_USER_IDS is empty. Anyone who can reach the bot may use it.');
    }
  } catch (error) {
    polling.lastError = error?.message || String(error);
    console.error('Telegram startup check failed:', polling.lastError);
  }

  while (polling.desired) {
    const controller = new AbortController();
    pollAbortController = controller;
    try {
      const updates = await telegram('getUpdates', {
        offset: state.offset,
        timeout: config.pollTimeoutSeconds,
        allowed_updates: ['message'],
      }, { signal: controller.signal });
      for (const update of updates) {
        state.offset = update.update_id + 1;
        polling.lastUpdateAt = new Date().toISOString();
        saveState(statePath, state);
        void handleUpdate(update).catch((error) => {
          polling.lastError = error?.message || String(error);
          console.error('Update failed:', error);
        });
      }
    } catch (error) {
      if (!polling.desired || error?.name === 'AbortError') break;
      polling.lastError = error?.message || String(error);
      console.error('Polling failed:', polling.lastError);
      await sleep(2000);
    } finally {
      if (pollAbortController === controller) pollAbortController = null;
    }
  }
}

function startAdminServer() {
  if (adminServer) return;
  adminServer = http.createServer((req, res) => {
    handleAdminRequest(req, res).catch((error) => {
      console.error('Admin API failed:', error);
      sendJson(req, res, 500, {
        ok: false,
        message: error?.message || 'Admin API failed',
      });
    });
  });
  adminServer.listen(config.adminPort, config.adminHost, () => {
    adminServerInfo = {
      host: config.adminHost,
      port: config.adminPort,
    };
    console.log(`AIBAR Telegram admin API listening on ${adminServerUrl()}`);
  });
}

async function handleAdminRequest(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(req, res, 200, { ok: true });
    return;
  }

  if (!isAdminAuthorized(req)) {
    sendJson(req, res, 401, {
      ok: false,
      message: 'ADMIN_TOKEN 校验失败',
    });
    return;
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    sendJson(req, res, 200, buildStatus());
    return;
  }
  if (url.pathname === '/api/config' && req.method === 'POST') {
    const body = await readJson(req);
    const updates = configUpdatesFromBody(body);
    if (Object.keys(updates).length) {
      writeEnvFile(envPath, updates);
      reloadRuntime();
      await restartPolling();
    }
    sendJson(req, res, 200, buildStatus());
    return;
  }
  if (url.pathname === '/api/polling/restart' && req.method === 'POST') {
    reloadRuntime();
    await restartPolling();
    sendJson(req, res, 200, buildStatus());
    return;
  }
  if (url.pathname === '/api/debug/telegram' && req.method === 'POST') {
    const body = await readJson(req);
    sendJson(req, res, 200, await debugTelegram(body));
    return;
  }
  if (url.pathname === '/api/debug/st' && req.method === 'POST') {
    const body = await readJson(req);
    sendJson(req, res, 200, await debugSt(body));
    return;
  }
  if (url.pathname === '/api/debug/full' && req.method === 'POST') {
    const body = await readJson(req);
    const [telegramResult, stResult] = await Promise.all([
      debugTelegram(body),
      debugSt(body),
    ]);
    sendJson(req, res, 200, {
      ok: telegramResult.ok && stResult.ok,
      telegram: telegramResult,
      st: stResult,
    });
    return;
  }

  sendJson(req, res, 404, {
    ok: false,
    message: 'Not found',
  });
}

function configUpdatesFromBody(body) {
  const updates = {};
  if (body.clearToken) {
    updates.TELEGRAM_BOT_TOKEN = '';
  } else if (typeof body.token === 'string' && body.token.trim()) {
    updates.TELEGRAM_BOT_TOKEN = body.token.trim();
  }
  if (typeof body.allowedUserIds === 'string') {
    updates.TELEGRAM_ALLOWED_USER_IDS = normalizeCsv(body.allowedUserIds);
  }
  if (typeof body.stBaseUrl === 'string' && body.stBaseUrl.trim()) {
    updates.ST_BASE_URL = normalizeBaseUrl(body.stBaseUrl);
  }
  if (typeof body.modelProfileId === 'string') {
    updates.AIBAR_MODEL_PROFILE_ID = body.modelProfileId.trim();
  }
  if (body.maxCompletionTokens !== undefined) {
    const tokens = Number(body.maxCompletionTokens);
    if (Number.isFinite(tokens) && tokens >= 256 && tokens <= 65536) {
      updates.AIBAR_MAX_COMPLETION_TOKENS = String(Math.round(tokens));
    }
  }
  if (body.pollTimeoutSeconds !== undefined) {
    const seconds = Number(body.pollTimeoutSeconds);
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 60) {
      updates.POLL_TIMEOUT_SECONDS = String(Math.round(seconds));
    }
  }
  return updates;
}

async function debugTelegram(body = {}) {
  const startedAt = Date.now();
  const token = String(body.token || config.token || '').trim();
  if (!token) {
    return {
      ok: false,
      message: '未配置 Telegram Bot Token',
      latencyMs: 0,
    };
  }
  try {
    const bot = await telegram('getMe', {}, { token });
    return {
      ok: true,
      message: `Telegram Bot 可用：@${bot.username || bot.first_name || bot.id}`,
      latencyMs: Date.now() - startedAt,
      bot: normalizeTelegramBot(bot),
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || 'Telegram 检查失败',
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function debugSt(body = {}) {
  const startedAt = Date.now();
  const baseUrl = normalizeBaseUrl(body.stBaseUrl || config.stBaseUrl);
  try {
    const client = new StClient(baseUrl);
    await client.boot();
    const [characters, rawSettings] = await Promise.all([
      client.post('/api/characters/all'),
      client.post('/api/settings/get'),
    ]);
    const settings = parseSettings(rawSettings?.settings);
    const aibar = settings.aibar || {};
    const profiles = Array.isArray(aibar.simple_ui_model_profiles) ? aibar.simple_ui_model_profiles : [];
    return {
      ok: true,
      message: 'ST 后端连接正常',
      latencyMs: Date.now() - startedAt,
      stBaseUrl: baseUrl,
      characters: Array.isArray(characters) ? characters.length : 0,
      modelProfiles: profiles.length,
      activeProfileId: aibar.simple_ui_active_profile || '',
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || 'ST 检查失败',
      latencyMs: Date.now() - startedAt,
      stBaseUrl: baseUrl,
    };
  }
}

function buildStatus() {
  return {
    ok: true,
    config: {
      tokenConfigured: Boolean(config.token),
      tokenPreview: maskToken(config.token),
      allowedUserIds: [...config.allowedUserIds],
      stBaseUrl: config.stBaseUrl,
      modelProfileId: config.modelProfileId,
      maxCompletionTokens: config.maxCompletionTokens,
      pollTimeoutSeconds: config.pollTimeoutSeconds,
      dataDir: path.relative(rootDir, config.dataDir) || '.',
      admin: {
        host: adminServerInfo?.host || config.adminHost,
        port: adminServerInfo?.port || config.adminPort,
        tokenConfigured: Boolean(config.adminToken),
      },
    },
    polling: {
      configured: Boolean(config.token),
      desired: polling.desired,
      running: polling.running,
      startedAt: polling.startedAt,
      stoppedAt: polling.stoppedAt,
      lastUpdateAt: polling.lastUpdateAt,
      lastError: polling.lastError,
      bot: polling.bot,
      offset: state.offset,
      sessions: Object.keys(state.sessions || {}).length,
      activeUsers: activeUsers.size,
    },
  };
}

function reloadRuntime() {
  config = loadConfig();
  fs.mkdirSync(config.dataDir, { recursive: true });
  statePath = path.join(config.dataDir, 'state.json');
  state = loadState(statePath);
  st = new StClient(config.stBaseUrl);
}

function getSession(userId, chatId) {
  state.sessions[userId] ||= {
    userId,
    chatId,
    lastCharacters: [],
    createdAt: new Date().toISOString(),
  };
  state.sessions[userId].chatId = chatId;
  state.sessions[userId].updatedAt = new Date().toISOString();
  return state.sessions[userId];
}

function isAllowed(userId) {
  return !config.allowedUserIds.size || config.allowedUserIds.has(String(userId));
}

function parseSettings(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getMetadataAibar(metadata) {
  return metadata?.aibar && typeof metadata.aibar === 'object' ? metadata.aibar : {};
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function loadConfig() {
  const fileEnv = readEnvFile(envPath);
  const env = { ...process.env, ...fileEnv };
  return {
    token: String(env.TELEGRAM_BOT_TOKEN || '').trim(),
    allowedUserIds: setFromCsv(env.TELEGRAM_ALLOWED_USER_IDS || ''),
    stBaseUrl: normalizeBaseUrl(env.ST_BASE_URL || 'http://127.0.0.1:8001'),
    modelProfileId: String(env.AIBAR_MODEL_PROFILE_ID || '').trim(),
    maxCompletionTokens: clampNumber(env.AIBAR_MAX_COMPLETION_TOKENS, 4096, 256, 65536),
    pollTimeoutSeconds: clampNumber(env.POLL_TIMEOUT_SECONDS, 25, 5, 60),
    dataDir: path.resolve(rootDir, env.DATA_DIR || './data'),
    adminHost: String(env.ADMIN_HOST || '127.0.0.1').trim(),
    adminPort: clampNumber(env.ADMIN_PORT, 8787, 1, 65535),
    adminToken: String(env.ADMIN_TOKEN || '').trim(),
  };
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function writeEnvFile(filePath, updates) {
  const lines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    return `${key}=${formatEnvValue(updates[key])}`;
  });

  for (const key of ENV_WRITE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(updates, key) || seen.has(key)) continue;
    nextLines.push(`${key}=${formatEnvValue(updates[key])}`);
  }

  fs.writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/, '')}\n`);
}

function formatEnvValue(value) {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@,\-]*$/.test(text) ? text : JSON.stringify(text);
}

function setFromCsv(value) {
  return new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
}

function normalizeCsv(value) {
  return [...setFromCsv(value)].join(',');
}

function normalizeBaseUrl(value) {
  return String(value || 'http://127.0.0.1:8001').trim().replace(/\/+$/, '');
}

function resolveMaxCompletionTokens(value) {
  const tokens = Number(value);
  const fallback = config.maxCompletionTokens || 4096;
  if (!Number.isFinite(tokens) || tokens <= 0) return fallback;
  return Math.min(Math.round(tokens), fallback);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function loadState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      offset: Number(parsed.offset || 0),
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
    };
  } catch {
    return { offset: 0, sessions: {} };
  }
}

function saveState(filePath, nextState) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2));
}

function maskToken(token) {
  const text = String(token || '');
  if (!text) return '';
  const [prefix, rest = ''] = text.split(':');
  if (!rest) return text.length <= 8 ? '已配置' : `${text.slice(0, 4)}...${text.slice(-4)}`;
  return `${prefix}:...${rest.slice(-4)}`;
}

function normalizeTelegramBot(bot) {
  if (!bot) return null;
  return {
    id: bot.id,
    username: bot.username || '',
    firstName: bot.first_name || '',
    canJoinGroups: Boolean(bot.can_join_groups),
    canReadAllGroupMessages: Boolean(bot.can_read_all_group_messages),
    supportsInlineQueries: Boolean(bot.supports_inline_queries),
  };
}

function adminServerUrl() {
  const host = adminServerInfo?.host || config.adminHost;
  const port = adminServerInfo?.port || config.adminPort;
  return `http://${host}:${port}`;
}

function isAdminAuthorized(req) {
  if (!config.adminToken) return true;
  const direct = req.headers['x-aibar-admin-token'];
  const authorization = req.headers.authorization || '';
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  return direct === config.adminToken || bearer === config.adminToken;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || isLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-AIBAR-Admin-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function sendJson(req, res, statusCode, body) {
  setCors(req, res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
