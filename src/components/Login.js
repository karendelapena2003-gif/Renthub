import React, { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Role selection modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");

  // 🔐 LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Admin check
      if (user.email === "admin@gmail.com") {
        navigate("/admin-dashboard");
        return;
      }

      // Check role in Firestore (primary: users collection, fallback: owners/renters)
      let role = null;
      let docRef = doc(db, "users", user.uid);
      let docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.blocked || data.deleted) {
          await signOut(auth);
          setError("This account is blocked or deleted.");
          return;
        }
        role = data.role;
      } else {
        // Fallback: check owners collection
        docRef = doc(db, "owners", user.uid);
        docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          role = "owner";
        } else {
          // Fallback: check renters collection
          docRef = doc(db, "renters", user.uid);
          docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            role = "renter";
          }
        }
      }

      if (role === "owner") navigate("/owner-dashboard");
      else if (role === "renter") navigate("/renter-dashboard");
      else {
        setError("No role found for this account.");
      }
    } catch (err) {
      if (err.code === "auth/user-not-found") setError("No account found with this email.");
      else if (err.code === "auth/wrong-password") setError("Incorrect password.");
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🎭 HANDLE ROLE SELECTION
  const handleRoleSelection = async () => {
    if (!selectedRole) {
      setError("Please select a role");
      return;
    }

    try {
      const docRef = doc(db, "users", pendingUser.uid);
      await setDoc(docRef, { 
        email: pendingUser.email, 
        role: selectedRole, 
        createdAt: new Date(),
        displayName: pendingUser.displayName || "",
        photoURL: pendingUser.photoURL || ""
      });

      // Redirect based on selected role
      if (selectedRole === "owner") {
        navigate("/owner-dashboard");
      } else {
        navigate("/renter-dashboard");
      }

      // Reset modal
      setShowRoleModal(false);
      setPendingUser(null);
      setSelectedRole("");
    } catch (err) {
      setError("Error saving profile: " + err.message);
    }
  };

  // 🔑 GOOGLE LOGIN
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      // If user already exists, check role and navigate
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.blocked || data.deleted) {
          await signOut(auth);
          setError("This account is blocked or deleted.");
          return;
        }

        const role = data.role;
        if (role === "owner") navigate("/owner-dashboard");
        else if (role === "renter") navigate("/renter-dashboard");
        else navigate("/unauthorized");
        return;
      }

      // New user - show role selection modal
      setPendingUser(user);
      setShowRoleModal(true);
      setError("");

    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Google login error: " + err.message);
      }
    }
  };

  // 🔑 FACEBOOK LOGIN
  const handleFacebookLogin = async () => {
    try {
      const result = await signInWithPopup(auth, facebookProvider);
      const user = result.user;
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      // If user already exists, check role and navigate
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.blocked || data.deleted) {
          await signOut(auth);
          setError("This account is blocked or deleted.");
          return;
        }

        const role = data.role;
        if (role === "owner") navigate("/owner-dashboard");
        else if (role === "renter") navigate("/renter-dashboard");
        else navigate("/unauthorized");
        return;
      }

      // New user - show role selection modal
      setPendingUser(user);
      setShowRoleModal(true);
      setError("");

    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Facebook login error: " + err.message);
      }
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h2 className="login-title">RentHub Login</h2>

        {!showRoleModal ? (
          <>
            <form onSubmit={handleLogin} className="login-form">
              <input
                type="email"
                placeholder="Email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && <p className="error-message">{error}</p>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>

              <div className="social-login">
                <p>Or sign in with</p>
                <div className="social-buttons">
                  <button type="button" onClick={handleGoogleLogin} className="google-btn">
                    Google
                  </button>
                  <button type="button" onClick={handleFacebookLogin} className="facebook-btn">
                    Facebook
                  </button>
                </div>
              </div>

              <p className="login-switch">
                Don't have an account?{" "}
                <span onClick={() => navigate("/register")} className="login-link">
                  Register here
                </span>
              </p>
            </form>
          </>
        ) : (
          // 🎭 ROLE SELECTION MODAL
          <div className="role-selection-modal">
            <h2>Select Your Role</h2>
            <p>Welcome, {pendingUser?.displayName || pendingUser?.email}!</p>

            <div className="role-options">
              <button
                className={`role-btn ${selectedRole === "owner" ? "active" : ""}`}
                onClick={() => setSelectedRole("owner")}
              >
                <strong>👤 Property Owner</strong>
                <p>List and manage your properties</p>
              </button>

              <button
                className={`role-btn ${selectedRole === "renter" ? "active" : ""}`}
                onClick={() => setSelectedRole("renter")}
              >
                <strong>🏠 Renter</strong>
                <p>Browse and rent properties</p>
              </button>
            </div>

            {error && <p className="error-message">{error}</p>}

            <div className="role-buttons">
              <button 
                className="role-confirm-btn" 
                onClick={handleRoleSelection}
                disabled={!selectedRole}
              >
                Continue
              </button>
              <button 
                className="role-cancel-btn" 
                onClick={() => {
                  setShowRoleModal(false);
                  setPendingUser(null);
                  setSelectedRole("");
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
