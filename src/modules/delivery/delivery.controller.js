import deliveryService from "./delivery.service.js";

export class DeliveryController {
  async getDeliveryOrders(req, res, next) {
    try {
      const { branchId } = req.params;
      const { status } = req.query;
      const result = await deliveryService.getDeliveryOrders(req.tenant, branchId, { status });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async pickupOrder(req, res, next) {
    try {
      const { branchId, orderId } = req.params;
      const result = await deliveryService.pickupOrder(req.tenant, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async deliverOrder(req, res, next) {
    try {
      const { branchId, orderId } = req.params;
      const result = await deliveryService.deliverOrder(req.tenant, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async failDelivery(req, res, next) {
    try {
      const { branchId, orderId } = req.params;
      const result = await deliveryService.failDelivery(req.tenant, branchId, orderId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getDriverWallet(req, res, next) {
    try {
      const { branchId } = req.params;
      const { driverId } = req.query;
      const result = await deliveryService.getDriverWallet(req.tenant, branchId, driverId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async settleDriverCash(req, res, next) {
    try {
      const { branchId } = req.params;
      const result = await deliveryService.settleDriverCash(req.tenant, branchId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getBranchDrivers(req, res, next) {
    try {
      const { branchId } = req.params;
      const result = await deliveryService.getBranchDrivers(req.tenant, branchId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const deliveryController = new DeliveryController();
export default deliveryController;
