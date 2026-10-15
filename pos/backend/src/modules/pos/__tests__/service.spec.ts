import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { POS_MODULE } from ".."
import { PosRegister } from "../models/pos-register"
import { PosShift } from "../models/pos-shift"
import PosModuleService from "../service"

jest.setTimeout(60 * 1000)

// TASKS P2-01: module `pos` with pos_register and pos_shift (BUILD_PLAN §6.2).
moduleIntegrationTestRunner<PosModuleService>({
  moduleName: POS_MODULE,
  moduleModels: [PosRegister, PosShift],
  resolve: "./src/modules/pos",
  testSuite: ({ service }) => {
    const openShift = (register_id: string, opened_by = "cashier_1") =>
      service.createPosShifts({
        register_id,
        opened_by,
        opened_at: new Date(),
        currency_code: "usd",
        opening_cash: 50,
      })

    it("stores a register with the plan's fields", async () => {
      const register = await service.createPosRegisters({
        name: "Front till",
        code: "PP-01",
      })

      expect(register.id).toMatch(/^preg_/)
      expect(register).toEqual(
        expect.objectContaining({ name: "Front till", code: "PP-01", is_active: true })
      )
    })

    it("refuses two registers with the same code", async () => {
      await service.createPosRegisters({ name: "A", code: "DUP-01" })

      await expect(
        service.createPosRegisters({ name: "B", code: "DUP-01" })
      ).rejects.toThrow()
    })

    it("stores a shift with the plan's fields and closes it", async () => {
      const register = await service.createPosRegisters({ name: "R", code: "SH-01" })
      const shift = await openShift(register.id)

      expect(shift.id).toMatch(/^pshift_/)
      expect(shift.status).toEqual("open")
      expect(Number(shift.opening_cash)).toEqual(50)
      expect(shift.closed_by).toBeNull()
      expect(shift.counted_cash).toBeNull()
      expect(shift.expected_cash).toBeNull()

      const closed = await service.updatePosShifts({
        id: shift.id,
        status: "closed",
        closed_by: "cashier_2",
        closed_at: new Date(),
        counted_cash: 148.5,
        expected_cash: 150,
        notes: "1.50 short",
      })

      expect(closed).toEqual(
        expect.objectContaining({ status: "closed", closed_by: "cashier_2", notes: "1.50 short" })
      )
      expect(Number(closed.counted_cash)).toEqual(148.5)
      expect(Number(closed.expected_cash)).toEqual(150)

      const withRegister = await service.retrievePosShift(shift.id, {
        relations: ["register"],
      })
      expect(withRegister.register.id).toEqual(register.id)
    })

    it("allows only one open shift per register", async () => {
      const register = await service.createPosRegisters({ name: "R", code: "ONE-01" })
      const other = await service.createPosRegisters({ name: "R2", code: "ONE-02" })
      const first = await openShift(register.id)

      await expect(openShift(register.id, "cashier_2")).rejects.toThrow()

      // Another register can open its own shift at the same time.
      await expect(openShift(other.id)).resolves.toEqual(
        expect.objectContaining({ status: "open" })
      )

      // After closing, the register can open a new shift.
      await service.updatePosShifts({
        id: first.id,
        status: "closed",
        closed_by: "cashier_1",
        closed_at: new Date(),
      })
      await expect(openShift(register.id, "cashier_2")).resolves.toEqual(
        expect.objectContaining({ status: "open", opened_by: "cashier_2" })
      )

      const shifts = await service.listPosShifts({ register_id: register.id })
      expect(shifts.map((s) => s.status).sort()).toEqual(["closed", "open"])
    })
  },
})
