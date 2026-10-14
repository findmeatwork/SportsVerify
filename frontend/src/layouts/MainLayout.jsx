import { NavLink, Outlet } from "react-router-dom";
import Banner from "../components/Banner.jsx";
import WalletStatus from "../components/WalletStatus.jsx";

export default function MainLayout() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <NavLink className="brand" to="/" aria-label="SportsVerify home">
            <span className="brand__mark" aria-hidden="true">SV</span>
            <span>SportsVerify</span>
          </NavLink>
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/register">Register</NavLink>
            <NavLink to="/organizer">Organizer</NavLink>
          </nav>
          <WalletStatus />
        </div>
      </header>
      <div className="demo-banner-wrap">
        <Banner type="warning" className="demo-banner">
          Demo mode: no authentication in Phase 1. Prototype, not production.
        </Banner>
      </div>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <span>SportsVerify</span>
          <span>Prototype registration record · on-chain data is limited to a commitment.</span>
        </div>
      </footer>
    </div>
  );
}