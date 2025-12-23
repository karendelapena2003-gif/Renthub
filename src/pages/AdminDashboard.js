// src/pages/AdminDashboard.js
import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import "./AdminDashboard.css";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  where,
} from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { uploadToCloudinary } from "../cloudinary";
import { increment } from "firebase/firestore";

const AdminDashboard = ({ onLogout }) => {
  /* ---------------- profile / UI ---------------- */
  const [adminUser, setAdminUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("/default-profile.png");
  const [isEditing, setIsEditing] = useState(false);

  /* ---------------- core data ---------------- */
  const [properties, setProperties] = useState([]);
  const [filteredProperties, setFilteredProperties] = useState([]);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [propertyStats, setPropertyStats] = useState({ pending: 0, approved: 0, rejected: 0 });

  const [usersList, setUsersList] = useState([]); // owners + renters
  const [owners, setOwners] = useState([]);
  const [renters, setRenters] = useState([]);

  const [rentals, setRentals] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  /* ---------------- messages ---------------- */
  const [messages, setMessages] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [replyText, setReplyText] = useState({});

  /* ---------------- UI/navigation ---------------- */
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ---------------- modals / details ---------------- */
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [rentalModal, setRentalModal] = useState(null);
  const [rentalStatusEdit, setRentalStatusEdit] = useState("");

  /* ---------------- misc states that were missing ---------------- */
  const [gcashAccountName, setGcashAccountName] = useState("");
  const [gcashPhoneNumber, setGcashPhoneNumber] = useState("");
  const [expandedWithdrawal, setExpandedWithdrawal] = useState(null);
  const [rentalsByRenterState, setRentalsByRenterState] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const ownerId = auth.currentUser ? auth.currentUser.uid : null;

  /* ---------------- initial admin ---------------- */
  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      setAdminUser(u);
      setDisplayName(u.displayName || "");
      setPhotoPreview(u.photoURL || "/default-profile.png");
    }
  }, []);

  /* ---------------- realtime listeners ---------------- */
  useEffect(() => {
    setLoading(true);

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      setUsersList(list);
      setOwners(list.filter((u) => u.role === "owner"));
      setRenters(list.filter((u) => u.role === "renter"));
    });

    const unsubProps = onSnapshot(collection(db, "properties"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProperties(arr);
      setFilteredProperties(propertyFilter === "all" ? arr : arr.filter((p) => (p.status || "").toLowerCase() === propertyFilter));
      const pending = arr.filter((p) => (p.status || "").toLowerCase() === "pending").length;
      const approved = arr.filter((p) => (p.status || "").toLowerCase() === "approved").length;
      const rejected = arr.filter((p) => (p.status || "").toLowerCase() === "rejected").length;
      setPropertyStats({ pending, approved, rejected });
    });

    const rentalsQ = query(collection(db, "rentals"), orderBy("createdAt", "desc"));
    const unsubRentals = onSnapshot(rentalsQ, (snap) => setRentals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

    const unsubWithdrawals = onSnapshot(collection(db, "withdrawals"), (snap) => setWithdrawals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

    // Messages listener
    const unsubMessages = onSnapshot(collection(db, "messages"), (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });

    setLoading(false);
    return () => {
      unsubUsers();
      unsubProps();
      unsubRentals();
      unsubWithdrawals();
      unsubMessages();
    };
  }, [propertyFilter]);

  /* ---------------- helper util functions ---------------- */
  const formatDate = (val) => {
    if (!val) return "N/A";
    try {
      if (typeof val.toDate === "function") return val.toDate().toLocaleString();
      return new Date(val).toLocaleString();
    } catch {
      return "N/A";
    }
  };

  const handlePhotoSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSaveProfile = async () => {
    if (!adminUser) return;
    if (!displayName.trim()) return alert("Name required");
    setLoading(true);
    try {
      let photoURL = adminUser.photoURL || "";
      if (photoFile) {
        const uploaded = await uploadToCloudinary(photoFile, "renthub/profiles");
        photoURL = uploaded?.secure_url || uploaded || photoURL;
      }

      // Update Firebase auth
      try {
        await updateProfile(auth.currentUser, { displayName, photoURL });
      } catch (e) {
        console.warn("updateProfile failed:", e);
      }

      // Update users collection
      try {
        await updateDoc(doc(db, "users", adminUser.uid), { displayName, photoURL, updatedAt: serverTimestamp() });
      } catch {}

      // Update GCash info in settings/gcash
      try {
        await updateDoc(doc(db, "settings", "gcash"), {
          accountName: gcashAccountName,
          phoneNumber: gcashPhoneNumber,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        // If document doesn't exist, create it
        await setDoc(doc(db, "settings", "gcash"), {
          accountName: gcashAccountName,
          phoneNumber: gcashPhoneNumber,
          updatedAt: serverTimestamp()
        });
      }

      setAdminUser({ ...adminUser, displayName, photoURL });
      setIsEditing(false);
      setPhotoFile(null);
      alert("Profile updated");
    } catch (err) {
      console.error(err);
      alert("Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const openUserDetails = (user) => {
    setSelectedUser(user);
    setShowUserDetails(true);
  };
  const closeUserDetails = () => {
    setSelectedUser(null);
    setShowUserDetails(false);
  };

  const updatePropertyStatus = async (propertyId, newStatus) => {
    try {
      await updateDoc(doc(db, "properties", propertyId), { status: newStatus, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      alert("Failed to update property");
    }
  };

  
  /* ---------------- rentals grouping & modal helpers ---------------- */
  const rentalsByRenter = usersList
    .filter((u) => u.role === "renter")
    .map((r) => {
      const items = rentals.filter((t) => t.renterEmail === r.email);
      return { renter: r, items, total: items.reduce((s, it) => s + Number(it.price || 0), 0) };
    })
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    // keep rentalsByRenterState in sync (optional)
    setRentalsByRenterState(rentalsByRenter);
  }, [usersList, rentals]);

  useEffect(() => {
    if (!ownerId) return;
    // listen to owner doc if exists (safe-guard)
    try {
      const ownerRef = doc(db, "owners", ownerId);
      const unsubscribe = onSnapshot(ownerRef, (docSnap) => {
        if (docSnap.exists()) {
          setTotalEarnings(docSnap.data().totalEarnings || 0);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      // owners collection might not exist; ignore
    }
  }, [ownerId]);

  const [showProof, setShowProof] = useState(false);


const openRentalModal = (rental, renter) => {
  setRentalModal({
    ...rental,
    dailyRate: rental.dailyRate || rental.price || 0,
    rentalDays: rental.rentalDays || 1,
    serviceFee: rental.serviceFee || 0,
    deliveryFee: rental.deliveryFee || 0,
    totalAmount: rental.totalAmount || rental.totalPrice || rental.price || 0,
    renterPhoneNumber: rental.renterPhoneNumber || rental.renterPhone || rental.phoneNumber || renter?.phoneNumber || "N/A",
    renterName: rental.renterName || rental.renterDisplayName || renter?.displayName || rental.renterEmail || "N/A",
  });
};


  const closeRentalModal = () => {
    setRentalModal(null);
    setRentalStatusEdit("");
  };

  const updateRentalStatus = async (rentalId, status) => {
    if (!rentalId || !status) return;
    try {
      const rentalRef = doc(db, "rentals", rentalId);
      const rentalSnap = await getDoc(rentalRef);
      if (!rentalSnap.exists()) return console.error("Rental not found");

      const rentalData = rentalSnap.data();
      await updateDoc(rentalRef, { status, updatedAt: serverTimestamp() });

      // If Completed, update owner's earnings (if owners collection exists)
      if (status === "Completed") {
        let ownerRef = null;
        let ownerData = null;

        if (rentalData.ownerId) {
          ownerRef = doc(db, "owners", rentalData.ownerId);
          const ownerSnap = await getDoc(ownerRef);
          if (!ownerSnap.exists()) {
            ownerRef = null;
          } else ownerData = ownerSnap.data();
        }

        if (!ownerRef && rentalData.ownerEmail) {
          const ownerQuery = query(collection(db, "owners"), where("email", "==", rentalData.ownerEmail));
          const ownerSnap = await getDocs(ownerQuery);
          if (!ownerSnap.empty) {
            ownerRef = ownerSnap.docs[0].ref;
            ownerData = ownerSnap.docs[0].data();
          }
        }

        if (ownerRef) {
          const earningsToAdd = Number(rentalData.price || 0);
          await updateDoc(ownerRef, {
            earnings: (ownerData?.earnings || 0) + earningsToAdd,
          });
        }
      }
    } catch (err) {
      console.error("Error updating rental status:", err);
    }
  };

  const removeRental = async (rentalId) => {
    // update local grouping state first
    setRentalsByRenterState((prev) =>
      prev
        .map((group) => ({
          ...group,
          items: group.items.filter((it) => it.id !== rentalId),
          total: group.items.filter((it) => it.id !== rentalId).reduce((s, it) => s + Number(it.price || 0), 0),
        }))
        .filter((group) => group.items.length > 0)
    );

    closeRentalModal();

    try {
      const rentalRef = doc(db, "rentals", rentalId);
      await deleteDoc(rentalRef);
      console.log(`Rental ${rentalId} removed`);
    } catch (err) {
      console.error("Error removing rental:", err);
    }
  };

  /* ---------------- gcash settings fetch ---------------- */
  useEffect(() => {
    const fetchGcashInfo = async () => {
      try {
        const docRef = doc(db, "settings", "gcash");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setGcashAccountName(data.accountName || "");
          setGcashPhoneNumber(data.phoneNumber || "");
        }
      } catch (e) {
        // ignore fetch errors
      }
    };
    fetchGcashInfo();
  }, []);

  /* ---------------- remove property helper ---------------- */
  const handleRemoveProperty = async () => {
    if (!selectedProperty) return;
    try {
      const confirmDelete = window.confirm(`Are you sure you want to remove "${selectedProperty.name || 'this property'}"?`);
      if (!confirmDelete) return;

      await deleteDoc(doc(db, "properties", selectedProperty.id));

      setFilteredProperties((prev) => prev.filter((p) => p.id !== selectedProperty.id));
      setSelectedProperty(null);
      alert("✅ Property removed successfully!");
    } catch (err) {
      console.error("Error removing property:", err);
      alert("❌ Failed to remove property: " + err.message);
    }
  };

  // placeholder state used by remove property flow (keeps parity with your earlier code)
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [propertyToRemove, setPropertyToRemove] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);

  useEffect(() => {
    if (!showRemoveModal) return;
    const timer = setTimeout(() => {
      setShowRemoveModal(false);
      setPropertyToRemove(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [showRemoveModal]);


  const [adminMessages, setAdminMessages] = useState([]);
const [selectedOwner, setSelectedOwner] = useState(null);
const [adminReplyText, setAdminReplyText] = useState({});
const adminEmail = adminUser?.email;

// Listen for admin-owner messages only
useEffect(() => {
  if (!adminEmail) return;

  const unsub = onSnapshot(collection(db, "messages"), (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter only messages involving admin & owners
    const filtered = all.filter(
      m =>
        (m.sender === adminEmail && m.receiverRole === "owner") ||
        (m.receiver === adminEmail && m.senderRole === "owner")
    );

    // Sort newest first
    filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    setAdminMessages(filtered);
  });

  return () => unsub();
}, [adminEmail]);

// Send message from admin to owner
const handleAdminSendMessage = async (ownerEmail) => {
  const text = adminReplyText[ownerEmail]?.trim();
  if (!text) return alert("Message is empty");

  await addDoc(collection(db, "messages"), {
    sender: adminEmail,
    receiver: ownerEmail,
    senderRole: "admin",
    receiverRole: "owner",
    text,
    createdAt: serverTimestamp(),
  });

  setAdminReplyText(prev => ({ ...prev, [ownerEmail]: "" }));
};


const handleAdminReply = async (ownerEmail) => {
  const text = adminReplyText[ownerEmail]?.trim();
  if (!text) return alert("Message empty");

  await addDoc(collection(db, "messages"), {
    sender: adminEmail,
    receiver: ownerEmail,
    text,
    createdAt: serverTimestamp(),
  });

  setAdminReplyText(prev => ({ ...prev, [ownerEmail]: "" }));
};
// Delete entire conversation with owner
const handleAdminDeleteConversation = async (ownerEmail) => {
  if (!window.confirm(`Delete conversation with ${ownerEmail}?`)) return;

  const snap = await getDocs(collection(db, "messages"));

  const convo = snap.docs.filter(
    d =>
      (d.data().sender === adminEmail && d.data().receiver === ownerEmail) ||
      (d.data().sender === ownerEmail && d.data().receiver === adminEmail)
  );

  await Promise.all(convo.map(d => deleteDoc(doc(db, "messages", d.id))));

  setAdminMessages(prev =>
    prev.filter(
      m =>
        !(m.sender === ownerEmail && m.receiver === adminEmail) &&
        !(m.sender === adminEmail && m.receiver === ownerEmail)
    )
  );

  setSelectedOwner(null);
};

// Send message from Users panel to owner
const handleSendMessage = async (ownerEmail) => {
  const text = replyText[ownerEmail]?.trim();
  if (!text) return alert("Cannot send empty message");

  try {
    await addDoc(collection(db, "messages"), {
      sender: adminEmail,        // ADMIN email
      receiver: ownerEmail,      // Always the owner's email
      senderRole: "admin",
      receiverRole: "owner",
      text,
      createdAt: serverTimestamp(),
    });

    // Clear input after sending
    setReplyText(prev => ({ ...prev, [ownerEmail]: "" }));

  } catch (err) {
    console.error(err);
    alert("Failed to send message");
  }
};
// ---------------- WITHDRAWAL APPROVAL ----------------
const approveWithdrawal = async (withdrawal) => {
  const { id, ownerEmail, amount } = withdrawal;
  try {
    // Update withdrawal in Firestore
    await updateDoc(doc(db, "withdrawals", id), {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy: adminEmail,
    });

    // Automatically notify owner
    await addDoc(collection(db, "messages"), {
      sender: adminEmail,
      receiver: ownerEmail,
      senderRole: "admin",
      receiverRole: "owner",
      text: `Your withdrawal of ₱${amount} has been approved successfully.`,
      createdAt: serverTimestamp(),
    });

    alert(`Withdrawal of ₱${amount} approved and owner notified.`);

  } catch (err) {
    console.error(err);
    alert("Failed to approve withdrawal");
  }
};

const rejectWithdrawal = async (withdrawal) => {
  const { id } = withdrawal;
  if (!window.confirm("Are you sure you want to reject this withdrawal?")) return;

  try {
    await updateDoc(doc(db, "withdrawals", id), {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: adminEmail,
    });

    alert("Withdrawal rejected successfully");
  } catch (err) {
    console.error(err);
    alert("Failed to reject withdrawal");
  }
};

// ✅ AUTO CLOSE SIDEBAR ON PAGE CHANGE (MOBILE ONLY)
useEffect(() => {
  if (window.innerWidth <= 768) {
    setSidebarOpen(false);
  }
}, [activePage]);

// Blocklist state
const [activeBlocklist, setActiveBlocklist] = useState(false);
const [blockedUsers, setBlockedUsers] = useState([]); // list of blocked user UIDs
const [showDetails, setShowDetails] = useState(false);

// Block/Unblock function
const handleBlockUser = (uid) => {
  setBlockedUsers(prev => {
    if (prev.includes(uid)) {
      return prev.filter(id => id !== uid); // Unblock
    } else {
      return [...prev, uid]; // Block
    }
  });
};

  /* ---------------- render ---------------- */
  return (
  <div className="dashboard-container admin-dashboard">
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
    userType="admin"
    activePage={activePage}
    setActivePage={setActivePage}
    onLogout={onLogout}
    isOpen={sidebarOpen}
    closeSidebar={() => setSidebarOpen(false)}
  />

      <div className="main-dashboard">

{/* ---------------- ADMIN PROFILE ---------------- */}
{activePage === "adminProfile" && (
  <section className="profile-section">
    <h2>Admin Profile</h2>
    {adminUser ? (
      <div className="profile-container">
        {/* ---------------- PROFILE PREVIEW ---------------- */}
        <div className="profile-preview">
          <img src={photoPreview} alt="Profile" className="profile-img" />
          <div className="profile-info">
            <p><strong>Name:</strong> {adminUser.displayName || "No Name"}</p>
            <p><strong>Email:</strong> {adminUser.email}</p>
            <p><strong>Joined:</strong> {adminUser.metadata?.creationTime ? new Date(adminUser.metadata.creationTime).toLocaleDateString() : "N/A"}</p>
          </div>
        </div>

        {/* ---------------- ACTION BUTTONS ---------------- */}
        {!isEditing ? (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setIsEditing(true)}>Edit Profile</button>
            <button onClick={() => setActiveBlocklist(true)}>View Blocklist</button>
          </div>
        ) : (
          <div className="profile-form">
            <label>Full Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

            <label>Profile Photo</label>
            <input type="file" accept="image/*" onChange={handlePhotoSelect} />

            <label>GCash Account Name</label>
            <input type="text" value={gcashAccountName} onChange={(e) => setGcashAccountName(e.target.value)} />

            <label>GCash Phone Number</label>
            <input type="text" value={gcashPhoneNumber} onChange={(e) => setGcashPhoneNumber(e.target.value)} />

            <div style={{ marginTop: 12 }}>
              <button onClick={handleSaveProfile} disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setPhotoFile(null);
                  setPhotoPreview(adminUser.photoURL || "/default-profile.png");
                  setDisplayName(adminUser.displayName || "");
                }}
              >
                Cancel
              </button>
              <button onClick={() => setActiveBlocklist(true)}>View Blocklist</button>
            </div>
          </div>
        )}

        {/* ---------------- BLOCKLIST MODAL ---------------- */}
        {activeBlocklist && (
          <div className="blocklist-modal">
            <div className="blocklist-modal-content">
              <button className="close-btn" onClick={() => setActiveBlocklist(false)}>✖ Close</button>
              <h3>Blocked Users</h3>
              {blockedUsers.length === 0 ? (
                <p>No users are blocked.</p>
              ) : (
                blockedUsers.map(uid => {
                  const user = usersList.find(u => u.uid === uid);
                  if (!user) return null;
                  return (
                    <div key={uid} className="blocked-user-item">
                      <span>{user.email} ({user.role})</span>
                      <button onClick={() => handleBlockUser(uid)}>Unblock</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    ) : (
      <p>Loading profile...</p>
    )}
  </section>
)}



        {/* Dashboard overview */}
        {activePage === "dashboard" && (
          <section className="overview-section">
            <h2>Admin Dashboard Overview</h2>
            <div className="overview-stats">
              <div className="stat-card" onClick={() => setActivePage("properties")}>
                <h3>Properties</h3>
                <p>Total: {properties.length}</p>
                <small>Pending: {propertyStats.pending} · Approved: {propertyStats.approved} · Rejected: {propertyStats.rejected}</small>
              </div>
              <div className="stat-card" onClick={() => setActivePage("users")}>
                <h3>Users</h3>
                <p>Total: {owners.length + renters.length}</p>
                <small>Owners: {owners.length} · Renters: {renters.length}</small>
              </div>
              <div className="stat-card" onClick={() => setActivePage("rentlist")}>
                <h3>Rent List</h3>
                <p>{rentals.length}</p>
              </div>
              <div className="stat-card" onClick={() => setActivePage("transactions")}>
                <h3>Transactions</h3>
                <p>{withdrawals.length}</p>
              </div>
              <div className="stat-card" onClick={() => setActivePage("messages")}>
                <h3>Messages</h3>
                <p>{new Set(messages.flatMap((m) => m.participants || [])).size}</p>
              </div>
            </div>
          </section>
        )}

        {/* Properties */}
        {activePage === "properties" && (
          <section className="properties-section">
            <h2 className="properties-title">🏠 Properties</h2>

            {loading ? (
              <p>Loading properties...</p>
            ) : (
              <>
                <div className="filter-section">
                  <label>Filter by status:</label>
                  <select
                    value={propertyFilter}
                    onChange={(e) => setPropertyFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="properties-list">
                  {filteredProperties.map((p) => (
                    <div key={p.id} className="property-card">
                      <div className="property-image-wrapper">
                        <img src={p.imageUrl || "/no-image.png"} alt={p.name} className="property-image" />
                      </div>

                      <div className="property-main">
                        <h3>{p.name}</h3>
                        <p>Owner: {p.ownerName || p.ownerEmail || "Unknown"}</p>
                        <p>Price: {p.price ? `₱${p.price}` : "N/A"}</p>
                        <p>Added: {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : formatDate(p.createdAt)}</p>
                        <p>Status: {p.status || "N/A"}</p>

                        <div className="status-badges">
                          <button onClick={() => updatePropertyStatus(p.id, "pending")}>Pending</button>
                          <button onClick={() => updatePropertyStatus(p.id, "approved")}>Approve</button>
                          <button onClick={() => updatePropertyStatus(p.id, "rejected")}>Reject</button>
                        </div>

                        <button
                          className="remove-btn"
                          onClick={async () => {
                            const confirmDelete = window.confirm(`Are you sure you want to remove "${p.name}"?`);
                            if (!confirmDelete) return;
                            try {
                              await deleteDoc(doc(db, "properties", p.id));
                              setProperties((prev) => prev.filter((prop) => prop.id !== p.id));
                              setFilteredProperties((prev) => prev.filter((prop) => prop.id !== p.id));
                              alert("✅ Property removed successfully!");
                            } catch (err) {
                              console.error(err);
                              alert("❌ Failed to remove property: " + err.message);
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

    {activePage === "users" && (
  <section className="users-section">
    <h2>Users</h2>
    <div className="users-container">
      <div className="users-list">
        <h3>Owners ({owners.length})</h3>
        {owners.map(o => (
          <div
            key={o.uid}
            className={`user-item ${selectedUser?.uid === o.uid ? "active" : ""}`}
            onClick={() => setSelectedUser(o)}
          >
            <strong>{o.email}</strong>
          </div>
        ))}

        <h3>Renters ({renters.length})</h3>
        {renters.map(r => (
          <div
            key={r.uid}
            className={`user-item ${selectedUser?.uid === r.uid ? "active" : ""}`}
            onClick={() => setSelectedUser(r)}
          >
            <strong>{r.email}</strong>
          </div>
        ))}
      </div>

      {selectedUser && (
        <div className="user-details-panel">
          <div className="panel-header">
            <h3>{selectedUser.email}</h3>
            <button onClick={() => setShowDetails(prev => !prev)}>
              {showDetails ? "Hide" : "Show"}
            </button>
            <button onClick={() => handleBlockUser(selectedUser.uid)}>
              {blockedUsers.includes(selectedUser.uid) ? "Unblock" : "Block"}
            </button>
            <button onClick={() => setSelectedUser(null)}>✖</button>
          </div>

          {showDetails && (
            <div className="user-details-content">
              <p><strong>Email:</strong> {selectedUser.email}</p>
              <p><strong>Joined:</strong> {selectedUser.createdAt?.toDate ? selectedUser.createdAt.toDate().toLocaleString() : formatDate(selectedUser.createdAt)}</p>
              <p><strong>Role:</strong> {selectedUser.role}</p>

              {selectedUser.role === "owner" && (
                <>
                  <h4>Owner's Properties</h4>
                  {properties.filter(p => p.ownerEmail === selectedUser.email).length === 0 ? (
                    <p>No properties</p>
                  ) : (
                    properties.filter(p => p.ownerEmail === selectedUser.email).map(p => (
                      <div key={p.id} className="property-card small">
                        <img src={p.imageUrl || "/no-image.png"} alt={p.name} />
                        <div>
                          <strong>{p.name}</strong>
                          <div>Status: {p.status}</div>
                          <div>Added: {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : formatDate(p.createdAt)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              <div className="message-input">
                <input
                  type="text"
                  placeholder={`Type message to ${selectedUser.role}...`}
                  value={replyText[selectedUser.email] || ""}
                  onChange={e => setReplyText(prev => ({ ...prev, [selectedUser.email]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleSendMessage(selectedUser.email)}
                />
                <button onClick={() => handleSendMessage(selectedUser.email)}>Send</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  </section>
)}


        {/* Rent List */}
        {activePage === "rentlist" && (
          <section className="admin-rentlist-section">
            <h2>Rent List</h2>

            {rentalsByRenter.length === 0 ? (
              <p>No rentals yet.</p>
            ) : (
              rentalsByRenter.map((group) => (
                <div key={group.renter.uid || group.renter.email} className="admin-renter-group">
                  <div className="admin-renter-total">
                    <strong>Total Rentals:</strong> ₱{group.total}
                  </div>

                  <div className="admin-renter-items">
                    {group.items.map((it) => (
                      <div key={it.id} className="admin-rental-card">
                        <img src={it.propertyImage || it.imageUrl || it.imageFile || "/no-image.png"} alt={it.propertyName || "Property"} className="admin-rental-image" />

                        <div className="admin-rental-details">
                          <div className="admin-rental-name"><strong>{it.propertyName}</strong></div>
                          <div className="admin-rental-price">Price: ₱{it.dailyRate || it.price || 0}</div>
                          <div className="admin-rental-ordered">Ordered: {it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString() : formatDate(it.createdAt)}</div>
                          <div className="admin-rental-status">
                            Status:
                            <button onClick={() => openRentalModal(it, group)} className="admin-rental-status-btn">{it.status || "N/A"}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

       {/* Rental Modal */}
{rentalModal && (
  <div className="admin-rental-modal">
    <div className="admin-rental-modal-content">
      <button onClick={closeRentalModal} className="admin-modal-close">✖</button>
      <h3 className="rental-modal-title">{rentalModal?.propertyName || "N/A"}</h3>

      <img
        src={rentalModal?.propertyImage || rentalModal?.imageUrl || rentalModal?.imageFile || "/no-image.png"}
        alt={rentalModal?.propertyName || "Property"}
        className="rental-modal-image"
      />

      <div className="rental-modal-info">
        <div className="rental-modal-item"><strong>Owner Email:</strong> {rentalModal?.ownerEmail || "N/A"}</div>
        <div className="rental-modal-item"><strong>Renter Name:</strong> {rentalModal?.renterName || rentalModal?.renterDisplayName || rentalModal?.renterEmail || "N/A"}</div>
        <div className="rental-modal-item"><strong>Renter Phone:</strong> {rentalModal?.renterPhoneNumber || rentalModal?.phoneNumber || "N/A"}</div>
        <div className="rental-modal-item"><strong>Renter Email:</strong> {rentalModal?.renterEmail || "N/A"}</div>
        <div className="rental-modal-item"><strong>Address:</strong> {rentalModal?.address || "N/A"}</div>
        <div className="rental-modal-item"><strong>Place Name:</strong> {rentalModal?.placeName || "N/A"}</div>
        <div className="rental-modal-item"><strong>Postal Code:</strong> {rentalModal?.postalCode || "N/A"}</div>
        <div className="rental-modal-item"><strong>Province:</strong> {rentalModal?.province || "N/A"}</div>
        <div className="rental-modal-item"><strong>Payment Method:</strong> {rentalModal?.paymentMethod || "N/A"}</div>

        {rentalModal?.paymentMethod === "GCash" && rentalModal?.proofUrl && (
          <>
            <button
              onClick={() => setShowProof(!showProof)}
              className="rental-modal-proof-toggle-btn"
            >
              {showProof ? "Hide Proof" : "Show Proof"}
            </button>
            {showProof && (
              <div className="rental-modal-payment-proof">
                <img src={rentalModal?.proofUrl} alt="Proof" className="rental-modal-proof-image" />
              </div>
            )}
          </>
        )}

        {/* Rental Breakdown */}
        <div className="rental-modal-item"><strong>Daily Rate:</strong> ₱{rentalModal?.dailyRate || rentalModal?.price || 0}</div>
        <div className="rental-modal-item"><strong>Rental Days:</strong> {rentalModal?.rentalDays || 0}</div>
        <div className="rental-modal-item"><strong>Service Fee:</strong> ₱{rentalModal?.serviceFee || 0}</div>
        <div className="rental-modal-item"><strong>Delivery Fee:</strong> ₱{rentalModal?.deliveryFee || 0}</div>
        <div className="rental-modal-item"><strong>Total Amount:</strong> ₱{rentalModal?.totalAmount || rentalModal?.totalPrice || 0}</div>
      </div>

      <label className="rental-modal-label">Update Status:</label>
      <select
        value={rentalStatusEdit}
        onChange={(e) => setRentalStatusEdit(e.target.value)}
        className="rental-modal-select"
      >
        <option value="">--Select--</option>
        <option value="To Deliver">To Deliver</option>
        <option value="To Receive">To Receive</option>
        <option value="Completed">Completed</option>
        <option value="Returned">Returned</option>
        <option value="Cancelled">Cancelled</option>
      </select>

      <div className="rental-modal-actions">
        <button onClick={() => updateRentalStatus(rentalModal?.id, rentalStatusEdit)} className="rental-modal-update-btn">Update</button>
        <button onClick={() => removeRental(rentalModal?.id)} className="rental-modal-remove-btn">Remove</button>
        <button onClick={closeRentalModal} className="rental-modal-close-btn">Close</button>
      </div>
    </div>
  </div>
)}

        {/* Transactions */}
        {activePage === "transactions" && (
          <section className="transactions-section">
            <h2>Owner Withdrawals</h2>
            {withdrawals.length === 0 ? (
              <p>No withdrawals yet.</p>
            ) : (
              withdrawals.map((w) => (
                <div key={w.id} className="withdrawal-card">
                  <div className="withdrawal-owner">
                    <strong>Owner:</strong> {w.ownerEmail || "N/A"}
                  </div>

                  <div className="withdrawal-amount">
                    <strong>Amount:</strong> ₱{Number(w.amount || 0).toFixed(2)}
                  </div>

                  <div className="withdrawal-status">
                    <strong>Status:</strong>{" "}
                    <span className="withdrawal-status-toggle" onClick={() => setExpandedWithdrawal(expandedWithdrawal === w.id ? null : w.id)}>
                      {w.status || "pending"}
                    </span>
                  </div>

                  {expandedWithdrawal === w.id && (
                    <div className="withdrawal-expanded">
                      <div><strong>Payment Method:</strong> {w.method || "N/A"}</div>
                      <div><strong>Account Name:</strong> {w.accountName || "N/A"}</div>
                      <div><strong>Phone Number:</strong> {w.phone || "N/A"}</div>

                      {w.status === "pending" && (
                        <div className="withdrawal-actions">
                          <label>
                            Confirm Amount:
                            <input
                              type="number"
                              value={w.confirmAmount ?? w.amount}
                              onChange={(e) => {
                                const updatedAmount = Number(e.target.value);
                                setWithdrawals((prev) => prev.map((item) => (item.id === w.id ? { ...item, confirmAmount: updatedAmount } : item)));
                              }}
                              className="withdrawal-confirm-input"
                            />
                          </label>

                          <button onClick={() => approveWithdrawal(w)} className="withdrawal-approve-btn">Approve</button>
                          <button onClick={() => rejectWithdrawal(w)} className="withdrawal-reject-btn">Reject</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        )}

      {activePage === "messages" && (
  <div className="admin-messages-page">
    <h1>Admin Messages</h1>
    <div className="admin-messages-container">
      {/* Conversation List */}
      <div className="conversation-list">
        <h3>Owners</h3>
        {Array.from(new Set(adminMessages.map(m => m.sender === adminEmail ? m.receiver : m.sender)))
          .map(owner => (
            <div
              key={owner}
              className={`conversation-item ${selectedOwner === owner ? "active" : ""}`}
              onClick={() => setSelectedOwner(owner)}
            >
              {owner} {/* Show owner email */}
            </div>
        ))}
      </div>

      {/* Chat Window */}
      <div className="chat-window">
        {selectedOwner ? (
          <>
            <div className="chat-header">
              <h3>Chat with {selectedOwner}</h3>
              <button onClick={() => handleAdminDeleteConversation(selectedOwner)}>🗑 Delete</button>
              <button onClick={() => setSelectedOwner(null)}>✖ Close</button>
            </div>

            <div className="chat-messages">
              {adminMessages
                .filter(m => m.sender === selectedOwner || m.receiver === selectedOwner)
                .sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
                .map(m => (
                  <div key={m.id} className={`chat-bubble ${m.sender === adminEmail ? "sent" : "received"}`}>
                    <p>{m.text}</p>
                    <small>{m.sender} | {m.createdAt?.toDate?.().toLocaleTimeString()}</small>
                  </div>
              ))}
            </div>

            <div className="chat-input">
              <input
                type="text"
                placeholder="Type a message..."
                value={adminReplyText[selectedOwner] || ""}
                onChange={e => setAdminReplyText(prev => ({ ...prev, [selectedOwner]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleAdminSendMessage(selectedOwner)}
              />
              <button onClick={() => handleAdminSendMessage(selectedOwner)}>Send</button>
            </div>
          </>
        ) : (
          <p>Select an owner to view messages</p>
        )}
      </div>
    </div>
  </div>
)}     </div>
    </div>
  );
};

export default AdminDashboard;
