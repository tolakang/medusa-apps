import assert from "node:assert/strict"
import { test } from "node:test"
import { parseQuickOrder } from "../util/parse-quick-order.ts"

test("reads comma, semicolon, tab and space separated lines", () => {
  const { lines, invalid } = parseQuickOrder(
    "SHIRT-S, 10\nSHIRT-M;5\nSHIRT-L\t2\nSHORTS-M 3\nSWEAT-S"
  )
  assert.deepEqual(lines, [
    { sku: "SHIRT-S", quantity: 10 },
    { sku: "SHIRT-M", quantity: 5 },
    { sku: "SHIRT-L", quantity: 2 },
    { sku: "SHORTS-M", quantity: 3 },
    { sku: "SWEAT-S", quantity: 1 },
  ])
  assert.deepEqual(invalid, [])
})

test("skips a header row and blank lines, and reads quoted CSV cells", () => {
  const { lines } = parseQuickOrder('sku,quantity\r\n\r\n"SHIRT-S","4"\r\n')
  assert.deepEqual(lines, [{ sku: "SHIRT-S", quantity: 4 }])
})

test("adds up a SKU listed twice, whatever its case", () => {
  const { lines } = parseQuickOrder("shirt-s,2\nSHIRT-S,3")
  assert.deepEqual(lines, [{ sku: "shirt-s", quantity: 5 }])
})

test("reports lines with a bad quantity or too many columns", () => {
  const { lines, invalid } = parseQuickOrder(
    "SHIRT-S,0\nSHIRT-M,1.5\nSHIRT-L,two\nA,1,extra\nOK-1,2"
  )
  assert.deepEqual(lines, [{ sku: "OK-1", quantity: 2 }])
  assert.deepEqual(invalid, [
    "1: SHIRT-S,0",
    "2: SHIRT-M,1.5",
    "3: SHIRT-L,two",
    "4: A,1,extra",
  ])
})
