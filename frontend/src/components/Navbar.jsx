import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="nav">
      <Link to="/" className="brand">
        SlotBook
      </Link>
      <nav>
        <NavLink to="/">Browse</NavLink>
        {user?.role === "user" && <NavLink to="/bookings">My bookings</NavLink>}
        {user?.role === "provider" && <NavLink to="/provider">My listings</NavLink>}
        {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
        {user ? (
          <>
            <span className="who">{user.name}</span>
            <button className="btn ghost" onClick={onLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <Link to="/register" className="btn primary small">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
