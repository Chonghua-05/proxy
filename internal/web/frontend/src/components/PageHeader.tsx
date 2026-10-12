import type { ReactNode } from 'react'

// Section header in the guidelines' register: a small brass-toned index
// figure beside the title, closed off by a hairline rule.
export default function PageHeader({
  title,
  description,
  actions,
}: {
  index?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 border-b pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
