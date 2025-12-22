// ✅ src/pages/OwnerDashboard.js
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Sidebar from "./Sidebar";
import "./OwnerDashboard.css";
import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc,
  setDoc,
  getDocs,
   orderBy,
   getDoc,
} from "firebase/firestore";
import { CLOUD_NAME, UPLOAD_PRESET } from "../cloudinaryConfig";
import { useNavigate } from "react-router-dom";
import {   getAuth, updateProfile, EmailAuthProvider, reauthenticateWithCredential,  updatePassword } from "firebase/auth";

const OwnerDashboard = ({ onLogout }) => {
  const [user, setUser] = useState(auth.currentUser);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(user?.photoURL || "");
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState("ownerProfile");
  const [posts, setPosts] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();
    const [withdrawals, setWithdrawals] = useState([]);
  const [earnings, setEarnings] = useState(0);
  const ownerEmail = user?.email || "owner@gmail.com";
  const currentUser = auth.currentUser;
  const ownerId = currentUser?.uid;
  const [sidebarOpen, setSidebarOpen] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  
  // ---------- Firestore listeners ----------
  useEffect(() => {
    if (!auth.currentUser) return;
    const userDocRef = doc(db, "owners", auth.currentUser.uid);
    const unsub = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUser({ ...data, uid: docSnap.id });
        setDisplayName(data.displayName || "");
        setPhotoPreview(data.photoURL || "");
      } else {
        setDoc(
          userDocRef,
          {
            displayName: auth.currentUser.displayName || "",
            email: auth.currentUser.email,
            createdAt: serverTimestamp(),
            photoURL: auth.currentUser.photoURL || "",
          },
          { merge: true }
        );
      }
    });
    return () => unsub();
  }, []);

useEffect(() => {
  const q = query(collection(db, "properties"), where("ownerEmail", "==", ownerEmail));
  const unsub = onSnapshot(q, (snapshot) => {
    const postData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setPosts(postData);
    setRentals(postData); // <-- update rentals count
  });
  return () => unsub();
}, [ownerEmail]);



useEffect(() => {
if (!ownerId) return;
const ownerRef = doc(db, "owners", ownerId);
const unsub = onSnapshot(ownerRef, (docSnap) => {
if (docSnap.exists()) {
setEarnings(docSnap.data().earnings || 0);
}
});
return () => unsub();
}, [ownerId]);


