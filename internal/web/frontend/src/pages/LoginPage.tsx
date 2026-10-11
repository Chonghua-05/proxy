import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LanguagesIcon, MoonIcon, SunIcon } from 'lucide-react'

import Lockup from '@/components/brand/Lockup'
import Monogram from '@/components/brand/Monogram'
import DismissibleAlert from '@/components/DismissibleAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'

export default function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const { t, language, setLanguage } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()

  const isZh = language === 'zh-CN'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) {
      setError(t('login.tokenRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      // Validate token by making a test API call.
      const resp = await fetch('/admin/providers', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      })
      if (resp.status === 401) {
        setError(t('login.invalidToken'))
        setLoading(false)
        return
      }
      if (!resp.ok) {
        setError(t('login.failedVerify'))
        setLoading(false)
        return
      }
      login(token.trim())
      navigate('/', { replace: true })
    } catch {
      setError(t('login.failedConnect'))
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-4 sm:gap-8 sm:p-6">
      {/* 顶部语言与主题快捷切换 */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 font-mono text-xs gap-1"
          onClick={() => setLanguage(isZh ? 'en' : 'zh-CN')}
          title={isZh ? t('lang.switchToEn') : t('lang.switchToZh')}
        >
          <LanguagesIcon className="size-3.5" />
          <span>{isZh ? '中' : 'EN'}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          title={resolvedTheme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
        >
          {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>

      <div className="flex flex-col items-center gap-4 sm:gap-5">
        <Monogram size={56} className="sm:size-16" />
        <Lockup className="text-2xl sm:text-3xl" />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <DismissibleAlert variant="destructive" className="mb-4" onClose={() => setError('')}>
              {error}
            </DismissibleAlert>
          )}
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="admin-token">{t('login.tokenLabel')}</Label>
              <Input
                id="admin-token"
                type="password"
                placeholder={t('login.tokenPlaceholder')}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="kicker text-center text-xs sm:text-sm text-muted-foreground">{t('login.tagline')}</p>
    </div>
  )
}
