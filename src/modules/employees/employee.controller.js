import employeeService from "./employee.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class EmployeeController {
  async listEmployees(req, res, next) {
    try {
      const page = req.query.page ? parseInt(req.query.page, 10) : 1;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10), 100) : 20;
      const branchId = req.query.branchId;

      const { items, pagination } = await employeeService.listEmployees(req.tenantContext, {
        page,
        limit,
        branchId,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getEmployeeById(req, res, next) {
    try {
      const employee = await employeeService.getEmployeeById(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  async createEmployee(req, res, next) {
    try {
      const employee = await employeeService.createEmployee(req.tenantContext, req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Employee created successfully",
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateEmployee(req, res, next) {
    try {
      const employee = await employeeService.updateEmployee(req.tenantContext, req.params.id, req.body);
      return sendSuccess(res, {
        message: "Employee updated successfully",
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const result = await employeeService.changePassword(req.tenantContext, req.params.id, req.body);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req, res, next) {
    try {
      const employee = await employeeService.updateRole(req.tenantContext, req.params.id, req.body.roleId);
      return sendSuccess(res, {
        message: "Employee role updated successfully",
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  async softDeleteEmployee(req, res, next) {
    try {
      const result = await employeeService.softDeleteEmployee(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const employeeController = new EmployeeController();
export default employeeController;
