import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ServerIcon,
  KeyRoundIcon,
  ChartNoAxesColumnIcon,
  ShieldIcon,
  TerminalIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  LanguagesIcon,
  MenuIcon,
  XIcon,
} from 'lucide-react'

import Lockup from '@/components/brand/Lockup'
import Monogram from '@/components/brand/Monogram'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTheme } from '@/lib/theme'
import { useAuth } from '@/context/AuthContext'
import { useI18n, type TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface NavDef {
  path: string
  index: string
  labelKey: TranslationKey
  icon: typeof ServerIcon
}

const NAV_ITEMS: NavDef[] = [
  { path: 'providers', index: '01', labelKey: 'nav.providers', icon: ServerIcon },
  { path: 'keys', index: '02', labelKey: 'nav.keys', icon: KeyRoundIcon },
  { path: 'usage', index: '03', labelKey: 'nav.usage', icon: ChartNoAxesColumnIcon },
  { path: 'guardrails', index: '04', labelKey: 'nav.guardrails', icon: ShieldIcon },
  { path: 'playground', index: '05', labelKey: 'nav.playground', icon: TerminalIcon },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useI18n()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={resolvedTheme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
      title={resolvedTheme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

function LanguageToggle() {
  const { language, setLanguage, t } = useI18n()
  const isZh = language === 'zh-CN'
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 font-mono text-xs gap-1"
      aria-label={isZh ? t('lang.switchToEn') : t('lang.switchToZh')}
      title={isZh ? t('lang.switchToEn') : t('lang.switchToZh')}
      onClick={() => setLanguage(isZh ? 'en' : 'zh-CN')}
    >
      <LanguagesIcon className="size-3.5" />
      <span>{isZh ? '中' : 'EN'}</span>
    </Button>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const { t } = useI18n()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // 路由跳转时自动关闭移动端菜单
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const NavList = ({ onSelect }: { onSelect?: () => void }) => (
    <ul className="grid gap-px">
      {NAV_ITEMS.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            onClick={onSelect}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 border-l-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive && 'border-brass bg-accent text-foreground font-medium',
              )
            }
          >
            <span className="font-mono text-xs text-muted-foreground/70">{item.index}</span>
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t(item.labelKey)}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  )

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* 移动端顶部标题栏 */}
      <header className="flex h-14 items-center justify-between border-b px-4 md:hidden bg-background sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
          <Lockup className="text-base" />
        </div>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* 移动端抽屉遮罩与侧栏 */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform duration-200 ease-in-out md:static md:w-60 md:shrink-0 md:translate-x-0',
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Lockup className="text-lg" />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <Separator />

        <nav className="flex-1 py-3 overflow-y-auto">
          <p className="kicker px-4 pb-2 text-muted-foreground/80">{t('nav.console')}</p>
          <NavList onSelect={() => setMobileMenuOpen(false)} />
        </nav>

        <Separator />
        <div className="py-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span className="font-mono text-xs text-muted-foreground/70">·</span>
            <LogOutIcon className="size-4 shrink-0" aria-hidden />
            <span>{t('nav.logout')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3 font-mono text-xs text-muted-foreground">
          <span className="flex-1 truncate">lab34 — llm-proxy</span>
          <Monogram size={20} variant="outline" />
        </div>
      </aside>

      {/* 主工作区 */}
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl p-3 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
