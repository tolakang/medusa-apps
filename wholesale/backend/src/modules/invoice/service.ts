import { MedusaService } from "@medusajs/framework/utils";
import { Invoice } from "./models/invoice";

class InvoiceModuleService extends MedusaService({ Invoice }) {}

export default InvoiceModuleService;
