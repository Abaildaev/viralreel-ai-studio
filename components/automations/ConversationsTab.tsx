import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import { AiSalesMessage } from '../../types';
import { generateSalesAgentReply, loadSalesAgentConfig } from '../../services/aiSalesAgentService';
import { getErrorMessage } from '../../utils/errorMessage';

type MessageRole = 'user' | 'agent';

interface ConversationMessage {
  id: string;
  instagram_account_id: string;
  sender_igsid: string;
  role: MessageRole;
  content: string;
  detected_intent: string | null;
  handed_off: boolean;
  created_at: string;
  instagram_accounts: { username: string } | null;
}

interface Conversation {
  id: string;
  senderIgsid: string;
  accountUsername: string | null;
  messages: ConversationMessage[];
  lastMessage: ConversationMessage;
}

interface InstagramContact {
  instagram_account_id: string;
  sender_igsid: string;
  username: string | null;
  display_name: string | null;
  profile_picture_url: string | null;
}

function personName(senderIgsid: string): string {
  return `Пользователь · ${senderIgsid.slice(-6)}`;
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

interface ConversationsTabProps {
  /** Instagram account whose Direct threads are shown; `null` shows all. */
  accountId?: string | null;
}

export default function ConversationsTab({ accountId = null }: ConversationsTabProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<InstagramContact[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);

    /* Scoped in the query rather than after the fact: the 300-row cap would
       otherwise be spent on the other account's threads. */
    const messageQuery = supabase
      .from('ai_sales_messages')
      .select('id,instagram_account_id,sender_igsid,role,content,detected_intent,handed_off,created_at,instagram_accounts(username)')
      .order('created_at', { ascending: false })
      .limit(300);

    const contactQuery = supabase
      .from('instagram_contacts')
      .select('instagram_account_id,sender_igsid,username,display_name,profile_picture_url');

    const [messageResult, contactResult] = await Promise.all([
      accountId ? messageQuery.eq('instagram_account_id', accountId) : messageQuery,
      accountId ? contactQuery.eq('instagram_account_id', accountId) : contactQuery,
    ]);

    if (!messageResult.error) setMessages((messageResult.data ?? []) as unknown as ConversationMessage[]);
    if (!contactResult.error) setContacts((contactResult.data ?? []) as InstagramContact[]);
    setLoading(false);
  };

  useEffect(() => {
    const syncAndLoad = async () => {
      await supabase.functions.invoke('sync-instagram-contacts', { body: {} });
      await loadMessages();
    };
    syncAndLoad();
    const channel = supabase
      .channel('realtime:ai-sales-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_sales_messages' }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId]);

  const conversations = useMemo(() => {
    const grouped = new Map<string, Conversation>();
    for (const message of messages) {
      const id = `${message.instagram_account_id}:${message.sender_igsid}`;
      const existing = grouped.get(id);
      if (existing) existing.messages.push(message);
      else grouped.set(id, {
        id,
        senderIgsid: message.sender_igsid,
        accountUsername: message.instagram_accounts?.username ?? null,
        messages: [message],
        lastMessage: message,
      });
    }
    return [...grouped.values()]
      .map((conversation) => ({ ...conversation, messages: [...conversation.messages].reverse() }))
      .sort((a, b) => +new Date(b.lastMessage.created_at) - +new Date(a.lastMessage.created_at));
  }, [messages]);

  const visibleConversations = conversations.filter((conversation) => {
    const value = `${conversation.senderIgsid} ${conversation.lastMessage.content}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });
  const selected = visibleConversations.find((conversation) => conversation.id === selectedId)
    ?? visibleConversations[0]
    ?? null;

  const contactMap = useMemo(
    () => new Map(contacts.map((contact) => [
      `${contact.instagram_account_id}:${contact.sender_igsid}`,
      contact,
    ])),
    [contacts],
  );
  const contactName = (conversation: Conversation) => {
    const contact = contactMap.get(conversation.id);
    if (contact?.username) return `@${contact.username}`;
    return contact?.display_name || personName(conversation.senderIgsid);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!selected || !text || sending) return;
    setSending(true);
    setSendError(null);
    const { data, error } = await supabase.functions.invoke('send-instagram-message', {
      body: {
        instagramAccountId: selected.messages[0].instagram_account_id,
        senderIgsid: selected.senderIgsid,
        text,
      },
    });
    setSending(false);
    if (error || data?.error) {
      setSendError(data?.error || error?.message || 'Не удалось отправить сообщение');
      return;
    }
    setDraft('');
    await loadMessages();
  };

  const handleResumeAi = async () => {
    if (!selected || resuming) return;
    setResuming(true);
    setSendError(null);
    const { data, error } = await supabase.functions.invoke('send-instagram-message', {
      body: {
        action: 'resume',
        instagramAccountId: selected.messages[0].instagram_account_id,
        senderIgsid: selected.senderIgsid,
      },
    });
    setResuming(false);
    if (error || data?.error) {
      setSendError(data?.error || error?.message || 'Не удалось вернуть диалог ИИ');
      return;
    }
    await loadMessages();
  };

  const handleDraftWithAi = async () => {
    if (!selected || assisting) return;

    setAssisting(true);
    setSendError(null);
    try {
      const accountId = selected.messages[0].instagram_account_id;
      const config = await loadSalesAgentConfig(accountId);
      const history: AiSalesMessage[] = selected.messages.slice(-12).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.created_at,
        detectedIntent: message.detected_intent as AiSalesMessage['detectedIntent'],
      }));
      const { reply } = await generateSalesAgentReply(history, config);
      setDraft(reply);
    } catch (error) {
      setSendError(getErrorMessage(error, 'Не удалось подготовить ответ с ИИ'));
    } finally {
      setAssisting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl shadow-xs overflow-hidden min-h-[620px] flex">
      <aside className="w-full md:w-[340px] border-r border-gray-100 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Диалоги</h2>
              <p className="text-xs text-gray-500 mt-0.5">Переписки, обработанные ИИ</p>
            </div>
            <button onClick={loadMessages} title="Обновить" className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по сообщению или ID"
            className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="overflow-y-auto divide-y divide-gray-100 flex-1">
          {loading ? (
            <p className="p-5 text-xs text-gray-400">Загружаю переписки…</p>
          ) : visibleConversations.length === 0 ? (
            <div className="p-8 text-center">
              <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-500">Пока нет сообщений от ИИ‑продавца.</p>
            </div>
          ) : visibleConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${selected?.id === conversation.id ? 'bg-brand-50/70' : ''}`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-xs text-gray-900 truncate">{contactName(conversation)}</span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeLabel(conversation.lastMessage.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 truncate">{conversation.lastMessage.role === 'agent' ? 'ИИ: ' : ''}{conversation.lastMessage.content}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="hidden md:flex flex-1 flex-col min-w-0 bg-gray-50/35">
        {selected ? (
          <>
            <header className="p-4 bg-white border-b border-gray-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                <UserCircleIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-gray-900">{contactName(selected)}</h3>
                <p className="text-[11px] text-gray-400">Instagram Direct · технический ID {selected.senderIgsid}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
              {selected.messages.some((message) => message.handed_off) && (
                <button
                  onClick={handleResumeAi}
                  disabled={resuming}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200 disabled:opacity-50"
                >
                  {resuming ? 'Возвращаю…' : 'Вернуть ИИ'}
                </button>
              )}
              {contactMap.get(selected.id)?.username && (
                <a
                  href={`https://instagram.com/${contactMap.get(selected.id)?.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 text-gray-400 hover:text-gray-700"
                  title="Открыть профиль Instagram"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </a>
              )}
              </div>
            </header>
            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              {selected.messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${message.role === 'agent' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>
                    <p>{message.content}</p>
                    <p className={`text-[10px] mt-1.5 ${message.role === 'agent' ? 'text-brand-100' : 'text-gray-400'}`}>
                      {message.role === 'agent'
                        ? message.detected_intent === 'manual_reply'
                          ? 'Вы · '
                          : message.detected_intent === 'lead_magnet'
                            ? 'Автоматизация · '
                            : 'ИИ‑продавец · '
                        : ''}{timeLabel(message.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <footer className="p-4 bg-white border-t border-gray-100">
              {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-gray-400">ИИ предложит ответ по контексту диалога — вы сможете его изменить.</p>
                <button
                  type="button"
                  onClick={handleDraftWithAi}
                  disabled={assisting}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                >
                  <SparklesIcon className={`h-3.5 w-3.5 ${assisting ? 'animate-pulse' : ''}`} />
                  {assisting ? 'ИИ пишет…' : 'Помочь написать'}
                </button>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={2}
                  maxLength={1000}
                  placeholder="Напишите ответ пользователю…"
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="h-10 px-4 rounded-xl bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  {sending ? 'Отправляю…' : 'Отправить'}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-gray-400">После ручного ответа ИИ ставится на паузу для этого диалога. Enter — отправить, Shift+Enter — новая строка.</p>
            </footer>
          </>
        ) : (
          <div className="m-auto text-center text-sm text-gray-400">Выберите диалог слева</div>
        )}
      </main>
    </div>
  );
}
