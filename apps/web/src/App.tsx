import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Account } from "./pages/Account";
import { Cart } from "./pages/Cart";
import { Catalog } from "./pages/Catalog";
import { Checkout } from "./pages/Checkout";
import { DesignSystem } from "./pages/DesignSystem";
import { Favorites } from "./pages/Favorites";
import { InfoPage } from "./pages/InfoPage";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { ForgotPassword, ResetPassword, VerifyEmail } from "./pages/PasswordPages";
import { OrderDone } from "./pages/OrderDone";
import { Product } from "./pages/Product";

const AdminApp = lazy(() => import("./admin/AdminApp")); // painel carregado só quando acessado

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/catalogo" element={<Catalog />} />
        <Route path="/categoria/:slug" element={<Catalog />} />
        <Route path="/produto/:slug" element={<Product />} />
        <Route path="/favoritos" element={<Favorites />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pedido/:id" element={<OrderDone />} />
        <Route path="/p/:slug" element={<InfoPage />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/verificar-email" element={<VerifyEmail />} />
        <Route path="/conta" element={<Account />} />
        <Route path="/conta/pedidos/:id" element={<OrderDone />} />
      </Route>
      <Route path="/admin/*" element={<Suspense fallback={<p className="container state">Carregando painel…</p>}><AdminApp /></Suspense>} />
      {import.meta.env.DEV && <Route path="/design" element={<DesignSystem />} />}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
