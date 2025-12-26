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
  const [showIndividualEarnings, setShowIndividualEarnings] = useState(false);
  const [completedRentals, setCompletedRentals] = useState([]);
  const [renterPhotos, setRenterPhotos] = useState({});
  const [toastMessage, setToastMessage] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userPhotos, setUserPhotos] = useState({});

  // Comments states
  const [comments, setComments] = useState({});
  const [showCommentsSection, setShowCommentsSection] = useState({});
  const [newComments, setNewComments] = useState({});
  const [commentReplyText, setCommentReplyText] = useState({});
  const [showReplyInput, setShowReplyInput] = useState({});

  
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
        // Seed owner profile and mirror into shared users collection for admin view
        const baseProfile = {
          displayName: auth.currentUser.displayName || "",
          email: auth.currentUser.email,
          createdAt: serverTimestamp(),
          photoURL: auth.currentUser.photoURL || "",
          role: "owner",
        };

        setDoc(userDocRef, baseProfile, { merge: true });
        setDoc(doc(db, "users", auth.currentUser.uid), baseProfile, { merge: true });
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

// Fetch comments for owner's posts
useEffect(() => {
  if (!ownerEmail || posts.length === 0) return;
  const unsubscribers = [];
  posts.forEach(post => {
    unsubscribers.push(
      onSnapshot(collection(db, "rentals", post.id, "comments"), (snap) => {
        const fetchedComments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(prev => ({ ...prev, [post.id]: fetchedComments }));
      })
    );
  });
  return () => unsubscribers.forEach(u => u());
}, [ownerEmail, posts]);

