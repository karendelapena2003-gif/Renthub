import React, { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from "firebase/auth";
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
        const role = docSnap.data().role;
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

      const role = docSnap.exists() ? docSnap.data().role : "renter";
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

      const role = docSnap.exists() ? docSnap.data().role : "renter";
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
