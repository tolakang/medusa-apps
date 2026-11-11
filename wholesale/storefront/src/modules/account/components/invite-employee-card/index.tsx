"use client"

import { inviteEmployee } from "@/lib/data/companies"
import Button from "@/modules/common/components/button"
import Input from "@/modules/common/components/input"
import { Container, Text } from "@medusajs/ui"
import { useState } from "react"

// A company admin invites a colleague (REVIEW_FIXES B14): enter their email,
// get a join code, give it to them. They join with it when they sign up (or
// from their account page if they already have one). Nobody is added
// without their consent.
const InviteEmployeeCard = () => {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<{ email: string; join_code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await inviteEmployee(email.trim())
    setBusy(false)
    if (result.error || !result.join_code) {
      setError(result.error ?? "Couldn't make a join code.")
      return
    }
    setCode({ email: email.trim().toLowerCase(), join_code: result.join_code })
  }

  return (
    <Container className="p-0 overflow-hidden">
      <div className="flex flex-col gap-y-2 p-4 border-b border-neutral-200">
        <Text className="font-medium text-neutral-950">Colleague&apos;s email</Text>
        <Input
          name="email"
          label="Enter an email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="invite-email-input"
        />
        {code && (
          <div className="mt-2 text-sm" data-testid="invite-join-code">
            <Text className="text-neutral-700">
              Give this join code to {code.email}. They enter it when they
              sign up, or on their account page:
            </Text>
            <code className="block mt-1 break-all rounded bg-neutral-100 px-2 py-1 text-neutral-950">
              {code.join_code}
            </code>
          </div>
        )}
        {error && (
          <Text role="alert" className="text-sm text-red-700">
            {error}
          </Text>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 bg-neutral-50 p-4">
        <Button
          variant="primary"
          onClick={submit}
          disabled={busy || !email.includes("@")}
          data-testid="invite-button"
        >
          {busy ? "Making code…" : "Get join code"}
        </Button>
      </div>
    </Container>
  )
}

export default InviteEmployeeCard
