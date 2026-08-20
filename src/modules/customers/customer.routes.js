import { Router } from "express";
import customerController from "./customer.controller.js";
import {
  customerQuerySchema,
  createCustomerSchema,
  updateCustomerSchema,
  createAddressSchema,
  updateAddressSchema,
} from "./customer.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("customers.view"), validate(customerQuerySchema), (req, res, next) => {
  customerController.listCustomers(req, res, next);
});

router.post("/", authorize("customers.create"), validate(createCustomerSchema), (req, res, next) => {
  customerController.createCustomer(req, res, next);
});

router.get("/:id", authorize("customers.view"), (req, res, next) => {
  customerController.getCustomerById(req, res, next);
});

router.patch("/:id", authorize("customers.update"), validate(updateCustomerSchema), (req, res, next) => {
  customerController.updateCustomer(req, res, next);
});

router.delete("/:id", authorize("customers.delete"), (req, res, next) => {
  customerController.deleteCustomer(req, res, next);
});

router.get("/:id/orders", authorize("customers.view"), validate(customerQuerySchema), (req, res, next) => {
  customerController.getCustomerOrderHistory(req, res, next);
});

router.get("/:id/addresses", authorize("customers.view"), (req, res, next) => {
  customerController.listAddresses(req, res, next);
});

router.post("/:id/addresses", authorize("customers.update"), validate(createAddressSchema), (req, res, next) => {
  customerController.addAddress(req, res, next);
});

router.patch("/:id/addresses/:addressId", authorize("customers.update"), validate(updateAddressSchema), (req, res, next) => {
  customerController.updateAddress(req, res, next);
});

router.delete("/:id/addresses/:addressId", authorize("customers.update"), (req, res, next) => {
  customerController.deleteAddress(req, res, next);
});

export default router;
