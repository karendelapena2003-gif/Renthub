// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Register from "./components/Register";
import OwnerDashboard from "./pages/OwnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import RenterDashboard from "./pages/RenterDashboard";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const App = () => {
  const ProtectedRoute = ({ children }) => {
    const [user, setUser] = React.useState(undefined);

    React.useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser || null);
      });
      return () => unsubscribe();
    }, []);

    if (user === undefined) return <p>Loading...</p>;
    if (!user) return <Navigate to="/" replace />;
    return children;
  };

  // ✅ Common logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/"; // balik sa login page
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Routes */}
      <Route
        path="/owner-dashboard"
        element={
          <ProtectedRoute>
            <OwnerDashboard onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute>
            <AdminDashboard onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/renter-dashboard"
        element={
          <ProtectedRoute>
            <RenterDashboard onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