// Fetch withdrawals
useEffect(() => {
  const fetchWithdrawals = async () => {
    const q = query(collection(db, "withdrawals"), where("ownerId", "==", ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // ✅ add id
    setWithdrawals(data);
  };
  if (ownerId) fetchWithdrawals();
}, [ownerId]);



  // ---------- Profile handlers ----------

  const handleSaveProfile = async () => {
    if (!auth.currentUser) return alert("User not logged in.");
    if (!displayName || displayName.trim() === "") return alert("Display name cannot be empty.");

    try {
      setLoading(true);
      let photoURL = user?.photoURL || "";

      if (photo) {
        const formData = new FormData();
        formData.append("file", photo);
        formData.append("upload_preset", "renthub_unsigned");

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: formData }
        );
        const data = await res.json();
        if (!res.ok || !data.secure_url) throw new Error("Cloudinary upload failed");
        photoURL = data.secure_url;
      }

      try {
        await updateProfile(auth.currentUser, { displayName, photoURL });
      } catch (err) {
        if (err.code === "auth/requires-recent-login") {
          const password = prompt("Please enter your password to update your profile:");
          if (!password) throw new Error("Reauthentication cancelled.");
          const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
          await reauthenticateWithCredential(auth.currentUser, credential);
          await updateProfile(auth.currentUser, { displayName, photoURL });
        } else throw err;
      }

      const userDocRef = doc(db, "owners", auth.currentUser.uid);
      await setDoc(
        userDocRef,
        { displayName, photoURL, createdAt: user?.createdAt || serverTimestamp() },
        { merge: true }
      );
      setUser({ ...user, displayName, photoURL });
      setPhoto(null);
      setPhotoPreview(photoURL);
      setIsEditing(false);
      alert("✅ Profile updated successfully!");
    } catch (err) {
      console.error(err);
      alert(`❌ Failed to update profile: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  const handleCancel = () => {
    setDisplayName(user?.displayName || "");
    setPhoto(null);
    setPhotoPreview(user?.photoURL || "");
    setIsEditing(false);
  };

    const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("New password and confirm password do not match");
      return;
    }

    try {
      setPasswordLoading(true);
      const auth = getAuth();
      const user = auth.currentUser;

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, newPassword);

      alert("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowSettings(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setPasswordLoading(false);
    }
  };


  // ---------- Add Post ----------

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    imageFile: null,
    imagePreview: "",
    agreed: false,
  });

  const handleAddPost = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.imageFile) return alert("⚠️ Fill name, price, image.");

    try {
      const data = new FormData();
      data.append("file", formData.imageFile);
      data.append("upload_preset", UPLOAD_PRESET);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: data });
      const uploadResponse = await res.json();
      const imageUrl = uploadResponse.secure_url;

      await addDoc(collection(db, "properties"), {
        name: formData.name,
        price: Number(formData.price),
        description: formData.description,
        imageUrl,
        ownerEmail,
        status: "pending",
        paymentStatus: "Unpaid",
        createdAt: serverTimestamp(),
      });

      alert("✅ Submitted for approval!");
      setFormData({ name: "", price: "", description: "", imageFile: null, imagePreview: "", agreed: false });
      setActivePage("rentalitem");
    } catch (error) {
      console.error(error);
      alert("❌ Failed to add post.");
    }
  };

  const handleDeletePost = async (id) => {
    if (!window.confirm("🗑️ Delete this post?")) return;
    try { await deleteDoc(doc(db, "properties", id)); alert("Deleted."); } catch (err) { console.error(err); alert("Failed."); }
  };

  const handlePayNow = async (id) => {
    try { await updateDoc(doc(db, "properties", id), { paymentStatus: "Paid" }); alert("Marked as Paid."); }
    catch (err) { console.error(err); alert("Failed."); }
  };


   // ---------- Handle Withdraw ----------

const totalWithdrawn = withdrawals
  .filter(w => w.status !== "rejected")
  .reduce((sum, w) => sum + w.amount, 0);
  const balance = earnings;
  const withdrawn = totalWithdrawn;
  const [withdrawMethod, setWithdrawMethod] = useState("");
  const [withdrawAccountName, setWithdrawAccountName] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawPassword, setWithdrawPassword] = useState("");
  
  const toggleWithdrawals = () => {
    setShowWithdrawals((prev) => !prev); 
  };

const handleWithdraw = async () => {
  if (!withdrawMethod || !withdrawAccountName || !withdrawPhone) {
    return alert("Please fill in all withdrawal details!");
  }

  if (balance < 1000) return alert("Minimum withdrawal is ₱1,000");

  const amountToWithdraw = Number(balance);

  try {
    await addDoc(collection(db, "withdrawals"), {
      ownerId: auth.currentUser.uid,
      ownerEmail: auth.currentUser.email, 
      amount: amountToWithdraw,
      method: withdrawMethod,
      accountName: withdrawAccountName,
      phone: withdrawPhone,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "owners", auth.currentUser.uid), {
      earnings: 0,
    });

    alert("✅ Withdrawal request submitted!");

    // Reset form
    setWithdrawMethod("");
    setWithdrawAccountName("");
    setWithdrawPhone("");
  } catch (err) {
    console.error(err);
    alert("❌ Failed to submit withdrawal");
  }
};

const [showWithdrawForm, setShowWithdrawForm] = useState(false);
const [showWithdrawals, setShowWithdrawals] = useState(false); // State for toggling visibility


async function updateOldWithdrawalsWithEmails() {
  try {
    const withdrawalsCol = collection(db, "withdrawals");
    const withdrawalsSnap = await getDocs(withdrawalsCol);

    for (const wDoc of withdrawalsSnap.docs) {
      const wData = wDoc.data();

      if (!wData.ownerEmail && wData.ownerId) {
        const ownerRef = doc(db, "owners", wData.ownerId);
        const ownerSnap = await getDoc(ownerRef);

        if (ownerSnap.exists()) {
          const ownerEmail = ownerSnap.data().email;

          await updateDoc(doc(db, "withdrawals", wDoc.id), {
            ownerEmail: ownerEmail || "N/A",
          });

          console.log(`✅ Updated withdrawal ${wDoc.id} with email: ${ownerEmail}`);
        } else {
          console.log(`⚠️ Owner not found for withdrawal ${wDoc.id}`);
        }
      }
    }

    console.log("✅ All old withdrawals processed.");
  } catch (err) {
    console.error("❌ Error updating withdrawals:", err);
  }
}

updateOldWithdrawalsWithEmails();


  // ---------- MESSAGES HANDLERS ----------

const [allUsers, setAllUsers] = useState([]);       
const [selectedChat, setSelectedChat] = useState(null); 
const [messages, setMessages] = useState([]);      
const [replyText, setReplyText] = useState({});    

const currentUserEmail = auth.currentUser?.email;

useEffect(() => {
  if (!ownerEmail) return;

  const q = query(
    collection(db, "messages"),
    orderBy("createdAt", "asc") 
  );

  const unsub = onSnapshot(q, (snapshot) => {
    const allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Keep only messages where owner is either sender or receiver
    const ownerMessages = allMessages.filter(
      m => m.sender?.toLowerCase() === ownerEmail.toLowerCase() || m.receiver?.toLowerCase() === ownerEmail.toLowerCase()
    );

    setMessages(ownerMessages);
  });

  return () => unsub();
}, [ownerEmail]);

const getFilteredMessages = (chatUser) => {
  return messages
    .filter(
      m =>
        (m.sender?.toLowerCase() === ownerEmail.toLowerCase() && m.receiver?.toLowerCase() === chatUser.toLowerCase()) ||
        (m.sender?.toLowerCase() === chatUser.toLowerCase() && m.receiver?.toLowerCase() === ownerEmail.toLowerCase())
    )
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
};

useEffect(() => {
  const fetchUsers = async () => {
    const snapshot = await getDocs(collection(db, "users"));
    const usersData = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(u => u.email !== currentUserEmail); // exclude self
    setAllUsers(usersData);
  };
  fetchUsers();
}, [currentUserEmail]);

useEffect(() => {
  if (!currentUserEmail) return;

  const q = query(
    collection(db, "messages"),
    orderBy("createdAt", "asc")
  );

  const unsub = onSnapshot(q, (snapshot) => {
    const allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const userMessages = allMessages.filter(
      m => m.sender?.toLowerCase() === currentUserEmail.toLowerCase() ||
           m.receiver?.toLowerCase() === currentUserEmail.toLowerCase()
    );
    setMessages(userMessages);
  });

  return () => unsub();
}, [currentUserEmail]);


const conversationUsers = Array.from(
  new Set(messages.map(m => (m.sender === currentUserEmail ? m.receiver : m.sender)))
);

const getChatMessages = (chatUserEmail) =>
  messages
    .filter(
      m =>
        (m.sender === currentUserEmail && m.receiver === chatUserEmail) ||
        (m.sender === chatUserEmail && m.receiver === currentUserEmail)
    )
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));

const handleReply = async (receiverEmail) => {
  const text = replyText[receiverEmail];
  if (!text || !currentUserEmail) return;

  try {
    const newMessage = {
      sender: currentUserEmail,
      receiver: receiverEmail,
      text,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "messages"), newMessage);

    // Optimistic UI update
    setMessages(prev => [...prev, { id: docRef.id, ...newMessage, createdAt: new Date() }]);
    setReplyText(prev => ({ ...prev, [receiverEmail]: "" }));
  } catch (err) {
    console.error(err);
    alert("❌ Failed to send message.");
  }
};

const handleDeleteConversation = async (chatUserEmail) => {
  const conv = messages.filter(
    m =>
      (m.sender === chatUserEmail && m.receiver === currentUserEmail) ||
      (m.sender === currentUserEmail && m.receiver === chatUserEmail)
  );
  const batch = conv.map(m => deleteDoc(doc(db, "messages", m.id)));
  await Promise.all(batch);
  setSelectedChat(null);
};

// ✅ AUTO CLOSE SIDEBAR ON PAGE CHANGE (MOBILE ONLY)
useEffect(() => {
  if (window.innerWidth <= 768) {
    setSidebarOpen(false);
  }
}, [activePage]);




const [userRole, setUserRole] = useState(""); // <-- define userRole state

useEffect(() => {
  const auth = getAuth();
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Example: kunin ang role mula sa Firestore user document
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUserRole(docSnap.data().role); // 'renter', 'owner', or 'admin'
      }
    } else {
      setUserRole(""); // walang user
    }
  });

  return () => unsubscribe();
}, []);
  // ---------- JSX ----------
  return (
   <div className="dashboard-container owner-dashboard">
  {/* MENU TOGGLE BUTTON */}
  <button
    className="menu-toggle"
    onClick={() => setSidebarOpen(!sidebarOpen)}
  >
    ☰
  </button>

  {/* SIDEBAR OVERLAY */}
  {sidebarOpen && (
    <div
      className="sidebar-overlay"
      onClick={() => setSidebarOpen(false)}
    />
  )}

  {/* SIDEBAR */}
  <Sidebar
    userType="owner"
    activePage={activePage}
    setActivePage={setActivePage}
    onLogout={onLogout}
    isOpen={sidebarOpen}
    closeSidebar={() => setSidebarOpen(false)}
  />

  <div className="dashboard-content" onClick={() => setSidebarOpen(false)}>
    {/* OWNER PROFILE */}
   {activePage === "ownerProfile" && userRole === "owner" && (
  <section className="profile-owner">
    <h2>Owner Profile</h2>

    {user ? (
      <div className="profile-container">
        <img
          src={photoPreview || "/default-profile.png"}
          alt="Profile"
          className="profile-img"
        />

        <div className="profile-info">
          <p>Name: {user.displayName || "No Name"}</p>
          <p>Email: {user.email || "No Email"}</p>
          <p>
            Joined:{" "}
            {user.createdAt?.toDate
              ? user.createdAt.toDate().toLocaleDateString()
              : "N/A"}
          </p>
        </div>

        {/* Buttons */}
        {!isEditing && (
          <div className="profile-actions">
            <button onClick={() => setIsEditing(true)} className="edit-btn">
              Edit
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="settings-btn"
            >
              Settings
            </button>
          </div>
        )}

        {/* Edit Profile */}
        {isEditing && (
          <div className="profile-form">
            <label>Full Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <label>Profile Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files[0])}
            />

            <div className="profile-form-buttons">
              <button onClick={handleSaveProfile} disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </button>
              <button onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        )}

        {/* Settings → Change Password */}
        {showSettings && (
          <div className="settings-form">
            <h3>Change Password</h3>

            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <div className="profile-form-buttons">
              <button
                onClick={handleChangePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
              <button onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    ) : (
      <p>Loading profile...</p>
    )}
  </section>
)}

  {/* DASHBOARD OVERVIEW */}
{activePage === "dashboard" && userRole === "owner" && (
  <section className="overview-owner">
    <h2>Dashboard</h2>
    <div className="overview-cards">

      {/* Owner Profile */}
      <div className="overview-card" onClick={() => setActivePage("ownerProfile")}>
        <h3>👤 Owner Profile</h3>
        <p>View and edit your profile</p>
      </div>

      {/* Rental Items */}
      <div className="overview-card" onClick={() => setActivePage("rentalitem")}>
        <h3>📦 Rental Items</h3>
        <p>Total: {rentals.length}</p>
      </div>

      {/* Total Earnings */}
      <div className="overview-card" onClick={() => setActivePage("totalEarnings")}>
        <h3>💰 Total Earnings</h3>
        <p>Balance: ₱{balance}</p>
        <p>Withdrawn: ₱{withdrawn}</p>
      </div>

            {/* Messages */}
      <div className="overview-card" onClick={() => setActivePage("messages")}>
        <h3>📩 Messages</h3>
        <p>Total: {conversationUsers.length}</p>
      </div>

      {/* Add Rental Item */}
      <div className="overview-card" onClick={() => setActivePage("addrentalitem")}>
        <h3>➕ Add Rental Item</h3>
        <p>Add new rentals here</p>
      </div>

    </div>
  </section>
)}


 {/* TOTAL EARNINGS */}
{activePage === "totalEarnings" && userRole === "owner" && (
  <section className="totalearnings-owner">
    <h2>Total Earnings</h2>
    <p>Balance: ₱{balance > 0 ? balance.toFixed(2) : "0.00"}</p>
    <p>Withdrawn: ₱{withdrawn.toFixed(2)}</p>
    <p>Minimum Withdraw: ₱1,000</p>

    {/* Withdraw Button */}
    <button
      className="show-withdraw-form-btn"
      onClick={() => setShowWithdrawForm(prev => !prev)}
      disabled={balance < 1000}
    >
      {showWithdrawForm ? "Cancel Withdrawal" : "Withdraw"}
    </button>

    {/* Conditional Withdraw Form */}
    {showWithdrawForm && (
      <div className="withdraw-form">
        <label>Withdrawal Method:</label>
        <select
          value={withdrawMethod}
          onChange={(e) => setWithdrawMethod(e.target.value)}
        >
          <option value="">--Select Method--</option>
          <option value="GCash">GCash</option>
          <option value="PayMaya">PayMaya</option>
        </select>

        <label>Account Name:</label>
        <input
          type="text"
          value={withdrawAccountName}
          onChange={(e) => setWithdrawAccountName(e.target.value)}
        />

        <label>Phone Number:</label>
        <input
          type="text"
          value={withdrawPhone}
          onChange={(e) => setWithdrawPhone(e.target.value)}
        />

        <button
          disabled={balance < 1000}
          onClick={handleWithdraw}
          className="withdraw-btn"
        >
          Confirm Withdraw
        </button>
      </div>
    )}

    {/* Toggle Past Withdrawals */}
    <h3>Past Withdrawals</h3>
    <button onClick={toggleWithdrawals} className="toggle-withdrawals-btn">
      {showWithdrawals ? "Hide Past Withdrawals" : "Show Past Withdrawals"}
    </button>

    {showWithdrawals && (
      <ul>
        {withdrawals.length === 0 ? (
          <p>No withdrawals yet.</p>
        ) : (
          withdrawals.map((w) => (
            <li key={w.id} style={{ marginBottom: "12px", padding: "8px", border: "1px solid #ccc", borderRadius: "6px", backgroundColor: "#f9f9f9" }}>
              <div><strong>Owner:</strong> {w.ownerEmail || "N/A"}</div>
              <div><strong>Amount:</strong> ₱{Number(w.amount || 0).toFixed(2)}</div>
              <div>
                <strong>Status:</strong>{" "}
                <span style={{ cursor: "pointer", textDecoration: "underline" }}>
                  {w.status || "pending"}
                </span>
              </div>
              <div><strong>Method:</strong> {w.method || "N/A"}</div>
              <div><strong>Account Name:</strong> {w.accountName || "N/A"}</div>
              <div><strong>Phone:</strong> {w.phone || "N/A"}</div>

              <button
                style={{ marginTop: 6 }}
                onClick={async () => {
                  if (window.confirm("Remove this withdrawal?")) {
                    try {
                      await deleteDoc(doc(db, "withdrawals", w.id));
                      setWithdrawals(prev => prev.filter(item => item.id !== w.id));
                    } catch (err) {
                      console.error(err);
                      alert("Failed to remove withdrawal");
                    }
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    )}
  </section>
)}



 {/* MESSAGES */}
{activePage === "messages" && userRole === "owner" && (
  <section className="messages-owner">
    <h2>Messages</h2>
    <div className="messages-container">
      
      {/* Conversation List */}
      <div className="conversation-list">
        {conversationUsers.length === 0 ? (
          <p>No conversations.</p>
        ) : (
          conversationUsers.map(user => (
            <div
              key={user}
              className={`conversation-item ${selectedChat === user ? "active" : ""}`}
              onClick={() => setSelectedChat(user)}
            >
              {user}
            </div>
          ))
        )}
      </div>

      {/* Chat Window */}
      <div className="chat-window">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <h3>Chat with {selectedChat}</h3>
              <button onClick={() => handleDeleteConversation(selectedChat)}>🗑 Delete</button>
              <button onClick={() => setSelectedChat(null)}>✖ Close</button>
            </div>

            {/* Chat Messages */}
            <div className="chat-messages">
              {messages
                .filter(
                  m =>
                    (m.sender === ownerEmail && m.receiver === selectedChat) ||
                    (m.sender === selectedChat && m.receiver === ownerEmail)
                )
                .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
                .map(m => (
                  <div
                    key={m.id}
                    className={`chat-bubble ${m.sender === ownerEmail ? "sent" : "received"}`}
                  >
                    <p>{m.text}</p>
                    <small>
                      {m.createdAt?.toDate
                        ? m.createdAt.toDate().toLocaleTimeString()
                        : new Date().toLocaleTimeString()}
                    </small>
                  </div>
                ))}
            </div>

            {/* Message Input */}
            <div className="chat-input">
              <input
                type="text"
                placeholder="Type your message..."
                value={replyText[selectedChat] || ""}
                onChange={e =>
                  setReplyText(prev => ({ ...prev, [selectedChat]: e.target.value }))
                }
                onKeyDown={e => {
                  if (e.key === "Enter") handleReply(selectedChat);
                }}
              />
              <button onClick={() => handleReply(selectedChat)}>Send</button>
            </div>
          </>
        ) : (
          <p>Select a conversation to start chatting.</p>
        )}
      </div>
    </div>
  </section>
)}


       {activePage === "addrentalitem" && userRole === "owner" && (
  <section>
    <h2>Add Rental Item</h2>
    <form onSubmit={handleAddPost}>
      <div>
        <label>Property Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Price</label>
        <input
          type="number"
          value={formData.price}
          onChange={e => setFormData({ ...formData, price: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div>
        <label>Maximum Renters</label>
        <input
          type="number"
          min={1}
          value={formData.maxRenters || ""}
          onChange={e => setFormData({ ...formData, maxRenters: parseInt(e.target.value) })}
          required
        />
      </div>

      <div>
        <label>Upload Image</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => {
            const file = e.target.files[0];
            if (file) setFormData({ ...formData, imageFile: file });
          }}
          required
        />
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={formData.agreed}
            onChange={e => setFormData({ ...formData, agreed: e.target.checked })}
            required
          />
          I confirm the information is accurate.
        </label>
      </div>

      <button type="submit" disabled={!formData.agreed || loading}>
        {loading ? "Submitting..." : "Submit Rental Item"}
      </button>
    </form>
  </section>
)}

        {/* RENTAL ITEMS */}
        {activePage === "rentalitem" && userRole === "owner" && (
          <section className="rentalitem-owner">
            <h2>Rental Item</h2>
            {posts.length===0 ? <p>No rental items yet.</p> : posts.map(post=>(
              <div key={post.id} className="property-card">
                {post.imageUrl && <img src={post.imageUrl} alt={post.name} className="property-image"/>}
                <h3>{post.name}</h3>
                <p><strong>Price:</strong> ₱{post.price}</p>
                <p><strong>Status:</strong> {post.status}</p>
                <p><strong>Payment:</strong> {post.paymentStatus}</p>
                <div className="property-actions">
                  <button className="delete-btn" onClick={()=>handleDeletePost(post.id)}>🗑️ Delete</button>
                  {post.status==="pending" && post.paymentStatus==="Unpaid" && <button className="pay-now-btn" onClick={()=>handlePayNow(post.id)}>Pay Now</button>}
                </div>
              </div>
            ))}
          </section>
        )}



      
  </div>
</div>
  );
}
export default OwnerDashboard;
