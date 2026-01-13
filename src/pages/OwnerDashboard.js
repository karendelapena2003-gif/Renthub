
import React, { useState, useEffect, useRef } from "react";
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
import { getAuth, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword, reauthenticateWithPopup, GoogleAuthProvider } from "firebase/auth";



const OwnerDashboard = ({ onLogout }) => {
      // Utility: Fix all withdrawal documents to ensure correct ownerId and ownerEmail
      // Run this function once if you have permission errors when removing withdrawals
      async function fixAllWithdrawalsOwnerFields() {
        try {
          const withdrawalsCol = collection(db, "withdrawals");
          const withdrawalsSnap = await getDocs(withdrawalsCol);
          let fixed = 0;
          for (const wDoc of withdrawalsSnap.docs) {
            const wData = wDoc.data();
            let needsUpdate = false;
            const updateObj = {};
            // Fix ownerId if missing or wrong
            if (!wData.ownerId || wData.ownerId !== auth.currentUser.uid) {
              updateObj.ownerId = auth.currentUser.uid;
              needsUpdate = true;
            }
            // Fix ownerEmail if missing or wrong
            if (!wData.ownerEmail || wData.ownerEmail !== auth.currentUser.email) {
              updateObj.ownerEmail = auth.currentUser.email;
              needsUpdate = true;
            }
            if (needsUpdate) {
              await updateDoc(doc(db, "withdrawals", wDoc.id), updateObj);
              fixed++;
              console.log(`✅ Fixed withdrawal ${wDoc.id}:`, updateObj);
            }
          }
          alert(`Fixed ${fixed} withdrawal documents. You can now try removing withdrawals again.`);
        } catch (err) {
          console.error("❌ Error fixing withdrawals:", err);
          alert("❌ Error fixing withdrawals: " + err.message);
        }
      }
      // To run: Open browser console and call fixAllWithdrawalsOwnerFields()
  const [user, setUser] = useState(auth.currentUser);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(user?.photoURL || "");
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [posts, setPosts] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();
    const [withdrawals, setWithdrawals] = useState([]);
  const [earnings, setEarnings] = useState(0);
  const ownerEmail = auth.currentUser?.email || user?.email || "";
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
  const [adminPhoto, setAdminPhoto] = useState("");

  // State for expanded withdrawal row
  const [expandedWithdrawal, setExpandedWithdrawal] = useState(null);
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [myRentalsView, setMyRentalsView] = useState([]);
  const [showRentersFor, setShowRentersFor] = useState(null); // property ID to show renters
  const [selectedRenterForMessage, setSelectedRenterForMessage] = useState(null);
  const [renterMessage, setRenterMessage] = useState("");
  const [viewingPropertyRenters, setViewingPropertyRenters] = useState(null); // For separate page view
  const [showReviewsPanel, setShowReviewsPanel] = useState({});
  const [editingPropertyId, setEditingPropertyId] = useState(null);
  const [editPropertyForm, setEditPropertyForm] = useState({ maxRenters: 1 });

  // Comments states
  const [comments, setComments] = useState({});
  const [showCommentsSection, setShowCommentsSection] = useState({});
  const [newComments, setNewComments] = useState({});
  const [commentReplyText, setCommentReplyText] = useState({});
  const [showReplyInput, setShowReplyInput] = useState({});

  // Role verification on mount
  useEffect(() => {
    const verifyOwnerRole = async () => {
      if (!auth.currentUser) {
        navigate("/");
        return;
      }

      try {
        // Check users collection first
        let userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        let role = userDoc.exists() ? userDoc.data().role : null;

        // Fallback to owners collection
        if (!role) {
          const ownerDoc = await getDoc(doc(db, "owners", auth.currentUser.uid));
          if (ownerDoc.exists()) {
            role = "owner";
          }
        }

        // If not an owner, redirect to renter dashboard
        if (role !== "owner") {
          navigate("/renter-dashboard");
        }
      } catch (err) {
        console.error("Role verification failed:", err);
        navigate("/");
      }
    };

    verifyOwnerRole();
  }, [navigate]);

  
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
          earnings: 0,
          totalEarnings: 0,
          totalWithdrawn: 0,
        };

        setDoc(userDocRef, baseProfile, { merge: true });
        setDoc(doc(db, "users", auth.currentUser.uid), baseProfile, { merge: true });
      }
    });
    return () => unsub();
  }, []);

// Fetch active posts only
useEffect(() => {
  const q = query(collection(db, "properties"), where("ownerEmail", "==", ownerEmail));
  const unsub = onSnapshot(q, (snapshot) => {
    const postData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setPosts(postData.filter(p => !p.deleted));
    setRentals(postData.filter(p => !p.deleted));
  });
  return () => unsub();
}, [ownerEmail]);

// Fetch all rentals for owner's properties
useEffect(() => {
  if (!ownerEmail) return;
  const q = query(collection(db, "rentals"), where("ownerEmail", "==", ownerEmail));
  const unsub = onSnapshot(q, (snapshot) => {
    const rentalData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setMyRentalsView(rentalData);
    console.log("Owner's rentals loaded:", rentalData.length);
  });
  return () => unsub();
}, [ownerEmail]);

