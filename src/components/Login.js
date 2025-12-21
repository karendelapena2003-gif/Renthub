import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false); // ⭐ toggle form

  // 🔐 LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 📧 SEND RESET EMAIL
  const handleForgotPassword = async () => {
    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("Reset link sent to your email");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">

        {/* 🔁 LOGIN FORM */}
        {!showForgot && (
          <>
            <h2 className="login-title">Login</h2>

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

              <p className="login-switch">
                Don’t have an account?{" "}
                <span onClick={() => navigate("/register")} className="login-link">
                  Register here
                </span>
              </p>
            </form>
          </>
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
