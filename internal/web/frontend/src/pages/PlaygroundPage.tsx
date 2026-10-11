import { useState, useRef, useEffect, useCallback } from 'react'
import { SendIcon, XIcon, SquareIcon } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export default function PlaygroundPage() {
  const { t } = useI18n()
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [input, setInput] = useState('')
  const [conversation, setConversation] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [conversation, scrollToBottom])

  async function sendMessage() {
    const text = input.trim()
    if (!apiKey.trim()) {
      setError(t('playground.apiKeyRequired'))
      return
    }
    if (!model.trim()) {
      setError(t('playground.modelRequired'))
      return
    }
    if (!text) return

    setError('')
    const userMsg: Message = { role: 'user', content: text }
    const newConvo = [...conversation, userMsg]
    setConversation(newConvo)
    setInput('')

    const messages: Message[] = []
    if (systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() })
    }
    messages.push(...newConvo)

    setStreaming(true)
    const assistantMsg: Message = { role: 'assistant', content: '' }
    setConversation([...newConvo, assistantMsg])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const resp = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim(),
          messages,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        setConversation((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${errText}` }
          return updated
        })
        setStreaming(false)
        return
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              assistantText += delta
              setConversation((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                return updated
              })
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setConversation((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err.message}` }
          return updated
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function stopStreaming() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setStreaming(false)
  }

  function clearConversation() {
    if (abortRef.current) abortRef.current.abort()
    setConversation([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !streaming) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex min-h-[calc(100svh-5rem)] md:h-[calc(100svh-4rem)] flex-col">
      <PageHeader
        index="05"
        title={t('playground.title')}
        description={t('playground.description')}
        actions={
          <Button variant="outline" size="sm" onClick={clearConversation} className="w-full sm:w-auto">
            <XIcon className="size-4" /> {t('playground.clearChat')}
          </Button>
        }
      />

      {error && <DismissibleAlert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</DismissibleAlert>}

      {/* Request configuration */}
      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="grid gap-3 sm:gap-4 px-3 sm:px-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pg-key">{t('playground.apiKey')}</Label>
              <Input
                id="pg-key"
                type="password"
                className="h-8 font-mono text-xs"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('playground.apiKeyPlaceholder')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pg-model">{t('playground.model')}</Label>
              <Input
                id="pg-model"
                className="h-8 font-mono text-xs"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t('playground.modelPlaceholder')}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pg-system">{t('playground.systemPrompt')}</Label>
            <Textarea
              id="pg-system"
              className="min-h-8 text-xs"
              rows={1}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('playground.systemPromptPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Conversation log */}
      <div className="mb-4 flex min-h-[300px] flex-1 flex-col gap-3 overflow-y-auto border bg-card p-3 sm:p-4">
        {conversation.length === 0 ? (
          <p className="my-auto text-center font-mono text-xs text-muted-foreground">
            {t('playground.emptyChat')}
          </p>
        ) : (
          conversation.map((msg, i) => (
            <div
              key={i}
              className={cn('flex max-w-[92%] sm:max-w-[85%] flex-col gap-1', msg.role === 'user' ? 'self-end items-end' : 'self-start')}
            >
              <span className="kicker text-muted-foreground text-xs">
                {msg.role === 'user' ? 'User' : msg.role === 'system' ? 'System' : 'Assistant'}
              </span>
              <div
                className={cn(
                  'border px-3 py-2 text-sm whitespace-pre-wrap break-words rounded-xs',
                  msg.role === 'user'
                    ? 'border-carbon bg-carbon text-bone dark:border-bone/90 dark:bg-bone/90 dark:text-ink'
                    : 'bg-background',
                )}
              >
                {msg.content || (streaming && i === conversation.length - 1 ? '▍' : '')}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          className="flex-1 text-sm"
          placeholder={t('playground.messagePlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        {streaming ? (
          <Button variant="destructive" onClick={stopStreaming}>
            <SquareIcon className="size-4" /> {t('playground.stop')}
          </Button>
        ) : (
          <Button onClick={sendMessage} disabled={streaming}>
            <SendIcon className="size-4" /> <span className="hidden sm:inline">{t('playground.send')}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
