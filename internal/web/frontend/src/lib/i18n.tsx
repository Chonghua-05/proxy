import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Language = 'en' | 'zh-CN'

export const translations = {
  en: {
    // Navigation & Common
    'nav.console': 'Console',
    'nav.providers': 'Providers',
    'nav.quotas': 'Quotas & Accounts',
    'nav.keys': 'API keys',
    'nav.usage': 'Usage',
    'nav.guardrails': 'Guardrails',
    'nav.playground': 'Playground',
    'nav.logout': 'Log out',
    'theme.switchToLight': 'Switch to light mode',
    'theme.switchToDark': 'Switch to dark mode',
    'lang.switchToZh': '切换为中文',
    'lang.switchToEn': 'Switch to English',
    'lang.label': 'Language',
    'common.id': 'ID',
    'common.name': 'Name',
    'common.created': 'Created',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.revoke': 'Revoke',
    'common.create': 'Create',
    'common.save': 'Save',
    'common.actions': 'Actions',
    'common.loading': 'loading…',
    'common.submitting': 'Saving…',
    'common.copied': 'Copied to clipboard',
    'common.copy': 'Copy',
    'common.all': 'All',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.page': 'Page',
    'common.of': 'of',
    'common.confirm': 'Confirm',
    'common.refresh': 'Refresh',
    'common.refreshing': 'Refreshing…',

    // Login
    'login.title': 'Console',
    'login.subtitle': 'Enter your admin token to open the dashboard.',
    'login.tokenLabel': 'Admin token',
    'login.tokenPlaceholder': '••••••••',
    'login.submit': 'Sign in',
    'login.submitting': 'Verifying…',
    'login.tagline': 'AI tooling & training for IT operations',
    'login.tokenRequired': 'Admin token is required.',
    'login.invalidToken': 'Invalid admin token.',
    'login.failedVerify': 'Failed to verify token.',
    'login.failedConnect': 'Failed to connect to the server.',

    // Providers Page
    'providers.title': 'Providers',
    'providers.description': 'The upstream LLM backends that requests are forwarded to.',
    'providers.add': 'Add provider',
    'providers.empty': 'No providers registered yet.',
    'providers.baseUrl': 'Base URL',
    'providers.apiKey': 'API Key',
    'providers.modalTitle': 'Add provider',
    'providers.modalDescription': 'Register a new upstream LLM backend.',
    'providers.baseUrlPlaceholder': 'https://api.openai.com',
    'providers.apiKeyPlaceholder': 'sk-…',
    'providers.namePlaceholder': 'e.g. OpenAI Production',
    'providers.allRequired': 'All fields are required.',
    'providers.createdSuccess': 'Provider created successfully.',
    'providers.deletedSuccess': 'Provider deleted.',
    'providers.deleteConfirmTitle': 'Delete provider',
    'providers.deleteConfirmDesc': 'Are you sure you want to delete {name}? Associated keys and requests may fail.',
    'providers.quotaType': 'Quota Driver',
    'providers.quotaTypeNone': 'None / No tracking',
    'providers.quotaTypeAntigravity': 'Google Antigravity (CPA)',
    'providers.quotaTypeBalance': 'Billing / Subscription Balance',
    'providers.quotaConfig': 'Driver Config (JSON)',
    'providers.quotaConfigPlaceholder': '{"proxy_url":"socks5://127.0.0.1:1081"}',

    // Quotas Page
    'quotas.title': 'Upstream Quotas',
    'quotas.description': 'Live quota and account balance monitoring across upstream backends.',
    'quotas.empty': 'No quota-enabled providers found. Edit a provider and select a quota driver.',
    'quotas.account': 'Account',
    'quotas.driver': 'Driver',
    'quotas.status': 'Status',
    'quotas.modelQuota': 'Model Quota Pools',
    'quotas.remaining': 'Remaining',
    'quotas.resetTime': 'Next Reset',
    'quotas.balance': 'Balance',
    'quotas.refreshAll': 'Refresh all',
    'quotas.statusOk': 'Healthy',
    'quotas.statusWarning': 'Low Quota',
    'quotas.statusExhausted': 'Exhausted',
    'quotas.statusError': 'Check Failed',
    'quotas.statusUnsupported': 'Not Configured',
    'quotas.modelsModalTitle': 'Covered Models',
    'quotas.modelsModalDesc': '{count} models share this quota window. Use the exact model name when invoking.',
    'quotas.modelsSearchPlaceholder': 'Search model name…',
    'quotas.modelsEmpty': 'No matching models',
    'quotas.viewModels': 'Covered models',
    'quotas.clickToView': 'Click to view',

    // Keys Page
    'keys.title': 'API keys',
    'keys.description': 'Keys clients use to call the proxy. Each key maps to one provider.',
    'keys.create': 'Create key',
    'keys.edit': 'Edit key',
    'keys.empty': 'No API keys created yet.',
    'keys.rateLimit': 'Rate limit (RPM)',
    'keys.provider': 'Provider',
    'keys.selectProvider': 'Select a provider',
    'keys.allowedProviders': 'Allowed Providers / Upstreams',
    'keys.allowedProvidersHint': 'Select which upstreams this key can access. Models will auto-route across selected providers.',
    'keys.allProviders': 'All Providers (Auto-aggregate)',
    'keys.status': 'Status',
    'keys.active': 'Active',
    'keys.revoked': 'Revoked',
    'keys.modalTitle': 'Create API key',
    'keys.editModalTitle': 'Edit API key',
    'keys.modalDescription': 'Issue a new proxy key for client applications.',
    'keys.namePlaceholder': 'e.g. Mobile App Client',
    'keys.rpmPlaceholder': '60',
    'keys.rpmHint': 'Requests per minute (0 for unlimited)',
    'keys.requiredFields': 'Name and Provider are required.',
    'keys.createdAlert': 'Key created. Copy it now — it will not be displayed again.',
    'keys.revokedSuccess': 'Key revoked.',
    'keys.updatedSuccess': 'Key updated successfully.',
    'keys.revokeConfirmTitle': 'Revoke API key',
    'keys.revokeConfirmDesc': 'Are you sure you want to revoke {name}? Clients using this key will immediately receive 401 Unauthorized.',

    // Usage Page
    'usage.title': 'Usage',
    'usage.description': 'Token usage per request, as recorded by the proxy.',
    'usage.filterKey': 'API Key',
    'usage.filterProvider': 'Provider',
    'usage.filterStart': 'Start time',
    'usage.filterEnd': 'End time',
    'usage.clearFilters': 'Clear filters',
    'usage.empty': 'No usage records found.',
    'usage.statPrompt': 'Prompt tokens',
    'usage.statCompletion': 'Completion tokens',
    'usage.statTotal': 'Total tokens',
    'usage.statRequests': 'Total requests',
    'usage.model': 'Model',
    'usage.timestamp': 'Timestamp',
    'usage.timelineTitle': 'Token & Request Trends',
    'usage.topModelsTitle': 'Top Models Consumption',
    'usage.topKeysTitle': 'Top Active API Keys',
    'usage.recentLogs': 'Detailed Request Logs',
    'usage.requestsTrend': 'request points',
    'usage.noChartData': 'Not enough data points to plot.',

    // Guardrails Page
    'guardrails.title': 'Guardrails',
    'guardrails.description': 'Regex-based content filtering rules and trigger audit logs.',
    'guardrails.rulesTab': 'Rules',
    'guardrails.eventsTab': 'Event log',
    'guardrails.add': 'Add guardrail',
    'guardrails.empty': 'No guardrails defined.',
    'guardrails.eventsEmpty': 'No guardrail events recorded yet.',
    'guardrails.pattern': 'Pattern (Regex)',
    'guardrails.mode': 'Mode',
    'guardrails.modeReject': 'Reject (Block)',
    'guardrails.modeReplace': 'Replace (Mask)',
    'guardrails.replaceBy': 'Replace with',
    'guardrails.matchedInput': 'Matched Input',
    'guardrails.rule': 'Rule',
    'guardrails.modalTitle': 'Add guardrail',
    'guardrails.modalDescription': 'Configure a safety or redaction rule applied to incoming prompts.',
    'guardrails.patternPlaceholder': 'e.g. (?i)confidential|api[_-]?key',
    'guardrails.replacePlaceholder': 'e.g. [REDACTED]',
    'guardrails.requiredFields': 'Pattern and Mode are required.',
    'guardrails.createdSuccess': 'Guardrail created.',
    'guardrails.deletedSuccess': 'Guardrail deleted.',
    'guardrails.eventDeletedSuccess': 'Event log deleted.',
    'guardrails.deleteConfirmTitle': 'Delete guardrail',
    'guardrails.deleteConfirmDesc': 'Are you sure you want to delete pattern {pattern}?',

    // Playground Page
    'playground.title': 'Playground',
    'playground.description': 'Test completions directly through the proxy with streaming SSE.',
    'playground.apiKey': 'Proxy API Key',
    'playground.model': 'Model',
    'playground.systemPrompt': 'System prompt (optional)',
    'playground.systemPromptPlaceholder': 'You are a helpful assistant...',
    'playground.messagePlaceholder': 'Type a message… (Enter to send, Shift+Enter for new line)',
    'playground.send': 'Send',
    'playground.stop': 'Stop',
    'playground.clearChat': 'Clear chat',
    'playground.emptyChat': 'Send a message to start the playground session.',
    'playground.apiKeyPlaceholder': 'llmp-…',
    'playground.modelPlaceholder': 'e.g. gpt-4o, claude-3-5-sonnet',
    'playground.apiKeyRequired': 'Please enter an API key.',
    'playground.modelRequired': 'Please enter a model name.',
  },
  'zh-CN': {
    // Navigation & Common
    'nav.console': '控制台',
    'nav.providers': '模型提供商',
    'nav.keys': 'API 密钥',
    'nav.usage': '使用量统计',
    'nav.guardrails': '安全护栏',
    'nav.playground': '演练场',
    'nav.logout': '退出登录',
    'theme.switchToLight': '切换到浅色模式',
    'theme.switchToDark': '切换到深色模式',
    'lang.switchToZh': '切换为中文',
    'lang.switchToEn': 'Switch to English',
    'lang.label': '语言',
    'common.id': '编号',
    'common.name': '名称',
    'common.created': '创建时间',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.revoke': '吊销',
    'common.create': '创建',
    'common.save': '保存',
    'common.actions': '操作',
    'common.loading': '加载中…',
    'common.submitting': '保存中…',
    'common.copied': '已复制到剪贴板',
    'common.copy': '复制',
    'common.all': '全部',
    'common.error': '错误',
    'common.success': '成功',
    'common.page': '第',
    'common.of': '页，共',
    'common.confirm': '确认',
    'common.refresh': '刷新',
    'common.refreshing': '刷新中…',

    // Login
    'login.title': '控制台登录',
    'login.subtitle': '请输入管理员令牌（Admin Token）进入控制台。',
    'login.tokenLabel': '管理员令牌',
    'login.tokenPlaceholder': '••••••••',
    'login.submit': '登 录',
    'login.submitting': '验证中…',
    'login.tagline': '面向 IT 与运维的自托管大模型代理网关',
    'login.tokenRequired': '请输入管理员令牌。',
    'login.invalidToken': '管理员令牌无效。',
    'login.failedVerify': '验证令牌失败。',
    'login.failedConnect': '无法连接到服务端。',

    // Providers Page
    'providers.title': '模型提供商',
    'providers.description': '配置请求所转发到的上游大模型端点及凭证。',
    'providers.add': '添加提供商',
    'providers.empty': '暂未配置任何提供商。',
    'providers.baseUrl': '接口地址 (Base URL)',
    'providers.apiKey': '上游密钥 (API Key)',
    'providers.modalTitle': '添加上游提供商',
    'providers.modalDescription': '注册新的 OpenAI 兼容大模型服务提供商。',
    'providers.baseUrlPlaceholder': 'https://api.openai.com',
    'providers.apiKeyPlaceholder': 'sk-…',
    'providers.namePlaceholder': '例如：OpenAI 官方、DeepSeek、自建 vLLM',
    'providers.allRequired': '所有字段均为必填项。',
    'providers.createdSuccess': '提供商添加成功。',
    'providers.deletedSuccess': '提供商已删除。',
    'providers.deleteConfirmTitle': '确认删除提供商',
    'providers.deleteConfirmDesc': '确定要删除提供商「{name}」吗？绑定该提供商的 API 密钥及下游请求将无法正常处理。',
    'providers.quotaType': '额度查询驱动',
    'providers.quotaTypeNone': '无 / 不监控',
    'providers.quotaTypeAntigravity': 'Google 反重力账号池 (CPA)',
    'providers.quotaTypeBalance': '商业平台余额 (Billing Balance)',
    'providers.quotaConfig': '驱动配置 (JSON 格式)',
    'providers.quotaConfigPlaceholder': '{"proxy_url":"socks5://127.0.0.1:1081"}',

    // Quotas Page
    'nav.quotas': '号源额度',
    'quotas.title': '号源额度监控',
    'quotas.description': '实时查看不同上游提供商与号源的剩余配额、重置时间与账户状态。',
    'quotas.empty': '暂无配置额度驱动的提供商。请在「模型提供商」中选择额度驱动。',
    'quotas.account': '绑定账号',
    'quotas.driver': '驱动类型',
    'quotas.status': '状态',
    'quotas.modelQuota': '各模型配额池',
    'quotas.remaining': '剩余额度',
    'quotas.resetTime': '重置时间',
    'quotas.balance': '可用余额',
    'quotas.refreshAll': '刷新全部',
    'quotas.statusOk': '健康正常',
    'quotas.statusWarning': '配额紧张',
    'quotas.statusExhausted': '额度耗尽',
    'quotas.statusError': '查询失败',
    'quotas.statusUnsupported': '未配置',
    'quotas.modelsModalTitle': '涵盖模型',
    'quotas.modelsModalDesc': '共 {count} 个模型共享该额度配额。调用时直接使用模型名称即可。',
    'quotas.modelsSearchPlaceholder': '搜索模型名称…',
    'quotas.modelsEmpty': '无匹配模型',
    'quotas.viewModels': '涵盖模型',
    'quotas.clickToView': '点击弹窗查看',

    // Keys Page
    'keys.title': 'API 密钥',
    'keys.description': '客户端调用代理时使用的密钥。每个密钥绑定一个提供商端点。',
    'keys.create': '创建密钥',
    'keys.edit': '编辑密钥',
    'keys.empty': '暂未创建任何 API 密钥。',
    'keys.rateLimit': '速率限制 (RPM)',
    'keys.provider': '绑定提供商',
    'keys.selectProvider': '请选择上游提供商',
    'keys.allowedProviders': '允许访问的号源（可多选）',
    'keys.allowedProvidersHint': '选择此密钥允许调用的号源。网关将在选中的号源之间进行模型智能分流与合并。',
    'keys.allProviders': '全部号源（自动聚合分流）',
    'keys.status': '状态',
    'keys.active': '正常',
    'keys.revoked': '已吊销',
    'keys.modalTitle': '创建 API 密钥',
    'keys.editModalTitle': '编辑 API 密钥',
    'keys.modalDescription': '为下游业务应用签发带独立限流规则的代理调用密钥。',
    'keys.namePlaceholder': '例如：内部前端应用、移动端客户端',
    'keys.rpmPlaceholder': '60',
    'keys.rpmHint': '每分钟请求数限制（填 0 表示不限制）',
    'keys.requiredFields': '名称和提供商为必填项。',
    'keys.createdAlert': '密钥创建成功！请立即复制保存，关闭后将无法再次查看该密钥。',
    'keys.revokedSuccess': '密钥已吊销。',
    'keys.updatedSuccess': '密钥更新成功。',
    'keys.revokeConfirmTitle': '确认吊销密钥',
    'keys.revokeConfirmDesc': '确定要吊销密钥「{name}」吗？使用该密钥的请求将立即被拒（401 Unauthorized）。',

    // Usage Page
    'usage.title': '使用量统计',
    'usage.description': '代理记录的每条请求 Token 消耗与指标报表。',
    'usage.filterKey': 'API 密钥',
    'usage.filterProvider': '提供商',
    'usage.filterStart': '起始时间',
    'usage.filterEnd': '结束时间',
    'usage.clearFilters': '重置筛选',
    'usage.empty': '未查询到用量记录。',
    'usage.statPrompt': '输入 Token (Prompt)',
    'usage.statCompletion': '输出 Token (Completion)',
    'usage.statTotal': '总 Token 消耗',
    'usage.statRequests': '总请求次数',
    'usage.model': '模型',
    'usage.timestamp': '请求时间',
    'usage.timelineTitle': 'Token 消耗与请求趋势',
    'usage.topModelsTitle': '模型消耗分布',
    'usage.topKeysTitle': 'API 密钥消耗排行',
    'usage.recentLogs': '请求调用明细',
    'usage.requestsTrend': '个采样时段',
    'usage.noChartData': '暂无足够数据展示趋势图。',

    // Guardrails Page
    'guardrails.title': '安全护栏',
    'guardrails.description': '基于正则表达式的内容安全过滤规则与触发审计日志。',
    'guardrails.rulesTab': '过滤规则',
    'guardrails.eventsTab': '拦截日志',
    'guardrails.add': '添加规则',
    'guardrails.empty': '暂无安全护栏规则。',
    'guardrails.eventsEmpty': '暂无安全拦截或替换记录。',
    'guardrails.pattern': '匹配规则 (正则表达式)',
    'guardrails.mode': '动作类型',
    'guardrails.modeReject': '拦截阻断 (Reject)',
    'guardrails.modeReplace': '内容脱敏 (Replace)',
    'guardrails.replaceBy': '替换为',
    'guardrails.matchedInput': '命中文本',
    'guardrails.rule': '关联规则',
    'guardrails.modalTitle': '添加安全护栏规则',
    'guardrails.modalDescription': '配置对请求上下文进行安全检查或敏感信息脱敏的规则。',
    'guardrails.patternPlaceholder': '例如：(?i)机密|密码|api[_-]?key',
    'guardrails.replacePlaceholder': '例如：[已脱敏]',
    'guardrails.requiredFields': '规则表达式与动作类型为必填项。',
    'guardrails.createdSuccess': '护栏规则已创建。',
    'guardrails.deletedSuccess': '护栏规则已删除。',
    'guardrails.eventDeletedSuccess': '审计记录已删除。',
    'guardrails.deleteConfirmTitle': '确认删除护栏规则',
    'guardrails.deleteConfirmDesc': '确定要删除匹配模式为「{pattern}」的护栏规则吗？',

    // Playground Page
    'playground.title': '演练场',
    'playground.description': '直接通过代理网关调试对话模型，支持 SSE 实时流式响应。',
    'playground.apiKey': '代理 API 密钥',
    'playground.model': '模型名称',
    'playground.systemPrompt': '系统提示词 (可选)',
    'playground.systemPromptPlaceholder': '你是一个专业且乐于助人的 AI 助手...',
    'playground.messagePlaceholder': '输入消息…（Enter 发送，Shift+Enter 换行）',
    'playground.send': '发送',
    'playground.stop': '停止',
    'playground.clearChat': '清空对话',
    'playground.emptyChat': '发送一条消息开始调试。',
    'playground.apiKeyPlaceholder': 'llmp-…',
    'playground.modelPlaceholder': '例如：gpt-4o, claude-3-5-sonnet, deepseek-chat',
    'playground.apiKeyRequired': '请输入 API 密钥。',
    'playground.modelRequired': '请输入模型名称。',
  },
} as const

export type TranslationKey = keyof typeof translations.en

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('llmp_lang')
    if (saved === 'en' || saved === 'zh-CN') return saved
    if (typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')) {
      return 'zh-CN'
    }
    return 'en'
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('llmp_lang', lang)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = translations[language] || translations.en
    let text: string = dict[key] || translations.en[key] || key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return text
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
