"use client"

import { addBySku, QuickOrderResult } from "@/lib/data/quick-order"
import { parseQuickOrder } from "@/lib/util/parse-quick-order"
import Button from "@/modules/common/components/button"
import LocalizedClientLink from "@/modules/common/components/localized-client-link"
import { Container, Text } from "@medusajs/ui"
import { useParams, useRouter } from "next/navigation"
import { ChangeEvent, useState } from "react"

const MAX_FILE_BYTES = 200 * 1024

const QuickOrderForm = () => {
  const { countryCode } = useParams<{ countryCode: string }>()
  const router = useRouter()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState<string[]>([])
  const [result, setResult] = useState<QuickOrderResult | null>(null)

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) {
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setResult({ added: 0, not_found: [], error: "This file is too large." })
      return
    }
    setText(await file.text())
    setResult(null)
    setInvalid([])
  }

  const submit = async () => {
    const parsed = parseQuickOrder(text)
    setInvalid(parsed.invalid)
    setResult(null)
    if (parsed.invalid.length) {
      return
    }
    setBusy(true)
    const outcome = await addBySku(parsed.lines, countryCode).catch(
      (): QuickOrderResult => ({
        added: 0,
        not_found: [],
        error: "Something went wrong. Please try again.",
      })
    )
    setBusy(false)
    setResult(outcome)
    if (outcome.added) {
      router.refresh()
    }
  }

  return (
    <Container className="flex flex-col gap-y-4">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={10}
        placeholder={"SHIRT-S-BLACK, 10\nSHIRT-M-BLACK, 5"}
        className="w-full rounded-md border border-neutral-200 p-3 font-mono text-sm"
        aria-label="Items to add, one SKU and quantity per line"
        data-testid="quick-order-input"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={busy || !text.trim()} data-testid="quick-order-submit">
          {busy ? "Adding…" : "Add to cart"}
        </Button>
        <label className="text-sm text-neutral-950 underline cursor-pointer">
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={readFile}
            data-testid="quick-order-file"
          />
        </label>
      </div>

      {!!invalid.length && (
        <div role="alert" className="text-sm text-red-700" data-testid="quick-order-invalid">
          <Text>These lines can't be read. Use a SKU and a whole number:</Text>
          <ul className="list-disc pl-5 font-mono">
            {invalid.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {result?.error && (
        <Text role="alert" className="text-sm text-red-700" data-testid="quick-order-error">
          {result.error}
        </Text>
      )}

      {!!result?.added && (
        <Text className="text-sm text-neutral-950" data-testid="quick-order-added">
          Added {result.added} {result.added === 1 ? "item" : "items"} to your
          cart.{" "}
          <LocalizedClientLink href="/cart" className="underline">
            Go to cart
          </LocalizedClientLink>
        </Text>
      )}

      {!!result?.not_found.length && (
        <div role="alert" className="text-sm text-red-700" data-testid="quick-order-not-found">
          <Text>These SKUs were not found, so they were not added:</Text>
          <ul className="list-disc pl-5 font-mono">
            {result.not_found.map((sku) => (
              <li key={sku}>{sku}</li>
            ))}
          </ul>
        </div>
      )}
    </Container>
  )
}

export default QuickOrderForm
