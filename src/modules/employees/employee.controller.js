import employeeService from "./employee.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class EmployeeController {
  listEmployees = asyncHandler(async (req, res) => {
    const { page, limit, branchId, search, status, roleId, sort } = req.query;
    const { items, pagination } = await employeeService.listEmployees(req.tenantContext, {
      page,
      limit,
      branchId,
      search,
      status,
      roleId,
      sort,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getEmployeeById = asyncHandler(async (req, res) => {
    const employee = await employeeService.getEmployeeById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: employee });
  });

  createEmployee = asyncHandler(async (req, res) => {
    const employee = await employeeService.createEmployee(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Employee created successfully",
      data: employee,
    });
  });

  updateEmployee = asyncHandler(async (req, res) => {
    const employee = await employeeService.updateEmployee(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Employee updated successfully",
      data: employee,
    });
  });

  changePassword = asyncHandler(async (req, res) => {
    const result = await employeeService.changePassword(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, { message: result.message });
  });

  updateRole = asyncHandler(async (req, res) => {
    const employee = await employeeService.updateRole(req.tenantContext, req.params.id, req.body.roleId);
    return sendSuccess(res, {
      message: "Employee role updated successfully",
      data: employee,
    });
  });

  softDeleteEmployee = asyncHandler(async (req, res) => {
    const result = await employeeService.softDeleteEmployee(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });
}

export const employeeController = new EmployeeController();
export default employeeController;
