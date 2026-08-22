import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import employeesRouter from "../modules/employees/employee.routes.js";
import rolesRouter from "../modules/roles/role.routes.js";
import restaurantRouter from "../modules/restaurants/restaurant.routes.js";
import branchRouter from "../modules/branches/branch.routes.js";
import menuRouter from "../modules/menu/menu.routes.js";
import tableRouter from "../modules/tables/table.routes.js";
import orderRouter from "../modules/orders/order.routes.js";
import kdsRouter from "../modules/kds/kds.routes.js";
import customerRouter from "../modules/customers/customer.routes.js";
import inboxRouter from "../modules/inbox/inbox.routes.js";
import whatsappRouter from "../modules/whatsapp/whatsapp.routes.js";

const router = Router();

// Module 2, 3, 4, 5, 6, 7, 8 & 9 API Routes mounted under /api
router.use("/v1/auth", authRouter);
router.use("/v1/employees", employeesRouter);
router.use("/v1/roles", rolesRouter);
router.use("/v1/restaurant", restaurantRouter);
router.use("/v1/branches", branchRouter);
router.use("/v1/branches/:branchId/kds/orders", kdsRouter);
router.use("/v1/customers", customerRouter);
router.use("/v1/inbox", inboxRouter);
router.use("/v1", tableRouter);
router.use("/v1", orderRouter);
router.use("/v1/menu", menuRouter);
router.use("/", whatsappRouter);

export default router;