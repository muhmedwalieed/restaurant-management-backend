import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import employeesRouter from "../modules/employees/employee.routes.js";
import rolesRouter from "../modules/roles/role.routes.js";
import restaurantRouter from "../modules/restaurants/restaurant.routes.js";
import branchRouter from "../modules/branches/branch.routes.js";
import menuRouter from "../modules/menu/menu.routes.js";
import tableRouter from "../modules/tables/table.routes.js";

const router = Router();

// Module 2, 3, 4 & 5 API Routes mounted under /api/v1
router.use("/v1/auth", authRouter);
router.use("/v1/employees", employeesRouter);
router.use("/v1/roles", rolesRouter);
router.use("/v1/restaurant", restaurantRouter);
router.use("/v1/branches", branchRouter);
router.use("/v1", tableRouter);
router.use("/v1/menu", menuRouter);

export default router;