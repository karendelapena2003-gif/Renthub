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
  reauthenticateWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { uploadToCloudinary } from "../cloudinary";

const RenterDashboard = () => {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // --- State ---
const [activePage, setActivePage] = useState("browseRentals");
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
  const [userProfiles, setUserProfiles] = useState({});
const [showSettings, setShowSettings] = useState(false);
const [currentPassword, setCurrentPassword] = useState("");
const [newPassword, setNewPassword] = useState("");
const [passwordLoading, setPasswordLoading] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState("");

  // Chat
  const [selectedChat, setSelectedChat] = useState(null);
const [selectedTab, setSelectedTab] = useState("Processing");
  const [messageSearch, setMessageSearch] = useState("");
  const [lastReadByChat, setLastReadByChat] = useState({});
  const [userRole, setUserRole] = useState("");

// Filter rentals by selected status (handle "Return" tab mapping to "Returned" status)
const filteredRentals = myRentals.filter((r) => {
  const tabStatus = selectedTab === "Return" ? "Returned" : selectedTab;
  return r.status === tabStatus;
});

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
  const unsub = onSnapshot(
    userDocRef,
    (docSnap) => {
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

        setDoc(userDocRef, baseProfile, { merge: true }).catch(err => {
          console.error("Failed to create renter profile:", err);
        });
        setDoc(doc(db, "users", auth.currentUser.uid), baseProfile, { merge: true }).catch(err => {
          console.error("Failed to mirror to users collection:", err);
        });
      }
    },
    (err) => {
      console.error("Firestore: renter profile read denied", err);
      // Silently fail on permission errors during initial login
    }
  );

  return () => unsub();
}, []);

  // ------------------ AUTH ------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate("/login");
        return;
      }
      // Don't override if renters listener already set detailed user data
      // Auth provides basic info as fallback
      setUser((prev) => {
        if (prev && prev.uid === currentUser.uid && prev.role === "renter") {
          return prev; // Keep detailed Firestore data
        }
        return currentUser; // Use auth data as fallback
      });
      setDisplayName((prev) => prev || currentUser.displayName || "");
      setPhotoPreview((prev) => prev || currentUser.photoURL || "/default-profile.png");
      // Ensure renters land on Browse Rentals upon login
      setActivePage("browseRentals");
    });
    return () => unsubscribe();
  }, [navigate]);

  // ------------------ FIRESTORE DATA ------------------
  useEffect(() => {
    if (!renterEmail || !auth.currentUser) return;

    const unsubscribers = [];

    // Properties
    const propsUnsub = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "approved")),
      (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("Firestore: properties read denied", err);
        // Don't show toast for properties - might be empty on first login
      }
    );
    unsubscribers.push(propsUnsub);

    

    // My rentals
    const rentalsUnsub = onSnapshot(
      query(collection(db, "rentals"), where("renterEmail", "==", renterEmail)),
      (snap) => setMyRentals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("Firestore: rentals read denied", err);
        // Don't show toast - might be empty for new renters
      }
    );
    unsubscribers.push(rentalsUnsub);



    // Messages: subscribe only to threads involving this renter (via participants)
    const qMsgs = query(
      collection(db, "messages"),
      where("participants", "array-contains", renterEmail.toLowerCase())
    );
    const msgsUnsub = onSnapshot(
      qMsgs,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0) - (b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0));
        setMessages(list);
      },
      (err) => {
        console.error("Firestore: messages read denied", err);
        // Don't show toast - might be empty for new renters
      }
    );
    unsubscribers.push(msgsUnsub);

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
  if (!auth.currentUser) return;
  
  setOwnerProfileEmail(email);
  setShowOwnerProfile(true);
  setOwnerSearchTerm("");

  // Unsubscribe previous owner's posts snapshot if any
  if (ownerUnsubRef.current) ownerUnsubRef.current();

  // Subscribe to the selected owner's properties
  const q = query(
    collection(db, "properties"),
    where("ownerEmail", "==", email),
    where("status", "==", "approved")
  );
  const unsub = onSnapshot(
    q,
    (snap) => {
      setOwnerPostsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.error("Firestore: owner properties read denied", err);
      setToastMessage("❌ Cannot load owner posts (permissions)");
      setTimeout(() => setToastMessage(""), 2500);
    }
  );
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
    if (!auth.currentUser || !posts || posts.length === 0) return;
    const emails = Array.from(new Set(posts.map((p) => p.ownerEmail).filter(Boolean)));
    const unsubscribers = [];

    emails.forEach((email) => {
      const q = query(collection(db, "users"), where("email", "==", email));
      const unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const d = snap.docs[0].data();
            setOwnerNames((prev) => ({ ...prev, [email]: d.displayName || d.name || email }));
          } else {
            setOwnerNames((prev) => ({ ...prev, [email]: email }));
          }
        },
        (err) => {
          console.error("Firestore: owner names read denied", err);
          setOwnerNames((prev) => ({ ...prev, [email]: email }));
        }
      );
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((u) => u());
  }, [posts]);

  const getOwnerLabel = (email) => ownerNames[email] || (email ? email.split("@")[0] : "Unknown");



  
  // ---------- COMMENTS per post (subscribe) ----------
  useEffect(() => {
    if (!auth.currentUser || !posts || posts.length === 0) return;
    const unsubArr = posts.map((post) => {
      const q = collection(db, `properties/${post.id}/comments`);
      return onSnapshot(
        q,
        (snap) => {
          setComments((prev) => ({ ...prev, [post.id]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }));
        },
        (err) => {
          console.error("Firestore: property comments read denied for", post.id, err);
          // Don't show toast, just log
        }
      );
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
      const municipality = (data.address?.municipality || data.address?.city || data.address?.town || "").toLowerCase();
      const village = (data.address?.village || data.address?.suburb || data.address?.hamlet || "").toLowerCase();
      const road = (data.address?.road || "").toLowerCase();
      const fullDisplayName = (data.display_name || "").toLowerCase();

      // Debug: log ALL location details
      console.log("📍 FULL Location Details:", {
        displayName: displayName,
        province: province,
        municipality: municipality,
        village: village,
        road: road,
        fullDisplayName: fullDisplayName,
        completeAddress: data.address
      });

      // Province restriction: only Isabela or Negros Occidental
      const allowedProvinces = ["isabela", "negros occidental"];
      if (!allowedProvinces.some(ap => province.includes(ap))) {
        alert(`❌ Orders are only allowed from Isabela or Negros Occidental. You selected: ${province || "Unknown"}`);
        return;
      }

      // Delivery Fee Calculation based on specific locations
      // ₱30 - Town Proper (Poblacion/Main Town)
      const location30 = [
        "barangay 5", "bgry 5", "barangay5", "bgry5",
        "barangay 3", "bgry 3", "barangay3", "bgry3",
        "barangay 4", "bgry 4", "barangay4", "bgry4",
        "barangay 6", "bgry 6", "barangay6", "bgry6",
        "barangay 9", "bgry 9", "barangay9", "bgry9",
        "barangay 2", "bgry 2", "barangay2", "bgry2",
        "barangay 1", "bgry 1", "barangay1", "bgry1",
        "barangay 8", "bgry 8", "barangay8", "bgry8",
        "renaldo street", "renaldo",
        "rizal extension", "rizal ext",
        "panganiban street", "panganiban",
        "bagonawa", "la castellana",
        "isabela-libas", "libas road", "boundary road", "libas"
      ];

      // ₱50 - Near barangays
      const location50 = [
        "maytubig",
        "san agustin",
        "mansablay",
        "camangcamang", "camang",
        "cansalongon"
      ];

      // ₱70 - Medium distance
      const location70 = [
        "payao"
      ];

      // ₱80 - Far areas
      const location80 = [
        "cabcab",
        "amin",
        "camp clark",
        "libas national high school", "libas nhs",
        "sacop"
      ];

      // ₱90 - Very far areas
      const location90 = [
        "sebucauan elementary school", "sebucauan",
        "sikatuna elementary school", "sikatuna"
      ];

      // ₱100 - Farthest areas
      const location100 = [
        "banogbanog",
        "limalima",
        "makilignit"
      ];

      // Function to check if location matches any keyword in the list
      const matchesLocation = (keywords) => {
        return keywords.some(keyword => 
          fullDisplayName.includes(keyword) || 
          village.includes(keyword) || 
          road.includes(keyword) ||
          displayName.toLowerCase().includes(keyword)
        );
      };

      // Calculate delivery fee based on location priority (check from highest to lowest)
      let newDeliveryFee = 50; // Default fallback
      
      if (matchesLocation(location100)) {
        newDeliveryFee = 100;
      } else if (matchesLocation(location90)) {
        newDeliveryFee = 90;
      } else if (matchesLocation(location80)) {
        newDeliveryFee = 80;
      } else if (matchesLocation(location70)) {
        newDeliveryFee = 70;
      } else if (matchesLocation(location50)) {
        newDeliveryFee = 50;
      } else if (matchesLocation(location30)) {
        newDeliveryFee = 30;
      }
      
      console.log(`💰 DELIVERY FEE CALCULATION:
        - Municipality: "${municipality}"
        - Village/Barangay: "${village}"
        - Road: "${road}"
        - Display Name: "${displayName}"
        - Full Display: "${fullDisplayName}"
        - Delivery Fee: ₱${newDeliveryFee}`);

      setRentalForm((prev) => {
        // Recalculate total with new delivery fee
        const newTotal = prev.dailyRate * prev.rentalDays + prev.serviceFee + newDeliveryFee - (prev.discount || 0);
        console.log(`🔄 Updating form - Old Fee: ₱${prev.deliveryFee}, New Fee: ₱${newDeliveryFee}, New Total: ₱${newTotal}`);
        return {
          ...prev,
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          placeName: displayName,
          province,
          deliveryFee: newDeliveryFee,
          totalAmount: newTotal,
        };
      });
    } catch (err) {
      console.error("❌ Reverse geocode failed:", err);
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
  
  // Service Fee: ₱15 for first ₱100, then +₱10 for every additional ₱100
  // Formula: ₱5 + (₱10 × number of ₱100 increments)
  // Examples: ₱100→₱15, ₱200→₱25, ₱500→₱55, ₱600→₱65
  const serviceFee = Math.max(5, 5 + Math.floor(dailyRate / 100) * 10);
  
  // Delivery Fee: ₱30 for Municipality of Isabela, ₱50 for other areas
  // Default to ₱30, will be updated based on selected location
  const deliveryFee = 30;
  
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
    discount: 0,
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

      // Keep existing service fee (fixed, not multiplied by days)
      const serviceFee = prev.serviceFee;
      
      // Keep existing delivery fee (fixed, not multiplied by days)
      const deliveryFee = prev.deliveryFee;

      // Base total: Only daily rate is multiplied by days, fees stay the same
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
  console.log("🔍 handleSubmitRental called");
  console.log("📋 Form data:", rentalForm);
  console.log("🏠 Selected rental:", rental);
  console.log("👤 Current user:", auth.currentUser);

  if (!rentalForm.fullName || !rentalForm.phoneNumber || !rentalForm.address) {
    console.warn("⚠️ Validation failed: Missing required fields");
    setToastMessage("⚠️ Please fill in all required fields");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  if (rentalForm.paymentMethod === "GCash" && !uploadedScreenshotUrl) {
    console.warn("⚠️ Validation failed: Missing GCash screenshot");
    setToastMessage("⚠️ Please upload GCash screenshot for GCash payment");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  console.log("✅ Validation passed, proceeding with submission");

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

    console.log("💾 Writing to Firestore...");
    console.log("📄 Rental data:", rentalData);

    await Promise.all([
      addDoc(rentalRef, rentalData),
      updateDoc(propertyRef, { 
        currentRenters: arrayUnion(auth.currentUser.uid),
        isRented: (rental.currentRenters?.length || 0) + 1 >= (rental.maxRenters || 1) 
      }),
    ]);

    console.log("✅ Firestore write successful!");

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
    console.error("❌ Rental submission error:", err);
    console.error("Error code:", err.code);
    console.error("Error message:", err.message);
    
    let errorMessage = "❌ Failed to submit rental";
    if (err.code === "permission-denied") {
      errorMessage = "❌ Permission denied. Please check your account status.";
    } else if (err.code === "unauthenticated") {
      errorMessage = "❌ You must be logged in to submit a rental.";
    }
    
    setToastMessage(errorMessage);
    setTimeout(() => setToastMessage(""), 3500);
  } finally {
    setLoading(false);
  }
};


// inside BrowseRentals component
const [gcashAccountName, setGcashAccountName] = useState("");
const [gcashPhoneNumber, setGcashPhoneNumber] = useState("");

useEffect(() => {
  if (!auth.currentUser) return;
  
  const fetchGcashInfo = async () => {
    try {
      const docRef = doc(db, "settings", "gcash");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGcashAccountName(data.accountName || "");
        setGcashPhoneNumber(data.phoneNumber || "");
      }
    } catch (err) {
      console.error("Failed to fetch GCash settings:", err);
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

// Disabled: only run manually when needed
// fixRentalImages();

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

// Disabled: only run manually when needed
// fixMissingRentalImages();

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

// Disabled: only run manually when needed
// fixMissingDateRented();

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
  // Only run if explicitly admin (not empty/undefined)
  if (userRole !== "admin") return;
  
  const q = query(collection(db, "rentals"));
  adminUnsubRef.current = onSnapshot(
    q,
    (snap) => {
      setAdminRentalList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.error("Firestore: admin rentals read denied", err);
    }
  );

  return () => {
    if (adminUnsubRef.current) adminUnsubRef.current();
  };
}, [userRole]);


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
        participants: [renterEmail.toLowerCase(), post.ownerEmail.toLowerCase()],
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


const [comments, setComments] = useState({});
const [newComments, setNewComments] = useState({});
const [commentImages, setCommentImages] = useState({});
const [showReplyInput, setShowReplyInput] = useState({});
const [replyText, setReplyText] = useState({});
const [showCommentInput, setShowCommentInput] = useState({});
const [showCommentsSection, setShowCommentsSection] = useState({});
const [showProof, setShowProof] = useState({});
const [showReturnProofModal, setShowReturnProofModal] = useState(false);
const [returnProofRental, setReturnProofRental] = useState(null);
const [returnProofImage, setReturnProofImage] = useState(null);
const [returnProofPreview, setReturnProofPreview] = useState("");
const [returnDescription, setReturnDescription] = useState("");
const [overdueRentals, setOverdueRentals] = useState([]);
const [showOverdueModal, setShowOverdueModal] = useState(false);

const handleAddComment = async (postId) => {
  const text = newComments[postId]?.trim();
  if (!text && !commentImages[postId]) return;

  let imageUrl = "";
  if (commentImages[postId] instanceof File) {
    imageUrl = await uploadToCloudinary(commentImages[postId], "renthub/comments");
  }

  await addDoc(collection(db, "properties", postId, "comments"), {
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

  await addDoc(collection(db, "properties", postId, "comments", commentId, "replies"), {
    userId: auth.currentUser.uid,
    userName: auth.currentUser.displayName || "Anonymous",
    comment: text,
    createdAt: serverTimestamp(),
  });

  setReplyText(prev => ({ ...prev, [commentId]: "" }));
  setShowReplyInput(prev => ({ ...prev, [commentId]: false }));
};
const handleEditComment = async (postId, commentId, newText) => {
  const commentRef = doc(db, "properties", postId, "comments", commentId);
  await updateDoc(commentRef, { comment: newText, updatedAt: serverTimestamp() });
};

const handleUpdateStatus = (id, newStatus) => {
  const updated = myRentals.map(r => (r.id === id ? { ...r, status: newStatus } : r));
  setMyRentals(updated);
};

const handleReturnProofChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    setReturnProofImage(file);
    setReturnProofPreview(URL.createObjectURL(file));
  }
};

const handleSubmitReturnProof = async () => {
  if (!returnProofImage) {
    setToastMessage("⚠️ Please upload proof of return");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  if (!returnDescription.trim()) {
    setToastMessage("⚠️ Please provide feedback for return");
    setTimeout(() => setToastMessage(""), 2500);
    return;
  }

  try {
    setLoading(true);
    
    // Upload proof to Cloudinary
    const proofUrl = await uploadToCloudinary(returnProofImage, "renthub/return-proofs");
    
    // Update rental status in Firestore
    await updateDoc(doc(db, "rentals", returnProofRental.id), {
      status: "Returned",
      returnProofImage: proofUrl,
      returnDescription: returnDescription.trim(),
      returnedAt: serverTimestamp(),
    });

    setToastMessage("✅ Item marked as Returned");
    setTimeout(() => setToastMessage(""), 2000);
    
    // Close modal and reset
    setShowReturnProofModal(false);
    setReturnProofRental(null);
    setReturnProofImage(null);
    setReturnProofPreview("");
    setReturnDescription("");
  } catch (err) {
    console.error(err);
    setToastMessage("❌ Failed to submit return proof");
    setTimeout(() => setToastMessage(""), 3500);
  } finally {
    setLoading(false);
  }
};

const handleCancelReturnProof = () => {
  setShowReturnProofModal(false);
  setReturnProofRental(null);
  setReturnProofImage(null);
  setReturnProofPreview("");
  setReturnDescription("");
};

// Check for overdue rentals
const checkOverdueRentals = useCallback(() => {
  const now = new Date();
  const overdueList = myRentals.filter((rental) => {
    // Only check Completed rentals (items that should be returned)
    if (rental.status !== "Completed") return false;
    
    const dateRented = rental.dateRented || rental.createdAt;
    if (!dateRented) return false;
    
    const rentedDate = dateRented.toDate ? dateRented.toDate() : new Date(dateRented);
    const rentalDays = rental.rentalDays || 1;
    const dueDate = new Date(rentedDate);
    dueDate.setDate(dueDate.getDate() + rentalDays);
    
    // Check if rental is overdue (due date has passed)
    return now > dueDate;
  });
  
  setOverdueRentals(overdueList);
  return overdueList;
}, [myRentals]);

// Auto-check overdue rentals
useEffect(() => {
  if (myRentals.length > 0) {
    const overdueList = checkOverdueRentals();
    
    // Show modal if there are overdue rentals
    if (overdueList.length > 0 && activePage === "myRentals") {
      // Only show once per session or every hour
      const lastShown = localStorage.getItem("lastOverdueShown");
      const now = Date.now();
      if (!lastShown || now - parseInt(lastShown) > 3600000) { // 1 hour
        setShowOverdueModal(true);
        localStorage.setItem("lastOverdueShown", now.toString());
      }
    }
  }
}, [myRentals, checkOverdueRentals, activePage]);

// Calculate days overdue
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

// Subscribe to user profiles for participants in current messages
useEffect(() => {
  if (!auth.currentUser) return;
  
  const unsubscribers = [];
  const participants = Array.from(new Set(messages.flatMap(m => [m.sender, m.receiver])));
  if (participants.length === 0) return;

  participants.forEach(email => {
    if (!email) return;
    const userQuery = query(collection(db, "users"), where("email", "==", email));
    const unsub = onSnapshot(
      userQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();
          setUserProfiles(prev => ({ ...prev, [email]: userData }));
        } else {
          setUserProfiles(prev => ({ ...prev, [email]: { displayName: email, photoURL: null } }));
        }
      },
      (err) => {
        console.error("Firestore: user profile read denied", err);
        setUserProfiles(prev => ({ ...prev, [email]: { displayName: email, photoURL: null } }));
      }
    );
    unsubscribers.push(unsub);
  });

  return () => unsubscribers.forEach(u => u());
}, [messages]);

// Mark chat as read when messages update for the open chat
useEffect(() => {
  if (selectedChat) {
    markChatRead(selectedChat);
  }
}, [selectedChat, messages]);

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
      participants: [renterEmail.toLowerCase(), ownerEmail.toLowerCase()],
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
        participants: [renterEmail.toLowerCase(), chatUser.toLowerCase()],
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

  const markChatRead = (chatUser) => {
    const chatMessages = messages
      .filter((m) => (m.sender === chatUser && m.receiver === renterEmail) || (m.receiver === chatUser && m.sender === renterEmail))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

    const last = chatMessages[chatMessages.length - 1];
    const lastTs = last?.createdAt?.seconds || Math.floor(Date.now() / 1000);
    setLastReadByChat((prev) => ({ ...prev, [chatUser]: lastTs }));
  };

  
  const handleDeleteAllConversations = async () => {
    if (messages.length === 0) {
      setToastMessage("⚠️ No conversations to delete");
      setTimeout(() => setToastMessage(""), 2500);
      return;
    }
    try {
      setLoading(true);
      const q = query(
        collection(db, "messages"),
        where("participants", "array-contains", renterEmail.toLowerCase())
      );
      const snap = await getDocs(q);
      const myMessages = snap.docs;
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

  const handleDeleteConversation = async (chatUser) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "messages"),
        where("participants", "array-contains", renterEmail.toLowerCase())
      );
      const snap = await getDocs(q);
      const toDelete = snap.docs.filter((d) => {
        const m = d.data();
        return (
          (m.sender === renterEmail && m.receiver === chatUser) ||
          (m.receiver === renterEmail && m.sender === chatUser)
        );
      });

      await Promise.all(toDelete.map((d) => deleteDoc(doc(db, "messages", d.id))));

      // Optimistically update local state
      setMessages((prev) =>
        prev.filter(
          (m) =>
            !(
              (m.sender === renterEmail && m.receiver === chatUser) ||
              (m.receiver === renterEmail && m.sender === chatUser)
            )
        )
      );

      if (selectedChat === chatUser) {
        setSelectedChat(null);
      }

      setToastMessage("✅ Conversation deleted");
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setToastMessage("❌ Failed to delete conversation");
      setTimeout(() => setToastMessage(""), 3500);
    } finally {
      setLoading(false);
    }
  };

  const handleMessageNow = (post) => {
    if (!post?.ownerEmail) return alert("Owner has no email");
    setSelectedChat(post.ownerEmail);
    setActivePage("messages");
    markChatRead(post.ownerEmail);
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

// moved userRole state above to avoid TDZ errors

useEffect(() => {
  const auth = getAuth();
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        // Fetch role from Firestore user document
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserRole(docSnap.data().role || "renter"); // Default to renter
        } else {
          // New user, set default role
          setUserRole("renter");
        }
      } catch (err) {
        console.error("Failed to fetch user role:", err);
        setUserRole("renter"); // Default to renter on error
      }
    } else {
      setUserRole("");
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
              Changes Password
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
          <div className="quantity-selector">
            <button
              type="button"
              className="qty-btn qty-btn-minus"
              onClick={() => {
                if (rentalForm.rentalDays > 1) {
                  handleFormChange({
                    target: { name: 'rentalDays', value: rentalForm.rentalDays - 1, type: 'number' }
                  });
                }
              }}
              disabled={rentalForm.rentalDays <= 1}
            >
              −
            </button>
            <input
              type="number"
              className="qty-input"
              name="rentalDays"
              min={1}
              value={rentalForm.rentalDays}
              onChange={handleFormChange}
            />
            <button
              type="button"
              className="qty-btn qty-btn-plus"
              onClick={() => {
                handleFormChange({
                  target: { name: 'rentalDays', value: rentalForm.rentalDays + 1, type: 'number' }
                });
              }}
            >
              +
            </button>
          </div>

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
        {["Processing", "To Receive", "To deliver", "Completed", "Return", "Cancelled"].map(
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
                    onClick={() => {
                      setReturnProofRental(rental);
                      setShowReturnProofModal(true);
                    }}
                  >
                    {getDaysOverdue(rental) > 0 ? `⚠️ Return Now (${getDaysOverdue(rental)}d Overdue)` : "Return"}
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
                <p><strong>Postal Code:</strong> {rental.postalCode || rental.zipCode || rental.postCode || "N/A"}</p>
                <p><strong>Province:</strong> {rental.province || rental.state || "N/A"}</p>
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
                {rental.status === "Completed" && getDueDate(rental) && (
                  <p className={getDaysOverdue(rental) > 0 ? "overdue-warning" : ""}>
                    <strong>Due Date:</strong> {getDueDate(rental).toLocaleDateString()}
                    {getDaysOverdue(rental) > 0 && <span className="overdue-badge"> ⚠️ {getDaysOverdue(rental)} days overdue!</span>}
                  </p>
                )}
                {rental.returnProofImage && rental.status === "Returned" && (
                  <div className="return-proof-info">
                    <p><strong>Return Description:</strong> {rental.returnDescription || "N/A"}</p>
                    <button
                      type="button"
                      onClick={() => window.open(rental.returnProofImage, "_blank")}
                      className="view-proof-btn"
                    >
                      View Return Proof
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* RETURN PROOF MODAL */}
    {showReturnProofModal && returnProofRental && (
      <div className="rental-modal-overlay">
        <div className="rental-modal">
          <button className="close-btn" onClick={handleCancelReturnProof}>✖</button>
          
          <h2>Return Proof Required</h2>
          <p>Please upload proof that you have returned: <strong>{returnProofRental.propertyName}</strong></p>
          
          <div className="return-proof-details">
            <p><strong>Address:</strong> {returnProofRental.address || "N/A"}</p>
            <p><strong>Postal Code:</strong> {returnProofRental.postalCode || returnProofRental.zipCode || returnProofRental.postCode || "N/A"}</p>
            <p><strong>Owner Email:</strong> {returnProofRental.ownerEmail || "N/A"}</p>
          </div>
          
          <div className="return-proof-form">
            <label>Return Feedback *</label>
            <textarea
              className="return-description-textarea"
              placeholder="Share your feedback about the rental experience (e.g., condition of item, satisfaction, any comments)..."
              value={returnDescription}
              onChange={(e) => setReturnDescription(e.target.value)}
              rows={4}
            />

            <label>Upload Return Proof (Image) *</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleReturnProofChange}
            />
            
            {returnProofPreview && (
              <div className="return-proof-preview">
                <p>Preview:</p>
                <img
                  src={returnProofPreview}
                  alt="Return Proof Preview"
                  className="proof-preview-image"
                />
              </div>
            )}
            
            <div className="form-buttons">
              <button
                type="button"
                className="cancel-btn"
                onClick={handleCancelReturnProof}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit-btn"
                onClick={handleSubmitReturnProof}
                disabled={loading || !returnProofImage}
              >
                {loading ? "Submitting..." : "Submit Return Proof"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
)}


       {activePage === "messages" && userRole === "renter" && (
  <div className="messages-renter">
    <div className="messages-header">
      <h1>Messages</h1>
    </div>
    <div className={`messages-container ${selectedChat ? "chat-open" : "no-chat"}`}>
      <div className="conversation-list">
        <div className="conversation-list-header">
          <h3>Conversations</h3>
          <div className="messages-search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search email"
              className="messages-search-input"
              value={messageSearch}
              onChange={(e) => setMessageSearch(e.target.value)}
            />
          </div>
        </div>

        {Array.from(new Set(messages.map(m => m.sender === renterEmail ? m.receiver : m.sender)))
          .filter(email => (email || "").toLowerCase().includes(messageSearch.toLowerCase()))
          .sort((a, b) => {
            const lastA = messages.filter(m => (m.sender === a && m.receiver === renterEmail) || (m.receiver === a && m.sender === renterEmail)).pop();
            const lastB = messages.filter(m => (m.sender === b && m.receiver === renterEmail) || (m.receiver === b && m.sender === renterEmail)).pop();
            return (lastB?.createdAt?.seconds || 0) - (lastA?.createdAt?.seconds || 0);
          })
          .map(email => {
            const convoMessages = messages.filter(m => (m.sender === email && m.receiver === renterEmail) || (m.receiver === email && m.sender === renterEmail));
            const lastMsg = convoMessages[convoMessages.length - 1];
            const lastRead = lastReadByChat[email] || 0;
            const unreadCount = convoMessages.filter(m => m.receiver === renterEmail && (m.createdAt?.seconds || 0) > lastRead).length;

            return (
              <div
                key={email}
                className={`conversation-item ${selectedChat === email ? "active" : ""}`}
                onClick={() => {
                  setSelectedChat(email);
                  markChatRead(email);
                }}
              >
                <div className="conversation-avatar">
                  {userProfiles[email]?.photoURL ? (
                    <img src={userProfiles[email].photoURL} alt={email} />
                  ) : (
                    <span>{(userProfiles[email]?.displayName || email).charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="conversation-preview">
                  <div className="conversation-email">{email}</div>
                  <div className={`conversation-preview-text ${unreadCount > 0 ? "unread" : ""}`}>{lastMsg?.text || "No messages"}</div>
                </div>
                <button
                  type="button"
                  className="conversation-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(email);
                  }}
                  disabled={loading}
                >
                  🗑
                </button>
                {unreadCount > 0 && (
                  <span className="conversation-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </div>
            );
          })
        }
        {messages.length === 0 && <p>No messages yet.</p>}
      </div>

      {selectedChat && (
        <div className="chat-window">
          <div className="chat-header">
            <h3>Chat with {selectedChat}</h3>
            <button onClick={() => setSelectedChat(null)}>✖ Close</button>
          </div>

          <div className="chat-messages">
            {messages
              .filter(m => m.sender === renterEmail || m.receiver === renterEmail)
              .filter(m => m.sender === selectedChat || m.receiver === selectedChat)
              .sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
              .map(m => {
                console.log("💬 [Renter] Rendering message from:", m.sender, "| userProfiles:", userProfiles);
                return (
                  <div key={m.id} className={`chat-bubble-container ${m.sender === renterEmail ? "sent" : "received"}`}>
                    {/* Profile Photo for received messages (admin/owner) */}
                    {m.sender !== renterEmail && (
                      <img 
                        src={userProfiles[m.sender]?.photoURL || "/default-profile.png"} 
                        alt={m.sender}
                        className="chat-bubble-avatar"
                        onError={(e) => {
                          console.log("❌ [Renter] Image load failed for:", m.sender, "| URL:", userProfiles[m.sender]?.photoURL);
                          e.target.src = "/default-profile.png";
                        }}
                      />
                    )}
                    
                    <div className={`chat-bubble ${m.sender === renterEmail ? "sent" : "received"}`}>
                      <p>{m.text}</p>
                      <small>{m.createdAt?.toDate?.().toLocaleTimeString()}</small>
                    </div>
                    
                    {/* Renter Photo for sent messages */}
                    {m.sender === renterEmail && (
                      <img 
                        src={userProfiles[renterEmail]?.photoURL || photoPreview || "/default-profile.png"} 
                        alt="You"
                        className="chat-bubble-avatar"
                        onError={(e) => {
                          console.log("❌ [Renter] Image load failed for renter:", renterEmail);
                          e.target.src = "/default-profile.png";
                        }}
                      />
                    )}
                  </div>
                );
              })}
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
        </div>
      )}
    </div>
  </div>

        )}
      </div>

      {/* OVERDUE RENTALS MODAL */}
      {showOverdueModal && overdueRentals.length > 0 && (
        <div className="rental-modal-overlay">
          <div className="rental-modal overdue-modal">
            <button className="close-btn" onClick={() => setShowOverdueModal(false)}>✖</button>
            
            <h2 className="overdue-modal-title">⚠️ Overdue Rentals Detected!</h2>
            <p className="overdue-modal-subtitle">
              You have {overdueRentals.length} rental(s) that are past their due date.
              Please return the items as soon as possible to avoid penalties.
            </p>
            
            <div className="overdue-rental-list">
              {overdueRentals.map((rental) => (
                <div key={rental.id} className="overdue-rental-item">
                  <img 
                    src={rental.propertyImage || "/no-image.png"} 
                    alt={rental.propertyName} 
                    className="overdue-rental-image"
                  />
                  <div className="overdue-rental-details">
                    <h4>{rental.propertyName}</h4>
                    <p><strong>Owner:</strong> {rental.ownerEmail}</p>
                    <p><strong>Due Date:</strong> {getDueDate(rental)?.toLocaleDateString()}</p>
                    <p className="overdue-days"><strong>Overdue:</strong> {getDaysOverdue(rental)} day(s)</p>
                  </div>
                  <button
                    className="overdue-return-btn"
                    onClick={() => {
                      setReturnProofRental(rental);
                      setShowReturnProofModal(true);
                      setShowOverdueModal(false);
                    }}
                  >
                    Return Now
                  </button>
                </div>
              ))}
            </div>
            
            <div className="overdue-modal-footer">
              <button 
                className="overdue-modal-close-btn" 
                onClick={() => setShowOverdueModal(false)}
              >
                I Understand
              </button>
            </div>
          </div>
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
  );
};
export default RenterDashboard;
