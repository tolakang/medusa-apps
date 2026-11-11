"use client"

import { joinCompany } from "@/lib/data/companies"
import Button from "@/modules/common/components/button"
import Input from "@/modules/common/components/input"
import { Container, Text } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import { useState } from "react"

// For a signed-in customer without a company: join one with the code a
// company admin made for this email (REVIEW_FIXES B14).
const JoinCompanyCard = () => {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await joinCompany(code.trim())
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <Container className="flex flex-col gap-y-3 mb-6" data-testid="join-company-card">
      <Text className="font-medium text-neutral-950">
        Your account doesn&apos;t belong to a company yet.
      </Text>
      <Text className="text-sm text-neutral-700">
        Ask your company admin for a join code for your email and enter it here.
      </Text>
      <Input
        name="join_code"
        label="Join code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        data-testid="join-code-input"
      />
      {error && (
        <Text role="alert" className="text-sm text-red-700">
          {error}
        </Text>
      )}
      <div>
        <Button onClick={submit} disabled={busy || !code.trim()} data-testid="join-button">
          {busy ? "Joining…" : "Join company"}
        </Button>
      </div>
    </Container>
  )
}

export default JoinCompanyCard
