import { lazy, Suspense, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Logo } from "../components/Logo";
import { logout, useAuth } from "../hooks/useAuth";
import "./admin.css";

const DashboardPage = lazy(() => import("./DashboardPage"));
const CustomersPage = lazy(() => import("./CustomersPage"));
const ReportsPage = lazy(() => import("./ReportsPage"));
const PagesPage = lazy(() => import("./PagesPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const OrdersPages = lazy(() => import("./OrdersPages"));
const ProductsPages = lazy(() => import("./ProductsPages"));
const CatalogSetup = lazy(() => import("./CatalogSetup"));
const StockPage = lazy(() => import("./StockPage"));
const CouponsPage = lazy(() => import("./CouponsPage"));
const HomePage = lazy(() => import("./HomePage"));
const ReviewsPage = lazy(() => import("./ReviewsPage"));

const NAV: Array<{ to: string; label: string; perm: string }> = [
  { to: "painel", label: "Resumo", perm: "dashboard.read" },
  { to: "pedidos", label: "Pedidos", perm: "orders.read" },
  { to: "retiradas", label: "Retiradas", perm: "orders.read" },
  { to: "produtos", label: "Produtos", perm: "catalog.read" },
  { to: "cadastros", label: "Categorias e atributos", perm: "catalog.read" },
  { to: "estoque", label: "Estoque", perm: "stock.read" },
  { to: "cupons", label: "Cupons", perm: "coupons.read" },
  { to: "home", label: "Página inicial", perm: "content.read" },
  { to: "avaliacoes", label: "Avaliações", perm: "reviews.moderate" },
  { to: "clientes", label: "Clientes", perm: "users.read" },
  { to: "paginas", label: "Páginas", perm: "content.read" },
  { to: "relatorios", label: "Relatórios", perm: "reports.read" },
  { to: "configuracoes", label: "Configurações", perm: "settings.read" },
];

function Shell() {
  const { user } = useAuth();
  const nav = NAV.filter((n) => user!.permissions.includes(n.perm));
  return (
    <div className="adm">
      <aside className="adm-side">
        <Link to="/admin" className="adm-brand"><Logo size="sm" tone="light" /><span>Painel</span></Link>
        <nav aria-label="Painel">{nav.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}</nav>
        <div className="adm-user">
          <span>{user!.name}</span>
          <Link to="/" className="link-btn">Ver loja</Link>
          <button type="button" className="link-btn" onClick={() => void logout()}>Sair</button>
        </div>
      </aside>
      <main className="adm-main"><Suspense fallback={<p className="state">Carregando…</p>}><Outlet /></Suspense></main>
    </div>
  );
}

function Guard({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="container state">Carregando…</p>;
  if (!user) return <Navigate to="/entrar?next=/admin" replace />;
  if (!user.permissions.includes("panel.access")) return <div className="container state"><h1>Sem acesso ao painel</h1><p>Esta conta não tem permissão para administrar a loja.</p><Link to="/" className="btn btn--ghost">Voltar à loja</Link></div>;
  return <>{children}</>;
}

export default function AdminApp() {
  const { user } = useAuth();
  const first = NAV.find((n) => user?.permissions.includes(n.perm))?.to ?? "pedidos";
  return (
    <Guard>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to={first} replace />} />
          <Route path="painel" element={<DashboardPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="paginas" element={<PagesPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="pedidos/*" element={<OrdersPages />} />
          <Route path="retiradas/*" element={<OrdersPages pickups />} />
          <Route path="produtos/*" element={<ProductsPages />} />
          <Route path="cadastros" element={<CatalogSetup />} />
          <Route path="estoque" element={<StockPage />} />
          <Route path="cupons" element={<CouponsPage />} />
          <Route path="home" element={<HomePage />} />
          <Route path="avaliacoes" element={<ReviewsPage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Route>
      </Routes>
    </Guard>
  );
}
