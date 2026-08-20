import customerService from "./customer.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class CustomerController {
  async listCustomers(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

      const { items, pagination } = await customerService.listCustomers(req.tenantContext, {
        page,
        limit,
        q: query.q,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async createCustomer(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body;
      const customer = await customerService.createCustomer(req.tenantContext, body);

      return sendSuccess(res, {
        statusCode: 201,
        message: "Customer profile created successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerById(req, res, next) {
    try {
      const customer = await customerService.getCustomerById(req.tenantContext, req.params.id);

      return sendSuccess(res, {
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCustomer(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body;
      const customer = await customerService.updateCustomer(req.tenantContext, req.params.id, body);

      return sendSuccess(res, {
        message: "Customer profile updated successfully",
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCustomer(req, res, next) {
    try {
      await customerService.deleteCustomer(req.tenantContext, req.params.id);

      return sendSuccess(res, {
        message: "Customer profile deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerOrderHistory(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

      const { items, pagination } = await customerService.getCustomerOrderHistory(
        req.tenantContext,
        req.params.id,
        { page, limit }
      );

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async listAddresses(req, res, next) {
    try {
      const addresses = await customerService.listAddresses(req.tenantContext, req.params.id);

      return sendSuccess(res, {
        data: addresses,
      });
    } catch (error) {
      next(error);
    }
  }

  async addAddress(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body;
      const address = await customerService.addAddress(req.tenantContext, req.params.id, body);

      return sendSuccess(res, {
        statusCode: 201,
        message: "Customer address added successfully",
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateAddress(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body;
      const address = await customerService.updateAddress(
        req.tenantContext,
        req.params.id,
        req.params.addressId,
        body
      );

      return sendSuccess(res, {
        message: "Customer address updated successfully",
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteAddress(req, res, next) {
    try {
      await customerService.deleteAddress(req.tenantContext, req.params.id, req.params.addressId);

      return sendSuccess(res, {
        message: "Customer address deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
export default customerController;
