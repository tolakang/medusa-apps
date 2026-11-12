"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { confirmEmail } from "../login/actions"

// Confirms the code once (the code works once; React may run effects twice
// in development).
export default function VerifyAccount() {
  const code = useSearchParams().get("token")
  const [state, setState] = useState<"checking" | "done" | "failed">("checking")
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) {
      return
    }
    sent.current = true
    if (!code) {
      setState("failed")
      return
    }
    confirmEmail(code).then((ok) => setState(ok ? "done" : "failed"))
  }, [code])

  if (state === "checking") {
    return <p className="mt-4 text-ui-fg-subtle">Confirming your email…</p>
  }
  return (
    <>
      <p className="mt-4">
        {state === "done"
          ? "Your email is confirmed. Sign in to see your shop; the marketplace reviews every new shop."
          : "This link is invalid or has expired. Sign in to get a new one."}
      </p>
      <Link href="/login" className="btn-primary mt-6 inline-block">
        Go to sign in
      </Link>
    </>
  )
}
