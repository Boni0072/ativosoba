import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./_core/hooks/useAuth";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayoutCustom";
import Dashboard from "./pages/Dashboard";
import ProjectsPage from "./pages/ProjectsPage";
import BudgetsPage from "./pages/BudgetsPage";
import AssetsPage from "./pages/AssetsPage";
import AccountingStructurePage from "./pages/AccountingStructurePage";
import Home from "./pages/Home";
import UserPage from "./pages/UserPage";
import Login from "./pages/Login";
import AssetInventoryPage from "./pages/AssetInventoryPage";
import ReportsPage from "./pages/ReportsPage";
import AssetDepreciationPage from "./pages/AssetDepreciationPage";
import AssetMovementsPage from "./pages/AssetMovementsPage";
import NotificationsPage from "./pages/NotificationsPage";

// App Router Configuration
function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen w-full items-center justify-center">Carregando...</div>;
  }

  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path="/">
        {isAuthenticated ? <Redirect to="/dashboard" /> : <Home />}
      </Route>

      {/* Protected Routes */}
      <Route path="/:rest*">
        {() =>
          isAuthenticated ? (
            <DashboardLayout>
              <Switch>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/notifications" component={NotificationsPage} />
                <Route path="/projects" component={ProjectsPage} />
                <Route path="/budgets" component={BudgetsPage} />
                <Route path="/assets" component={AssetsPage} />
                <Route path="/asset-movements" component={AssetMovementsPage} />
                <Route path="/asset-depreciation" component={AssetDepreciationPage} />
                <Route path="/inventory" component={AssetInventoryPage} />
                <Route path="/reports" component={ReportsPage} />
                <Route path="/accounting" component={AccountingStructurePage} />
                <Route path="/users" component={UserPage} />
                <Route component={NotFound} />
              </Switch>
            </DashboardLayout>
          ) : (
            <Redirect to="/login" />
          )
        }
      </Route>

      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
