// src/pages/AdminDashboard.js
import React, { useState, useEffect, useMemo } from "react";
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
  const [overdueRentals, setOverdueRentals] = useState([]);

  /* ---------------- messages ---------------- */
  const [messages, setMessages] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [replyText, setReplyText] = useState({});
  const [messageSearch, setMessageSearch] = useState("");
  const [lastReadByOwner, setLastReadByOwner] = useState({}); // per-owner last read timestamp
  const [showMessageSettings, setShowMessageSettings] = useState(false);
  const [showTransactionSettings, setShowTransactionSettings] = useState(false);
  const [userPhotos, setUserPhotos] = useState({}); // Store user profile photos

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

  /* ---------------- toast notifications ---------------- */
  const [toastMessage, setToastMessage] = useState("");

  // Backfill missing displayName/photoURL in users collection using owners/renters docs
  const backfillUsersProfileData = async (arr) => {
    const toFix = arr.filter((u) => !u.displayName || !u.photoURL);
    await Promise.all(
      toFix.map(async (u) => {
        const sourceCol = u.role === "owner" ? "owners" : "renters";
        try {
          const snap = await getDoc(doc(db, sourceCol, u.uid));
          if (!snap.exists()) return;
          const data = snap.data();
          const update = {};
          if (!u.displayName && data.displayName) update.displayName = data.displayName;
          if (!u.photoURL && data.photoURL) update.photoURL = data.photoURL;
          if (Object.keys(update).length === 0) return;
          update.updatedAt = serverTimestamp();
          await setDoc(doc(db, "users", u.uid), update, { merge: true });
        } catch (e) {
          console.warn("backfillUsersProfileData failed for", u.uid, e);
        }
      })
    );
  };

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
    // Only allow admin email to access these listeners
    const currentEmail = auth.currentUser?.email;
    if (currentEmail !== "admin@gmail.com") {
      console.warn("Non-admin trying to access admin dashboard");
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        setUsersList(list);
        setOwners(list.filter((u) => u.role === "owner"));
        setRenters(list.filter((u) => u.role === "renter"));
        setBlockedUsers(list.filter((u) => u.blocked || u.deleted).map((u) => u.uid));

        // Auto-fix missing name/photo using owner/renter docs so admin sees latest profile
        backfillUsersProfileData(list);
      },
      (err) => {
        console.error("Firestore: users read denied", err);
        setToastMessage("❌ Cannot load users (check admin permissions)");
        setTimeout(() => setToastMessage(""), 3000);
      }
    );

    const unsubProps = onSnapshot(collection(db, "properties"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter(p => !p.removedByAdmin); // Hide removed properties from admin view
      setProperties(arr);
      setFilteredProperties(propertyFilter === "all" ? arr : arr.filter((p) => (p.status || "").toLowerCase() === propertyFilter));
      const pending = arr.filter((p) => (p.status || "").toLowerCase() === "pending").length;
      const approved = arr.filter((p) => (p.status || "").toLowerCase() === "approved").length;
      const rejected = arr.filter((p) => (p.status || "").toLowerCase() === "rejected").length;
      setPropertyStats({ pending, approved, rejected });
    });

    const rentalsQ = query(collection(db, "rentals"), orderBy("createdAt", "desc"));
    const unsubRentals = onSnapshot(rentalsQ, (snap) => {
      const allRentals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRentals(allRentals);
      
      // Check for overdue rentals
      const now = new Date();
      const overdue = allRentals.filter((rental) => {
        if (rental.status !== "Completed") return false;
        
        const dateRented = rental.dateRented || rental.createdAt;
        if (!dateRented) return false;
        
        const rentedDate = dateRented.toDate ? dateRented.toDate() : new Date(dateRented);
        const rentalDays = rental.rentalDays || 1;
        const dueDate = new Date(rentedDate);
        dueDate.setDate(dueDate.getDate() + rentalDays);
        
        return now > dueDate;
      });
      
      setOverdueRentals(overdue);
    });

    const unsubWithdrawals = onSnapshot(
      collection(db, "withdrawals"),
      (snap) => setWithdrawals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("Firestore: withdrawals read denied", err);
        setToastMessage("❌ Cannot load withdrawals (check admin permissions)");
        setTimeout(() => setToastMessage(""), 3000);
      }
    );

    // Messages listener
    const unsubMessages = onSnapshot(
      collection(db, "messages"),
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
      },
      (err) => {
        console.error("Firestore: messages read denied", err);
        setToastMessage("❌ Cannot load messages (check admin permissions)");
        setTimeout(() => setToastMessage(""), 3000);
      }
    );

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

  // Calculate days overdue for a rental
  const getDaysOverdue = (rental) => {
    const now = new Date();
    const dateRented = rental.dateRented || rental.createdAt;
    if (!dateRented) return 0;
    
    const rentedDate = dateRented.toDate ? dateRented.toDate() : new Date(dateRented);
    const rentalDays = rental.rentalDays || 1;
    const dueDate = new Date(rentedDate);
    dueDate.setDate(dueDate.getDate() + rentalDays);
    
    const diffTime = now - dueDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Get due date for rental
  const getDueDate = (rental) => {
    const dateRented = rental.dateRented || rental.createdAt;
    if (!dateRented) return null;
    
    const rentedDate = dateRented.toDate ? dateRented.toDate() : new Date(dateRented);
    const rentalDays = rental.rentalDays || 1;
    const dueDate = new Date(rentedDate);
    dueDate.setDate(dueDate.getDate() + rentalDays);
    return dueDate;
  };

  // Send overdue notification to renter
  const sendOverdueNotification = async (rental) => {
    try {
      await addDoc(collection(db, "messages"), {
        sender: adminEmail || "admin@renthub.com",
        receiver: rental.renterEmail,
        participants: [(adminEmail || "admin@renthub.com").toLowerCase(), rental.renterEmail.toLowerCase()],
        text: `⚠️ OVERDUE NOTICE: Your rental "${rental.propertyName}" is ${getDaysOverdue(rental)} day(s) overdue. Please return the item immediately with proof of return to avoid penalties.`,
        createdAt: serverTimestamp(),
        isSystemMessage: true,
      });
      
      setToastMessage("✅ Overdue notification sent");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error("Failed to send notification:", err);
      setToastMessage("❌ Failed to send notification");
      setTimeout(() => setToastMessage(""), 2500);
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
    if (!displayName.trim()) {
      setToastMessage("⚠️ Name is required");
      setTimeout(() => setToastMessage(""), 2500);
      return;
    }
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

      // Update users collection with COMPLETE profile data including email & role
      try {
        await updateDoc(doc(db, "users", adminUser.uid), { 
          email: adminUser.email,
          displayName, 
          photoURL, 
          role: "admin",
          updatedAt: serverTimestamp() 
        });
      } catch (updateErr) {
        // If document doesn't exist, create it with setDoc
        console.log("⚠️ updateDoc failed, using setDoc fallback:", updateErr);
        await setDoc(doc(db, "users", adminUser.uid), {
          email: adminUser.email,
          displayName,
          photoURL,
          role: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

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
      setToastMessage("✅ Profile updated successfully");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to save profile");
      setTimeout(() => setToastMessage(""), 3500);
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
  const rentalsByRenter = useMemo(() => {
    const grouped = rentals.reduce((acc, rental) => {
      const key = rental.renterEmail || rental.renterUid || rental.renterId || "unknown-renter";
      if (!acc[key]) {
        const renterProfile = usersList.find((u) => u.email === rental.renterEmail) || {};
        acc[key] = { renter: renterProfile, items: [], total: 0 };
      }

      acc[key].items.push(rental);
      const price = Number(rental.price || rental.totalAmount || rental.dailyRate || 0);
      acc[key].total += Number.isNaN(price) ? 0 : price;
      return acc;
    }, {});

    return Object.values(grouped);
  }, [rentals, usersList]);

  useEffect(() => {
    // keep rentalsByRenterState in sync (optional)
    setRentalsByRenterState(rentalsByRenter);
  }, [rentalsByRenter]);

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

  // Update rental status (admin)
const updateRentalStatus = async (rentalId, status) => {
  if (!rentalId || !status) return;

  try {
    const rentalRef = doc(db, "rentals", rentalId);
    const rentalSnap = await getDoc(rentalRef);

    if (!rentalSnap.exists()) {
      console.error("Rental not found");
      return;
    }

    const rentalData = rentalSnap.data();
    const previousStatus = rentalData.status;

    // Update the rental status with completedAt timestamp
    const updateData = {
      status,
      updatedAt: serverTimestamp(),
    };
    
    // Add completedAt timestamp when marking as Completed
    if (status === "Completed" && previousStatus !== "Completed") {
      updateData.completedAt = serverTimestamp();
    }
    
    await updateDoc(rentalRef, updateData);

    // ✅ Only add earnings ONCE when changing to Completed
    if (previousStatus !== "Completed" && status === "Completed") {
      let ownerRef = null;

      // Try to find owner by ownerId first
      if (rentalData.ownerId) {
        const ref = doc(db, "owners", rentalData.ownerId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          ownerRef = ref;
        }
      }

      // Fallback: find owner by email (case-insensitive)
      if (!ownerRef && rentalData.ownerEmail) {
        const emailLc = rentalData.ownerEmail.toLowerCase();
        const ownerQuery = query(
          collection(db, "owners"),
          where("email", "==", rentalData.ownerEmail)
        );
        const ownerSnap = await getDocs(ownerQuery);
        if (!ownerSnap.empty) {
          ownerRef = ownerSnap.docs[0].ref;
        } else {
          const ownerQueryLc = query(
            collection(db, "owners"),
            where("email", "==", emailLc)
          );
          const ownerSnapLc = await getDocs(ownerQueryLc);
          if (!ownerSnapLc.empty) {
            ownerRef = ownerSnapLc.docs[0].ref;
          }
        }
      }

      // Update earnings using increment(), then notify owner via message
      if (ownerRef) {
        // Owner should receive the full renter charge (posted price/total)
        const dailyRate = Number(rentalData.dailyRate || 0);
        const rentalDays = Number(rentalData.rentalDays || 1);
        const fallbackComputed = dailyRate * rentalDays;
        const earningsToAddRaw = Number(
          rentalData.totalAmount ||
          rentalData.totalPrice ||
          rentalData.price ||
          fallbackComputed ||
          0
        );
        const earningsToAdd = Number.isFinite(earningsToAddRaw) ? earningsToAddRaw : 0;

        if (earningsToAdd > 0) {
          console.log(`💰 [Completed] Adding ₱${earningsToAdd} to owner earnings (${dailyRate} × ${rentalDays} days)`);
          await setDoc(ownerRef, {
            earnings: increment(earningsToAdd),
            totalEarnings: increment(earningsToAdd),
          }, { merge: true }).then(async () => {
            console.log(`✅ [Completed] Added ₱${earningsToAdd} to owner earnings`);

            // Resolve owner email for the message (prefer owner doc, fallback to rental fields)
            let receiverEmail = "";
            try {
              const ownerDocSnap = await getDoc(ownerRef);
              receiverEmail = ownerDocSnap.data()?.email || "";
            } catch (e) {
              console.warn("⚠️ [Completed] Failed to read owner email for message", e);
            }
            if (!receiverEmail && rentalData.ownerEmail) receiverEmail = rentalData.ownerEmail;
            if (!receiverEmail && rentalData.ownerEmailLower) receiverEmail = rentalData.ownerEmailLower;

            // Send message to owner confirming earnings were added
            if (receiverEmail) {
              try {
                const senderEmail = adminEmail || "admin@gmail.com";
                const receiverLc = receiverEmail.toLowerCase();
                await addDoc(collection(db, "messages"), {
                  sender: senderEmail,
                  receiver: receiverEmail,
                  participants: [senderEmail.toLowerCase(), receiverLc],
                  senderRole: "admin",
                  receiverRole: "owner",
                  text: `✅ Rental ${rentalData.propertyName || rentalData.name || rentalId} has been marked Completed. Earnings of ₱${earningsToAdd.toFixed(2)} were added to your balance.`,
                  createdAt: serverTimestamp(),
                });
              } catch (msgErr) {
                console.warn("❌ [Completed] Failed to send earnings message to owner:", msgErr);
              }
            } else {
              console.warn("⚠️ [Completed] Owner email not available; message not sent");
            }
          }).catch((err) => {
            console.warn(`❌ [Completed] Could not update owner earnings:`, err.code, err.message);
          });
        }
      } else {
        console.warn(`⚠️ [Completed] Could not find owner for rental:`, rentalData.ownerId || rentalData.ownerEmail);
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

  // Load persisted last-read map for unread badges (per owner)
  useEffect(() => {
    if (!adminEmail) return;
    try {
      const stored = localStorage.getItem(`admin-last-read-${adminEmail}`);
      if (stored) {
        setLastReadByOwner(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to load lastReadByOwner", e);
    }
  }, [adminEmail]);

  // Persist last-read map when it changes
  useEffect(() => {
    if (!adminEmail) return;
    try {
      localStorage.setItem(`admin-last-read-${adminEmail}`, JSON.stringify(lastReadByOwner));
    } catch (e) {
      console.warn("Failed to persist lastReadByOwner", e);
    }
  }, [adminEmail, lastReadByOwner]);

// Listen for admin-owner and admin-renter messages
useEffect(() => {
  if (!adminEmail) return;

  const unsub = onSnapshot(collection(db, "messages"), (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter messages involving admin with both owners & renters
    const filtered = all.filter(
      m =>
        (m.sender === adminEmail && (m.receiverRole === "owner" || m.receiverRole === "renter")) ||
        (m.receiver === adminEmail && (m.senderRole === "owner" || m.senderRole === "renter"))
    );

    // Sort newest first
    filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    setAdminMessages(filtered);
  });

  return () => unsub();
}, [adminEmail]);

// Fetch profile photos for conversation users (owners and renters)
useEffect(() => {
  const conversationEmails = Array.from(
    new Set(messages
      .filter(m => m.senderRole === "admin" || m.receiverRole === "admin")
      .flatMap(m => m.senderRole === "admin" ? [m.receiver] : [m.sender])
    )
  );

  if (conversationEmails.length === 0) return;

  const fetchUserPhotos = async () => {
    const photos = {};
    for (const email of conversationEmails) {
      if (email && email !== adminEmail) {
        try {
          console.log("🔍 [Admin] Fetching photo for:", email);
          const usersQuery = query(
            collection(db, "users"),
            where("email", "==", email)
          );
          const userSnap = await getDocs(usersQuery);
          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            const photoURL = userData.photoURL;
            photos[email] = photoURL || null;
            console.log("✅ [Admin] Photo found for", email, ":", photoURL);
          } else {
            console.log("⚠️ [Admin] No user document found in Firestore for:", email);
            photos[email] = null;
          }
        } catch (err) {
          console.error("❌ [Admin] Error fetching user photo for", email, ":", err);
          photos[email] = null;
        }
      }
    }
    console.log("📸 [Admin] All user photos fetched:", photos);
    setUserPhotos(photos);
  };

  fetchUserPhotos();
}, [messages, adminEmail]);

// Send message from admin to owner
const handleAdminSendMessage = async (ownerEmail) => {
  const text = adminReplyText[ownerEmail]?.trim();
  if (!text) return alert("Message is empty");

  await addDoc(collection(db, "messages"), {
    sender: adminEmail,
    receiver: ownerEmail,
    participants: [adminEmail.toLowerCase(), ownerEmail.toLowerCase()],
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
    participants: [adminEmail.toLowerCase(), ownerEmail.toLowerCase()],
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

// Mark a conversation as read up to its latest message
const markChatRead = (ownerEmail) => {
  if (!ownerEmail) return;
  const latestTs = messages
    .filter(m => (m.sender === ownerEmail && m.receiver === adminEmail) || (m.receiver === ownerEmail && m.sender === adminEmail))
    .reduce((max, m) => Math.max(max, m.createdAt?.seconds || 0), 0);
  setLastReadByOwner((prev) => ({ ...prev, [ownerEmail]: latestTs }));
};

// Auto-mark selected chat as read when messages change
useEffect(() => {
  if (!selectedChat) return;
  markChatRead(selectedChat);
}, [selectedChat, messages]);

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

const handleDeleteMessage = async (messageId) => {
  if (!window.confirm("Delete this message?")) return;
  
  try {
    await deleteDoc(doc(db, "messages", messageId));
    setToastMessage("✅ Message deleted");
    setTimeout(() => setToastMessage(""), 2000);
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to delete message");
    setTimeout(() => setToastMessage(""), 3000);
  }
};

const handleDeleteAllMessages = async () => {
  if (!window.confirm("⚠️ Delete ALL conversations? This cannot be undone!")) return;

  try {
    const allMessages = messages.filter(m => m.senderRole === "admin" || m.receiverRole === "admin");
    await Promise.all(allMessages.map(m => deleteDoc(doc(db, "messages", m.id))));
    setSelectedChat(null);
    setToastMessage("✅ All conversations deleted");
    setTimeout(() => setToastMessage(""), 2500);
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to delete conversations");
    setTimeout(() => setToastMessage(""), 3500);
  }
};

const handleDeleteAllTransactions = async () => {
  if (!window.confirm("⚠️ Delete ALL transactions? This cannot be undone!")) return;

  try {
    const snap = await getDocs(collection(db, "withdrawals"));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "withdrawals", d.id))));
    setToastMessage("✅ All transactions deleted");
    setTimeout(() => setToastMessage(""), 2500);
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to delete transactions");
    setTimeout(() => setToastMessage(""), 3500);
  }
};

// ---------------- WITHDRAWAL APPROVAL ----------------
const approveWithdrawal = async (withdrawal) => {
  const { id, ownerEmail, amount, ownerId } = withdrawal;
  try {
    // Find owner document ID
    let targetOwnerUid = ownerId || withdrawal.ownerUid;
    
    // If no ownerId, find by email
    if (!targetOwnerUid && ownerEmail) {
      const ownerSnap = await getDocs(query(collection(db, "owners"), where("email", "==", ownerEmail)));
      if (!ownerSnap.empty) {
        targetOwnerUid = ownerSnap.docs[0].id;
      }
    }

    if (!targetOwnerUid) {
      alert("❌ Cannot find owner document. Withdrawal will be approved but balance won't be deducted.");
      // Still approve the withdrawal for record purposes
      await updateDoc(doc(db, "withdrawals", id), {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: adminEmail,
      });
      return;
    }

    // Get current owner balance
    const ownerRef = doc(db, "owners", targetOwnerUid);
    const ownerSnap = await getDoc(ownerRef);
    
    if (!ownerSnap.exists()) {
      alert("❌ Owner document does not exist. Creating it now...");
      await setDoc(ownerRef, { 
        email: ownerEmail,
        earnings: 0, 
        totalEarnings: 0 
      });
    }

    const ownerData = ownerSnap.exists() ? ownerSnap.data() : {};
    const currentBalance = Number(ownerData.earnings || ownerData.totalEarnings || 0);
    const withdrawAmount = Number(amount || 0);

    // NOTE: Do not mutate owner's earnings here.
    // The OwnerDashboard computes balance as: earnings - sum(approved withdrawals).
    // Mutating earnings here would double-deduct.
    const newBalance = Math.max(0, currentBalance - withdrawAmount);

    // Update withdrawal status to approved
    await updateDoc(doc(db, "withdrawals", id), {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy: adminEmail,
    });

    // Automatically notify owner
    await addDoc(collection(db, "messages"), {
      sender: adminEmail,
      receiver: ownerEmail,
      participants: [adminEmail.toLowerCase(), ownerEmail.toLowerCase()],
      senderRole: "admin",
      receiverRole: "owner",
      text: `✅ Your withdrawal of ₱${Number(amount||0).toFixed(2)} has been approved!`,
      createdAt: serverTimestamp(),
    });

    alert(`✅ Withdrawal approved!\n\nAmount: ₱${amount}\nPrevious Balance: ₱${currentBalance.toFixed(2)}\nNew Balance: ₱${newBalance.toFixed(2)}`);

  } catch (err) {
    console.error("Withdrawal approval error:", err);
    alert("❌ Failed to approve withdrawal: " + err.message);
  }
};

const rejectWithdrawal = async (withdrawal) => {
  const { id, ownerEmail, amount } = withdrawal;
  if (!window.confirm("Are you sure you want to reject this withdrawal?")) return;

  try {
    // Update withdrawal status to rejected
    await updateDoc(doc(db, "withdrawals", id), {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: adminEmail,
    });

    // Send notification to owner
    await addDoc(collection(db, "messages"), {
      sender: adminEmail,
      receiver: ownerEmail,
      participants: [adminEmail.toLowerCase(), ownerEmail.toLowerCase()],
      senderRole: "admin",
      receiverRole: "owner",
      text: `❌ Your withdrawal request of ₱${Number(amount || 0).toFixed(2)} has been rejected by admin.`,
      createdAt: serverTimestamp(),
    });

    setToastMessage("✅ Withdrawal rejected");
    setTimeout(() => setToastMessage(""), 2500);
  } catch (err) {
    console.error("❌ [Reject] Error:", err);
    setToastMessage("❌ Failed to reject withdrawal: " + err.message);
    setTimeout(() => setToastMessage(""), 3000);
  }
};

// Delete a single withdrawal (no toast, removes inline)
const handleDeleteWithdrawal = async (withdrawal) => {
  try {
    await deleteDoc(doc(db, "withdrawals", withdrawal.id));
    setWithdrawals(prev => prev.filter(item => item.id !== withdrawal.id));
  } catch (err) {
    console.error("Failed to delete withdrawal", err);
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
const [showOwnersList, setShowOwnersList] = useState(false);
const [showRentersList, setShowRentersList] = useState(false);

// Block/Unblock function
  const handleBlockUser = async (user) => {
    if (!user?.uid) return;
    const isBlocked = !!user.blocked;
    try {
      const updates = {
        blocked: !isBlocked,
        blockedAt: !isBlocked ? serverTimestamp() : null,
        deleted: false, // Clear deleted status when unblocking
        deletedAt: null,
      };

      await Promise.all([
        setDoc(doc(db, "users", user.uid), updates, { merge: true }),
        setDoc(doc(db, user.role === "owner" ? "owners" : "renters", user.uid), updates, { merge: true }).catch(() => {}),
      ]);

      // Update blockedUsers state immediately
      setBlockedUsers((prev) => {
        if (isBlocked) return prev.filter((id) => id !== user.uid);
        return Array.from(new Set([...prev, user.uid]));
      });

      setSelectedUser({ ...user, blocked: !isBlocked, deleted: false });
      
      // Show success message
      if (isBlocked) {
        setToastMessage("✅ User unblocked successfully");
        // Auto-close blocklist modal after unblock (like Messenger)
        setTimeout(() => {
          setActiveBlocklist(false);
        }, 800);
      } else {
        setToastMessage("⚠️ User blocked");
      }
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error("Failed to toggle block", err);
      setToastMessage("❌ Failed to update block status");
      setTimeout(() => setToastMessage(""), 3000);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!user?.uid) return;
    if (!window.confirm(`Delete account for ${user.email}? This will block login.`)) return;
    try {
      const updates = {
        deleted: true,
        blocked: true,
        deletedAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(db, "users", user.uid), updates, { merge: true }),
        setDoc(doc(db, user.role === "owner" ? "owners" : "renters", user.uid), updates, { merge: true }).catch(() => {}),
      ]);

      setBlockedUsers((prev) => Array.from(new Set([...prev, user.uid])));
      setSelectedUser(null);
      setToastMessage("✅ Account marked as deleted");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error("Failed to delete user", err);
      setToastMessage("❌ Failed to delete user");
      setTimeout(() => setToastMessage(""), 3000);
    }
  };

  /* ---------------- render ---------------- */
  const displayedOwners = owners.filter((u) => !u.blocked && !u.deleted);
  const displayedRenters = renters.filter((u) => !u.blocked && !u.deleted);

  return (
  <div className="dashboard-container admin-dashboard">
  {/* MENU TOGGLE BUTTON */}
  <button
    className="menu-toggle"
    onClick={() => setSidebarOpen(!sidebarOpen)}
  >
    {sidebarOpen ? '✖' : '☰'}
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
          <div className="profile-actions">
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

            <div className="profile-actions">
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
                      <button onClick={() => handleBlockUser(user)}>Unblock</button>
                      <button 
                        onClick={() => handleDeleteUser(user)} 
                        className="blocklist-delete-btn"
                        title="Delete User"
                      >
                        🗑
                      </button>
                    </div>
                  );
                })
              )}
              <div className="blocklist-actions">
                <button onClick={() => setActiveBlocklist(false)}>Cancel</button>
              </div>
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
              <div className={`stat-card ${overdueRentals.length > 0 ? "overdue-alert" : ""}`} onClick={() => setActivePage("rentlist")}>
                <h3>⚠️ Overdue Returns</h3>
                <p>{overdueRentals.length}</p>
                <small>
                  {overdueRentals.length > 0 
                    ? `${overdueRentals.length} rental(s) need attention!` 
                    : "No overdue rentals"}
                </small>
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

                        <div className="status-and-remove">
                          <div className="status-grid">
                            <div className="status-row">
                              <button className="btn-pending" onClick={() => updatePropertyStatus(p.id, "pending")}>Pending</button>
                              <button className="btn-approve" onClick={() => updatePropertyStatus(p.id, "approved")}>Approve</button>
                            </div>

                            <div className="status-row">
                              <button className="btn-reject" onClick={() => updatePropertyStatus(p.id, "rejected")}>Reject</button>
                              <button
                                className="remove-btn"
                                onClick={async () => {
                                  try {
                                    // Mark property as removed by admin instead of deleting
                                    // This way only admin won't see it, but property record stays intact
                                    await updateDoc(doc(db, "properties", p.id), {
                                      removedByAdmin: true,
                                      removedAt: serverTimestamp(),
                                      removedByAdminId: adminUser?.uid
                                    });
                                  
                                    setProperties((prev) => prev.filter((prop) => prop.id !== p.id));
                                    setFilteredProperties((prev) => prev.filter((prop) => prop.id !== p.id));
                                    setToastMessage("✅ Property removed from your view");
                                    setTimeout(() => setToastMessage(""), 2500);
                                  } catch (err) {
                                    console.error(err);
                                    setToastMessage("❌ Failed to remove property");
                                    setTimeout(() => setToastMessage(""), 3500);
                                  }
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
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
        <div className="users-list-header">
          <h3>Owners ({displayedOwners.length})</h3>
          <button 
            onClick={() => setShowOwnersList(!showOwnersList)}
            className="users-list-toggle-btn"
          >
            {showOwnersList ? "Hide" : "Show"}
          </button>
        </div>
        {showOwnersList && displayedOwners.map(o => (
          <div
            key={o.uid}
            className={`user-item ${selectedUser?.uid === o.uid ? "active" : ""}`}
            onClick={() => setSelectedUser(o)}
          >
            <div className="user-avatar">
              {o.photoURL ? (
                <img src={o.photoURL} alt={o.displayName || o.email} />
              ) : (
                <span>{(o.displayName || o.email)?.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="user-item-info">
              <span className="user-item-name">{o.displayName || "No name"}</span>
              <span className="user-item-email">{o.email}</span>
            </div>
          </div>
        ))}

        <div className="users-list-renters-header">
          <h3>Renters ({displayedRenters.length})</h3>
          <button 
            onClick={() => setShowRentersList(!showRentersList)}
            className="users-list-toggle-btn"
          >
            {showRentersList ? "Hide" : "Show"}
          </button>
        </div>
        {showRentersList && displayedRenters.map(r => (
          <div
            key={r.uid}
            className={`user-item ${selectedUser?.uid === r.uid ? "active" : ""}`}
            onClick={() => setSelectedUser(r)}
          >
            <div className="user-avatar">
              {r.photoURL ? (
                <img src={r.photoURL} alt={r.displayName || r.email} />
              ) : (
                <span>{(r.displayName || r.email)?.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="user-item-info">
              <span className="user-item-name">{r.displayName || "No name"}</span>
              <span className="user-item-email">{r.email}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedUser && (
        <div className="user-details-panel">
          <div className="panel-header">
            <h3>{selectedUser.email}</h3>
            <button onClick={() => handleBlockUser(selectedUser)}>
              {blockedUsers.includes(selectedUser.uid) ? "Unblock" : "Block"}
            </button>
            <button onClick={() => handleDeleteUser(selectedUser)}>🗑 Delete</button>
            <button onClick={() => setSelectedUser(null)}>✖</button>
          </div>

          <div className="user-details-content">
            {/* User Profile Info */}
            <div className="panel-profile-section">
              {selectedUser.photoURL ? (
                <img src={selectedUser.photoURL} alt="Profile" className="panel-profile-img" />
              ) : (
                <div className="panel-profile-avatar">
                  {(selectedUser.displayName || selectedUser.email)?.charAt(0).toUpperCase()}
                </div>
              )}
              <p><strong>Email:</strong> {selectedUser.email}</p>
              {selectedUser.displayName && (
                <p><strong>Name:</strong> {selectedUser.displayName}</p>
              )}
              <p><strong>Role:</strong> {selectedUser.role}</p>
              
              {/* Additional Owner Profile Details */}
              {selectedUser.role === "owner" && (
                <>
                  {selectedUser.phoneNumber && (
                    <p><strong>Phone:</strong> {selectedUser.phoneNumber}</p>
                  )}
                  {selectedUser.address && (
                    <p><strong>Address:</strong> {selectedUser.address}</p>
                  )}
                  {selectedUser.createdAt && (
                    <p><strong>Joined:</strong> {selectedUser.createdAt?.toDate ? selectedUser.createdAt.toDate().toLocaleDateString() : formatDate(selectedUser.createdAt)}</p>
                  )}
                </>
              )}

              {/* Additional Renter Profile Details */}
              {selectedUser.role === "renter" && (
                <>
                  {selectedUser.phoneNumber && (
                    <p><strong>Phone:</strong> {selectedUser.phoneNumber}</p>
                  )}
                  {selectedUser.address && (
                    <p><strong>Address:</strong> {selectedUser.address}</p>
                  )}
                  {selectedUser.createdAt && (
                    <p><strong>Joined:</strong> {selectedUser.createdAt?.toDate ? selectedUser.createdAt.toDate().toLocaleDateString() : formatDate(selectedUser.createdAt)}</p>
                  )}
                </>
              )}
            </div>

            {/* OWNER SECTION */}
            {selectedUser.role === "owner" && (
              <>
                {/* Owner's Properties */}
                <div className="panel-section">
                  <h4>Properties ({properties.filter(p => p.ownerEmail === selectedUser.email).length})</h4>
                  {properties.filter(p => p.ownerEmail === selectedUser.email).length === 0 ? (
                    <p style={{fontSize: "0.9em", color: "#888"}}>No properties listed</p>
                  ) : (
                    <div className="panel-properties-list">
                      {properties.filter(p => p.ownerEmail === selectedUser.email).map(prop => (
                        <div key={prop.id} className="panel-property-card">
                          {prop.imageUrl && (
                            <img src={prop.imageUrl} alt={prop.name} className="panel-property-img" />
                          )}
                          <div className="panel-property-info">
                            <strong>{prop.name}</strong>
                            <p>₱{prop.price || "N/A"}</p>
                            <span className={`panel-property-status ${(prop.status || "").toLowerCase()}`}>
                              {prop.status || "N/A"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Owner's Total Withdrawals */}
                <div className="panel-section">
                  <h4>Withdrawals</h4>
                  {withdrawals.filter(w => w.ownerEmail === selectedUser.email).length === 0 ? (
                    <p style={{fontSize: "0.9em", color: "#888"}}>No withdrawals</p>
                  ) : (
                    <div className="panel-withdrawals-info">
                      <div className="withdrawal-stat">
                        <strong>Total Withdrawn:</strong> ₱{withdrawals
                          .filter(w => w.ownerEmail === selectedUser.email && w.status === "approved")
                          .reduce((sum, w) => sum + Number(w.amount || 0), 0)
                          .toFixed(2)}
                      </div>
                      <div className="withdrawal-stat">
                        <strong>Pending:</strong> ₱{withdrawals
                          .filter(w => w.ownerEmail === selectedUser.email && w.status === "pending")
                          .reduce((sum, w) => sum + Number(w.amount || 0), 0)
                          .toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* RENTER SECTION */}
            {selectedUser.role === "renter" && (
              <>
                {/* Renter's Rentals */}
                <div className="panel-section">
                  <h4>Rentals ({rentals.filter(r => r.renterEmail === selectedUser.email).length})</h4>
                  {rentals.filter(r => r.renterEmail === selectedUser.email).length === 0 ? (
                    <p style={{fontSize: "0.9em", color: "#888"}}>No rentals yet</p>
                  ) : (
                    <div className="panel-rentals-list">
                      {rentals.filter(r => r.renterEmail === selectedUser.email).map(rental => (
                        <div key={rental.id} className="panel-rental-card">
                          {rental.propertyImage && (
                            <img src={rental.propertyImage} alt={rental.propertyName} className="panel-rental-img" />
                          )}
                          <div className="panel-rental-info">
                            <strong>{rental.propertyName}</strong>
                            <p>₱{rental.totalAmount || rental.price || "N/A"}</p>
                            <span className={`panel-rental-status ${(rental.status || "").toLowerCase()}`}>
                              {rental.status || "N/A"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Message Input */}
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
        </div>
      )}
    </div>
  </section>
)}


        {/* Rent List */}
        {activePage === "rentlist" && !rentalModal && (
          <section className="admin-rentlist-section">
            <h2>Rent List</h2>

            {rentals.length === 0 ? (
              <p>No rentals yet.</p>
            ) : (
              <>
                <div className="admin-renter-total overall-total">
                  <strong>Total Rentals:</strong> {rentals.length}
                </div>

                <div className="admin-renter-items">
                  {rentals
                    .slice()
                    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                    .map((it) => {
                      const renterProfile = usersList.find((u) => u.email === it.renterEmail);
                      return (
                        <div key={it.id} className="admin-rental-card">
                          <img src={it.propertyImage || it.imageUrl || it.imageFile || "/no-image.png"} alt={it.propertyName || "Property"} className="admin-rental-image" />

                          <div className="admin-rental-details">
                            <div className="admin-rental-name"><strong>{it.propertyName}</strong></div>
                            <div className="admin-rental-price">Price: ₱{it.dailyRate || it.price || 0}</div>
                            <div className="admin-rental-ordered">Ordered: {it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString() : formatDate(it.createdAt)}</div>
                            {it.status === "Completed" && getDueDate(it) && (
                              <div className={`admin-rental-duedate ${getDaysOverdue(it) > 0 ? "overdue" : ""}`}>
                                Due: {getDueDate(it).toLocaleDateString()}
                                {getDaysOverdue(it) > 0 && <span className="overdue-tag"> ⚠️ {getDaysOverdue(it)}d OVERDUE</span>}
                              </div>
                            )}
                            <div className="admin-rental-status">
                              Status:
                              <button onClick={() => openRentalModal(it, renterProfile)} className="admin-rental-status-btn">{it.status || "N/A"}</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </section>
        )}

       {/* Rental Modal */}
{activePage === "rentlist" && rentalModal && (
  <div className="admin-rental-modal">
    <div className="admin-rental-modal-content">
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
        
        {/* Overdue Warning */}
        {rentalModal?.status === "Completed" && getDueDate(rentalModal) && (
          <div className={`rental-modal-item ${getDaysOverdue(rentalModal) > 0 ? "overdue-warning-admin" : ""}`}>
            <strong>Due Date:</strong> {getDueDate(rentalModal).toLocaleDateString()}
            {getDaysOverdue(rentalModal) > 0 && (
              <>
                <span className="overdue-badge-admin"> ⚠️ {getDaysOverdue(rentalModal)} days overdue!</span>
                <button 
                  onClick={() => sendOverdueNotification(rentalModal)}
                  className="send-notification-btn"
                  style={{ marginLeft: "10px", padding: "5px 10px", fontSize: "12px" }}
                >
                  📧 Send Reminder
                </button>
              </>
            )}
          </div>
        )}
        
        {/* Return Proof Display */}
        {rentalModal?.status === "Returned" && rentalModal?.returnProofImage && (
          <div className="rental-modal-item">
            <strong>Return Description:</strong> {rentalModal?.returnDescription || "N/A"}
            <br />
            <button
              onClick={() => window.open(rentalModal?.returnProofImage, "_blank")}
              className="view-return-proof-btn"
              style={{ marginTop: "8px" }}
            >
              📷 View Return Proof
            </button>
          </div>
        )}
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
        <button onClick={async () => {
          await updateRentalStatus(rentalModal?.id, rentalStatusEdit);
          closeRentalModal();
        }} className="rental-modal-update-btn">Update</button>
        <button onClick={() => removeRental(rentalModal?.id)} className="rental-modal-remove-btn">Remove</button>
        <button onClick={closeRentalModal} className="rental-modal-close-btn">Close</button>
      </div>
    </div>
  </div>
)}

        {/* Transactions */}
        {activePage === "transactions" && (
          <section className="transactions-section">
            <div className="transactions-header">
              <h2 className="transactions-title">Owner Withdrawals</h2>
            </div>
            {withdrawals.length === 0 ? (
              <p>No withdrawals yet.</p>
            ) : (
              <div className="withdrawals-list">
              {withdrawals.map((w) => (
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

                  <div className="withdrawal-delete-row">
                    <button
                      className="withdrawal-delete-btn"
                      onClick={() => handleDeleteWithdrawal(w)}
                    >
                      Delete
                    </button>
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
              ))}
              </div>
            )}
          </section>
        )}

      {activePage === "messages" && (
  <div className={`messages-page-container ${selectedChat ? "chat-open" : ""}`}>
    {/* Conversation List - Facebook Style */}
    <div className="conversation-list">
      <div className="conversation-list-header">
        <div className="messages-header">
          <h2 className="messages-title">Messages</h2>
          <div className="settings-position">
            <button
              onClick={() => setShowMessageSettings(!showMessageSettings)}
              className="messages-settings-btn"
            >
              ⚙️
            </button>
            {showMessageSettings && (
              <div className="settings-dropdown">
                <button
                  onClick={() => {
                    handleDeleteAllMessages();
                    setShowMessageSettings(false);
                  }}
                  className="settings-dropdown-btn"
                >
                  🗑️ Delete All
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="messages-search-box">
          <span></span>
          <input
            type="text"
            placeholder="Search email"
            className="messages-search-input"
            value={messageSearch}
            onChange={(e) => setMessageSearch(e.target.value)}
          />
        </div>
      </div>

      {Array.from(new Set(messages
        .filter(m => m.senderRole === "admin" || m.receiverRole === "admin")
        .flatMap(m => m.senderRole === "admin" ? [m.receiver] : [m.sender])
      ))
        .filter(email => (email || "").toLowerCase().includes(messageSearch.toLowerCase()))
        .sort((a, b) => {
          const lastA = messages.filter(m => (m.sender === a && m.receiver === adminEmail) || (m.receiver === a && m.sender === adminEmail)).pop();
          const lastB = messages.filter(m => (m.sender === b && m.receiver === adminEmail) || (m.receiver === b && m.sender === adminEmail)).pop();
          return (lastB?.createdAt?.seconds || 0) - (lastA?.createdAt?.seconds || 0);
        })
        .map(userEmail => {
          const lastMsg = messages
            .filter(m => (m.sender === userEmail && m.receiver === adminEmail) || (m.receiver === userEmail && m.sender === adminEmail))
            .pop();
          const user = [...owners, ...renters].find(u => u.email === userEmail);
          const lastReadTs = lastReadByOwner[userEmail] || 0;
          const unreadCount = messages.filter(m => (
            m.sender === userEmail &&
            m.receiver === adminEmail &&
            (m.createdAt?.seconds || 0) > lastReadTs
          )).length;
          return (
            <div
              key={userEmail}
              onClick={() => {
                setSelectedChat(userEmail);
                markChatRead(userEmail);
              }}
              className={`conversation-item ${selectedChat === userEmail ? "active" : ""}`}
              onMouseEnter={e => !selectedChat === userEmail && (e.currentTarget.style.background = "#f0f2f5")}
              onMouseLeave={e => !selectedChat === userEmail && (e.currentTarget.style.background = "#fff")}
            >
              <div className="conversation-avatar">
                {userPhotos[userEmail] ? (
                  <img src={userPhotos[userEmail]} alt={user?.displayName || userEmail} />
                ) : (
                  <span>{userEmail.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="conversation-preview">
                <div className="conversation-email">{userEmail}</div>
                <div className={`conversation-last-msg ${unreadCount > 0 ? "unread" : ""}`}>
                  {lastMsg?.text || "No messages"}
                </div>
              </div>
              {unreadCount > 0 && (
                <span className="conversation-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </div>
          );
        })
      }
      {messages.length === 0 && <p className="no-messages-text">No messages yet.</p>}
    </div>

    {/* Chat Window - Facebook Style */}
    {selectedChat && (
      <div className="chat-window-container">
        <div className="chat-window-header">
          <h3 className="chat-window-title">{selectedChat}</h3>
          <button 
            onClick={() => setSelectedChat(null)}
            className="chat-window-close-btn"
          >
            ✖
          </button>
        </div>

        <div className="chat-messages-container">
          {messages
            .filter(m => (m.sender === selectedChat && m.receiver === adminEmail) || (m.receiver === selectedChat && m.sender === adminEmail))
            .sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
            .map(m => {
              console.log(" [Admin] Rendering message from:", m.sender, "| userPhotos:", userPhotos);
              return (
                <div
                  key={m.id}
                  className={`chat-bubble-container ${m.sender === adminEmail ? "sent" : "received"}`}
                >
                  {/* Profile Photo for received messages (owner/renter) */}
                  {m.sender !== adminEmail && (
                    <img 
                      src={userPhotos[m.sender] || "/default-profile.png"} 
                      alt={m.sender}
                      className="chat-bubble-avatar"
                      onError={(e) => {
                        console.log("❌ [Admin] Image load failed for:", m.sender, "| URL:", userPhotos[m.sender]);
                        e.target.src = "/default-profile.png";
                      }}
                    />
                  )}
                  
                  <div className="chat-bubble-with-delete">
                    <div className={`chat-bubble ${m.sender === adminEmail ? "sent" : "received"}`}>
                      <p className="chat-message-text">{m.text}</p>
                      <small className="chat-message-time">
                        {m.createdAt?.toDate
                          ? m.createdAt.toDate().toLocaleTimeString()
                          : new Date().toLocaleTimeString()}
                      </small>
                    </div>
                    <button 
                      className="message-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMessage(m.id);
                      }}
                      title="Delete message"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  {/* Admin Photo for sent messages */}
                  {m.sender === adminEmail && (
                    <img 
                      src={photoPreview || "/default-profile.png"} 
                      alt="Admin"
                      className="chat-bubble-avatar"
                    />
                  )}
                </div>
              );
            })}
        </div>

        <div className="chat-input-section">
          <input
            type="text"
            placeholder="Aa"
            value={replyText[selectedChat] || ""}
            onChange={e => setReplyText(prev => ({ ...prev, [selectedChat]: e.target.value }))}
            onKeyDown={e => { if(e.key === "Enter") handleSendMessage(selectedChat) }}
            className="chat-input-field"
          />
          <button 
            onClick={() => handleSendMessage(selectedChat)}
            className="chat-send-btn"
          >
            ➤
          </button>
        </div>
      </div>
    )}
  </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`toast-notification ${
          toastMessage.startsWith("✅") ? "success" : 
          toastMessage.startsWith("❌") ? "error" : "warning"
        }`}>
          {toastMessage}
        </div>
      )}

     </div>
    </div>
  );
};

export default AdminDashboard;
