import deliveryService from "./delivery.service.js";

export class DeliveryController {
  async getDeliveryOrders(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const { status } = req.query;
      const result = await deliveryService.getDeliveryOrders(tenantContext, branchId, { status });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async requestPickup(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.requestPickupOrder(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async approvePickup(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.approvePickupOrder(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async rejectPickup(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.rejectPickupOrder(tenantContext, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async cancelPickup(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.cancelPickupOrder(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async assignDriver(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const { driverEmployeeId } = req.body;
      const result = await deliveryService.assignDriverOrder(tenantContext, branchId, orderId, driverEmployeeId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async acceptDriverAssignment(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.acceptDriverAssignment(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async rejectDriverAssignment(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.rejectDriverAssignment(tenantContext, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async cancelDriverAssignment(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.cancelDriverAssignment(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getPendingHandovers(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const result = await deliveryService.getPendingHandovers(tenantContext, branchId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async pickupOrder(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.pickupOrder(tenantContext, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async deliverOrder(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.deliverOrder(tenantContext, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async failDelivery(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.failDelivery(tenantContext, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getDriverWallet(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const { driverId } = req.query;
      const result = await deliveryService.getDriverWallet(tenantContext, branchId, driverId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async settleDriverCash(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const result = await deliveryService.settleDriverCash(tenantContext, branchId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async handoverReturn(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.handoverReturnOrder(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async confirmReturn(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId, orderId } = req.params;
      const result = await deliveryService.confirmReturnOrder(tenantContext, branchId, orderId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getBranchDrivers(req, res, next) {
    try {
      const tenantContext = req.tenantContext || req.tenant;
      const { branchId } = req.params;
      const result = await deliveryService.getBranchDrivers(tenantContext, branchId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const deliveryController = new DeliveryController();
export default deliveryController;
