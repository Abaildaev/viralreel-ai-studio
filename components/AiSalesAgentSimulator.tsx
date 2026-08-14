import React, { useState, useRef, useEffect } from 'react';
import { AiSalesAgentConfig, AiSalesMessage } from '../types';
import { generateSalesAgentReply } from '../services/aiSalesAgentService';
import {
  PaperAirplaneIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface AiSalesAgentSimulatorProps {
  config: AiSalesAgentConfig;
}

const INITIAL_MESSAGES: AiSalesMessage[] = [
  {
    id: 'm-0',
    role: 'agent',
    content: 'Привет! Рад знакомству 🙌 Подскажите, вы сейчас развиваете личный блог или проект для бизнеса?',
    timestamp: '14:20',
    detectedIntent: 'greeting',
  },
];

export const AiSalesAgentSimulator: React.FC<AiSalesAgentSimulatorProps> = ({ config }) => {
  const [messages, setMessages] = useState<AiSalesMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    const userMsg: AiSalesMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setIsTyping(true);

    try {
      // Simulate natural typing delay (800ms)
      await new Promise((r) => setTimeout(r, 800));

      const { reply, intent } = await generateSalesAgentReply(newHistory, config);

      const agentMsg: AiSalesMessage = {
        id: `a-${Date.now()}`,
        role: 'agent',
        content: reply,
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        detectedIntent: intent,
      };

      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleReset = () => {
    setMessages(INITIAL_MESSAGES);
    setInputText('');
  };

  const quickPrompts = [
    { label: '💰 «Сколько стоит обучение?»', text: 'Сколько стоит ваше обучение?' },
    { label: '⚠️ «Мне кажется, это дорого»', text: 'Мне кажется, это дорого для меня' },
    { label: '⏳ «У меня совсем нет времени»', text: 'У меня совсем нет времени снимать ролики' },
    { label: '💳 «Хочу купить, куда платить?»', text: 'Хочу купить базовый тариф, куда оплатить?' },
    { label: '👤 «Позови живого человека»', text: 'Позови пожалуйста живого менеджера' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col h-[640px]">
      {/* Simulator Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-[#1E60FF] text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {config.agentName.slice(0, 2).toUpperCase()}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-xs text-slate-900">
                {config.agentName} (ИИ-Менеджер)
              </h3>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100/60">
                В сети
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Цель: {config.goal === 'consultation' ? 'Запись на консультацию' : config.goal === 'direct_sale' ? 'Прямая продажа' : 'Квалификация лида'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="p-1.5 hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
          title="Сбросить диалог"
        >
          <ArrowPathIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Сбросить</span>
        </button>
      </div>

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/30">
        {messages.map((msg) => {
          const isAgent = msg.role === 'agent';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-xs ${
                  isAgent
                    ? 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-xs'
                    : 'bg-[#1E60FF] text-white rounded-tr-xs'
                }`}
              >
                <p className="whitespace-pre-line font-normal">{msg.content}</p>
              </div>

              {/* Timestamp & Intent Badge */}
              <div className="flex items-center gap-1.5 mt-1 px-1">
                <span className="text-[10px] text-slate-400 font-mono">{msg.timestamp}</span>

                {isAgent && msg.detectedIntent && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                    msg.detectedIntent === 'ready_to_buy'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : msg.detectedIntent === 'objection'
                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                      : msg.detectedIntent === 'handoff_request'
                      ? 'bg-purple-50 text-purple-700 border border-purple-100'
                      : 'text-slate-400'
                  }`}>
                    {msg.detectedIntent === 'ready_to_buy' && '🎯 Готов к покупке'}
                    {msg.detectedIntent === 'objection' && '⚠️ Отработка возражения'}
                    {msg.detectedIntent === 'handoff_request' && '👤 Запрос оператора'}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-1.5 bg-white border border-slate-200/80 w-16 p-2.5 rounded-2xl rounded-tl-xs shadow-xs">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="p-2 border-t border-slate-100 bg-white overflow-x-auto flex items-center gap-1.5 select-none">
        <span className="text-[11px] text-slate-400 pl-1 whitespace-nowrap">Тестовые вопросы:</span>
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(qp.text)}
            className="px-2.5 py-1 bg-slate-100 hover:bg-[#1E60FF]/10 hover:text-[#1E60FF] text-slate-700 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input Message Footer */}
      <div className="p-3 border-t border-slate-100 bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Напишите сообщение от лица покупателя..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#1E60FF]"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="p-2.5 bg-[#1E60FF] hover:bg-[#1551E5] disabled:bg-slate-200 text-white rounded-xl transition-all shadow-xs"
            title="Отправить"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default AiSalesAgentSimulator;
