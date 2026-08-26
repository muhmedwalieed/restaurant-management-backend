import customerService from "./customer.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class CustomerController {
  listCustomers = asyncHandler(async (req, res) => {
    const { page, limit, q } = req.query;
    const { items, pagination } = await customerService.listCustomers(req.tenantContext, {
      page,
      limit,
      q,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  createCustomer = asyncHandler(async (req, res) => {
    const customer = await customerService.createCustomer(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Customer profile created successfully",
      data: customer,
    });
  });

  getCustomerById = asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: customer });
  });

  updateCustomer = asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Customer profile updated successfully",
      data: customer,
    });
  });

  deleteCustomer = asyncHandler(async (req, res) => {
    await customerService.deleteCustomer(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: "Customer profile deleted successfully" });
  });

  getCustomerOrderHistory = asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { items, pagination } = await customerService.getCustomerOrderHistory(
      req.tenantContext,
      req.params.id,
      { page, limit }
    );
    return sendSuccess(res, { data: items, pagination });
  });

  listAddresses = asyncHandler(async (req, res) => {
    const addresses = await customerService.listAddresses(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: addresses });
  });

  addAddress = asyncHandler(async (req, res) => {
    const address = await customerService.addAddress(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Customer address added successfully",
      data: address,
    });
  });

  updateAddress = asyncHandler(async (req, res) => {
    const address = await customerService.updateAddress(
      req.tenantContext,
      req.params.id,
      req.params.addressId,
      req.body
    );
    return sendSuccess(res, {
      message: "Customer address updated successfully",
      data: address,
    });
  });

  deleteAddress = asyncHandler(async (req, res) => {
    await customerService.deleteAddress(req.tenantContext, req.params.id, req.params.addressId);
    return sendSuccess(res, { message: "Customer address deleted successfully" });
  });
}

export const customerController = new CustomerController();
export default customerController;
