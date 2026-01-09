import React, { useState } from "react";
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Register.css";

const Register = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("renter");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Please fill in all required fields");
      return;
    }

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
      await updateProfile(user, { displayName: fullName });

      const userData = {
        displayName: fullName,
        email: user.email,
        role: role,
        photoURL: user.photoURL || "",
        createdAt: serverTimestamp(),
        earnings: 0,
        totalEarnings: 0,
        totalWithdrawn: 0,
      };

      await setDoc(doc(db, "users", user.uid), userData, { merge: true });

      const roleCollection = role === "owner" ? "owners" : "renters";
      await setDoc(doc(db, roleCollection, user.uid), userData, { merge: true });

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
          displayName: user.displayName || "",
          email: user.email,
          role: "renter",
          photoURL: user.photoURL || "",
          createdAt: serverTimestamp(),
        });
        await setDoc(
          doc(db, "renters", user.uid),
          {
            displayName: user.displayName || "",
            email: user.email,
            role: "renter",
            photoURL: user.photoURL || "",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
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
          displayName: user.displayName || "",
          email: user.email,
          role: "renter",
          photoURL: user.photoURL || "",
          createdAt: serverTimestamp(),
        });
        await setDoc(
          doc(db, "renters", user.uid),
          {
            displayName: user.displayName || "",
            email: user.email,
            role: "renter",
            photoURL: user.photoURL || "",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
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
            type="text"
            placeholder="Full Name"
            className="register-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

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
                <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <button
                type="button"
                onClick={handleFacebookRegister}
                className="facebook-btn"
              >
                <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
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
