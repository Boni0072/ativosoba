import { Switch, Route, Redirect } from "wouter";
import DashboardLayoutCustom from "./DashboardLayoutCustom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import ProjectsPage from "../pages/ProjectsPage";
import BudgetsPage from "../pages/BudgetsPage";
import AssetsPage from "../pages/AssetsPage";
import AssetMovementsPage from "../pages/AssetMovementsPage";
import AssetDepreciationPage from "../pages/AssetDepreciationPage";
import AssetInventoryPage from "../pages/AssetInventoryPage";
import { Upload } from "lucide-react";
import ReportsPage from "../pages/ReportsPage";
import AccountingStructurePage from "../pages/AccountingStructurePage";
import UserPage from "../pages/UserPage";
import NotificationsPage from "../pages/NotificationsPage";
import ImobilizadoEmAndamento from "../pages/ImobilizadoEmAndamento";
import CapexReportPage from "../pages/CapexReportPage"; // Importa a nova página
import DataImportPage from "../pages/DataImportPage"; // Importa a página de importação
import CapexPage from "../pages/CapexPage";
import NotFound from "../pages/NotFound";
import ExpensesPage from "../pages/ExpensesPage";
import NfeConsultationPage from "../pages/NfeConsultationPage";
import CalculationsPage from "../pages/CalculationsPage";
import ComponentsShowcase from "../pages/ComponentShowcase";
import DataConnectionsPage from "../pages/DataConnectionsPage";
import NfeQueryByKeyPage from "../pages/NfeQueryByKeyPage"; // Restaurado
import { useAuth } from "../_core/hooks/useAuth";
import { ThemeProvider } from "@/contexts/ThemeContext";

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Carregando...</div>;
  }

  return (
    isAuthenticated ? (
      <DashboardLayoutCustom>
        <Switch>
          <Route path="/"><Redirect to="/dashboard" /></Route>
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
          <Route path="/capex" component={CapexPage} />
          <Route path="/users" component={UserPage} />
          <Route path="/imobilizado" component={ImobilizadoEmAndamento} />
          <Route path="/capex-report" component={CapexReportPage} /> {/* Adiciona a nova rota */}
          <Route path="/expenses" component={ExpensesPage} />
          <Route path="/nfe" component={NfeConsultationPage} />
          <Route path="/calculations" component={CalculationsPage} />
          <Route path="/showcase" component={ComponentsShowcase} />
          <Route path="/connections" component={DataConnectionsPage} />
          <Route path="/nfe-query" component={NfeQueryByKeyPage} /> {/* Restaurado */}
          <Route path="/import" component={DataImportPage} /> {/* Rota de importação */}
          <Route component={NotFound} />
        </Switch>
      </DashboardLayoutCustom>
    ) : (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" component={Home} />
        <Route><Redirect to="/" /></Route>
      </Switch>
    )
  );
}

export default App;