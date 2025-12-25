// src/pages/RenterDashboard.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, storage } from "../firebase";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./RenterDashboard.css";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setDoc,
  orderBy,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
   getAuth,
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { uploadToCloudinary } from "../cloudinary";

const RenterDashboard = () => {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // --- State ---
const [activePage, setActivePage] = useState("renterProfile");
const [user, setUser] = useState(null);
const [loading, setLoading] = useState(false);
const [sidebarOpen, setSidebarOpen] = useState(false);

  // Profile edit
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // Data
  const [posts, setPosts] = useState([]);
  const [myRentals, setMyRentals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);

  // Search/filter
  const [searchTerm, setSearchTerm] = useState("");

  // Rentals & Favorites selection
  const [selectedRentals, setSelectedRentals] = useState([]);
  const [selectAllRentals, setSelectAllRentals] = useState(false);

  // Rentals modal
  const [rentalForm, setRentalForm] = useState({
    fullName: "",
    phoneNumber: "",
    address: "",
    postalCode: "",
    paymentMethod: "COD",
    screenshot: null,
  });
  const [selectedRental, setSelectedRental] = useState(null);

  // Owner profile modal
  const [showOwnerProfile, setShowOwnerProfile] = useState(false);
  const [ownerProfileEmail, setOwnerProfileEmail] = useState(null);
  const [ownerPostsList, setOwnerPostsList] = useState([]);
  const [ownerSearchTerm, setOwnerSearchTerm] = useState("");
  const [ownerNames, setOwnerNames] = useState({});
const [showSettings, setShowSettings] = useState(false);
const [currentPassword, setCurrentPassword] = useState("");
const [newPassword, setNewPassword] = useState("");
const [passwordLoading, setPasswordLoading] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState("");

  // Chat
  const [selectedChat, setSelectedChat] = useState(null);
const [selectedTab, setSelectedTab] = useState("Processing");

// Filter rentals by selected status
const filteredRentals = myRentals.filter((r) => r.status === selectedTab);

  const renterEmail = user?.email || "";

  // Provide aliases so old JSX names don't break (selectAll, setSelectAll, handleDeleteSelected)
  const selectAll = selectAllRentals;
  const setSelectAll = setSelectAllRentals;
  const handleDeleteSelected = async () => {
    // alias for deleting selected rentals
    if (!selectedRentals.length) return alert("No rentals selected");
    try {
      await Promise.all(selectedRentals.map((id) => deleteDoc(doc(db, "rentals", id))));
      setSelectedRentals([]);
      setSelectAllRentals(false);
      alert("Deleted selected rentals.");
    } catch (err) {
      console.error(err);
      alert("Failed to delete selected rentals.");
    }
  };

  useEffect(() => {
  if (!auth.currentUser) return;

  const userDocRef = doc(db, "renters", auth.currentUser.uid);
  const unsub = onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      setUser({ ...data, uid: docSnap.id });
      setDisplayName(data.displayName || "");
      setPhotoPreview(data.photoURL || "/default-profile.png");
    } else {
      // Create initial document if it doesn't exist and mirror to shared users collection
      const baseProfile = {
        displayName: auth.currentUser.displayName || "",
        email: auth.currentUser.email,
        createdAt: serverTimestamp(),
        photoURL: auth.currentUser.photoURL || "/default-profile.png",
        role: "renter",
      };

      setDoc(userDocRef, baseProfile, { merge: true });
      setDoc(doc(db, "users", auth.currentUser.uid), baseProfile, { merge: true });
    }
  });

  return () => unsub();
}, []);

  // ------------------ AUTH ------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) return navigate("/login");
      setUser(currentUser);
      setDisplayName(currentUser.displayName || "");
      setPhotoPreview(currentUser.photoURL || "/default-profile.png");
    });
    return () => unsubscribe();
  }, [navigate]);

  // ------------------ FIRESTORE DATA ------------------
  useEffect(() => {
    if (!renterEmail) return;

    const unsubscribers = [];

    // Properties
    unsubscribers.push(
      onSnapshot(
        query(collection(db, "properties"), where("status", "==", "approved")),
        (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    

    // My rentals
    unsubscribers.push(
      onSnapshot(
        query(collection(db, "rentals"), where("renterEmail", "==", renterEmail)),
        (snap) => setMyRentals(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );



    // Messages
    unsubscribers.push(
      onSnapshot(collection(db, "messages"), (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const mine = all.filter((m) => m.sender === renterEmail || m.receiver === renterEmail);
        mine.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMessages(mine);
      })
    );

    return () => unsubscribers.forEach((u) => u());
  }, [renterEmail]);


// Handle profile photo selection
const handlePhotoChange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setPhotoFile(file);

  const reader = new FileReader();
  reader.onloadend = () => setPhotoPreview(reader.result);
  reader.readAsDataURL(file);
};
const handleSaveProfile = async () => {
  if (!user) {
    setToastMessage("⚠️ Not logged in");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }
  if (!displayName.trim()) {
    setToastMessage("⚠️ Name cannot be empty");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }
  setLoading(true);
  try {
    let photoURL = user.photoURL || "";
    if (photoFile) {
      // Use Cloudinary for faster upload
      photoURL = await uploadToCloudinary(photoFile, "renthub/profiles");
    }
    try {
      await updateProfile(auth.currentUser, { displayName, photoURL });
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        const password = prompt("Please re-enter password:");
        const cred = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updateProfile(auth.currentUser, { displayName, photoURL });
      } else throw err;
    }
    const userDocRef = doc(db, "renters", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      // Create document with createdAt for first time
      await setDoc(userDocRef, {
        displayName,
        photoURL,
        email: user.email,
        role: "renter",
        createdAt: serverTimestamp(),
      });
    } else {
      // Update document without overwriting createdAt
      await setDoc(
        userDocRef,
        { displayName, photoURL, email: user.email, role: "renter" },
        { merge: true }
      );
    }

    // Mirror into shared users collection for admin visibility
    await setDoc(
      doc(db, "users", user.uid),
      {
        displayName,
        photoURL,
        email: user.email,
        role: "renter",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setUser({ ...user, displayName, photoURL });
    setIsEditing(false);
    setPhotoFile(null);
    setToastMessage("✅ Profile updated successfully");
    setTimeout(() => setToastMessage(""), 2000);
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to update profile");
    setTimeout(() => setToastMessage(""), 3500);
  } finally {
    setLoading(false);
  }
};
const handleCancelEdit = () => {
  setDisplayName(user?.displayName || "");
  setPhotoPreview(user?.photoURL || "/default-profile.png");
  setPhotoFile(null);
  setIsEditing(false);
};
const openOwnerProfile = useCallback((email) => {
  setOwnerProfileEmail(email);
  setShowOwnerProfile(true);
  setOwnerSearchTerm("");

  // Unsubscribe previous owner's posts snapshot if any
  if (ownerUnsubRef.current) ownerUnsubRef.current();

  // Subscribe to the selected owner's properties
  const q = query(collection(db, "properties"), where("ownerEmail", "==", email));
  const unsub = onSnapshot(q, (snap) => {
    setOwnerPostsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
  ownerUnsubRef.current = unsub;
}, []);

const closeOwnerProfile = () => {
  setShowOwnerProfile(false);
  setOwnerProfileEmail(null);
  setOwnerPostsList([]);
  if (ownerUnsubRef.current) ownerUnsubRef.current(); // unsubscribe
};


  // adapter functions (match names used in your JSX)
  const handleCloseOwnerProfile = () => closeOwnerProfile();
  const handleViewOwnerProfile = (email) => openOwnerProfile(email);
  const handleShowPosterInfo = (post) => {
    alert(`Posted by: ${getOwnerLabel(post.ownerEmail)}\nEmail: ${post.ownerEmail || "N/A"}`);
  };



  // ---------- OWNER NAMES (for display) ----------
  // Subscribe to "users" documents for owner displayName when posts change
  useEffect(() => {
    if (!posts || posts.length === 0) return;
    const emails = Array.from(new Set(posts.map((p) => p.ownerEmail).filter(Boolean)));
    const unsubscribers = [];

    emails.forEach((email) => {
      const q = query(collection(db, "users"), where("email", "==", email));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0].data();
          setOwnerNames((prev) => ({ ...prev, [email]: d.displayName || d.name || email }));
        } else {
          setOwnerNames((prev) => ({ ...prev, [email]: email }));
        }
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((u) => u());
  }, [posts]);

  const getOwnerLabel = (email) => ownerNames[email] || (email ? email.split("@")[0] : "Unknown");



  
  // ---------- COMMENTS per post (subscribe) ----------
  useEffect(() => {
    if (!posts || posts.length === 0) return;
    const unsubArr = posts.map((post) => {
      const q = collection(db, `properties/${post.id}/comments`);
      return onSnapshot(q, (snap) => {
        setComments((prev) => ({ ...prev, [post.id]: snap.docs.map((d) => d.data()) }));
      });
    });
    return () => unsubArr.forEach((u) => u());
  }, [posts]);


  const allowedProvinces = ["isabela", "negros occidental"];

const initMap = useCallback(() => {
  if (!selectedRental) return;

  // Remove existing map if any
  if (mapRef.current) {
    mapRef.current.remove();
    mapRef.current = null;
    markerRef.current = null;
  }

  const defaultCoords = selectedRental.lat && selectedRental.lng
    ? [selectedRental.lat, selectedRental.lng]
    : [10.2037, 122.981]; // default

  const map = L.map("rental-map").setView(defaultCoords, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const marker = L.marker(defaultCoords, { draggable: true }).addTo(map);
  marker.bindPopup("Drag or click on map to select location").openPopup();

  const updateLocation = async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      );
      const data = await res.json();
      const displayName = data.name || data.display_name || "Unknown Place";
      const province = (data.address?.state || data.address?.province || "").toLowerCase();

      // Province restriction: only Isabela or Negros Occidental
      const allowedProvinces = ["isabela", "negros occidental"];
      if (!allowedProvinces.some(ap => province.includes(ap))) {
        alert(`❌ Orders are only allowed from Isabela or Negros Occidental. You selected: ${province || "Unknown"}`);
        return;
      }

      setRentalForm((prev) => ({
        ...prev,
        address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        placeName: displayName,
        province,
      }));
    } catch (err) {
      console.error("Reverse geocode failed:", err);
      setRentalForm((prev) => ({ ...prev, placeName: "Unknown Place" }));
    }
  };

  // Trigger immediately if selectedRental has coords
  if (selectedRental.lat && selectedRental.lng) {
    updateLocation(selectedRental.lat, selectedRental.lng);
  }

  marker.on("moveend", (e) => {
    const { lat, lng } = e.target.getLatLng();
    updateLocation(lat, lng);
  });

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    marker.setLatLng([lat, lng]);
    updateLocation(lat, lng);
  });

  // Use My Location button
  const locBtn = L.control({ position: "topleft" });
  locBtn.onAdd = () => {
    const div = L.DomUtil.create("div", "use-location-btn");
    div.innerHTML = "📍 Use My Location";
    div.onclick = () => {
      if (!navigator.geolocation) return alert("Geolocation not supported");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          // Province check before setting marker
          updateLocation(latitude, longitude).then(() => {
            if (allowedProvinces.includes(rentalForm.province)) {
              map.setView([latitude, longitude], 15);
              marker.setLatLng([latitude, longitude]);
            }
          });
        },
        () => alert("Failed to get location")
      );
    };
    return div;
  };
  locBtn.addTo(map);

  mapRef.current = map;
  markerRef.current = marker;
}, [selectedRental]);



useEffect(() => {
  initMap();
  // cleanup: remove map when modal closes
  return () => {
    if (!selectedRental && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }
  };
}, [initMap, selectedRental]);


// At the top of RenterDashboard.js, inside the component
const [isUploading, setIsUploading] = useState(false); // tracks screenshot upload
const [uploadedScreenshotUrl, setUploadedScreenshotUrl] = useState(""); // stores uploaded screenshot URL

 // --- Handle opening rental modal ---
const handleRentNow = (post) => {
  setSelectedRental(post);
  setShowOwnerProfile(false);

  const dailyRate = Number(post.price) || 0;
  const rentalDays = 1;
  const serviceFee = dailyRate * rentalDays * 0.1; // 10% service fee
  const deliveryFee = 20; // default delivery fee
  const totalAmount = dailyRate * rentalDays + serviceFee + deliveryFee;

  setRentalForm({
    fullName: "",
    phoneNumber: "",
    address: "",
    placeName: "",
    postalCode: "",
    province: "",
    paymentMethod: "COD",
    screenshot: null,
    dailyRate,
    rentalDays,
    serviceFee,
    deliveryFee,
    totalAmount,
  });
};

// Handle canceling rental
const handleCancelRent = () => {
  setSelectedRental(null);
  if (mapRef.current) {
    mapRef.current.remove();
    mapRef.current = null;
    markerRef.current = null;
  }
};


const handleFormChange = (e) => {
  const { name, value, type, files } = e.target;

  // If file input
  if (type === "file" && files && files[0]) {
    const file = files[0];
    setRentalForm(prev => ({ ...prev, [name]: file }));

    // Optional: Upload immediately for preview
    if (name === "screenshot") {
      setIsUploading(true);
      uploadToCloudinary(file, "renthub/gcash")
        .then(url => setUploadedScreenshotUrl(url))
        .catch(err => {
          console.error(err);
          alert("GCash screenshot upload failed!");
        })
        .finally(() => setIsUploading(false));
    }

    return; // skip normal update
  }

  setRentalForm((prev) => {
    const updated = { ...prev, [name]: type === "number" ? Number(value) : value };

    if (name === "rentalDays") {
      const days = Number(value) || 1;

      // Randomize service fee 10% - 12%
      const serviceFeePercentage = 9 + Math.random() * 1; // 10% - 12%
      const serviceFee = prev.dailyRate * days * (serviceFeePercentage / 100);

      // Randomize delivery fee 5% - 7%
      const deliveryFeePercentage = 5 + Math.random() * 1; // 5% - 7%
      const deliveryFee = prev.dailyRate * days * (deliveryFeePercentage / 100);

      // Base total
      let totalAmount = prev.dailyRate * days + serviceFee + deliveryFee;

      // Apply 1% discount if 7 or more days
      let discount = 0;
      if (days >= 7) {
        discount = totalAmount * 0.01;
        totalAmount -= discount;
      }

      updated.rentalDays = days;
      updated.serviceFee = serviceFee;
      updated.deliveryFee = deliveryFee;
      updated.discount = discount;
      updated.totalAmount = totalAmount;
    }

    return updated;
  });
};

const handleSubmitRental = async (rental) => {
  if (!rentalForm.fullName || !rentalForm.phoneNumber || !rentalForm.address) {
    setToastMessage("⚠️ Please fill in all required fields");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  if (rentalForm.paymentMethod === "GCash" && !uploadedScreenshotUrl) {
    setToastMessage("⚠️ Please upload GCash screenshot for GCash payment");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  try {
    setLoading(true);

    // --- Use already uploaded screenshot URL if available ---
    let screenshotUrl = "";
    if (rentalForm.paymentMethod === "GCash") {
      screenshotUrl = uploadedScreenshotUrl || "";
      console.log("GCash Screenshot URL:", screenshotUrl);
    }

    // Property image
    let propertyImageUrl = rental.imageUrl || "/no-image.png";
    if (!rental.imageUrl && rental.imageFile) {
      propertyImageUrl = await uploadToCloudinary(rental.imageFile, "renthub/properties");
    }

    // --- Prepare rental data ---
    const rentalData = {
      propertyId: rental.id,
      propertyName: rental.name || "Unknown Property",
      propertyImage: propertyImageUrl,
      ownerEmail: rental.ownerEmail || "",
      renterName: rentalForm.fullName,
      renterPhone: rentalForm.phoneNumber,
      renterEmail: auth.currentUser?.email || "",
      address: rentalForm.address,
      placeName: rentalForm.placeName || "",
      postalCode: rentalForm.postalCode || "",
      province: rentalForm.province || "",
      paymentMethod: rentalForm.paymentMethod,
      gcashAccountName: rentalForm.paymentMethod === "GCash" ? gcashAccountName : "",
      gcashPhoneNumber: rentalForm.paymentMethod === "GCash" ? gcashPhoneNumber : "",
      gcashScreenshot: screenshotUrl,
      dailyRate: rentalForm.dailyRate,
      rentalDays: rentalForm.rentalDays,
      serviceFee: rentalForm.serviceFee,
      deliveryFee: rentalForm.deliveryFee,
      totalAmount: rentalForm.totalAmount,
      status: "Processing",
      createdAt: serverTimestamp(),
      dateRented: serverTimestamp(),
    };

    // --- Firestore writes in parallel ---
    const rentalRef = collection(db, "rentals");
    const propertyRef = doc(db, "properties", rental.id);

    await Promise.all([
      addDoc(rentalRef, rentalData),
      updateDoc(propertyRef, { 
        currentRenters: arrayUnion(auth.currentUser.uid),
        isRented: (rental.currentRenters?.length || 0) + 1 >= (rental.maxRenters || 1) 
      }),
    ]);

    // --- Update local admin state instantly ---
    setAdminRentalList((prev) => [...prev, { id: rental.id, ...rentalData }]);

    setToastMessage("✅ Rental submitted successfully!");
    setTimeout(() => setToastMessage(""), 2000);

    // --- Reset form and close modal ---
    setSelectedRental(null);
    setRentalForm({
      fullName: "",
      phoneNumber: "",
      address: "",
      placeName: "",
      postalCode: "",
      province: "",
      paymentMethod: "COD",
      screenshot: null,
    });
    setUploadedScreenshotUrl(""); // reset uploaded screenshot
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to submit rental");
    setTimeout(() => setToastMessage(""), 3500);
  } finally {
    setLoading(false);
  }
};


// inside BrowseRentals component
const [gcashAccountName, setGcashAccountName] = useState("");
const [gcashPhoneNumber, setGcashPhoneNumber] = useState("");

useEffect(() => {
  const fetchGcashInfo = async () => {
    const docRef = doc(db, "settings", "gcash");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      setGcashAccountName(data.accountName || "");
      setGcashPhoneNumber(data.phoneNumber || "");
    }
  };
  fetchGcashInfo();
}, []);


  // ------------------ RENTALS  ------------------
  const handleSelectAllRentals = () => {
    if (selectAllRentals) {
      setSelectedRentals([]);
    } else {
      setSelectedRentals(myRentals.map((r) => r.id));
    }
    setSelectAllRentals(!selectAllRentals);
  };


  // Generic delete that matches your JSX signature handleDelete(collectionName, id)
  const handleDelete = async (collectionName, id) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      // locally remove from states if necessary
      if (collectionName === "rentals") setMyRentals((p) => p.filter((r) => r.id !== id));
      if (collectionName === "notifications") setNotifications((p) => p.filter((n) => n.id !== id));
      if (collectionName === "properties") setPosts((p) => p.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete item.");
    }
  };



async function fixRentalImages() {
  try {
    const rentalsSnap = await getDocs(collection(db, "rentals"));
    const batchUpdates = [];

    rentalsSnap.forEach((rentalDoc) => {
      const rental = rentalDoc.data();
      // Check if propertyImage is missing or empty
      if (!rental.propertyImage || rental.propertyImage === "") {
        // Determine fallback: use rental.imageUrl if exists, else placeholder
        const newImage = rental.imageUrl || "/no-image.png";

        // Prepare update
        batchUpdates.push(updateDoc(doc(db, "rentals", rentalDoc.id), {
          propertyImage: newImage
        }));
      }
    });

    await Promise.all(batchUpdates);
    console.log(`✅ Updated ${batchUpdates.length} rentals with missing images`);
  } catch (err) {
    console.error("Failed to fix rental images:", err);
  }
}

fixRentalImages();

async function fixMissingRentalImages() {
  const rentalsRef = collection(db, "rentals");
  const rentalsSnap = await getDocs(rentalsRef);

  for (const rentalDoc of rentalsSnap.docs) {
    const rentalData = rentalDoc.data();
    
    // Check if propertyImage is missing
    if (!rentalData.propertyImage || rentalData.propertyImage === "") {
      // Try to get property image from properties collection
      if (rentalData.propertyId) {
        const propertyDoc = await getDoc(doc(db, "properties", rentalData.propertyId));
        const propertyData = propertyDoc.exists() ? propertyDoc.data() : null;
        const propertyImage = propertyData?.imageUrl || "/no-image.png";

        // Update rental document
        await updateDoc(doc(db, "rentals", rentalDoc.id), { propertyImage });
        console.log(`Updated rental ${rentalDoc.id} with image: ${propertyImage}`);
      }
    }
  }
  console.log("All missing rental images fixed!");
}

// Run the function once
fixMissingRentalImages();

async function fixMissingDateRented() {
  const rentalsSnap = await getDocs(collection(db, "rentals"));

  for (const rentalDoc of rentalsSnap.docs) {
    const rentalData = rentalDoc.data();
    if (!rentalData.dateRented) {
      await updateDoc(doc(db, "rentals", rentalDoc.id), {
        dateRented: rentalData.createdAt || serverTimestamp(),
      });
      console.log(`Updated rental ${rentalDoc.id} with dateRented`);
    }
  }

  console.log("All missing dateRented fixed!");
}

fixMissingDateRented();

const formatDate = (date) => {
  if (!date) return "N/A";

  if (date?.toDate) {
    return date.toDate().toLocaleDateString("en-US");
  }

  const d = new Date(date);
  return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-US");
};



const handleDeleteRental = async (id) => {
  try {
    await deleteDoc(doc(db, "rentals", id));
    setToastMessage("✅ Rental deleted successfully");
    setTimeout(() => setToastMessage(""), 2000);
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to delete rental");
    setTimeout(() => setToastMessage(""), 3500);
  }
};



  const ownerUnsubRef = useRef(null);
const adminUnsubRef = useRef(null); // ✅ for admin rentals snapshot
// Add this near your other useState declarations at the top
const [adminRentalList, setAdminRentalList] = useState([]);
const [adminSearchTerm, setAdminSearchTerm] = useState(""); // optional, for search


  // Fetch all rentals for admin view
useEffect(() => {
  const q = query(collection(db, "rentals"));
  adminUnsubRef.current = onSnapshot(q, (snap) => {
    setAdminRentalList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });

  return () => {
    if (adminUnsubRef.current) adminUnsubRef.current();
  };
}, []);


  // Filtered owner posts
  const filteredOwnerPosts = ownerPostsList.filter((p) =>
    p.name?.toLowerCase().includes(ownerSearchTerm.toLowerCase()) ||
    (p.description || "").toLowerCase().includes(ownerSearchTerm.toLowerCase())
  );

  // Filtered posts for browse
  const filteredPosts = posts.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Send one-off message (prompt)
  const handleMessageNowPrompt = async (post) => {
    const text = prompt(`Enter your message for ${post.ownerEmail}:`);
    if (!text || text.trim() === "") return alert("Message cannot be empty.");
    try {
      await addDoc(collection(db, "messages"), {
        sender: renterEmail,
        receiver: post.ownerEmail,
        text,
        propertyName: post.name,
        createdAt: serverTimestamp(),
      });
      alert("Message sent!");
    } catch (err) {
      console.error(err);
      alert("Failed to send message.");
    }
  };
  


const [ownerMessages, setOwnerMessages] = useState({});

useEffect(() => {
  const unsubscribes = posts.map(post => {
    const q = query(
      collection(db, "rentals", post.id, "comments"),
      orderBy("createdAt")
    );
    return onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(prev => ({ ...prev, [post.id]: data }));
    });
  });

  return () => unsubscribes.forEach(u => u());
}, [posts]);


