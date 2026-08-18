import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import employeesRouter from "../modules/employees/employee.routes.js";
import rolesRouter from "../modules/roles/role.routes.js";

const router = Router();

// Module 2 API Routes mounted under /api/v1
router.use("/v1/auth", authRouter);
router.use("/v1/employees", employeesRouter);
router.use("/v1/roles", rolesRouter);

export default router;