import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../lib/sdk"

// Settings → Store: the maximum size of an uploaded image (TASKS P1-12).
// Reads and saves through GET/POST /admin/upload-limit; the server checks the
// value against UPLOAD_MAX_FILE_SIZE_CEILING_MB.

type UploadLimit = {
  limit_mb: number
  source: "admin" | "environment" | "default"
  default_mb: number
  ceiling_mb: number
}

const QUERY_KEY = ["upload-limit"]

const UploadLimitWidget = () => {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sdk.client.fetch<{ upload_limit: UploadLimit }>("/admin/upload-limit"),
  })
  const limit = data?.upload_limit
  const [value, setValue] = useState("")

  useEffect(() => {
    if (limit) {
      setValue(String(limit.limit_mb))
    }
  }, [limit])

  const save = useMutation({
    mutationFn: (limit_mb: number | null) =>
      sdk.client.fetch<{ upload_limit: UploadLimit }>("/admin/upload-limit", {
        method: "POST",
        body: { limit_mb },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(QUERY_KEY, result)
      toast.success(`Image upload limit is now ${result.upload_limit.limit_mb} MB`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const parsed = Number(value)
  const valid =
    value.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    (!limit || parsed <= limit.ceiling_mb)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Image upload limit</Heading>
        {limit && (
          <Badge size="2xsmall">
            {limit.source === "admin" ? "Set here" : "Default"}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          Largest image admins can upload, in MB. SVG files are always refused.
          {limit && ` Default ${limit.default_mb} MB, maximum ${limit.ceiling_mb} MB.`}
        </Text>
        <div className="flex items-end gap-x-2">
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="upload-limit-mb" size="small">
              Limit (MB)
            </Label>
            <Input
              id="upload-limit-mb"
              type="number"
              min={0.1}
              step={0.1}
              max={limit?.ceiling_mb}
              value={value}
              disabled={isLoading || save.isPending}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button
            size="small"
            disabled={!valid || save.isPending}
            isLoading={save.isPending}
            onClick={() => save.mutate(parsed)}
          >
            Save
          </Button>
          {limit?.source === "admin" && (
            <Button
              size="small"
              variant="secondary"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
            >
              Reset to default
            </Button>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "store.details.after",
})

export default UploadLimitWidget
