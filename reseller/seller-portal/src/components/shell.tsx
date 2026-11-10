import Link from "next/link"
import { logout } from "@/app/login/actions"
import type { Seller } from "@/lib/server/seller"

// TASKS P5-08: header and navigation of every portal page.
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/products", label: "Products" },
  { href: "/sales", label: "Sales" },
  { href: "/commissions", label: "Commissions" },
]

export function Shell({
  seller,
  active,
  children,
}: {
  seller: Seller
  active: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ui-fg-subtle">Seller portal</p>
          <h1 className="text-xl font-semibold">{seller.name}</h1>
        </div>
        <form action={logout}>
          <button className="btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Portal">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active === link.href ? "page" : undefined}
            className={active === link.href ? "btn-primary" : "btn-secondary"}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {seller.status === "pending" && (
        <p className="card px-4 py-3 text-sm">
          Your seller account is waiting for the shop to activate it. Orders in your shop
          earn commission once it is active.
        </p>
      )}
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  )
}

export function Pager({ path, page, count, limit, extra = "" }: {
  path: string
  page: number
  count: number
  limit: number
  extra?: string
}) {
  const last = Math.max(1, Math.ceil(count / limit))
  return (
    <div className="flex items-center justify-between text-sm text-ui-fg-subtle">
      <span>
        Page {Math.min(page, last)} of {last} · {count} in all
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link className="btn-secondary" href={`${path}?page=${page - 1}${extra}`}>
            Previous
          </Link>
        )}
        {page < last && (
          <Link className="btn-secondary" href={`${path}?page=${page + 1}${extra}`}>
            Next
          </Link>
        )}
      </span>
    </div>
  )
}
