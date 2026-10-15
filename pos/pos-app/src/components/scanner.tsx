"use client"

import { useEffect, useRef, useState } from "react"

// Barcode input (TASKS P2-10). USB and Bluetooth scanners type the code and
// press Enter, so the field keeps focus and submits on Enter. Tablets without
// a scanner can use the camera where the browser has the BarcodeDetector API
// (Chrome on Android); elsewhere the camera button is hidden.

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"]

function detectorCtor(): DetectorCtor | null {
  const ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  return typeof ctor === "function" ? ctor : null
}

export function Scanner({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const [code, setCode] = useState("")
  const [camera, setCamera] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHasCamera(!!detectorCtor() && !!navigator.mediaDevices?.getUserMedia)
  }, [])

  // Keep the scanner field focused while nothing else is being typed in.
  useEffect(() => {
    const refocus = () => {
      const active = document.activeElement
      if (!active || active === document.body) {
        input.current?.focus()
      }
    }
    const t = window.setInterval(refocus, 1000)
    return () => window.clearInterval(t)
  }, [])

  const submit = (value: string) => {
    const v = value.trim()
    if (v) {
      onCode(v)
    }
    setCode("")
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit(code)
        }}
      >
        <input
          ref={input}
          className="field"
          placeholder="Scan or type a barcode / SKU"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="off"
          aria-label="Barcode or SKU"
          enterKeyHint="search"
        />
        <button className="btn-primary" type="submit" disabled={busy || !code.trim()}>
          Add
        </button>
        {hasCamera && (
          <button className="btn-secondary" type="button" onClick={() => setCamera(true)}>
            Camera
          </button>
        )}
      </form>
      {camera && (
        <CameraScan
          onClose={() => setCamera(false)}
          onCode={(c) => {
            setCamera(false)
            submit(c)
          }}
        />
      )}
    </div>
  )
}

function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  // The latest callback, without restarting the camera on every render.
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    const Ctor = detectorCtor()
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        if (stopped || !video.current || !Ctor) return
        video.current.srcObject = stream
        await video.current.play()
        const detector = new Ctor({ formats: FORMATS })
        const tick = async () => {
          if (stopped || !video.current) return
          const found = await detector.detect(video.current).catch(() => [])
          if (found[0]?.rawValue) {
            onCodeRef.current(found[0].rawValue)
            return
          }
          timer = window.setTimeout(tick, 250)
        }
        tick()
      } catch {
        setError("The camera can't be used. Allow camera access, or scan with the scanner.")
      }
    })()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="card flex flex-col gap-2 p-3">
      {error ? <p className="text-ui-fg-error">{error}</p> : <video ref={video} className="w-full rounded-lg" muted playsInline />}
      <button className="btn-secondary" onClick={onClose}>
        Close camera
      </button>
    </div>
  )
}