// Aggregate ratings from rentals and persist to property docs so renters can see totals
useEffect(() => {
  if (!posts.length || !myRentalsView.length) return;
  
  const updatedPosts = posts.map(post => {
    // Find all rentals with ratings for this property (any status once rated)
    const propertyRentals = myRentalsView.filter(r => 
      r.propertyId === post.id && 
      r.rating != null && 
      r.rating > 0
    );
    
    if (propertyRentals.length === 0) return post;
    
    // Aggregate ratings
    const ratings = propertyRentals.map(r => ({
      rating: r.rating,
      review: r.review || r.returnDescription || "",
      renterEmail: r.renterEmail,
      renterName: r.renterName || "Anonymous",
      rentalId: r.id,
      propertyName: r.propertyName,
      createdAt: r.reviewedAt || r.returnedAt || new Date().toISOString(),
    }));
    
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const ratingCount = ratings.length;
    const averageRating = totalRating / ratingCount;
    
    // If aggregates changed, persist to Firestore so renters can read
    const shouldPersist = (post.ratingCount !== ratingCount) || (Number(post.averageRating || 0).toFixed(2) !== averageRating.toFixed(2)) || (post.totalRating !== totalRating);
    if (shouldPersist) {
      const propertyRef = doc(db, "properties", post.id);
      updateDoc(propertyRef, {
        ratings,
        totalRating,
        ratingCount,
        averageRating,
      }).catch((e) => console.warn("Failed to persist rating aggregates", post.id, e));
    }
    
    return {
      ...post,
      ratings,
      totalRating,
      ratingCount,
      averageRating,
    };
  });
  
  setPosts(updatedPosts);
}, [myRentalsView, posts]);

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

  // ---------- Helper Functions ----------
  
  // Calculate due date for rental
  const getDueDate = (rental) => {
    const dateRented = rental.dateRented || rental.createdAt;
    if (!dateRented) return null;
    
    const rentedDate = dateRented.toDate ? dateRented.toDate() : new Date(dateRented);
    const rentalDays = rental.rentalDays || 1;
    const dueDate = new Date(rentedDate);
    dueDate.setDate(dueDate.getDate() + rentalDays);
    return dueDate;
  };

  // Calculate days overdue
  const getDaysOverdue = (rental) => {
    const now = new Date();
    const dueDate = getDueDate(rental);
    if (!dueDate) return 0;
    
    const diffTime = now - dueDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // ---------- Profile handlers ----------


  // Send message to renter
  const handleSendMessageToRenter = async (renterEmail) => {
    if (!renterMessage.trim()) {
      setToastMessage("⚠️ Please enter a message");
      setTimeout(() => setToastMessage(""), 2500);
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        sender: ownerEmail,
        receiver: renterEmail,
        participants: [ownerEmail.toLowerCase(), renterEmail.toLowerCase()],
        senderRole: "owner",
        receiverRole: "renter",
        text: renterMessage,
        createdAt: serverTimestamp(),
      });

      setToastMessage("✅ Message sent to renter");
      setTimeout(() => setToastMessage(""), 2500);
      setRenterMessage("");
      setSelectedRenterForMessage(null);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to send message");
      setTimeout(() => setToastMessage(""), 2500);
    }
  };

  // Edit property (maxRenters)
  const handleEditProperty = (property) => {
    setEditingPropertyId(property.id);
    setEditPropertyForm({ maxRenters: property.maxRenters || 1 });
  };

  const handleSavePropertyEdit = async () => {
    if (editingPropertyId && editPropertyForm.maxRenters > 0) {
      try {
        await updateDoc(doc(db, "properties", editingPropertyId), {
          maxRenters: editPropertyForm.maxRenters,
          updatedAt: serverTimestamp(),
        });
        setToastMessage("✅ Property updated! Renters will see available slots now.");
        setTimeout(() => setToastMessage(""), 3500);
        setEditingPropertyId(null);
      } catch (err) {
        console.error(err);
        setToastMessage("❌ Failed to update property");
        setTimeout(() => setToastMessage(""), 2500);
      }
    }
  };

  const handleCancelPropertyEdit = () => {
    setEditingPropertyId(null);
    setEditPropertyForm({ maxRenters: 1 });
  };

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
    const auth = getAuth();
    const user = auth.currentUser;

    // Check if user has password provider (email/password login)
    const hasPasswordProvider = user.providerData.some(
      provider => provider.providerId === "password"
    );

    const hasGoogleProvider = user.providerData.some(
      provider => provider.providerId === "google.com"
    );

    setPasswordLoading(true);

    try {
      // If user has Google provider, use Google popup to authenticate
      if (hasGoogleProvider) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(user, provider);
        
        // If also has password provider, ask if they want to change it
        if (hasPasswordProvider) {
          // Show form to set new password
          setToastMessage("✅ Authenticated! Now enter your new password below");
          setTimeout(() => setToastMessage(""), 3000);
          setPasswordLoading(false);
          return;
        } else {
          // Google-only user, just confirm
          setToastMessage("✅ Password confirmed via Google! Your account is secure.");
          setTimeout(() => setToastMessage(""), 3000);
          setShowSettings(false);
          setPasswordLoading(false);
          return;
        }
      } 
      // If user only has password, require current password
      else if (hasPasswordProvider) {
        if (!currentPassword) {
          setToastMessage("⚠️ Please enter your current password");
          setTimeout(() => setToastMessage(""), 2500);
          setPasswordLoading(false);
          return;
        }

        if (!newPassword || !confirmPassword) {
          setToastMessage("⚠️ Please fill in all fields");
          setTimeout(() => setToastMessage(""), 2500);
          setPasswordLoading(false);
          return;
        }

        if (newPassword !== confirmPassword) {
          setToastMessage("⚠️ Passwords do not match");
          setTimeout(() => setToastMessage(""), 2500);
          setPasswordLoading(false);
          return;
        }

        if (newPassword.length < 6) {
          setToastMessage("⚠️ Password must be at least 6 characters");
          setTimeout(() => setToastMessage(""), 2500);
          setPasswordLoading(false);
          return;
        }

        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        await reauthenticateWithCredential(user, credential);

        // Update password
        await updatePassword(user, newPassword);

        setToastMessage("✅ Password updated successfully!");
        setTimeout(() => setToastMessage(""), 3000);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowSettings(false);
      }
    } catch (error) {
      console.error("Password change error:", error);
      if (error.code === "auth/wrong-password") {
        setToastMessage("❌ Current password is incorrect");
      } else if (error.code === "auth/weak-password") {
        setToastMessage("❌ Password is too weak");
      } else if (error.code === "auth/popup-closed-by-user") {
        setToastMessage("⚠️ Authentication cancelled. Please try again.");
      } else if (error.code === "auth/requires-recent-login") {
        setToastMessage("❌ Session expired. Please logout and login again, then retry.");
      } else {
        setToastMessage("❌ " + error.message);
      }
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

        const resolvedOwnerEmail = auth.currentUser?.email || ownerEmail;
        const resolvedOwnerId = auth.currentUser?.uid || ownerId;

        await addDoc(collection(db, "properties"), {
          name: formData.name,
          price: Number(formData.price),
          description: formData.description,
          imageUrl,
          ownerEmail: resolvedOwnerEmail,
          ownerEmailLower: (resolvedOwnerEmail || "").toLowerCase(),
          ownerId: resolvedOwnerId,
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

  // Soft delete post
  const handleDeletePost = async (id) => {
    try {
      await updateDoc(doc(db, "properties", id), { deleted: true, deletedAt: serverTimestamp() });
      setToastMessage("✅ Post moved to Recently Deleted");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete post");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };


  const handleDeleteRental = async (rentalId) => {
    if (!window.confirm("Are you sure you want to delete this rental record?")) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, "rentals", rentalId));
      setToastMessage("✅ Rental deleted successfully");
      setTimeout(() => setToastMessage(""), 2500);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete rental");
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

  // Remove earning delete for owner: Only admin can remove from rent list
  // (No-op: function removed)


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

  // Remove withdrawal delete for owner: Only admin can remove from rent list
  // (No-op: function removed)

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


  // 1️⃣ Listen for real-time owner earnings (current balance)
  useEffect(() => {
    if (!ownerId) return;
    const ownerRef = doc(db, "owners", ownerId);
    
    // Ensure owner doc exists with proper fields
    setDoc(ownerRef, {
      earnings: 0,
      totalEarnings: 0
    }, { merge: true }).catch(err => {
      console.warn("Could not initialize owner doc:", err.message);
    });

    const unsub = onSnapshot(
      ownerRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const currentBalance = Number((data && (data.earnings ?? data.totalEarnings)) ?? 0);
          setEarnings(currentBalance);
          console.log("✅ [Owner Earnings] Updated balance:", currentBalance, "ownerId:", ownerId, "doc earnings:", data?.earnings, "doc totalEarnings:", data?.totalEarnings);
        } else {
          console.warn("⚠️ [Owner Earnings] Owner doc does not exist:", ownerId);
          setEarnings(0);
        }
      },
      (error) => {
        console.error("❌ [Owner Earnings] Subscription error:", error.code, error.message);
        setToastMessage("⚠️ Cannot load earnings (permission/connection issue)");
        setTimeout(() => setToastMessage(""), 3000);
      }
    );
    return () => unsub();
  }, [ownerId]);

  // 2️⃣ Fetch withdrawals (live) by ownerId and (fallback) ownerEmail, merge results
  useEffect(() => {
    if (!ownerId && !ownerEmail) return;

    const unsubs = [];
    let latestById = [];
    let latestByEmail = [];

    const pushMerged = () => {
      const mergedMap = new Map();
      [...latestById, ...latestByEmail].forEach(item => {
        if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
      });
      const merged = Array.from(mergedMap.values());
      setWithdrawals(merged);
      console.log("📊 Owner withdrawals merged:", {
        byId: latestById.length,
        byEmail: latestByEmail.length,
        merged: merged.length
      });
    };

    if (ownerId) {
      const q1 = query(
        collection(db, "withdrawals"),
        where("ownerId", "==", ownerId)
      );
      const u1 = onSnapshot(
        q1,
        (snapshot) => {
          latestById = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          pushMerged();
        },
        (error) => {
          console.error("❌ Withdrawals (by ownerId) subscription error:", error);
          setToastMessage("⚠️ Unable to load withdrawals by ownerId.");
          setTimeout(() => setToastMessage(""), 3000);
        }
      );
      unsubs.push(u1);
    }

    if (ownerEmail) {
      const q2 = query(
        collection(db, "withdrawals"),
        where("ownerEmail", "==", ownerEmail)
      );
      const u2 = onSnapshot(
        q2,
        (snapshot) => {
          latestByEmail = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          pushMerged();
        },
        (error) => {
          console.error("❌ Withdrawals (by ownerEmail) subscription error:", error);
          // don't toast twice if byId already worked
        }
      );
      unsubs.push(u2);
    }

    return () => {
      unsubs.forEach(u => u && u());
    };
  }, [ownerId, ownerEmail]);

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
      
      // Fetch renter photos (case-safe by email key)
      const photos = {};
      for (const rental of rentalData) {
        if (rental.renterEmail) {
          try {
            const emailRaw = String(rental.renterEmail).trim();
            const emailKey = emailRaw.toLowerCase();
            const usersQuery = query(
              collection(db, "users"),
              where("email", "==", emailRaw)
            );
            const userSnap = await getDocs(usersQuery);
            if (!userSnap.empty) {
              const data = userSnap.docs[0].data();
              photos[emailKey] = data.photoURL || "/default-profile.png";
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

// Only show withdrawals not soft-deleted by owner in main history
const visibleWithdrawals = withdrawals.filter(w => !w.ownerDeleted);

const totalWithdrawn = visibleWithdrawals
  .filter(w => w.status === "approved")  // Only approved withdrawals
  .reduce((sum, w) => sum + Number(w.amount || 0), 0);

const balance = Math.max(0, earnings - totalWithdrawn);  // Balance after withdrawals (cannot go negative)
const withdrawn = totalWithdrawn;

   const toggleWithdrawals = () => setShowWithdrawals(prev => !prev);

  const [withdrawMethod, setWithdrawMethod] = useState("");
  const [withdrawAccountName, setWithdrawAccountName] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
const [showWithdrawForm, setShowWithdrawForm] = useState(false);
const [showWithdrawals, setShowWithdrawals] = useState(false); // State for toggling visibility
// Inline feedback for Withdrawal History actions
const [historyFeedback, setHistoryFeedback] = useState("");
// Inline feedback for Individual Earnings actions
const [earningsFeedback, setEarningsFeedback] = useState("");
// Hide approved withdrawals by default
const [hideApproved, setHideApproved] = useState(true);

// Locally hidden earnings (UI-only for Individual Earnings), persisted to localStorage
const [hiddenEarningIds, setHiddenEarningIds] = useState(() => {
  try {
    const raw = localStorage.getItem("hiddenEarningIds");
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
});

useEffect(() => {
  try {
    localStorage.setItem("hiddenEarningIds", JSON.stringify(Array.from(hiddenEarningIds)));
  } catch {}
}, [hiddenEarningIds]);
// Locally hidden withdrawals (UI-only); persisted to localStorage
const [hiddenWithdrawalIds, setHiddenWithdrawalIds] = useState(() => {
  try {
    const raw = localStorage.getItem("hiddenWithdrawalIds");
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
});

useEffect(() => {
  try {
    localStorage.setItem(
      "hiddenWithdrawalIds",
      JSON.stringify(Array.from(hiddenWithdrawalIds))
    );
  } catch {}
}, [hiddenWithdrawalIds]);

const handleHideWithdrawal = (withdrawalId) => {
  if (!withdrawalId) return;
  setHiddenWithdrawalIds(prev => new Set(prev).add(withdrawalId));
  // Show inline success on the side, no top toast
  setHistoryFeedback("✅ Successfully deleted from history");
  setTimeout(() => setHistoryFeedback(""), 2000);
};

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

    const amountToWithdraw = Number(withdrawAmount);
    if (!amountToWithdraw || isNaN(amountToWithdraw)) {
      setToastMessage("⚠️ Enter a valid withdrawal amount");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }
    if (amountToWithdraw < 500) {
      setToastMessage("⚠️ Minimum withdrawal amount is ₱500");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }
    if (amountToWithdraw > balance) {
      setToastMessage("⚠️ Amount exceeds current balance");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

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

      // Do not zero out balance on pending request; admin will approve/reject

      setToastMessage("✅ Withdrawal request submitted!");
      setTimeout(() => {
        // Reset form
        setWithdrawMethod("");
        setWithdrawAccountName("");
        setWithdrawPhone("");
        setWithdrawAmount("");
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

// ✅ Single message listener for owner
useEffect(() => {
  if (!ownerEmail) return;
  console.log("🔍 [Owner] Setting up message listener for:", ownerEmail);

  const q = query(
    collection(db, "messages"),
    where("participants", "array-contains", ownerEmail.toLowerCase())
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = msgs.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      setMessages(sorted);
    },
    (error) => {
      console.error("❌ [Owner] Message listener error:", error);
    }
  );

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

// Note: removed broad users collection fetch to comply with rules


// ✅ Get unique conversation partners (excluding owner themselves)
const conversationUsers = Array.from(
  new Set(messages.map(m => (m.sender === ownerEmail ? m.receiver : m.sender)))
).filter(email => email && email.toLowerCase() !== ownerEmail.toLowerCase());

console.log("💬 [Owner] Conversation users:", conversationUsers);

// Fetch profile photos for conversation users (including admin and renters)
useEffect(() => {
  const fetchUserPhotos = async () => {
    const photos = {};
    for (const email of conversationUsers) {
      // Fetch all conversation users except support system
      if (email && email !== "renthub-support") {
        try {
          console.log("🔍 Fetching photo for:", email);
          const emailLc = email.toLowerCase();

          // Try exact match on users.email
          let userSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));

          // Fallback: match on users.emailLower (if stored)
          if (userSnap.empty) {
            userSnap = await getDocs(query(collection(db, "users"), where("emailLower", "==", emailLc)));
          }

          // Last fallback: renters collection
          let userData = null;
          if (!userSnap.empty) {
            userData = userSnap.docs[0].data();
          } else {
            const renterSnap = await getDocs(query(collection(db, "renters"), where("email", "==", email)));
            const renterSnapLc = renterSnap.empty
              ? await getDocs(query(collection(db, "renters"), where("emailLower", "==", emailLc)))
              : renterSnap;
            if (!renterSnapLc.empty) {
              userData = renterSnapLc.docs[0].data();
            }
          }

          const photoURL = userData?.photoURL;
          photos[email] = photoURL || "/default-profile.png";
          console.log("✅ Photo resolved for", email, ":", photos[email]);
        } catch (err) {
          console.error("❌ Error fetching user photo for", email, ":", err);
          photos[email] = "/default-profile.png";
        }
      }
    }
    console.log("📸 All user photos fetched:", photos);
    setUserPhotos(photos);
  };
  
  if (conversationUsers.length > 0) {
    fetchUserPhotos();
  }
}, [JSON.stringify(conversationUsers)]);

// Fetch admin profile information from admin@gmail.com
useEffect(() => {
  const fetchAdminProfile = async () => {
    try {
      const adminQuery = query(
        collection(db, "users"),
        where("email", "==", "admin@gmail.com")
      );
      const adminSnap = await getDocs(adminQuery);
      if (!adminSnap.empty) {
        const adminData = adminSnap.docs[0].data();
        setAdminPhoto(adminData.photoURL || "/default-profile.png");
        setAdminDisplayName(adminData.displayName || "Admin");
      }
    } catch (err) {
      console.error("Error fetching admin profile:", err);
      setAdminPhoto("/default-profile.png");
      setAdminDisplayName("Admin");
    }
  };

  fetchAdminProfile();
}, []);

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
      participants: [currentUserEmail.toLowerCase(), receiverEmail.toLowerCase()],
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
      participants: [currentUserEmail.toLowerCase(), "renthub-support"],
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
      participants: [currentUserEmail.toLowerCase(), "renthub-support"],
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
          <p>Email: {user.email || auth.currentUser?.email || "No Email"}</p>
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
              Change Password
            </button>
          </div>
        )}

        {/* Edit Profile */}
        {isEditing && (
          <div className="profile-form">
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

        {/* Changes Password→ Change Password */}
        {showSettings && (
          <div className="changepassword-form">
            <h3>
              {user?.providerData?.some(p => p.providerId === "password") 
                ? "Change Password" 
                : "Set Password"}
            </h3>

            {user?.providerData?.some(p => p.providerId === "password") && (
              <>
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </>
            )}

            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
            />

            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />

            <div className="profile-form-buttons">
              <button
                onClick={handleChangePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? "Updating..." : (
                  user?.providerData?.some(p => p.providerId === "password") 
                    ? "Update Password" 
                    : "Set Password"
                )}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3>Rental Items</h3>
            <p>Total: {rentals.length}</p>
            <small>Active properties listed</small>
          </div>
        </div>
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


  {/* TOTAL EARNINGS SECTION */}
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
      <p>Choose an amount to withdraw:</p>
      
      <div className="withdraw-buttons">
        <button
          className="withdraw-amount-btn"
          onClick={() => setWithdrawAmount(500)}
          disabled={balance < 500}
        >
          ₱500
        </button>
        <button
          className="withdraw-amount-btn"
          onClick={() => setWithdrawAmount(1000)}
          disabled={balance < 1000}
        >
          ₱1000
        </button>
        <button
          className="withdraw-amount-btn"
          onClick={() => setWithdrawAmount(balance)}
          disabled={balance < 500}
        >
          Withdraw All (₱{balance.toFixed(2)})
        </button>
      </div>

      {balance < 500 && (
        <p className="withdraw-info">Minimum balance of ₱500 needed to withdraw</p>
      )}

      {/* Withdraw Form */}
      {withdrawAmount > 0 && balance >= 500 && (
        <div className="withdraw-form">
          <h4>Withdrawal Details</h4>
          <p className="selected-amount">Selected Amount: ₱{withdrawAmount.toFixed(2)}</p>
          
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
              placeholder="Enter account name"
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
              disabled={
                balance < 500 ||
                !withdrawMethod ||
                !withdrawAccountName ||
                !withdrawPhone ||
                !withdrawAmount ||
                withdrawAmount < 500 ||
                withdrawAmount > balance
              } 
              onClick={handleWithdraw}
            >
               Confirm Withdrawal
            </button>
            <button 
              className="cancel-btn"
              onClick={() => {
                setWithdrawAmount("");
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
      {historyFeedback && (
        <p className="inline-success" role="status">{historyFeedback}</p>
      )}
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
        <div className="withdrawals-table-wrapper">
          {withdrawals.length === 0 ? (
            <p className="empty-message">No withdrawal history yet.</p>
          ) : (
            <table className="withdrawal-details-table">
              <thead>
                <tr>
                  <th>Owner Email</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Requested Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                  .map((w, idx) => (
                    <React.Fragment key={w.id}>
                      <tr className="withdrawal-row">
                        <td className="withdrawal-owner-email">{w.ownerEmail || ownerEmail}</td>
                        <td>₱{Number(w.amount || 0).toFixed(2)}</td>
                        <td>
                          <span className={`status-badge ${w.status}`}>
                            {w.status === "approved" && "Approved"}
                            {w.status === "pending" && "Pending"}
                            {w.status === "rejected" && "Rejected"}
                          </span>
                        </td>
                        <td>{w.createdAt?.toDate ? w.createdAt.toDate().toLocaleString() : "N/A"}</td>
                        <td>
                          <button 
                            className="details-btn" 
                            onClick={() => setExpandedWithdrawal(expandedWithdrawal === w.id ? null : w.id)}
                          >
                            ▶ Details
                          </button>
                        </td>
                      </tr>
                      {expandedWithdrawal === w.id && (
                        <tr className="expandable-row">
                          <td colSpan="5">
                            <div className="withdrawal-expanded">
                              <div><strong>Method:</strong> {w.method || "N/A"}</div>
                              <div><strong>Account Name:</strong> {w.accountName || "N/A"}</div>
                              <div><strong>Phone:</strong> {w.phone || "N/A"}</div>
                              <div><strong>Status:</strong> {w.status}</div>
                              <div><strong>Requested:</strong> {w.createdAt?.toDate ? w.createdAt.toDate().toLocaleString() : "N/A"}</div>
                              {w.remarks && <div><strong>Remarks:</strong> {w.remarks}</div>}
                              {/* Show Confirm Amount and GCash Proof if approved */}
                              {w.status === 'approved' && (
                                <>
                                  <div style={{marginTop:8, fontWeight:600}}>Confirm Amount:</div>
                                  <div style={{marginBottom:8}}>₱{Number(w.amount || 0).toFixed(2)}</div>
                                  {(w.gcashProofImage || w.proofImageUrl) && (
                                    <div style={{marginTop:8}}>
                                      <strong>📷 GCash Proof Image:</strong><br />
                                      <a href={w.gcashProofImage || w.proofImageUrl} target="_blank" rel="noopener noreferrer">
                                        <img 
                                          src={w.gcashProofImage || w.proofImageUrl} 
                                          alt="GCash Proof" 
                                          style={{maxWidth:'180px', maxHeight:'180px', borderRadius:'8px', border:'1px solid #ccc', marginTop:'6px', cursor:'pointer'}}
                                        />
                                      </a>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>

    {/* Individual Earnings Section */}
    <div className="individual-earnings-section">
      <h3>Individual Earnings</h3>
      {earningsFeedback && (
        <p className="inline-success" role="status">{earningsFeedback}</p>
      )}
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
              {/* Individual Earnings Items */}
              <div className="earnings-items-container">
                <h4>Completed Earnings ({completedRentals.length})</h4>
                <p className="earnings-hint">Each rental completed by admin:</p>
                {completedRentals
                  .filter(r => !hiddenEarningIds.has(r.id))
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
                          <span>{rental.renterEmail || rental.renterName || "N/A"}</span>
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
        
        {/* Conversations List */}
        {conversationUsers.length === 0 ? (
          <p className="no-messages-text">No messages yet.</p>
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
                .filter(m => !m.isAdminReply && !m.isAutoReply)
                .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
                .map(m => {
                  return (
                    <div
                      key={m.id}
                      className={`chat-bubble-container ${m.sender === ownerEmail ? "sent" : "received"}`}
                    >
                      {/* Profile Photo for received messages */}
                      {m.sender !== ownerEmail && (
                        <img 
                          src={userPhotos[m.sender] || "/default-profile.png"} 
                          alt={m.sender}
                          className="chat-bubble-avatar"
                          onError={e => { e.target.src = "/default-profile.png"; }}
                        />
                      )}
                      <div className={`chat-bubble ${m.sender === ownerEmail ? "sent" : "received"}`}>
                        <p className="chat-message-text">{m.text}</p>
                        <small className="chat-message-time">
                          {m.createdAt?.toDate
                            ? m.createdAt.toDate().toLocaleTimeString()
                            : new Date().toLocaleTimeString()}
                        </small>
                      </div>
                      {/* Owner Photo for sent messages */}
                      {m.sender === ownerEmail && (
                        <img 
                          src={photoPreview || "/default-profile.png"} 
                          alt="You"
                          className="chat-bubble-avatar"
                        />
                      )}
                    </div>
                  );
                })
              }
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
                {posts.map(post=>{
                  const propertyRentals = myRentalsView.filter(r => r.propertyId === post.id);
                  console.log(`Property ${post.name} (${post.id}):`, propertyRentals.length, "rentals");
                  
                  return (
              <div key={post.id} className="property-card">
                {post.imageUrl && <img src={post.imageUrl} alt={post.name} className="property-image"/>}
                <h3>{post.name}</h3>
                <p><strong>Price:</strong> ₱{post.price}</p>
                <p><strong>Status:</strong> {post.status}</p>

                {/* Ratings Summary (accumulated stars) */}
                {(post.ratingCount > 0 || (Array.isArray(post.ratings) && post.ratings.length > 0)) ? (() => {
                  const totalStars = (post.totalRating != null)
                    ? post.totalRating
                    : (Array.isArray(post.ratings)
                        ? post.ratings.reduce((sum, r) => sum + (Number(r?.rating) || 0), 0)
                        : 0);
                  const reviewCount = (post.ratingCount != null && post.ratingCount > 0)
                    ? post.ratingCount
                    : (Array.isArray(post.ratings) ? post.ratings.length : 0);
                  return (
                    <p>
                      <strong>Rating:</strong> ⭐ {totalStars} ({reviewCount} review{reviewCount > 1 ? "s" : ""})
                    </p>
                  );
                })() : (
                  <p><em>No ratings yet</em></p>
                )}

                {(post.ratingCount > 0 || (Array.isArray(post.ratings) && post.ratings.length > 0)) && (
                  <button
                    type="button"
                    onClick={() => setShowReviewsPanel(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                    style={{ marginTop: "6px" }}
                  >
                    {showReviewsPanel[post.id] ? "Hide Reviews" : "View All Reviews"}
                  </button>
                )}
                {showReviewsPanel[post.id] && Array.isArray(post.ratings) && (
                  <div className="reviews-panel" style={{ marginTop: "8px", background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "8px" }}>
                    {post.ratings.map((rv, idx) => (
                      <div key={idx} className="review-item" style={{ marginBottom: "6px" }}>
                        <div>⭐ {rv.rating} — {rv.review || "(no text)"}</div>
                        <div style={{ fontSize: "0.85em", color: "#666" }}>
                          {rv.renterName || rv.renterEmail || "Anonymous"} • {(() => { try { return rv.createdAt ? (typeof rv.createdAt === "string" ? new Date(rv.createdAt).toLocaleString() : (rv.createdAt?.toDate ? rv.createdAt.toDate().toLocaleString() : new Date(rv.createdAt).toLocaleString())) : "N/A"; } catch { return "N/A"; } })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Admin Removal Indicator */}
                {post.removedByAdmin && (
                  <div style={{
                    backgroundColor: "#ffebee",
                    border: "2px solid #d32f2f",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "10px",
                    color: "#d32f2f",
                    fontWeight: "bold"
                  }}>
                    ⚠️ Removed by Admin {post.removedByAdminEmail && `(${post.removedByAdminEmail})`}
                    {post.removedAt && (
                      <div style={{ fontSize: "0.9em", marginTop: "5px" }}>
                        {post.removedAt.toDate?.() 
                          ? post.removedAt.toDate().toLocaleDateString()
                          : new Date(post.removedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
                
                {/* View Renters Button */}
                {propertyRentals.length > 0 && (
                  <button 
                    className="view-renters-btn"
                    onClick={() => setViewingPropertyRenters(post)}
                  >
                    ▶ View Renters ({propertyRentals.length})
                  </button>
                )}

                {/* Edit Max Renters */}
                {editingPropertyId === post.id ? (
                  <div style={{ marginTop: "10px", padding: "8px", background: "#f0f0f0", borderRadius: "6px" }}>
                    <label>Max Renters: </label>
                    <input 
                      type="number" 
                      min="1" 
                      value={editPropertyForm.maxRenters}
                      onChange={(e) => setEditPropertyForm({ ...editPropertyForm, maxRenters: parseInt(e.target.value) || 1 })}
                      style={{ marginRight: "8px" }}
                    />
                    <button onClick={handleSavePropertyEdit} style={{ marginRight: "6px" }}>Save</button>
                    <button onClick={handleCancelPropertyEdit}>Cancel</button>
                  </div>
                ) : (
                  <button 
                    className="edit-btn" 
                    onClick={() => handleEditProperty(post)}
                    style={{ marginTop: "6px" }}
                  >
                    ✏️ Edit Max Renters ({post.maxRenters || 1})
                  </button>
                )}

                
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
            );
          })}

            </div>
            )}
          </section>
        )}



      
  </div>

  {/* Separate Page View for Property Renters */}
  {viewingPropertyRenters && (
    <div className="property-renters-fullview">
      <div className="renters-fullview-header">
        <button 
          className="back-to-rentlist-btn"
          onClick={() => {
            setViewingPropertyRenters(null);
            setSelectedRenterForMessage(null);
            setRenterMessage('');
          }}
        >
          ← Back to Rent List
        </button>
        <h2>Renters for: {viewingPropertyRenters.name}</h2>
      </div>

      <div className="renters-fullview-container">
        {myRentalsView
          .filter(r => r.propertyId === viewingPropertyRenters.id)
          .map(rental => {
            const dueDate = getDueDate(rental);
            const daysOverdue = getDaysOverdue(rental);
            const isOverdue = rental.status === "Completed" && daysOverdue > 0;

            return (
              <div key={rental.id} className={`renter-detail-card ${isOverdue ? 'overdue-card' : ''}`}>
                <div className="renter-detail-header">
                  <h3>{rental.renterName || 'Renter'}</h3>
                  <span className={`status-badge status-${rental.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                    {rental.status}
                  </span>
                </div>

                <div className="renter-detail-body">
                  <div className="detail-section">
                    <h4>📇 Contact Information</h4>
                    <p><strong>Renter Name:</strong> {rental.renterName || 'N/A'}</p>
                    <p><strong>Renter Email:</strong> {rental.renterEmail}</p>
                    <p><strong>Renter Phone:</strong> {rental.renterPhone || 'N/A'}</p>
                  </div>

                  <div className="detail-section">
                    <h4>📍 Delivery Information</h4>
                    <p><strong>Address:</strong> {rental.address || 'N/A'}</p>
                    {rental.placeName && <p><strong>Place Name:</strong> {rental.placeName}</p>}
                    <p><strong>Postal Code:</strong> {rental.postalCode || rental.zipCode || rental.postCode || 'N/A'}</p>
                    {rental.province && <p><strong>Province:</strong> {rental.province}</p>}
                  </div>

                  <div className="detail-section">
                    <h4>💰 Payment & Pricing</h4>
                    <p><strong>Payment Method:</strong> {rental.paymentMethod || 'N/A'}</p>
                    <p><strong>Daily Rate:</strong> ₱{rental.dailyRate?.toLocaleString() || 'N/A'}</p>
                    <p><strong>Rental Days:</strong> {rental.rentalDays || 'N/A'} day(s)</p>
                    {rental.totalAmount && <p><strong>Total Amount:</strong> ₱{rental.totalAmount?.toLocaleString()}</p>}
                  </div>

                  <div className="detail-section">
                    <h4>📅 Rental Timeline</h4>
                    <p><strong>Date Rented:</strong> {rental.dateRented ? new Date(rental.dateRented.toDate?.() || rental.dateRented).toLocaleDateString() : 'N/A'}</p>
                    <p className={isOverdue ? 'due-date-overdue' : 'due-date-normal'}>
                      <strong>Due Date:</strong> {dueDate ? dueDate.toLocaleDateString() : 'N/A'}
                      {isOverdue && (
                        <span className="overdue-warning">
                          ⚠️ Overdue by {daysOverdue} day{daysOverdue > 1 ? 's' : ''}
                        </span>
                      )}
                    </p>
                  </div>

                  {rental.status === "Returned" && rental.returnProofImage && (
                    <div className="detail-section">
                      <h4>✅ Return Information</h4>
                      <p><strong>Return Proof:</strong></p>
                      <img 
                        src={rental.returnProofImage} 
                        alt="Return proof" 
                        className="return-proof-image"
                      />
                      {rental.rating && rental.rating > 0 && (
                        <p><strong>Rating:</strong> {"⭐".repeat(rental.rating)} ({rental.rating}/5)</p>
                      )}
                      {rental.returnDescription && (
                        <p><strong>Feedback:</strong> {rental.returnDescription}</p>
                      )}
                      {rental.review && rental.review.trim() !== "" && (
                        <p><strong>Review:</strong> {rental.review}</p>
                      )}
                    </div>
                  )}

                  <div className="renter-actions">
                    <div className="renter-action-buttons">
                      {selectedRenterForMessage === rental.id ? (
                        <div className="message-section-expanded">
                          <textarea
                            className="message-textarea"
                            placeholder="Type your message to the renter..."
                            value={renterMessage}
                            onChange={(e) => setRenterMessage(e.target.value)}
                            rows={4}
                          />
                          <div className="message-buttons">
                            <button 
                              className="send-msg-btn"
                              onClick={() => handleSendMessageToRenter(rental.renterEmail)}
                            >
                              📤 Send Message
                            </button>
                            <button 
                              className="cancel-msg-btn"
                              onClick={() => {
                                setSelectedRenterForMessage(null);
                                setRenterMessage('');
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          className="open-message-btn"
                          onClick={() => setSelectedRenterForMessage(rental.id)}
                        >
                          💬 Message Renter
                        </button>
                      )}
                      
                      <button 
                        className="delete-rental-btn"
                        onClick={() => handleDeleteRental(rental.id)}
                      >
                        🗑️ Delete Rental
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  )}
</div>
  );
}
export default OwnerDashboard;
