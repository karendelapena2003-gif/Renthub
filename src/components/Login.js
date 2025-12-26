import React, { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false); // toggle forgot password

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

      // Check role in Firestore
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

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
      } else {
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

  // 📧 FORGOT PASSWORD (Owner & Renter Only)
  const handleForgotPassword = async () => {
    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email");
      return;
    }

    try {
      // Send reset email
      await sendPasswordResetEmail(auth, email, {
        url: window.location.origin + "/login",
      });
      setSuccess("Reset link sent to your email.");

      // Auto-close forgot password after 3 seconds
      setTimeout(() => {
        setShowForgot(false);
        setSuccess("");
      }, 3000);

    } catch (err) {
      setError(err.message);
    }
  };

  // 🔑 GOOGLE LOGIN
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, { email: user.email, role: "renter", createdAt: new Date() });
      }

      const data = docSnap.exists() ? docSnap.data() : { role: "renter" };
      if (data.blocked || data.deleted) {
        await signOut(auth);
        setError("This account is blocked or deleted.");
        return;
      }

      const role = data.role;
      if (role === "owner") navigate("/owner-dashboard");
      else navigate("/renter-dashboard");

    } catch (err) {
      setError(err.message);
    }
  };

  // 🔑 FACEBOOK LOGIN
  const handleFacebookLogin = async () => {
    try {
      const result = await signInWithPopup(auth, facebookProvider);
      const user = result.user;
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, { email: user.email, role: "renter", createdAt: new Date() });
      }

      const data = docSnap.exists() ? docSnap.data() : { role: "renter" };
      if (data.blocked || data.deleted) {
        await signOut(auth);
        setError("This account is blocked or deleted.");
        return;
      }

      const role = data.role;
      if (role === "owner") navigate("/owner-dashboard");
      else navigate("/renter-dashboard");

    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h2 className="login-title">RentHub Login</h2>

        {!showForgot && (
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
                  <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button type="button" onClick={handleFacebookLogin} className="facebook-btn">
                  <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </button>
              </div>
            </div>

            <p
              className="forgot-password"
              onClick={() => {
                setError("");
                setSuccess("");
                setShowForgot(true);
              }}
            >
              Forgot password?
            </p>

            <p className="login-switch">
              Don’t have an account?{" "}
              <span onClick={() => navigate("/register")} className="login-link">
                Register here
              </span>
            </p>
          </form>
        )}

        {/* 🔑 FORGOT PASSWORD FORM */}
        {showForgot && (
          <>
            <div className="forgot-header">
              <h2>Forgot Password</h2>
              <span className="close-btn" onClick={() => setShowForgot(false)}>
                ✕
              </span>
            </div>

            <input
              type="email"
              placeholder="Enter your email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">{success}</p>}

            <button className="login-btn" onClick={handleForgotPassword}>
              Send Reset Email
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
