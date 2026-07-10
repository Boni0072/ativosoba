import { router } from "./_core/trpc";
import { projectsRouter } from "./projects";
import { expensesRouter } from "./expenses";
import { budgetsRouter } from "./budgets";
import { assetsRouter } from "./assets";
import { accountingRouter } from "./accounting";
import { budgetItemsRouter } from "./budgetItems";
import { usersRouter } from "./users";

export const appRouter = router({
  projects: projectsRouter,
  expenses: expensesRouter,
  budgets: budgetsRouter,
  assets: assetsRouter,
  accounting: accountingRouter,
  budgetItems: budgetItemsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;