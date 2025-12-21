import React, { useState } from "react";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Register.css";

const Register = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("renter");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    // ✅ Confirm Password Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        role: role,
        createdAt: new Date(),
      });

      if (role === "owner") navigate("/owner-dashboard");
      else navigate("/renter-dashboard");

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, {
          email: user.email,
          role: "renter",
          createdAt: new Date(),
        });
      }

      const role = docSnap.exists() ? docSnap.data().role : "renter";
      if (role === "owner") navigate("/owner-dashboard");
      else navigate("/renter-dashboard");

    } catch (err) {
      setError(err.message);
    }
  };

  const handleFacebookRegister = async () => {
    setError("");
    try {
      const result = await signInWithPopup(auth, facebookProvider);
      const user = result.user;

      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, {
          email: user.email,
          role: "renter",
          createdAt: new Date(),
        });
      }

      const role = docSnap.exists() ? docSnap.data().role : "renter";
      if (role === "owner") navigate("/owner-dashboard");
      else navigate("/renter-dashboard");

    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="register-page">
      <div className="register-box">
        <h2 className="register-title">RentHub Registration</h2>

        <form onSubmit={handleRegister} className="register-form">

          <input
            type="email"
            placeholder="Email"
            className="register-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="register-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Confirm Password"
            className="register-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <select
            className="register-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="renter">Renter</option>
            <option value="owner">Owner</option>
          </select>

          {error && <p className="error-message">{error}</p>}

          <button
            type="submit"
            className="register-btn"
            disabled={loading}
          >
            {loading ? "Registering..." : "Register"}
          </button>

          <div className="social-login">
            <p>Or register with</p>
            <div className="social-buttons">
              <button
                type="button"
                onClick={handleGoogleRegister}
                className="google-btn"
              >
                Google
              </button>

              <button
                type="button"
                onClick={handleFacebookRegister}
                className="facebook-btn"
              >
                Facebook
              </button>
            </div>
          </div>

          <p className="register-switch">
            Already have an account?{" "}
            <span
              onClick={() => navigate("/")}
              className="register-link"
            >
              Login here
            </span>
          </p>

        </form>
      </div>
    </div>
  );
};

export default Register;