const [comments, setComments] = useState({});
const [newComments, setNewComments] = useState({});
const [commentImages, setCommentImages] = useState({});
const [showReplyInput, setShowReplyInput] = useState({});
const [replyText, setReplyText] = useState({});
const [showCommentInput, setShowCommentInput] = useState({});
const [showCommentsSection, setShowCommentsSection] = useState({});
const [showProof, setShowProof] = useState({});
const handleAddComment = async (postId) => {
  const text = newComments[postId]?.trim();
  if (!text && !commentImages[postId]) return;

  let imageUrl = "";
  if (commentImages[postId] instanceof File) {
    imageUrl = await uploadToCloudinary(commentImages[postId], "renthub/comments");
  }

  await addDoc(collection(db, "rentals", postId, "comments"), {
    userId: auth.currentUser.uid,
    userName: auth.currentUser.displayName || "Anonymous",
    comment: text || "",
    imageUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  setNewComments(prev => ({ ...prev, [postId]: "" }));
  setCommentImages(prev => ({ ...prev, [postId]: null }));
};

const handleAddReply = async (postId, commentId) => {
  const text = replyText[commentId]?.trim();
  if (!text) return;

  await addDoc(collection(db, "rentals", postId, "comments", commentId, "replies"), {
    userId: auth.currentUser.uid,
    userName: auth.currentUser.displayName || "Anonymous",
    comment: text,
    createdAt: serverTimestamp(),
  });

  setReplyText(prev => ({ ...prev, [commentId]: "" }));
  setShowReplyInput(prev => ({ ...prev, [commentId]: false }));
};
const handleEditComment = async (postId, commentId, newText) => {
  const commentRef = doc(db, "rentals", postId, "comments", commentId);
  await updateDoc(commentRef, { comment: newText, updatedAt: serverTimestamp() });
};

const handleUpdateStatus = (id, newStatus) => {
  const updated = myRentals.map(r => (r.id === id ? { ...r, status: newStatus } : r));
  setMyRentals(updated);
};

// Add a new comment
const handleComment = (postId) => {
  const text = newComments[postId]?.trim();
  if (!text) return;

  const newComment = {
    id: Date.now().toString(),
    userName: auth.currentUser?.displayName || "You",
    userId: auth.currentUser?.uid,
    comment: text,
    replies: [],
  };

  setComments((prev) => ({
    ...prev,
    [postId]: [...(prev[postId] || []), newComment],
  }));

  setNewComments((prev) => ({ ...prev, [postId]: "" }));
};
// Save edited comment
const handleSaveComment = (postId, commentId) => {
  setComments(prev => ({
    ...prev,
    [postId]: prev[postId].map(c =>
      c.id === commentId ? { ...c, comment: c.editText, isEditing: false } : c
    ),
  }));
};

// Add a reply to a comment
const handleReplyComment = (postId, commentId) => {
  const text = replyText[commentId]?.trim();
  if (!text) return;

  setComments((prev) => ({
    ...prev,
    [postId]: prev[postId].map((c) =>
      c.id === commentId
        ? { ...c, replies: [...c.replies, { id: Date.now().toString(), userName: auth.currentUser?.displayName || "You", userId: auth.currentUser?.uid, comment: text }] }
        : c
    ),
  }));

  setReplyText((prev) => ({ ...prev, [commentId]: "" }));
};

const handleUpdateEditText = (postId, commentId, text) => {
  setComments(prev => ({
    ...prev,
    [postId]: prev[postId].map(c =>
      c.id === commentId ? { ...c, editText: text } : c
    ),
  }));
};

// Delete a comment
const handleDeleteComment = (postId, commentId) => {
  setComments(prev => ({
    ...prev,
    [postId]: prev[postId].filter(c => c.id !== commentId) // remove comment by id
  }));
};

useEffect(() => {
  if (!renterEmail) return;
  const unsubscribers = [];

  unsubscribers.push(
    onSnapshot(collection(db, "messages"), (snap) => {
      const allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Only messages involving this renter
      const mine = allMessages.filter(
        m => m.sender === renterEmail || m.receiver === renterEmail
      );

      // Sort newest first
      mine.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMessages(mine);
    })
  );

  return () => unsubscribers.forEach(u => u());
}, [renterEmail]);

// ---------------- MESSAGING ----------------
  const handleSendMessageToOwner = (postId, ownerEmail) => {
    if (!ownerMessages[postId]) {
      setToastMessage("⚠️ Cannot send empty message");
      setTimeout(() => setToastMessage(""), 2500);
      return;
    }
    addDoc(collection(db, "messages"), {
      sender: renterEmail,
      receiver: ownerEmail,
      text: ownerMessages[postId],
      propertyId: postId,
      createdAt: serverTimestamp(),
    });
    setOwnerMessages((prev) => ({ ...prev, [postId]: "" }));
    setToastMessage("✅ Message sent!");
    setTimeout(() => setToastMessage(""), 2000);
  };

  const handleReply = async (chatUser) => {
    const text = replyText[chatUser]?.trim();
    if (!text) {
      setToastMessage("⚠️ Cannot send empty message");
      setTimeout(() => setToastMessage(""), 2500);
      return;
    }
    try {
      await addDoc(collection(db, "messages"), {
        sender: renterEmail,
        receiver: chatUser,
        text,
        createdAt: serverTimestamp(),
      });
      setReplyText((prev) => ({ ...prev, [chatUser]: "" }));
      setToastMessage("✅ Message sent!");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      console.error(err);
      alert("Failed to send message");
    }
  };

  
  const handleDeleteAllConversations = async () => {
    if (messages.length === 0) {
      setToastMessage("⚠️ No conversations to delete");
      setTimeout(() => setToastMessage(""), 2500);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "messages"));
      const myMessages = snap.docs.filter(
        (d) => d.data().sender === renterEmail || d.data().receiver === renterEmail
      );
      await Promise.all(myMessages.map((d) => deleteDoc(doc(db, "messages", d.id))));
      setMessages([]);
      setSelectedChat(null);
      setToastMessage("✅ All conversations deleted");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete conversations");
      setTimeout(() => setToastMessage(""), 3500);
    } finally {
      setLoading(false);
    }
  };

  const handleMessageNow = (post) => {
    if (!post?.ownerEmail) return alert("Owner has no email");
    setSelectedChat(post.ownerEmail);
    setActivePage("messages");
  };

  // ✅ AUTO CLOSE SIDEBAR ON PAGE CHANGE (MOBILE ONLY)
  useEffect(() => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, [activePage]);

  // Confirm password state
