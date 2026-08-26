import crypto from "crypto";
import tableRepository from "./table.repository.js";
import branchRepository from "../branches/branch.repository.js";
import menuService from "../menu/menu.service.js";
import { ConflictError, NotFoundError } from "../../shared/errors/index.js";
import { paginateResponse } from "../../shared/utils/pagination.js";
import env from "../../config/env.js";

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

function buildQrUrl(qrToken) {
  return `${env.CLIENT_URL}/menu/table/${qrToken}`;
}

export class TableService {
  async verifyBranchOwnership(tenantContext, branchId) {
    return branchRepository.requireBranch(tenantContext, branchId);
  }

  async listTables(tenantContext, branchId, { page = 1, limit = 20, status } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);

    const { items, total } = await tableRepository.findTablesByBranch(tenantContext, branchId, {
      page,
      limit,
      status,
    });

    const itemsWithQrUrl = items.map((table) => ({
      ...table,
      qrUrl: buildQrUrl(table.qrToken),
    }));

    return paginateResponse(itemsWithQrUrl, total, page, limit);
  }

  async getTableById(tenantContext, branchId, tableId) {
    await this.verifyBranchOwnership(tenantContext, branchId);

    const table = await tableRepository.findTableById(tenantContext, branchId, tableId);
    if (!table) {
      throw new NotFoundError("Table not found or access denied");
    }

    return {
      ...table,
      qrUrl: buildQrUrl(table.qrToken),
    };
  }

  async createTable(tenantContext, branchId, data) {
    await this.verifyBranchOwnership(tenantContext, branchId);

    const existing = await tableRepository.findTableByLabel(tenantContext, branchId, data.label);
    if (existing) {
      throw new ConflictError(`Table with label '${data.label}' already exists in this branch`);
    }

    const qrToken = generateQrToken();

    const table = await tableRepository.createTable(tenantContext, branchId, {
      label: data.label,
      capacity: data.capacity !== undefined ? data.capacity : 2,
      status: data.status || "AVAILABLE",
      qrToken,
    });

    return {
      ...table,
      qrUrl: buildQrUrl(table.qrToken),
    };
  }

  async updateTable(tenantContext, branchId, tableId, data) {
    const existing = await this.getTableById(tenantContext, branchId, tableId);

    if (data.label && data.label.toLowerCase() !== existing.label.toLowerCase()) {
      const duplicate = await tableRepository.findTableByLabel(tenantContext, branchId, data.label);
      if (duplicate) {
        throw new ConflictError(`Table with label '${data.label}' already exists in this branch`);
      }
    }

    const updatePayload = {
      ...(data.label ? { label: data.label } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.status ? { status: data.status } : {}),
    };

    await tableRepository.updateTable(tenantContext, branchId, tableId, updatePayload);
    return this.getTableById(tenantContext, branchId, tableId);
  }

  async deleteTable(tenantContext, branchId, tableId) {
    const table = await this.getTableById(tenantContext, branchId, tableId);
    await tableRepository.softDeleteTable(tenantContext, branchId, tableId);
    return { message: `Table '${table.label}' deleted successfully` };
  }

  async regenerateQrToken(tenantContext, branchId, tableId) {
    await this.getTableById(tenantContext, branchId, tableId);

    const newQrToken = generateQrToken();
    await tableRepository.updateQrToken(tenantContext, branchId, tableId, newQrToken);

    const updatedTable = await this.getTableById(tenantContext, branchId, tableId);
    return {
      id: updatedTable.id,
      label: updatedTable.label,
      qrToken: updatedTable.qrToken,
      qrUrl: buildQrUrl(updatedTable.qrToken),
    };
  }

  async resolveTableMenu(qrToken) {
    if (!qrToken) {
      throw new NotFoundError("Invalid or missing QR code token");
    }

    const table = await tableRepository.findTableByQrToken(qrToken);
    if (!table || !table.branch || table.branch.status !== "ACTIVE" || table.restaurant.status !== "ACTIVE") {
      throw new NotFoundError("Invalid or expired QR code token");
    }

    const menuData = await menuService.getPublicMenu({ restaurantId: table.restaurantId });
    if (!menuData) {
      throw new NotFoundError("Restaurant menu not available");
    }

    return {
      table: {
        id: table.id,
        label: table.label,
        capacity: table.capacity,
        status: table.status,
      },
      branch: {
        id: table.branch.id,
        name: table.branch.name,
        code: table.branch.code,
        phone: table.branch.phone,
        address: table.branch.address,
      },
      restaurant: menuData.restaurant,
      categories: menuData.categories,
    };
  }
}

export const tableService = new TableService();
export default tableService;
