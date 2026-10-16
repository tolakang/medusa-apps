import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep, dismissRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { ensurePosInStoreOptionWorkflow } from "./pos-in-store"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

// Register setup for admins (BUILD_PLAN §6.2, TASKS P2-06). A register sells
// from one stock location in one sales channel (links of P2-02); the link
// tables allow more, so these workflows replace the link instead of adding one.

type RegisterLinks = { stock_location_id?: string; sales_channel_id?: string }

const locationLink = (registerId: string, id: string): LinkDefinition => ({
  [POS_MODULE]: { pos_register_id: registerId },
  [Modules.STOCK_LOCATION]: { stock_location_id: id },
})
const channelLink = (registerId: string, id: string): LinkDefinition => ({
  [POS_MODULE]: { pos_register_id: registerId },
  [Modules.SALES_CHANNEL]: { sales_channel_id: id },
})

const validatePosRegisterLinksStep = createStep(
  "validate-pos-register-links",
  async (input: RegisterLinks, { container }) => {
    if (input.stock_location_id) {
      const [location] = await container
        .resolve(Modules.STOCK_LOCATION)
        .listStockLocations({ id: input.stock_location_id })
      if (!location) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, `Stock location ${input.stock_location_id} was not found.`)
      }
    }
    if (input.sales_channel_id) {
      const [channel] = await container
        .resolve(Modules.SALES_CHANNEL)
        .listSalesChannels({ id: input.sales_channel_id })
      if (!channel) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, `Sales channel ${input.sales_channel_id} was not found.`)
      }
    }
    return new StepResponse(undefined)
  }
)

export type CreatePosRegisterInput = {
  name: string
  code: string
  is_active?: boolean
  stock_location_id: string
  sales_channel_id: string
}

const createPosRegisterStep = createStep(
  "create-pos-register",
  async (input: CreatePosRegisterInput, { container }) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const [existing] = await pos.listPosRegisters({ code: input.code })
    if (existing) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, `A register with code ${input.code} already exists.`)
    }
    const register = await pos.createPosRegisters({
      name: input.name,
      code: input.code,
      is_active: input.is_active ?? true,
    })
    return new StepResponse(register, register.id)
  },
  async (registerId: string | undefined, { container }) => {
    if (!registerId) {
      return
    }
    await container.resolve<PosModuleService>(POS_MODULE).deletePosRegisters(registerId)
  }
)

export const createPosRegisterWorkflow = createWorkflow(
  "create-pos-register",
  function (input: CreatePosRegisterInput) {
    validatePosRegisterLinksStep(input)
    const register = createPosRegisterStep(input)
    const links = transform({ input, register }, ({ input, register }) => [
      locationLink(register.id, input.stock_location_id),
      channelLink(register.id, input.sales_channel_id),
    ])
    createRemoteLinkStep(links)
    // The location's in-store shipping option, for counter sales (P2-11).
    ensurePosInStoreOptionWorkflow.runAsStep({
      input: transform({ input }, ({ input }) => ({ stock_location_id: input.stock_location_id })),
    })
    return new WorkflowResponse(register)
  }
)

export type UpdatePosRegisterInput = RegisterLinks & {
  id: string
  name?: string
  is_active?: boolean
}

// The register's current links and the ones to replace.
const getPosRegisterLinkChangesStep = createStep(
  "get-pos-register-link-changes",
  async (input: UpdatePosRegisterInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [register],
    } = await query.graph({
      entity: "pos_register",
      fields: ["id", "stock_location.id", "sales_channel.id"],
      filters: { id: input.id },
    })
    if (!register) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Register ${input.id} was not found.`)
    }
    const dismiss: LinkDefinition[] = []
    const create: LinkDefinition[] = []
    const currentLocation = register.stock_location?.id as string | undefined
    if (input.stock_location_id && input.stock_location_id !== currentLocation) {
      if (currentLocation) {
        dismiss.push(locationLink(input.id, currentLocation))
      }
      create.push(locationLink(input.id, input.stock_location_id))
    }
    const currentChannel = register.sales_channel?.id as string | undefined
    if (input.sales_channel_id && input.sales_channel_id !== currentChannel) {
      if (currentChannel) {
        dismiss.push(channelLink(input.id, currentChannel))
      }
      create.push(channelLink(input.id, input.sales_channel_id))
    }
    return new StepResponse({ dismiss, create })
  }
)

const updatePosRegisterStep = createStep(
  "update-pos-register",
  async (input: UpdatePosRegisterInput, { container }) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const before = await pos.retrievePosRegister(input.id)
    const register = await pos.updatePosRegisters({
      id: input.id,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    })
    return new StepResponse(register, { id: before.id, name: before.name, is_active: before.is_active })
  },
  async (before: { id: string; name: string; is_active: boolean } | undefined, { container }) => {
    if (!before) {
      return
    }
    await container.resolve<PosModuleService>(POS_MODULE).updatePosRegisters(before)
  }
)

export const updatePosRegisterWorkflow = createWorkflow(
  "update-pos-register",
  function (input: UpdatePosRegisterInput) {
    validatePosRegisterLinksStep(input)
    const changes = getPosRegisterLinkChangesStep(input)
    const register = updatePosRegisterStep(input)
    const toDismiss = transform({ changes }, ({ changes }) => changes.dismiss)
    const toCreate = transform({ changes }, ({ changes }) => changes.create)
    dismissRemoteLinkStep(toDismiss)
    createRemoteLinkStep(toCreate)
    when("pos-register-location-changed", { input }, ({ input }) => !!input.stock_location_id).then(() => {
      ensurePosInStoreOptionWorkflow.runAsStep({
        input: transform({ input }, ({ input }) => ({ stock_location_id: input.stock_location_id! })),
      })
    })
    return new WorkflowResponse(register)
  }
)
