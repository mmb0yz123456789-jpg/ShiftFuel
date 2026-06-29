import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shiftfuelRouter from "./shiftfuel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shiftfuelRouter);

export default router;
