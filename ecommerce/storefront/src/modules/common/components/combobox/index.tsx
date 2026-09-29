"use client"

import Input from "@modules/common/components/input"
import {
  matchOptions,
  normalizeKh,
  type KhOption,
} from "@lib/util/kh-locations"
import React, { useEffect, useId, useMemo, useRef, useState } from "react"

// Text box with a list of matching options (TASKS P1-15). The customer can
// type to filter, but the form only submits a value from the list: anything
// else is marked invalid with `invalidMessage`.

type ComboboxProps = {
  label: string
  name: string
  value: string
  options: KhOption[]
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  invalidMessage: string
  "data-testid"?: string
}

const Combobox = ({
  label,
  name,
  value,
  options,
  onChange,
  required,
  disabled,
  invalidMessage,
  "data-testid": testId,
}: ComboboxProps) => {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => matchOptions(options, value), [options, value])
  const isOption = options.some((o) => o.value === value)

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      value && !isOption ? invalidMessage : ""
    )
  }, [value, isOption, invalidMessage])

  const choose = (option: KhOption) => {
    onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setOpen(true)
      const step = e.key === "ArrowDown" ? 1 : -1
      setActive((i) =>
        matches.length ? (i + step + matches.length) % matches.length : 0
      )
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault()
      choose(matches[active])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  // Leaving the box with text that names exactly one option picks it.
  const onBlur = () => {
    setOpen(false)
    const exact = options.filter((o) => o.keys.includes(normalizeKh(value)))
    if (!isOption && exact.length === 1) {
      onChange(exact[0].value)
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        label={label}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${listId}-${active}` : undefined
        }
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        data-testid={testId}
      />
      {open && !disabled && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ui-border-base bg-ui-bg-base py-1 shadow-elevation-flyout"
        >
          {matches.map((option, i) => (
            <li
              key={option.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(option)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer justify-between gap-x-2 px-4 py-2 txt-compact-small ${
                i === active ? "bg-ui-bg-base-hover" : ""
              }`}
            >
              <span>{option.label}</span>
              <span className="text-ui-fg-subtle">{option.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default Combobox