// Fetch replies for owner's posts
useEffect(() => {
  if (!ownerEmail || posts.length === 0) return;
  const unsubscribers = [];
  posts.forEach(post => {
    onSnapshot(collection(db, "rentals", post.id, "comments"), (commentsSnap) => {
      commentsSnap.docs.forEach(commentDoc => {
        unsubscribers.push(
          onSnapshot(collection(db, "rentals", post.id, "comments", commentDoc.id, "replies"), (repliesSnap) => {
            const replies = repliesSnap.docs.map(r => ({ id: r.id, ...r.data() }));
            setComments(prev => ({
              ...prev,
              [post.id]: prev[post.id]?.map(c => c.id === commentDoc.id ? { ...c, replies } : c)
            }));
          })
        );
      });
    });
  });
  return () => unsubscribers.forEach(u => u());
}, [ownerEmail, posts]);





  // ---------- Profile handlers ----------

  const handleSaveProfile = async () => {
    if (!auth.currentUser) {
      setToastMessage("❌ User not logged in.");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }
    if (!displayName || displayName.trim() === "") {
      setToastMessage("⚠️ Display name cannot be empty.");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

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

      // Keep shared users collection in sync so AdminDashboard sees latest name/photo
      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          displayName,
          photoURL,
          email: auth.currentUser.email,
          role: "owner",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setUser({ ...user, displayName, photoURL });
      setPhoto(null);
      setPhotoPreview(photoURL);
      setIsEditing(false);
      setToastMessage("✅ Profile updated successfully!");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage(`❌ Failed to update profile: ${err.message}`);
      setTimeout(() => setToastMessage(""), 4000);
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
      setToastMessage("⚠️ Please fill in all fields");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

    if (newPassword !== confirmPassword) {
      setToastMessage("⚠️ Passwords do not match");
      setTimeout(() => setToastMessage(""), 3000);
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

      setToastMessage("✅ Password updated successfully!");
      setTimeout(() => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowSettings(false);
        setToastMessage("");
      }, 1500);
    } catch (error) {
      setToastMessage(`❌ ${error.message}`);
      setTimeout(() => setToastMessage(""), 4000);
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
    
    // Prevent double submission
    if (formSubmitting) return;
    
    if (!formData.name || !formData.price || !formData.imageFile) {
      setToastMessage("⚠️ Fill name, price, and image.");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

    try {
      setFormSubmitting(true);
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
        maxRenters: formData.maxRenters || 1,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setToastMessage("✅ Submitted for approval!");
      setTimeout(() => {
        setFormData({ name: "", price: "", description: "", imageFile: null, imagePreview: "", agreed: false });
        setActivePage("rentalitem");
        setToastMessage("");
      }, 1500);
    } catch (error) {
      console.error(error);
      setToastMessage("❌ Failed to add post: " + error.message);
      setTimeout(() => setToastMessage(""), 4000);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeletePost = async (id) => {
    try {
      await deleteDoc(doc(db, "properties", id));
      setToastMessage("✅ Post deleted successfully");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete post");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  // Comments handlers
  const handleAddReply = async (postId, commentId) => {
    const text = commentReplyText[commentId]?.trim();
    if (!text) return;

    await addDoc(collection(db, "rentals", postId, "comments", commentId, "replies"), {
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || "Owner",
      comment: text,
      createdAt: serverTimestamp(),
    });

    setCommentReplyText(prev => ({ ...prev, [commentId]: "" }));
    setShowReplyInput(prev => ({ ...prev, [commentId]: false }));
  };

  const handleDeleteAllComments = async (postId) => {
    if (!window.confirm("Delete all comments for this post?")) return;
    try {
      const commentsSnap = await getDocs(collection(db, "rentals", postId, "comments"));
      const deletePromises = commentsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      setComments(prev => ({ ...prev, [postId]: [] }));
      setToastMessage("✅ All comments deleted");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete comments");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  // Delete individual earning
  const handleDeleteEarning = async (rentalId, amount) => {
    if (!window.confirm("🗑️ Delete this earning? This will deduct ₱" + amount.toFixed(2) + " from your balance.")) return;
    try {
      await deleteDoc(doc(db, "rentals", rentalId));
      
      // Deduct amount from owner's balance
      await updateDoc(doc(db, "owners", auth.currentUser.uid), {
        totalEarnings: earnings - amount,
      });
      
      setCompletedRentals(prev => prev.filter(r => r.id !== rentalId));
      setToastMessage("✅ Earning deleted successfully");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete earning");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  // Delete all completed earnings
  const handleDeleteAllEarnings = async () => {
    if (!window.confirm("🗑️ Delete all completed earnings AND reset balance to ₱0? This action cannot be undone.")) return;
    try {
      const deletePromises = completedRentals.map(rental => 
        deleteDoc(doc(db, "rentals", rental.id))
      );
      await Promise.all(deletePromises);
      
      // Reset balance to 0 in owner document
      await updateDoc(doc(db, "owners", auth.currentUser.uid), {
        totalEarnings: 0,
      });
      
      setCompletedRentals([]);
      setToastMessage("✅ All completed earnings deleted and balance reset to ₱0");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete earnings");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  // Delete all withdrawals
  const handleDeleteAllWithdrawals = async () => {
    if (!window.confirm("🗑️ Delete all withdrawal history? This action cannot be undone.")) return;
    try {
      const deletePromises = withdrawals.map(withdrawal => 
        deleteDoc(doc(db, "withdrawals", withdrawal.id))
      );
      await Promise.all(deletePromises);
      setWithdrawals([]);
      setToastMessage("✅ All withdrawal history deleted");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete withdrawal history");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  // Delete individual withdrawal
  const handleDeleteWithdrawal = async (withdrawalId) => {
    if (!window.confirm("🗑️ Delete this withdrawal record?")) return;
    try {
      await deleteDoc(doc(db, "withdrawals", withdrawalId));
      setWithdrawals(prev => prev.filter(w => w.id !== withdrawalId));
      setToastMessage("✅ Withdrawal record deleted");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete withdrawal");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

   // ---------- Handle Withdraw ----------
async function updateOldWithdrawalsWithEmails() {
  try {
    const withdrawalsCol = collection(db, "withdrawals");
    const withdrawalsSnap = await getDocs(withdrawalsCol);

    for (const wDoc of withdrawalsSnap.docs) {
      const wData = wDoc.data();

      // Only update if ownerEmail is missing
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

// Run the function
updateOldWithdrawalsWithEmails();

const [allUsers, setAllUsers] = useState([]);       // All registered users
const [selectedChat, setSelectedChat] = useState(null); // Selected chat user email
const [messages, setMessages] = useState([]);       // Messages of selected chat
const [replyText, setReplyText] = useState({});     // Message input text

const currentUserEmail = auth.currentUser?.email;


// 1️⃣ Listen for real-time total earnings
  useEffect(() => {
    if (!ownerId) return;
    const ownerRef = doc(db, "owners", ownerId);
    const unsub = onSnapshot(ownerRef, (docSnap) => {
      if (docSnap.exists()) {
        setEarnings(Number(docSnap.data().totalEarnings || 0));
      }
    });
    return () => unsub();
  }, [ownerId]);

  // 2️⃣ Fetch withdrawals
  useEffect(() => {
    if (!ownerId) return;

    const q = query(collection(db, "withdrawals"), where("ownerId", "==", ownerId));
    const fetchWithdrawals = async () => {
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWithdrawals(data);
    };
    fetchWithdrawals();
  }, [ownerId]);

  // 2.5️⃣ Fetch completed rentals/earnings for owner
  useEffect(() => {
    if (!ownerEmail) return;
    
    const q = query(
      collection(db, "rentals"),
      where("ownerEmail", "==", ownerEmail),
      where("status", "==", "Completed")
    );
    
    const unsub = onSnapshot(q, async (snapshot) => {
      const rentalData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log("✅ Completed Rentals Found:", rentalData.length);
      console.log("📊 Owner Email:", ownerEmail);
      console.log("📋 Rentals Data:", rentalData);
      setCompletedRentals(rentalData);
      
      // Fetch renter photos
      const photos = {};
      for (const rental of rentalData) {
        if (rental.renterEmail) {
          try {
            const usersQuery = query(
              collection(db, "users"),
              where("email", "==", rental.renterEmail)
            );
            const userSnap = await getDocs(usersQuery);
            if (!userSnap.empty) {
              photos[rental.renterEmail] = userSnap.docs[0].data().photoURL || "/default-profile.png";
            }
          } catch (err) {
            console.error("Error fetching renter photo:", err);
          }
        }
      }
      setRenterPhotos(photos);
    });
    
    return () => unsub();
  }, [ownerEmail]);

const totalWithdrawn = withdrawals
    .filter(w => w.status !== "rejected")
    .reduce((sum, w) => sum + Number(w.amount || 0), 0);

  const balance = earnings;
  const withdrawn = totalWithdrawn;

   const toggleWithdrawals = () => setShowWithdrawals(prev => !prev);

  const [withdrawMethod, setWithdrawMethod] = useState("");
  const [withdrawAccountName, setWithdrawAccountName] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawPassword, setWithdrawPassword] = useState("");
const [showWithdrawForm, setShowWithdrawForm] = useState(false);
const [showWithdrawals, setShowWithdrawals] = useState(false); // State for toggling visibility

const handleWithdraw = async () => {
    if (!withdrawMethod || !withdrawAccountName || !withdrawPhone) {
      setToastMessage("⚠️ Please fill in all withdrawal details!");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

    if (balance < 500) {
      setToastMessage("⚠️ Minimum balance of ₱500 required to withdraw");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

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

      // Reset owner's balance to 0
      await updateDoc(doc(db, "owners", auth.currentUser.uid), {
        totalEarnings: 0,
      });

      setToastMessage("✅ Withdrawal request submitted!");
      setTimeout(() => {
        // Reset form
        setWithdrawMethod("");
        setWithdrawAccountName("");
        setWithdrawPhone("");
        setShowWithdrawForm(false);
        setToastMessage("");
      }, 1500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to submit withdrawal");
      setTimeout(() => setToastMessage(""), 4000);
    }
  };


   // 4️⃣ Update old withdrawals with emails (optional cleanup)
  useEffect(() => {
    const updateOldWithdrawalsWithEmails = async () => {
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
            }
          }
        }
      } catch (err) {
        console.error("❌ Error updating withdrawals:", err);
      }
    };

    updateOldWithdrawalsWithEmails();
  }, []);


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

// Fetch profile photos for conversation users
useEffect(() => {
  const fetchUserPhotos = async () => {
    const photos = {};
    for (const email of conversationUsers) {
      if (email && email !== "renthub-support") {
        try {
          const usersQuery = query(
            collection(db, "users"),
            where("email", "==", email)
          );
          const userSnap = await getDocs(usersQuery);
          if (!userSnap.empty) {
            photos[email] = userSnap.docs[0].data().photoURL || "/default-profile.png";
          } else {
            photos[email] = "/default-profile.png";
          }
        } catch (err) {
          console.error("Error fetching user photo:", err);
          photos[email] = "/default-profile.png";
        }
      }
    }
    setUserPhotos(photos);
  };
  
  if (conversationUsers.length > 0) {
    fetchUserPhotos();
  }
}, [conversationUsers.length]);

// Mark messages as read when conversation is opened
useEffect(() => {
  const markMessagesAsRead = async () => {
    if (!selectedChat || !currentUserEmail) return;
    
    try {
      const unreadMessages = messages.filter(
        m => m.sender === selectedChat && 
             m.receiver === currentUserEmail && 
             !m.read
      );
      
      const updatePromises = unreadMessages.map(msg => 
        updateDoc(doc(db, "messages", msg.id), { read: true })
      );
      
      await Promise.all(updatePromises);
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  };
  
  markMessagesAsRead();
}, [selectedChat, currentUserEmail]);

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
  if (messageLoading) return; // Prevent double submission

  try {
    setMessageLoading(true);
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
  } finally {
    setMessageLoading(false);
  }
};

const handleDeleteConversation = async (chatUserEmail) => {
  if (!window.confirm("Delete this conversation?")) return;
  try {
    const conv = messages.filter(
      m =>
        (m.sender === chatUserEmail && m.receiver === currentUserEmail) ||
        (m.sender === currentUserEmail && m.receiver === chatUserEmail)
    );
    const batch = conv.map(m => deleteDoc(doc(db, "messages", m.id)));
    await Promise.all(batch);
    setSelectedChat(null);
    setToastMessage("✅ Conversation deleted");
    setTimeout(() => setToastMessage(""), 2500);
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to delete conversation");
    setTimeout(() => setToastMessage(""), 3500);
  }
};

// Handle Support Messages to Admin with Auto-Reply
const handleSupportMessage = async () => {
  const text = replyText["renthub-support"]?.trim();
  if (!text || !currentUserEmail) return alert("Message cannot be empty");

  try {
    // Send user message to admin
    const userMessage = {
      sender: currentUserEmail,
      receiver: "renthub-support",
      text,
      userRole: userRole,
      status: "pending",
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "messages"), userMessage);

    // Create support ticket for admin
    await addDoc(collection(db, "support_tickets"), {
      ticketId: `TICKET-${Date.now()}`,
      sender: currentUserEmail,
      senderRole: userRole,
      senderName: displayName || "User",
      message: text,
      status: "open",
      priority: "normal",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Intelligent auto-reply based on keywords
    let autoReplyText = "";
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes("withdrawal") || lowerText.includes("withdraw") || lowerText.includes("payout")) {
      autoReplyText = "🤖 Withdrawal Support: Minimum withdrawal is ₱500. Submit your GCash details and admin will process within 24-48 hours. Check Withdrawal History for status updates.";
    } else if (lowerText.includes("earnings") || lowerText.includes("payment") || lowerText.includes("bayad")) {
      autoReplyText = "🤖 Earnings Support: Your earnings update automatically when renters complete payments. View Individual Earnings for breakdown. Contact admin if you see missing earnings.";
    } else if (lowerText.includes("property") || lowerText.includes("listing") || lowerText.includes("post")) {
      autoReplyText = "🤖 Property Management: Add new properties in My Properties section. Include clear photos, accurate descriptions, and competitive pricing. Admin approves listings within 24 hours.";
    } else if (lowerText.includes("renter") || lowerText.includes("tenant") || lowerText.includes("message")) {
      autoReplyText = "🤖 Renter Communication: Respond to renter messages promptly in the Messages section. Mark rentals as 'Completed' after successful transaction to receive earnings.";
    } else if (lowerText.includes("approval") || lowerText.includes("approve") || lowerText.includes("reject")) {
      autoReplyText = "🤖 Rental Approval: Review rental requests in the Rent List section. Approve or reject based on renter details. Communicate any concerns via Messages before deciding.";
    } else if (lowerText.includes("account") || lowerText.includes("profile") || lowerText.includes("gcash")) {
      autoReplyText = "🤖 Account Support: Update your GCash number in Settings for withdrawals. Keep your profile updated with valid contact information. For account issues, admin will assist within 24 hours.";
    } else if (lowerText.includes("how") || lowerText.includes("paano")) {
      autoReplyText = "🤖 How to Manage Your Properties:\\n1. Add properties in My Properties section\\n2. Wait for admin approval (24 hours)\\n3. Respond to renter inquiries in Messages\\n4. Approve/reject rental requests in Rent List\\n5. Mark completed rentals to receive earnings\\n6. Withdraw earnings when balance reaches ₱500\\n\\nNeed more help? An admin will respond shortly!";
    } else {
      autoReplyText = "🤖 Thank you for contacting RentHub Support! We have received your message and will respond within 24 hours. For urgent concerns, please include 'URGENT' in your message.";
    }

    // Send auto-reply immediately
    await addDoc(collection(db, "messages"), {
      sender: "renthub-support",
      receiver: currentUserEmail,
      text: autoReplyText,
      isAutoReply: true,
      createdAt: serverTimestamp(),
    });

    setReplyText(prev => ({ ...prev, "renthub-support": "" }));
    // Auto-scroll to see reply
    setTimeout(() => {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 500);
  } catch (err) {
    console.error(err);
    alert("❌ Failed to send support message.");
  }
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
    {/* TOAST NOTIFICATION */}
    {toastMessage && (
      <div className={`toast-notification ${
        toastMessage.includes("✅") ? "success" : 
        (toastMessage.includes("❌") ? "error" : "warning")
      }`}>
        {toastMessage}
      </div>
    )}
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
    <h2>Owner Dashboard Overview</h2>
    <div className="overview-cards">

      {/* Owner Profile */}
      <div className="overview-card" onClick={() => setActivePage("ownerProfile")}>
        <h3>Owner Profile</h3>
        <p>View and edit your profile</p>
      </div>

      {/* Rental Items */}
      <div className="overview-card" onClick={() => setActivePage("rentalitem")}>
        <h3>Rental Items</h3>
        <p>Total: {rentals.length}</p>
        <small>Active properties listed</small>
      </div>

      {/* Total Earnings */}
      <div className="overview-card" onClick={() => setActivePage("totalEarnings")}>
        <h3>Total Earnings</h3>
        <p>Balance: ₱{balance.toFixed(2)}</p>
        <small>Withdrawn: ₱{withdrawn.toFixed(2)}</small>
      </div>

      {/* Messages */}
      <div className="overview-card" onClick={() => setActivePage("messages")}>
        <h3>Messages</h3>
        <p>Conversations: {conversationUsers.length}</p>
      </div>

      {/* Add Rental Item */}
      <div className="overview-card" onClick={() => setActivePage("addrentalitem")}>
        <h3>Add Rental Item</h3>
        <p>Create new listing</p>
      </div>

    </div>
  </section>
)}


 {/* TOTAL EARNINGS */}
{activePage === "totalEarnings" && userRole === "owner" && (
  <section className="totalearnings-owner">
    <h2>Total Earnings</h2>

    {/* Balance Section */}
    <div className="balance-section">
      <div className="balance-card">
        <p className="balance-label">Current Balance</p>
        <p className="balance-amount">₱{balance.toFixed(2)}</p>
        <p className="balance-withdrawn">Withdrawn: ₱{withdrawn.toFixed(2)}</p>
      </div>
    </div>

    {/* Withdraw Funds Section */}
    <div className="withdraw-section">
      <h3>Withdraw Funds</h3>
      
      <button
        className="withdraw-btn"
        onClick={() => setShowWithdrawForm(prev => !prev)}
        disabled={balance < 500}
      >
        {showWithdrawForm ? "Cancel" : "Withdraw Now"}
      </button>

      {balance < 500 && (
        <p className="withdraw-info">Minimum balance of ₱500 needed to withdraw</p>
      )}

      {/* Withdraw Form */}
      {showWithdrawForm && balance >= 500 && (
        <div className="withdraw-form">
          <h4>Withdrawal Details</h4>
          
          <div className="form-group">
            <label>Amount to Withdraw:</label>
            <input 
              type="text" 
              value={`₱${balance.toFixed(2)}`} 
              disabled 
              className="withdraw-amount-display"
            />
          </div>

          <div className="form-group">
            <label>Withdrawal Method: *</label>
            <select 
              value={withdrawMethod} 
              onChange={e => setWithdrawMethod(e.target.value)}
              required
            >
              <option value="">-- Select Payment Method --</option>
              <option value="GCash">GCash</option>
              <option value="PayMaya">PayMaya</option>
            </select>
          </div>

          <div className="form-group">
            <label>Account Name: *</label>
            <input 
              type="text" 
              value={withdrawAccountName} 
              onChange={e => setWithdrawAccountName(e.target.value)}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="form-group">
            <label>Phone Number: *</label>
            <input 
              type="tel" 
              value={withdrawPhone} 
              onChange={e => setWithdrawPhone(e.target.value)}
              placeholder="09XXXXXXXXX"
              required
            />
          </div>

          <div className="form-actions">
            <button 
              className="confirm-withdraw-btn"
              disabled={balance < 500 || !withdrawMethod || !withdrawAccountName || !withdrawPhone} 
              onClick={handleWithdraw}
            >
               Confirm Withdrawal
            </button>
            <button 
              className="cancel-btn"
              onClick={() => {
                setShowWithdrawForm(false);
                setWithdrawMethod("");
                setWithdrawAccountName("");
                setWithdrawPhone("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Withdrawal History Section */}
    <div className="withdrawal-history-section">
      <h3>Withdrawal History</h3>
      <button 
        className="toggle-btn" 
        onClick={toggleWithdrawals}
        style={{
          backgroundColor: showWithdrawals ? '#9e9e9e' : '#2196F3'
        }}
      >
        {showWithdrawals ? "Hide Withdrawal History" : "Show Withdrawal History"}
      </button>

      {showWithdrawals && (
        <div className="withdrawals-list">
          {withdrawals.length === 0 ? (
            <p className="empty-message">📭 No withdrawal history yet.</p>
          ) : (
            <>
              {withdrawals
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .map(w => (
                  <div key={w.id} className="withdrawal-item">
                    <div className="withdrawal-header">
                      <span className={`status-badge ${w.status}`}>
                        {w.status === "approved" && "Approved"}
                        {w.status === "pending" && "Pending"}
                        {w.status === "rejected" && "Rejected"}
                      </span>
                      <span className="withdrawal-date">
                        {w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    <div className="withdrawal-details">
                      <div className="detail-row">
                        <strong>Amount:</strong>
                        <span>₱{Number(w.amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Method:</strong>
                        <span>{w.method || "N/A"}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Account:</strong>
                        <span>{w.accountName || "N/A"}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Phone:</strong>
                        <span>{w.phone || "N/A"}</span>
                      </div>
                    </div>
                    
                    {/* Delete Button */}
                    <button 
                      className="delete-withdrawal-btn"
                      onClick={() => handleDeleteWithdrawal(w.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              }
            </>
          )}
        </div>
      )}
    </div>

    {/* Individual Earnings Section */}
    <div className="individual-earnings-section">
      <h3>Individual Earnings</h3>
      <button className="toggle-btn" onClick={() => setShowIndividualEarnings(prev => !prev)}>
        {showIndividualEarnings ? "Hide Individual Earnings" : "Show Individual Earnings"}
      </button>

      {showIndividualEarnings && (
        <div className="earnings-list">
          {completedRentals.length === 0 ? (
            <div className="empty-earnings">
              <p className="empty-message">No completed rentals yet.</p>
              <p className="empty-hint">Your rental earnings will appear here one-by-one when admin completes rentals.</p>
            </div>
          ) : (
            <>
              {/* Delete All Button */}
              <button 
                onClick={handleDeleteAllEarnings}
                className="delete-all-earnings-btn"
              >
                 Clear All Earnings History
              </button>

              {/* Individual Earnings Items */}
              <div className="earnings-items-container">
                <h4>Completed Earnings ({completedRentals.length})</h4>
                <p className="earnings-hint">Each rental completed by admin:</p>
                {completedRentals
                  .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))
                  .map((rental, index) => (
                    <div key={rental.id} className="earnings-item">
                      <div className="earnings-item-header">
                        <span className="status-badge completed">✅ Completed</span>
                      </div>
                      
                      {/* Property Image */}
                      {(rental.propertyImage || rental.imageUrl) && (
                        <div className="earnings-image-container">
                          <img src={rental.propertyImage || rental.imageUrl} alt={rental.propertyName || rental.name} className="earnings-property-image" />
                        </div>
                      )}
                      
                      <div className="earnings-details">
                        <div className="detail-row">
                          <strong>Property:</strong>
                          <span>{rental.propertyName || rental.name || "N/A"}</span>
                        </div>
                        <div className="detail-row highlight">
                          <strong>Earned Amount:</strong>
                          <span className="price-highlight">₱{(Number(rental.dailyRate || 0) * Number(rental.rentalDays || 1)).toFixed(2)}</span>
                        </div>
                        <div className="detail-row">
                          <strong>Renter:</strong>
                          <div className="renter-info">
                            {renterPhotos[rental.renterEmail] && (
                              <img src={renterPhotos[rental.renterEmail]} alt="Renter" className="renter-photo" />
                            )}
                            <span>{rental.renterEmail || "N/A"}</span>
                          </div>
                        </div>
                        <div className="detail-row">
                          <strong>Completed:</strong>
                          <span>
                            {rental.completedAt?.toDate 
                              ? rental.completedAt.toDate().toLocaleString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : (rental.createdAt?.toDate 
                                ? rental.createdAt.toDate().toLocaleString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : "N/A")}
                          </span>
                        </div>
                      </div>
                      
                      {/* Delete Button */}
                      <button 
                        className="delete-earning-btn"
                        onClick={() => handleDeleteEarning(rental.id, Number(rental.dailyRate || 0) * Number(rental.rentalDays || 1))}
                      >
                         Delete
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  </section>
)}




 {/* MESSAGES */}
{activePage === "messages" && userRole === "owner" && (
  <section className="messages-owner">
    <h2>Messages</h2>
    <div className={`messages-container ${selectedChat ? "chat-open" : "no-chat"}`}>
      
      {/* Conversation List */}
      <div className="conversation-list">
        <h3>Conversations</h3>
        
        {/* Search Bar */}
        <div className="messages-search-box">
          <span>🔍</span>
          <input
            type="text"
            className="messages-search-input"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {/* Regular Conversations */}
        {conversationUsers.length === 0 ? (
          <p className="no-messages-text">No renter messages yet.</p>
        ) : (
          conversationUsers
            .filter(user => user !== "renthub-support")
            .filter(user => messages.some(m => 
              ((m.sender === ownerEmail && m.receiver === user) || 
               (m.sender === user && m.receiver === ownerEmail)) && 
              !m.isAdminReply
            ))
            .filter(user => {
              if (!searchTerm) return true;
              const userMessages = messages.filter(m =>
                (m.sender === user && m.receiver === ownerEmail) ||
                (m.sender === ownerEmail && m.receiver === user)
              );
              const lastMessage = userMessages[userMessages.length - 1];
              return (
                user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (lastMessage?.text || "").toLowerCase().includes(searchTerm.toLowerCase())
              );
            })
            .map(user => {
              const userMessages = messages.filter(m =>
                (m.sender === user && m.receiver === ownerEmail) ||
                (m.sender === ownerEmail && m.receiver === user)
              );
              const lastMessage = userMessages[userMessages.length - 1];
              const unreadCount = userMessages.filter(m => 
                m.sender === user && m.receiver === ownerEmail && !m.read
              ).length;
              
              return (
                <div
                  key={user}
                  className={`conversation-item ${selectedChat === user ? "active" : ""}`}
                  onClick={() => setSelectedChat(user)}
                >
                  {/* Avatar */}
                  <div className="conversation-avatar">
                    {userPhotos[user] ? (
                      <img src={userPhotos[user]} alt={user} />
                    ) : (
                      <span>{user.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  
                  {/* Preview */}
                  <div className="conversation-preview">
                    <div className="conversation-email">{user}</div>
                    <div className="conversation-preview-text">
                      {lastMessage?.text || "No messages yet"}
                    </div>
                  </div>
                  
                  {/* Unread Badge */}
                  {unreadCount > 0 && (
                    <span className="conversation-badge">{unreadCount}</span>
                  )}
                  
                  {/* Delete Button */}
                  <button
                    className="conversation-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(user);
                    }}
                    title="Delete conversation"
                  >
                    🗑️
                  </button>
                </div>
              );
            })
        )}
      </div>

      {/* Chat Window */}
      <div className="chat-window">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <h3>Chat with {selectedChat}</h3>
              <button className="close-chat-btn" onClick={() => setSelectedChat(null)}>✖</button>
            </div>

            {/* Chat Messages */}
            <div className="chat-messages">
              {messages
                .filter(
                  m =>
                    (m.sender === ownerEmail && m.receiver === selectedChat) ||
                    (m.sender === selectedChat && m.receiver === ownerEmail)
                )
                .filter(m => !m.isAdminReply)
                .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
                .map(m => (
                  <div
                    key={m.id}
                    className={`chat-bubble ${m.sender === ownerEmail ? "sent" : "received"} ${m.isAutoReply || m.isAdminReply ? "auto-reply-message" : ""}`}
                  >
                    {m.isAutoReply && (
                      <div className="auto-reply-label">
                        <span>🤖</span> AI Assistant
                      </div>
                    )}
                    {m.isAdminReply && (
                      <div className="admin-reply-label">
                        <span>👤</span> Support Team
                      </div>
                    )}
                    <p className="chat-message-text">{m.text}</p>
                    <small className="chat-message-time">
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
                  if (e.key === "Enter" && !messageLoading) {
                    handleReply(selectedChat);
                  }
                }}
                disabled={messageLoading}
              />
              <button 
                onClick={() => handleReply(selectedChat)}
                disabled={messageLoading}
              >
                {messageLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        ) : (
          <div className="no-chat-selected-container">
            <p className="no-chat-selected">Select a conversation to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  </section>
)}


       {activePage === "addrentalitem" && userRole === "owner" && (
  <section className="addrentalitem-section">
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

      <button type="submit" disabled={!formData.agreed || formSubmitting}>
        {formSubmitting ? "Submitting..." : "Submit Rental Item"}
      </button>
    </form>
  </section>
)}

        {/* RENTAL ITEMS */}
        {activePage === "rentalitem" && userRole === "owner" && (
          <section className="rentalitem-owner">
            <h2>Rental Item</h2>
            {posts.length===0 ? <p>No rental items yet.</p> : (
              <div className="properties-list">
                {posts.map(post=>(
              <div key={post.id} className="property-card">
                {post.imageUrl && <img src={post.imageUrl} alt={post.name} className="property-image"/>}
                <h3>{post.name}</h3>
                <p><strong>Price:</strong> ₱{post.price}</p>
                <p><strong>Status:</strong> {post.status}</p>
                <div className="property-actions">
                  <button className="delete-btn" onClick={()=>handleDeletePost(post.id)}>🗑️ Delete</button>
                </div>

                {/* Comments Section */}
                <div className="comments-section">
                  <button
                    type="button"
                    onClick={() =>
                      setShowCommentsSection(prev => ({
                        ...prev,
                        [post.id]: !prev[post.id]
                      }))
                    }
                  >
                    {showCommentsSection[post.id] ? "Hide Comments" : "Show Comments"}
                  </button>

                  {showCommentsSection[post.id] && (
                    <>
                      <button onClick={() => handleDeleteAllComments(post.id)}>🗑 Delete All Comments</button>

                      <div className="comments-list">
                        {(comments[post.id] || []).map((c) => (
                          <div key={c.id} className="comment-card">
                            <p>
                              <strong>{c.userName}:</strong> {c.comment}
                            </p>

                            {c.imageUrl && (
                              <img
                                src={c.imageUrl}
                                alt="Comment proof"
                                className="comment-image-preview"
                              />
                            )}

                            {!showReplyInput[c.id] && (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowReplyInput(prev => ({ ...prev, [c.id]: true }))
                                }
                              >
                                Reply
                              </button>
                            )}

                            {showReplyInput[c.id] && (
                              <div className="reply-input-row">
                                <input
                                  type="text"
                                  placeholder="Reply..."
                                  value={commentReplyText[c.id] || ""}
                                  onChange={(e) =>
                                    setCommentReplyText(prev => ({
                                      ...prev,
                                      [c.id]: e.target.value
                                    }))
                                  }
                                />
                                <button onClick={() => handleAddReply(post.id, c.id)}>
                                  Reply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCommentReplyText(prev => ({ ...prev, [c.id]: "" }));
                                    setShowReplyInput(prev => ({ ...prev, [c.id]: false }));
                                  }}
                                >
                                  Close
                                </button>
                              </div>
                            )}

                            {c.replies?.map((r) => (
                              <p key={r.id} className="reply">
                                <strong>{r.userName}:</strong> {r.comment}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            </div>
            )}
          </section>
        )}



      
  </div>
</div>
  );
}
export default OwnerDashboard;
