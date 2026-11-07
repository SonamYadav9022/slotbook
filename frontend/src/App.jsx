import { Routes, Route, Link } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Browse from "./pages/Browse.jsx";
import ResourceDetail from "./pages/ResourceDetail.jsx";
import { Login, Register } from "./pages/AuthPages.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import ProviderDashboard from "./pages/ProviderDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/resources/:id" element={<ResourceDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<ProtectedRoute roles={["user"]}><MyBookings /></ProtectedRoute>} />
          <Route path="/provider" element={<ProtectedRoute roles={["provider"]}><ProviderDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
          <Route
            path="*"
            element={
              <div className="pad">
                <h1>Page not found</h1>
                <Link to="/">Back to browse</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </>
  );
}