const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = async () => {
  if (!currentPassword || !newPassword || !confirmPassword) {
    setToastMessage("⚠️ Please fill in all fields");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  if (newPassword !== confirmPassword) {
    setToastMessage("⚠️ Passwords do not match");
    setTimeout(() => setToastMessage(""), 2500);
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

    // Re-authenticate
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    setToastMessage("✅ Password updated successfully");
    setTimeout(() => setToastMessage(""), 2000);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowSettings(false);
  } catch (error) {
    setToastMessage("❌ " + error.message);
    setTimeout(() => setToastMessage(""), 3500);
  } finally {
    setPasswordLoading(false);
  }
};

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

  return (
<div className="dashboard-container renter-dashboard">
 <button
  className="menu-toggle"
  onClick={() => setSidebarOpen(!sidebarOpen)}
>
  {sidebarOpen ? '✖' : '☰'}
</button>


  {sidebarOpen && (
    <div
      className="sidebar-overlay"
      onClick={() => setSidebarOpen(false)}
    />
  )}

  <Sidebar
  userType="renter"
  activePage={activePage}
  setActivePage={setActivePage}
  onLogout={() => signOut(auth)}
  isOpen={sidebarOpen}
  closeSidebar={() => setSidebarOpen(false)}
/>



  <div className="dashboard-content">
    {/* RENTER PROFILE */}
   {activePage === "renterProfile"  && userRole === "renter" && (
  <section className="profile-renter">
    <h2>Renter Profile</h2>

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
            <button
              onClick={() => setIsEditing(true)}
              className="edit-btn"
            >
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
              onChange={handlePhotoChange}
            />

            <div className="profile-form-buttons">
              <button onClick={handleSaveProfile} disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </button>
              <button onClick={handleCancelEdit}>Cancel</button>
            </div>
          </div>
        )}

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
  

{/* BROWSE RENTALS */}
{activePage === "browseRentals" && userRole === "renter" && (
  <div className="browse-rentals-renter">
    <h1>Browse Rentals</h1>

    {/* Search Bar */}
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search rentals..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value || "")}
      />
    </div>

    {/* OWNER PROFILE VIEW */}
    {showOwnerProfile && (
      <div className="owner-profile-replacement">
        <div className="owner-profile-header">
          <button className="close-btn" onClick={handleCloseOwnerProfile}>✖</button>
          <h2>Owner Profile</h2>
          <p><strong>Email:</strong> {ownerProfileEmail}</p>
          <p><strong>Name:</strong> {getOwnerLabel(ownerProfileEmail)}</p>

          <input
            type="text"
            placeholder="Search owner's posts..."
            value={ownerSearchTerm}
            onChange={(e) => setOwnerSearchTerm(e.target.value)}
          />
        </div>

        <h3>Owner's Posts</h3>
        {filteredOwnerPosts
          .filter((post) => {
            const renters = post.currentRenters || [];
            const max = post.maxRenters || 1;
            const userRented = renters.includes(auth.currentUser?.uid);
            if (renters.length >= max || userRented) return false;
            return true;
          })
          .filter(post => post.name.toLowerCase().includes(ownerSearchTerm.toLowerCase()))
          .length > 0 ? (
          <div className="owner-posts-list">
            {filteredOwnerPosts
              .filter((post) => {
                const renters = post.currentRenters || [];
                const max = post.maxRenters || 1;
                const userRented = renters.includes(auth.currentUser?.uid);
                if (renters.length >= max || userRented) return false;
                return true;
              })
              .filter(post => post.name.toLowerCase().includes(ownerSearchTerm.toLowerCase()))
              .map((post) => (
                <div key={post.id} className="owner-post-card">
                  <img
                    src={post.imageUrl || "/no-image.png"}
                    alt={post.name}
                    onClick={() => handleShowPosterInfo(post)}
                  />
                  <h4>{post.name}</h4>
                  <p>Owner: {getOwnerLabel(post.ownerEmail)}</p>
                  <p><strong>Price:</strong> ₱{post.price}</p>
                  <p>{post.description}</p>

                  {/* Message Owner */}
                  <div className="message-owner">
                    <input
                      type="text"
                      placeholder="Message the owner..."
                      value={ownerMessages[post.id] || ""}
                      onChange={(e) =>
                        setOwnerMessages((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                    />
                    <button onClick={() => handleSendMessageToOwner(post.id, post.ownerEmail)}>
                      Send
                    </button>
                  </div>

                  {/* Comments Section */}
<div className="comments-section">
  {/* Toggle Comments Section */}
  <button
    type="button"
    onClick={() =>
      setShowCommentsSection(prev => ({ ...prev, [post.id]: !prev[post.id] }))
    }
  >
    {showCommentsSection[post.id] ? "Hide Comments" : "Show Comments"}
  </button>

  {showCommentsSection[post.id] && (
    <>
      {/* Add Comment */}
      {!showCommentInput[post.id] && (
        <button
          type="button"
          onClick={() => setShowCommentInput(prev => ({ ...prev, [post.id]: true }))}
        >
          Add Comment
        </button>
      )}

      {showCommentInput[post.id] && (
        <div className="comment-input-row">
          <input
            type="text"
            placeholder="Add a comment..."
            value={newComments[post.id] || ""}
            onChange={(e) =>
              setNewComments(prev => ({ ...prev, [post.id]: e.target.value }))
            }
          />

          {/* Optional: Upload image proof */}
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setCommentImages(prev => ({ ...prev, [post.id]: e.target.files[0] }))
            }
          />
          {commentImages[post.id] && (
            <img
              src={URL.createObjectURL(commentImages[post.id])}
              alt="Preview"
              className="comment-image-preview"
            />
          )}

          <button onClick={() => handleAddComment(post.id)}>Comment</button>
          <button
            type="button"
            onClick={() => {
              setNewComments(prev => ({ ...prev, [post.id]: "" }));
              setShowCommentInput(prev => ({ ...prev, [post.id]: false }));
              setCommentImages(prev => ({ ...prev, [post.id]: null }));
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Comments List */}
      <div className="comments-list">
        {(comments[post.id] || []).map((c) => {
          const isOwner = c.userId === auth.currentUser?.uid;

          return (
            <div key={c.id} className="comment-card">
              {/* Comment content */}
              {!c.isEditing ? (
                <>
                  <p><strong>{c.userName}:</strong> {c.comment}</p>
                  {c.imageUrl && (
                    <img src={c.imageUrl} alt="Comment proof" className="comment-attachment-image" />
                  )}

                  {/* Owner actions */}
                  {isOwner && (
                    <div className="comment-actions">
                      <button onClick={() => handleEditComment(post.id, c.id)}>Edit</button>
                      <button onClick={() => handleDeleteComment(post.id, c.id)}>Delete</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="edit-comment-row">
                  <input
                    type="text"
                    value={c.editText}
                    onChange={(e) => handleUpdateEditText(post.id, c.id, e.target.value)}
                  />
                  <button onClick={() => handleSaveComment(post.id, c.id)}>Save</button>
                  <button onClick={() => handleCancelEdit(post.id, c.id)}>Cancel</button>
                </div>
              )}

              {/* Reply Button */}
              {!showReplyInput[c.id] && (
                <button
                  type="button"
                  onClick={() => setShowReplyInput(prev => ({ ...prev, [c.id]: true }))}
                >
                  Reply
                </button>
              )}

              {/* Reply Input */}
              {showReplyInput[c.id] && (
                <div className="reply-input-row">
                  <input
                    type="text"
                    placeholder="Reply..."
                    value={replyText[c.id] || ""}
                    onChange={(e) =>
                      setReplyText(prev => ({ ...prev, [c.id]: e.target.value }))
                    }
                  />
                  <button onClick={() => handleAddReply(post.id, c.id)}>Reply</button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyText(prev => ({ ...prev, [c.id]: "" }));
                      setShowReplyInput(prev => ({ ...prev, [c.id]: false }));
                    }}
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Replies List */}
              {c.replies?.map((r) => (
                <p key={r.id} className="reply">
                  <strong>{r.userName}:</strong> {r.comment}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </>
  )}
</div>

                  <div className="rental-actions">
                    <button onClick={() => handleRentNow(post)}>Rent Now</button>
                    <button
                      onClick={() => {
                        if (window.confirm("Delete this property?")) handleDelete("properties", post.id);
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p>No posts found for this owner.</p>
        )}
      </div>
    )}

{/* RENT NOW MODAL */}
{selectedRental && (
  <div className="rental-modal-overlay">
    <div className="rental-modal">
      <button className="close-btn" onClick={handleCancelRent}>✖</button>

      <h2>{selectedRental.name}</h2>
      <img src={selectedRental.imageUrl || "/no-image.png"} alt={selectedRental.name} />

      <p><strong>Owner:</strong> {getOwnerLabel(selectedRental.ownerEmail)}</p>
      <p><strong>Price:</strong> ₱{selectedRental.price}</p>
      <p>{selectedRental.description}</p>

      <div className="rental-form">
        <h4>Fill in your details</h4>

        <label>Full Name</label>
        <input
          type="text"
          name="fullName"
          value={rentalForm.fullName}
          onChange={handleFormChange}
        />

        <label>Phone Number</label>
        <input
          type="text"
          name="phoneNumber"
          value={rentalForm.phoneNumber}
          onChange={handleFormChange}
        />

        <label>Address</label>
        <input
          type="text"
          name="address"
          value={rentalForm.address}
          onChange={handleFormChange}
        />

        <label>Place Name</label>
        <input
          type="text"
          name="placeName"
          value={rentalForm.placeName}
          readOnly
        />

        <div id="rental-map" />

        <label>Postal Code</label>
        <input
          type="text"
          name="postalCode"
          value={rentalForm.postalCode}
          onChange={handleFormChange}
        />

        <label>Payment Method</label>
        <select
          name="paymentMethod"
          value={rentalForm.paymentMethod}
          onChange={handleFormChange}
        >
          <option value="COD">Cash on Delivery</option>
          <option value="GCash">GCash</option>
        </select>

        {rentalForm.paymentMethod === "GCash" && (
          <div className="gcash-info">
            <h4>📌 Send Payment To:</h4>
            <p><strong>GCash Account Name:</strong> {gcashAccountName || "N/A"}</p>
            <p><strong>GCash Phone Number:</strong> {gcashPhoneNumber || "N/A"}</p>

            <label>GCash Screenshot</label>
            <input
              type="file"
              name="screenshot"
              accept="image/*"
              onChange={handleFormChange}
            />

            {rentalForm.screenshot && (
              <div className="gcash-screenshot-container">
                <p>Uploaded ✅</p>
                <img
                  src={rentalForm.screenshot instanceof File
                    ? URL.createObjectURL(rentalForm.screenshot)
                    : rentalForm.screenshot
                  }
                  alt="GCash Screenshot"
                  className="gcash-screenshot-image"
                />
              </div>
            )}
          </div>
        )}

        {/* ----------- Rental Fee Section ----------- */}
        <div className="rental-fees">
          <label>Daily Rate</label>
          <input type="number" name="dailyRate" value={rentalForm.dailyRate.toFixed(2)} readOnly />

          <label>Rental Duration (days)</label>
          <input
            type="number"
            name="rentalDays"
            min={1}
            value={rentalForm.rentalDays}
            onChange={handleFormChange}
          />

          <p><strong>Service Fee:</strong> ₱{rentalForm.serviceFee.toFixed(2)}</p>
          <p><strong>Delivery Fee:</strong> ₱{rentalForm.deliveryFee.toFixed(2)}</p>

          {/* Conditional Discount */}
          {rentalForm.rentalDays >= 7 && (
            <p><strong>Discount:</strong> ₱{rentalForm.discount.toFixed(2)}</p>
          )}

          <p><strong>Total Amount:</strong> ₱{rentalForm.totalAmount.toFixed(2)}</p>
        </div>

        <div className="form-buttons">
          <button type="button" className="cancel-btn" onClick={handleCancelRent}>Cancel</button>
          <button type="button" className="submit-btn" onClick={() => handleSubmitRental(selectedRental)}>Submit</button>
        </div>
      </div>
    </div>
  </div>
)}



    {/* NORMAL RENTAL GRID */}
    {!showOwnerProfile && !selectedRental && (
      <div className="rental-grid">
        {filteredPosts.filter(post => {
          const renters = post.currentRenters || [];
          const max = post.maxRenters || 1;
          const userRented = renters.includes(auth.currentUser?.uid);
          if (renters.length >= max || userRented) return false;
          return true;
        }).length > 0 ? (
          filteredPosts
            .filter(post => {
              const renters = post.currentRenters || [];
              const max = post.maxRenters || 1;
              const userRented = renters.includes(auth.currentUser?.uid);
              if (renters.length >= max || userRented) return false;
              return true;
            })
            .map((post) => (
              <div key={post.id} className="rental-card">
                <img src={post.imageUrl || "/no-image.png"} alt={post.name} className="rental-image" />
                <h3>{post.name}</h3>
                <p>{post.description}</p>
                <p>
                  <strong>Owner:</strong>{" "}
                  <span onClick={() => handleViewOwnerProfile(post.ownerEmail)}>{getOwnerLabel(post.ownerEmail)}</span>
                </p>
                <p><strong>Price:</strong> ₱{post.price}</p>

                {/* Message Owner */}
                <div className="message-owner">
                  <input
                    type="text"
                    placeholder="Message the owner..."
                    value={ownerMessages[post.id] || ""}
                    onChange={(e) =>
                      setOwnerMessages((prev) => ({ ...prev, [post.id]: e.target.value }))
                    }
                  />
                  <button onClick={() => handleSendMessageToOwner(post.id, post.ownerEmail)}>Send</button>
                </div>

                   {/* Comments Section */}
<div className="comments-section">
  {/* Toggle Comments Section */}
  <button
    type="button"
    onClick={() =>
      setShowCommentsSection(prev => ({ ...prev, [post.id]: !prev[post.id] }))
    }
  >
    {showCommentsSection[post.id] ? "Hide Comments" : "Show Comments"}
  </button>

  {showCommentsSection[post.id] && (
    <>
      {/* Add Comment */}
      {!showCommentInput[post.id] && (
        <button
          type="button"
          onClick={() => setShowCommentInput(prev => ({ ...prev, [post.id]: true }))}
        >
          Add Comment
        </button>
      )}

      {showCommentInput[post.id] && (
        <div className="comment-input-row">
          <input
            type="text"
            placeholder="Add a comment..."
            value={newComments[post.id] || ""}
            onChange={(e) =>
              setNewComments(prev => ({ ...prev, [post.id]: e.target.value }))
            }
          />

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                setCommentImages(prev => ({ ...prev, [post.id]: file }));
              }
            }}
          />

          <button onClick={() => handleAddComment(post.id)}>Comment</button>
          <button
            type="button"
            onClick={() => {
              setNewComments(prev => ({ ...prev, [post.id]: "" }));
              setCommentImages(prev => ({ ...prev, [post.id]: null }));
              setShowCommentInput(prev => ({ ...prev, [post.id]: false }));
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Comments List */}
      <div className="comments-list">
        {(comments[post.id] || []).map((c) => (
          <div key={c.id} className="comment-card">
            <p>
              <strong>{c.userName}:</strong> {c.comment}
            </p>

            {c.imageUrl && (
              <img src={c.imageUrl} alt="Comment attachment" className="comment-reply-image" />
            )}

            {/* Only show edit/delete for comment owner */}
            {c.userId === auth.currentUser?.uid && (
              <div className="comment-actions">
                <button onClick={() => handleEditComment(post.id, c.id)}>Edit</button>
                <button onClick={() => handleDeleteComment(post.id, c.id)}>Delete</button>
              </div>
            )}

            {/* Replies */}
            {c.replies?.map((r) => (
              <p key={r.id} className="reply">
                <strong>{r.userName}:</strong> {r.comment}
              </p>
            ))}

            {/* Reply Input (optional: show for everyone or only owner) */}
            {showReplyInput[c.id] && (
              <div className="reply-input-row">
                <input
                  type="text"
                  placeholder="Reply..."
                  value={replyText[c.id] || ""}
                  onChange={(e) =>
                    setReplyText(prev => ({ ...prev, [c.id]: e.target.value }))
                  }
                />
                <button onClick={() => handleReplyComment(post.id, c.id)}>Reply</button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyText(prev => ({ ...prev, [c.id]: "" }));
                    setShowReplyInput(prev => ({ ...prev, [c.id]: false }));
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )}
</div>


                <div className="rental-actions">
                  <button 
                    onClick={() => handleRentNow(post)}
                    disabled={post.currentRenters?.includes(auth.currentUser?.uid)}
                  >
                    {post.currentRenters?.includes(auth.currentUser?.uid) ? "Already Rented" : "Rent Now"}
                  </button>
                </div>
              </div>
            ))
        ) : (
          <p>No rentals found.</p>
        )}
      </div>
    )}
  </div>
)}


{/* MY RENTALS */}
{activePage === "myRentals" && userRole === "renter" && (
 <div className="my-rentals-renter">
    <div className="rentals-container">
      <h1 className="rentals-title">My Rentals</h1>

      {/* Tabs */}
      <div className="rentals-tabs">
        {["Processing", "To Receive", "To deliver", "Completed", "Returned", "Cancelled"].map(
          (tab, index) => (
            <button
              key={tab}
              className={`rentals-tab-btn ${selectedTab === tab ? "active" : ""} ${
                index >= 4 ? "secondary" : ""
              }`}
              onClick={() => setSelectedTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          )
        )}
      </div>

      {/* RENTAL LIST */}
      <div className="rental-list">
        {filteredRentals.length === 0 && (
          <p className="no-rentals-text">No rentals in this category.</p>
        )}

        {filteredRentals.map((rental) => {
          const rentalDate =
            rental.dateRented || rental.rentalDate || rental.rentDate || rental.createdAt;

          return (
            <div
              key={rental.id}
              className={`rental-card ${
                rental.status === "Cancelled"
                  ? "cancelled"
                  : rental.status === "Returned"
                  ? "returned"
                  : rental.status === "Completed"
                  ? "completed"
                  : ""
              }`}
            >
              {/* IMAGE */}
              <img
                src={rental.propertyImage || "/no-image.png"}
                className="rental-card-image"
                alt={rental.propertyName || "property"}
              />

              {/* ACTION BUTTONS */}
              <div className="rental-actions">
                {rental.status === "Processing" && (
                  <button
                    className="rental-card-btn cancel-rental-btn"
                    onClick={() => handleUpdateStatus(rental.id, "Cancelled")}
                  >
                    Cancel
                  </button>
                )}

                {rental.status === "Completed" && (
                  <button
                    className="rental-card-btn returned-rental-btn"
                    onClick={() => handleUpdateStatus(rental.id, "Returned")}
                  >
                    Returned
                  </button>
                )}

                {/* REMOVE BUTTON BELOW CANCEL/RETURNED */}
                {["Processing", "Cancelled", "Returned", "Completed"].includes(rental.status) && (
                  <button
                    className="rental-card-btn delete-rental-btn"
                    onClick={() => handleDeleteRental(rental.id)}
                  >
                    🗑 Remove
                  </button>
                )}
              </div>

              {/* DETAILS */}
              <div className="rental-info">
                <p><strong>Property Name:</strong> {rental.propertyName || "N/A"}</p>
                <p><strong>Owner Email:</strong> {rental.ownerEmail || "N/A"}</p>
                <p><strong>Price:</strong> ₱{rental.dailyRate?.toLocaleString() || "0"}</p>
                <p><strong>Full Name:</strong> {rental.renterName || "N/A"}</p>
                <p><strong>Phone Number:</strong> {rental.renterPhone || "N/A"}</p>
                <p><strong>Address:</strong> {rental.address || "N/A"}</p>
                <p><strong>Place Name:</strong> {rental.placeName || "N/A"}</p>
                <p><strong>Postal Code:</strong> {rental.postalCode || "N/A"}</p>
                <p><strong>Payment Method:</strong> {rental.paymentMethod || "N/A"}</p>
                {rental.paymentMethod === "GCash" && (
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowProof(prev => ({
                          ...prev,
                          [rental.id]: !prev[rental.id]
                        }))
                      }
                    >
                      {showProof[rental.id] ? "Hide Proof" : "Show Proof"}
                    </button>
                    {showProof[rental.id] && rental.gcashScreenshot && (
                      <div>
                        <p><strong>GCash Proof:</strong></p>
                        {console.log("Displaying GCash Screenshot:", rental.gcashScreenshot)}
                        <img src={rental.gcashScreenshot} alt="GCash Screenshot" className="rental-gcash-proof-image" />
                      </div>
                    )}
                  </div>
                )}
                <p><strong>Daily Rate:</strong> ₱{rental.dailyRate?.toLocaleString() || "0"}</p>
                <p><strong>Rental Duration (Days):</strong> {rental.rentalDays || "N/A"}</p>
                <p><strong>Service Fee:</strong> ₱{rental.serviceFee?.toLocaleString() || "0"}</p>
                <p><strong>Delivery Fee:</strong> ₱{rental.deliveryFee?.toLocaleString() || "0"}</p>
                <p><strong>Total Amount:</strong> ₱{rental.totalAmount?.toLocaleString() || "0"}</p>
                <p><strong>Date Rented:</strong> {formatDate(rentalDate)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}


       {activePage === "messages" && userRole === "renter" && (
  <div className="messages-renter">
    <div className="messages-header">
      <h1>Messages</h1>
      <button 
        onClick={handleDeleteAllConversations}
        className="delete-all-btn"
        disabled={loading}
      >
        🗑️ Delete All
      </button>
    </div>
    <div className="messages-container">
      <div className="conversation-list">
        <h3>Conversations</h3>
        {Array.from(new Set(messages.map(m => m.sender === renterEmail ? m.receiver : m.sender)))
          .map(email => (
            <div
              key={email}
              className={`conversation-item ${selectedChat === email ? "active" : ""}`}
              onClick={() => setSelectedChat(email)}
            >
              {email}
            </div>
          ))
        }
        {messages.length === 0 && <p>No messages yet.</p>}
      </div>

      <div className="chat-window">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <h3>Chat with {selectedChat}</h3>
              <button onClick={() => setSelectedChat(null)}>✖ Close</button>
            </div>

            <div className="chat-messages">
              {messages
                .filter(m => m.sender === renterEmail || m.receiver === renterEmail)
                .filter(m => m.sender === selectedChat || m.receiver === selectedChat)
                .sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
                .map(m => (
                  <div key={m.id} className={`chat-bubble ${m.sender === renterEmail ? "sent" : "received"}`}>
                    <p>{m.text}</p>
                    <small>{m.createdAt?.toDate?.().toLocaleTimeString()}</small>
                  </div>
                ))}
            </div>

            <div className="chat-input">
              <input
                type="text"
                placeholder="Type your message..."
                value={replyText[selectedChat] || ""}
                onChange={e => setReplyText(prev => ({ ...prev, [selectedChat]: e.target.value }))}
                onKeyDown={e => { if(e.key === "Enter") handleReply(selectedChat) }}
              />
              <button onClick={() => handleReply(selectedChat)}>Send</button>
            </div>
          </>
        ) : <p>Select a conversation to start chatting.</p>}
      </div>
    </div>
  </div>

        )}
      </div>

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
  );
};
export default RenterDashboard;
