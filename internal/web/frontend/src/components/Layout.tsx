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
      className="rounded-lg"
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
      className="h-8 px-2 font-mono text-xs gap-1 rounded-lg"
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

  // 路由跳转时自动关闭移动端抽屉
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const NavList = ({ onSelect }: { onSelect?: () => void }) => (
    <ul className="grid gap-1 px-2">
      {NAV_ITEMS.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            onClick={onSelect}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all duration-150',
                'hover:bg-accent/80 hover:text-accent-foreground',
                isActive && 'bg-card text-foreground font-medium shadow-2xs border border-border/60',
              )
            }
          >
            <span className="font-mono text-xs text-muted-foreground/70 group-hover:text-brass transition-colors">{item.index}</span>
            <item.icon className="size-4 shrink-0 transition-colors group-hover:text-brass" aria-hidden />
            <span className="truncate flex-1">{t(item.labelKey)}</span>
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
    <div className="flex h-svh w-screen overflow-hidden flex-col md:flex-row bg-background">
      {/* 移动端顶部标题栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:hidden bg-background/95 backdrop-blur-xs z-30">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="rounded-lg"
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

      {/* 移动端抽屉遮罩 */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏（桌面端固定高且独占左侧，绝对不跟随主内容滚动；有独立滚动支持） */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col border-r bg-card/40 backdrop-blur-md transition-transform duration-200 ease-in-out md:static md:w-60 md:translate-x-0',
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
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
        <div className="p-2 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            <span className="font-mono text-xs text-muted-foreground/70">·</span>
            <LogOutIcon className="size-4 shrink-0" aria-hidden />
            <span>{t('nav.logout')}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3 font-mono text-xs text-muted-foreground bg-card/20">
          <span className="flex-1 truncate">lab34 — llm-proxy</span>
          <Monogram size={20} variant="outline" />
        </div>
      </aside>

      {/* 主工作区（独立滚动容器，内部上下滑动完全与侧栏解耦） */}
      <main className="min-w-0 flex-1 h-full overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-6xl p-3 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
