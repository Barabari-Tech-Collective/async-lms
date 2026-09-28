import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, BookOpen, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '@/services/api';
import { getErrorMessage } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface LessonContext {
  title: string;
  contentType: string;
  content: string;
}

interface Props {
  lessonContext: LessonContext;
}

// ─── Code Block Component (ChatGPT Style) ────────────────────────────────────

function CodeBlock({ language, value }: { language?: string; value: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className='not-prose my-2.5 w-full max-w-full min-w-0 rounded-xl overflow-hidden border border-slate-800 shadow-sm bg-[#0d1117] text-slate-100 font-mono'>
      {/* ChatGPT-style Code Header Bar */}
      <div className='flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-slate-800 text-xs text-slate-400 select-none min-w-0'>
        <span className='font-mono text-[11px] font-medium tracking-wide lowercase text-slate-300 truncate max-w-[120px]'>
          {language || 'code'}
        </span>
        <button
          type='button'
          onClick={handleCopy}
          className='flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-700/60 text-slate-300 hover:text-white transition-all text-[11px] font-sans shrink-0'
        >
          {isCopied ? (
            <>
              <Check className='h-3.5 w-3.5 text-emerald-400' />
              <span className='text-emerald-400 font-medium'>Copied!</span>
            </>
          ) : (
            <>
              <Copy className='h-3.5 w-3.5' />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code Area */}
      <div className='p-3 sm:p-3.5 overflow-x-auto w-full max-w-full text-[11px] sm:text-xs leading-relaxed text-slate-100 selection:bg-indigo-500/40 custom-scrollbar'>
        <pre className='!bg-transparent !p-0 !m-0 font-mono whitespace-pre'>
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
}

export default function LessonAssistant({ lessonContext }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<{
        success: boolean;
        data: { reply: string };
      }>('/assistant/chat', { messages: newMessages, lessonContext });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.data.data.reply },
      ]);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to get a response'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* ── Floating trigger ── */}
      <button
        onClick={() => setOpen(true)}
        className='fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-all'
      >
        <Bot className='h-4 w-4' />
        Ask AI
      </button>

      {/* ── Chat dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='flex flex-col gap-0 p-0 w-[94vw] max-w-[94vw] sm:w-full sm:max-w-2xl h-[85dvh] max-h-[700px] rounded-2xl overflow-hidden'>
          {/* Header */}
          <DialogHeader className='px-4 sm:px-5 py-3.5 sm:py-4 border-b shrink-0 min-w-0'>
            <div className='flex items-center gap-3 min-w-0'>
              <div className='h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0'>
                <Bot className='h-4 w-4 text-indigo-600' />
              </div>
              <div className='flex-1 min-w-0'>
                <DialogTitle className='text-sm font-semibold text-slate-900'>
                  CodeGuru AI
                </DialogTitle>
                <div className='flex items-center gap-1.5 mt-0.5 min-w-0'>
                  <BookOpen className='h-3 w-3 text-indigo-400 shrink-0' />
                  <p className='text-xs text-indigo-500 truncate font-medium'>
                    {lessonContext.title}
                  </p>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Messages */}
          <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3.5 sm:px-5 py-4 w-full min-w-0 custom-scrollbar'>
            {messages.length === 0 && (
              <div className='flex flex-col items-center justify-center h-full gap-3 text-center py-10 px-4'>
                <div className='h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center'>
                  <Bot className='h-6 w-6 text-indigo-400' />
                </div>
                <div>
                  <p className='font-semibold text-slate-700 text-sm'>
                    Ask anything about this lesson
                  </p>
                  <p className='text-xs text-slate-400 mt-1 max-w-xs mx-auto'>
                    I'll guide you through concepts and help you understand —
                    without giving away the answers.
                  </p>
                </div>
              </div>
            )}

            <div className='space-y-4 w-full min-w-0'>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 sm:gap-2.5 items-start w-full min-w-0 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className='h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5'>
                      <Bot className='h-3.5 w-3.5 text-indigo-600' />
                    </div>
                  )}
                  <div
                    className={`max-w-[88%] sm:max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm break-words [word-break:break-word] overflow-hidden ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className='prose prose-sm max-w-full w-full min-w-0 break-words [word-break:break-word] overflow-hidden leading-relaxed prose-p:leading-relaxed prose-p:my-1.5 prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0'>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            pre({ children }: any) {
                              return <>{children}</>;
                            },
                            table({ ...props }: any) {
                              return (
                                <div className='w-full max-w-full overflow-x-auto my-2.5 rounded-lg border border-slate-200 min-w-0 custom-scrollbar'>
                                  <table className='w-full text-xs text-left' {...props} />
                                </div>
                              );
                            },
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              const codeContent = String(children).replace(/\n$/, '');
                              const isMultiline = codeContent.includes('\n');
                              const isCodeBlock = !inline || Boolean(match) || isMultiline || codeContent.length > 50;

                              if (isCodeBlock) {
                                return (
                                  <CodeBlock
                                    language={match ? match[1] : undefined}
                                    value={codeContent}
                                  />
                                );
                              }
                              return (
                                <code
                                  className='font-mono text-[11px] sm:text-xs bg-slate-200/90 text-indigo-700 px-1.5 py-0.5 rounded font-semibold break-all'
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className='whitespace-pre-wrap break-words [word-break:break-word]'>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className='flex gap-2 sm:gap-2.5 items-start w-full min-w-0'>
                  <div className='h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5'>
                    <Bot className='h-3.5 w-3.5 text-indigo-600' />
                  </div>
                  <div className='bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none px-3.5 py-2.5'>
                    <Loader2 className='h-3.5 w-3.5 animate-spin text-indigo-400' />
                  </div>
                </div>
              )}

              {error && (
                <p className='text-xs text-red-500 text-center py-2 break-words'>{error}</p>
              )}
            </div>

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className='px-3.5 sm:px-4 py-2.5 sm:py-3 border-t shrink-0 w-full min-w-0 bg-white'>
            <div className='flex items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all min-w-0'>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Ask about this lesson… (Enter to send)'
                rows={1}
                className='flex-1 resize-none bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none py-0.5 max-h-28 min-w-0'
              />
              <Button
                size='icon'
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className='h-7 w-7 sm:h-8 sm:w-8 shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg'
              >
                <Send className='h-3 w-3 sm:h-3.5 sm:w-3.5' />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
