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
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
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
  const [favorites, setFavorites] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [comments, setComments] = useState({});
  const [newComments, setNewComments] = useState({});

  // Search/filter
  const [searchTerm, setSearchTerm] = useState("");

  // Rentals & Favorites selection
  const [selectedRentals, setSelectedRentals] = useState([]);
  const [selectAllRentals, setSelectAllRentals] = useState(false);
  const [selectedFavorites, setSelectedFavorites] = useState([]);
  const [selectAllFavorites, setSelectAllFavorites] = useState(false);

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

  // Chat
  const [selectedChat, setSelectedChat] = useState(null);
  const [replyText, setReplyText] = useState({});
// Track the selected tab
const [selectedTab, setSelectedTab] = useState("To Pay");

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
      // Create initial document if it doesn't exist
      setDoc(
        userDocRef,
        {
          displayName: auth.currentUser.displayName || "",
          email: auth.currentUser.email,
          createdAt: serverTimestamp(),
          photoURL: auth.currentUser.photoURL || "/default-profile.png",
        },
        { merge: true }
      );
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

    // Favorites
    unsubscribers.push(
      onSnapshot(
        query(collection(db, "favorites"), where("renterEmail", "==", renterEmail)),
        (snap) => setFavorites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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
  if (!user) return alert("Not logged in");
  if (!displayName.trim()) return alert("Name cannot be empty");
  setLoading(true);
  try {
    let photoURL = user.photoURL || "";
    if (photoFile) {
      const storageRef = ref(storage, `profilePhotos/${user.uid}`);
      await uploadBytes(storageRef, photoFile);
      photoURL = await getDownloadURL(storageRef);
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
        createdAt: serverTimestamp(),
      });
    } else {
      // Update document without overwriting createdAt
      await setDoc(
        userDocRef,
        { displayName, photoURL, email: user.email },
        { merge: true }
      );
    }
    setUser({ ...user, displayName, photoURL });
    setIsEditing(false);
    setPhotoFile(null);
    alert("Profile updated!");
  } catch (err) {
    console.error(err);
    alert("Failed to update profile: " + err.message);
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



  // Handle opening rental modal
const handleRentNow = (post) => {
  setSelectedRental(post);
  setShowOwnerProfile(false);

  setRentalForm({
    fullName: "",
    phoneNumber: "",
    address: "",
    placeName: "",
    postalCode: "",
    province: "",
    paymentMethod: "COD",
    screenshot: null,
    totalPrice: 0,
    adminCommission: 0,
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

// Handle form changes
const handleFormChange = (e) => {
  const { name, value, files, type } = e.target;
  if (type === "file") {
    setRentalForm((prev) => ({ ...prev, [name]: files[0] }));
  } else {
    setRentalForm((prev) => ({ ...prev, [name]: value }));
  }
};
const handleSubmitRental = async (rental) => {
  if (!rentalForm.fullName || !rentalForm.phoneNumber || !rentalForm.address) {
    return alert("Please fill in all required fields");
  }

  try {
    setLoading(true);

    // --- Upload screenshot if GCash ---
    let screenshotUrl = "";
    if (rentalForm.paymentMethod === "GCash" && rentalForm.screenshot) {
      if (rentalForm.screenshot instanceof File) {
        const uploaded = await uploadToCloudinary(rentalForm.screenshot, "renthub/gcash");
        screenshotUrl = uploaded?.secure_url || uploaded || "";
      } else {
        screenshotUrl = rentalForm.screenshot;
      }
    }

    // --- Ensure property image is available ---
    let propertyImageUrl = rental.imageUrl || "";
    if (!propertyImageUrl && rental.imageFile) {
      const uploaded = await uploadToCloudinary(rental.imageFile, "renthub/properties");
      propertyImageUrl = uploaded?.secure_url || uploaded || "/no-image.png";
    } else if (!propertyImageUrl) {
      propertyImageUrl = "/no-image.png";
    }

    // --- Calculate admin commission safely ---
    const price = Number(rental.price) || 0;
    const { adminCommission, totalPrice } = calculateAdminCommission(price, rentalForm.address);

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
      price,
      adminCommission,
      totalPrice,
      status: "To Pay",           // ✅ Ensure default status
      createdAt: serverTimestamp(),
      dateRented: serverTimestamp(),
    };

    // --- Save rental to Firestore ---
    const docRef = await addDoc(collection(db, "rentals"), rentalData);

    // --- Update property as rented ---
    if (rental.id) {
      await updateDoc(doc(db, "properties", rental.id), { isRented: true });
    }

    // --- Push rental to admin state immediately for instant display ---
    setAdminRentalList(prev => [...prev, { id: docRef.id, ...rentalData }]);

    alert(" ✅ Rental submitted successfully!");

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

  } catch (err) {
    console.error(err);
    alert("Failed to submit rental: " + err.message);
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


  // ------------------ RENTALS / FAVORITES ------------------
  const handleSelectAllRentals = () => {
    if (selectAllRentals) {
      setSelectedRentals([]);
    } else {
      setSelectedRentals(myRentals.map((r) => r.id));
    }
    setSelectAllRentals(!selectAllRentals);
  };

  const handleSelectAllFavorites = () => {
    if (selectAllFavorites) {
      setSelectedFavorites([]);
    } else {
      setSelectedFavorites(favorites.map((f) => f.id));
    }
    setSelectAllFavorites(!selectAllFavorites);
  };

  const handleDeleteSelectedFavorites = async () => {
    if (!selectedFavorites.length) return alert("No favorites selected");
    try {
      await Promise.all(selectedFavorites.map((id) => deleteDoc(doc(db, "favorites", id))));
      setSelectedFavorites([]);
      setSelectAllFavorites(false);
      alert("Selected favorites removed successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to delete selected favorites!");
    }
  };

  // Generic delete that matches your JSX signature handleDelete(collectionName, id)
  const handleDelete = async (collectionName, id) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      // locally remove from states if necessary
      if (collectionName === "rentals") setMyRentals((p) => p.filter((r) => r.id !== id));
      if (collectionName === "favorites") setFavorites((p) => p.filter((f) => f.id !== id));
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
  if (!window.confirm("Delete this rental permanently?")) return;

  try {
    await deleteDoc(doc(db, "rentals", id));
    alert("Rental deleted.");
  } catch (err) {
    console.error(err);
    alert("Failed to delete.");
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



  // Add favorite
  const handleAddFavorite = async (post) => {
    if (!user) return alert("Login required");
    try {
      const exists = favorites.find((f) => f.propertyId === post.id);
      if (exists) return alert("Already in Favorites");
      await addDoc(collection(db, "favorites"), {
        renterEmail,
        propertyId: post.id,
        propertyName: post.name,
        imageUrl: post.imageUrl || "",
        createdAt: serverTimestamp(),
      });
      alert("Added to Favorites!");
    } catch (err) {
      console.error(err);
      alert("Failed to add favorite.");
    }
  };


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
  
function calculateAdminCommission(price, address) {
  let adminCommission = price * 0.15; // base 15%
  const lowerAddr = (address || "").toLowerCase();

  // If far away, add 2%
  if (!lowerAddr.includes("isabela") && !lowerAddr.includes("negros occidental")) {
    adminCommission += price * 0.19;
  }

  // Minimum commission of ₱60 for nearby
  if ((lowerAddr.includes("isabela") || lowerAddr.includes("negros occidental")) && adminCommission < 60) {
    adminCommission = 60;
  }

  const totalPrice = price + adminCommission;
  return { adminCommission, totalPrice };
}

const [ownerMessages, setOwnerMessages] = useState({});
useEffect(() => {
  const unsubscribeList = filteredPosts.map((post) =>
    onSnapshot(collection(db, "rentals", post.id, "comments"), (snapshot) => {
      const postComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(prev => ({ ...prev, [post.id]: postComments }));
    })
  );

  // Cleanup
  return () => unsubscribeList.forEach(unsub => unsub());
}, [filteredPosts]);

// --- Functions ---
const handleComment = (postId) => {
  const text = newComments[postId]?.trim();
  if (!text) return;

  const newComment = {
    id: Date.now().toString(),
    user: "You", // replace with actual user
    comment: text,
    replies: [],
  };

  setComments((prev) => ({
    ...prev,
    [postId]: [...(prev[postId] || []), newComment],
  }));

  setNewComments((prev) => ({ ...prev, [postId]: "" }));
};

const handleReplyComment = (postId, commentId) => {
  const text = replyText[commentId]?.trim();
  if (!text) return;

  setComments((prev) => ({
    ...prev,
    [postId]: prev[postId].map((c) =>
      c.id === commentId
        ? { ...c, replies: [...c.replies, { id: Date.now().toString(), user: "You", comment: text }] }
        : c
    ),
  }));

  setReplyText((prev) => ({ ...prev, [commentId]: "" }));
};

const handleUpdateStatus = (id, newStatus) => {
  const updated = myRentals.map(r => (r.id === id ? { ...r, status: newStatus } : r));
  setMyRentals(updated);
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
    if (!ownerMessages[postId]) return alert("Cannot send empty message");
    addDoc(collection(db, "messages"), {
      sender: renterEmail,
      receiver: ownerEmail,
      text: ownerMessages[postId],
      propertyId: postId,
      createdAt: serverTimestamp(),
    });
    setOwnerMessages((prev) => ({ ...prev, [postId]: "" }));
    alert("Message sent!");
  };

  const handleReply = async (chatUser) => {
    const text = replyText[chatUser]?.trim();
    if (!text) return alert("Cannot send empty message");
    try {
      await addDoc(collection(db, "messages"), {
        sender: renterEmail,
        receiver: chatUser,
        text,
        createdAt: serverTimestamp(),
      });
      setReplyText((prev) => ({ ...prev, [chatUser]: "" }));
    } catch (err) {
      console.error(err);
      alert("Failed to send message");
    }
  };

  
  const handleDeleteConversation = async (chatUser) => {
    if (!chatUser) return;
    if (!window.confirm(`Delete entire conversation with ${chatUser}?`)) return;
    const snap = await getDocs(collection(db, "messages"));
    const convo = snap.docs.filter(
      (d) =>
        (d.data().sender === renterEmail && d.data().receiver === chatUser) ||
        (d.data().sender === chatUser && d.data().receiver === renterEmail)
    );
    await Promise.all(convo.map((d) => deleteDoc(doc(db, "messages", d.id))));
    setMessages((prev) => prev.filter(
      (m) => !(m.sender === renterEmail && m.receiver === chatUser) &&
             !(m.sender === chatUser && m.receiver === renterEmail)
    ));
    setSelectedChat(null);
    alert("Conversation deleted.");
  };

  const handleMessageNow = (post) => {
    if (!post?.ownerEmail) return alert("Owner has no email");
    setSelectedChat(post.ownerEmail);
    setActivePage("messages");
  };

const [showCommentInput, setShowCommentInput] = useState({});
const [showReplyInput, setShowReplyInput] = useState({});
const [showCommentsSection, setShowCommentsSection] = useState({});


  return (
<div className="dashboard-container renter-dashboard">
  <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
    ☰
  </button>
  {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
  <Sidebar
    userType="renter"
    activePage={activePage}
    setActivePage={setActivePage}
    onLogout={() => signOut(auth)}
    isOpen={sidebarOpen}
    onToggle={() => setSidebarOpen(!sidebarOpen)}
  />

  <div className="dashboard-content">
    {/* RENTER PROFILE */}
    {activePage === "renterProfile" && (
      <section className="profile-section">
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

            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="edit-btn"
              >
                Edit
              </button>
            )}

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
          </div>
        ) : (
          <p>Loading profile...</p>
        )}
      </section>
    )}
  

{/* BROWSE RENTALS */}
{activePage === "browseRentals" && (
  <div className="browse-rentals-page">
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
        {filteredOwnerPosts.filter(p => !p.isRented)
          .filter(post => post.name.toLowerCase().includes(ownerSearchTerm.toLowerCase()))
          .length > 0 ? (
          <div className="owner-posts-list">
            {filteredOwnerPosts
              .filter(p => !p.isRented)
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
                          <button onClick={() => handleComment(post.id)}>Comment</button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewComments(prev => ({ ...prev, [post.id]: "" })); // reset
                              setShowCommentInput(prev => ({ ...prev, [post.id]: false })); // hide input
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
                            <p><strong>{c.user}:</strong> {c.comment}</p>

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
                                <button onClick={() => handleReplyComment(post.id, c.id)}>Reply</button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyText(prev => ({ ...prev, [c.id]: "" })); // reset
                                    setShowReplyInput(prev => ({ ...prev, [c.id]: false })); // hide reply
                                  }}
                                >
                                  Close
                                </button>
                              </div>
                            )}

                            {/* Replies List */}
                            {c.replies?.map((r) => (
                              <p key={r.id} className="reply">
                                <strong>{r.user}:</strong> {r.comment}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>


                  <div className="rental-actions">
                    <button onClick={() => handleRentNow(post)}>Rent Now</button>
                    <button onClick={() => handleAddFavorite(post)}>♥ Add to Favorites</button>
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
        <input type="text" name="fullName" value={rentalForm.fullName} onChange={handleFormChange} />

        <label>Phone Number</label>
        <input type="text" name="phoneNumber" value={rentalForm.phoneNumber || ""} onChange={handleFormChange} />

        <label>Address</label>
        <input type="text" name="address" value={rentalForm.address || ""} onChange={handleFormChange} />

        <label>Place Name</label>
        <input type="text" name="placeName" value={rentalForm.placeName || ""} readOnly />

        <div id="rental-map" style={{ height: 300, margin: "10px 0", border: "1px solid #ccc" }} />

        <label>Postal Code</label>
        <input type="text" name="postalCode" value={rentalForm.postalCode || ""} onChange={handleFormChange} />

        <label>Payment Method</label>
        <select name="paymentMethod" value={rentalForm.paymentMethod} onChange={handleFormChange}>
          <option value="COD">Cash on Delivery</option>
          <option value="GCash">GCash</option>
        </select>

        {rentalForm.paymentMethod === "GCash" && (
          <>
            <div className="gcash-info">
              <h4>📌 Send Payment To:</h4>
              <p><strong>GCash Account Name:</strong> {gcashAccountName || "N/A"}</p>
              <p><strong>GCash Phone Number:</strong> {gcashPhoneNumber || "N/A"}</p>

              <label>GCash Screenshot</label>
              <input type="file" name="screenshot" accept="image/*" onChange={handleFormChange} />
              {rentalForm.screenshot && (
                <div style={{ marginTop: 4 }}>
                  <p>Uploaded ✅</p>
                  {rentalForm.screenshot instanceof File ? (
                    <img src={URL.createObjectURL(rentalForm.screenshot)} alt="GCash Screenshot" style={{ width: 180, marginTop: 4 }} />
                  ) : (
                    <img src={rentalForm.screenshot} alt="GCash Screenshot" style={{ width: 180, marginTop: 4 }} />
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Admin Commission + Total Price */}
        {rentalForm.address && (() => {
          const { adminCommission, totalPrice } = calculateAdminCommission(selectedRental.price, rentalForm.address);
          return (
            <div className="shipping-info">
              <p><strong>Admin Commission:</strong> ₱{adminCommission.toFixed(2)}</p>
              <p><strong>Total Price:</strong> ₱{totalPrice.toFixed(2)}</p>
            </div>
          );
        })()}

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
        {filteredPosts.filter(post => !post.isRented).length > 0 ? (
          filteredPosts
            .filter(post => !post.isRented)
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
                            <button onClick={() => handleComment(post.id)}>Comment</button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewComments(prev => ({ ...prev, [post.id]: "" })); // reset
                                setShowCommentInput(prev => ({ ...prev, [post.id]: false })); // hide input
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
                              <p><strong>{c.user}:</strong> {c.comment}</p>

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
                                  <button onClick={() => handleReplyComment(post.id, c.id)}>Reply</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyText(prev => ({ ...prev, [c.id]: "" })); // reset
                                      setShowReplyInput(prev => ({ ...prev, [c.id]: false })); // hide reply
                                    }}
                                  >
                                    Close
                                  </button>
                                </div>
                              )}

                              {/* Replies List */}
                              {c.replies?.map((r) => (
                                <p key={r.id} className="reply">
                                  <strong>{r.user}:</strong> {r.comment}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>


                <div className="rental-actions">
                  <button onClick={() => handleRentNow(post)}>Rent Now</button>
                  <button onClick={() => handleAddFavorite(post)}>♥ Add to Favorites</button>
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
{activePage === "myRentals" && (
 <div className="my-rentals-page">
    <div className="rentals-container">
      <h1 className="rentals-title">My Rentals</h1>

      {/* Tabs */}
      <div className="rentals-tabs">
        {["To Pay", "To Ship", "To Receive", "Completed", "Returned", "Cancelled"].map(
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
                {rental.status === "To Pay" && (
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
                {["To Pay", "Cancelled", "Returned", "Completed"].includes(rental.status) && (
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
                <p><strong>Full Name:</strong> {rental.renterName || "N/A"}</p>
                <p><strong>Phone Number:</strong> {rental.renterPhone || "N/A"}</p>
                <p><strong>Place Name:</strong> {rental.placeName || "N/A"}</p>
                <p><strong>Postal Code:</strong> {rental.postalCode || "N/A"}</p>

                {rental.address && (
                  <p>
                    <strong>Address:</strong>{" "}
                    {typeof rental.address === "object"
                      ? `${rental.address.street || ""}, ${rental.address.barangay || ""}, ${rental.address.city || ""}, ${rental.address.province || ""}, ${rental.address.region || ""}`
                      : rental.address}
                  </p>
                )}

                <p className="total-price">
                  <strong>Total Price:</strong> ₱{rental.totalPrice?.toLocaleString() || "0"}
                </p>

                <p>
                  <strong>Date Rented:</strong> {formatDate(rentalDate)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}


        {/* FAVORITES */}
        {activePage === "favorites" && (
          <div className="favorites-page">
            <h1>My Favorites</h1>

            {favorites.length > 0 ? (
              <>
                <div className="select-all-container">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectAllFavorites}
                      onChange={() => {
                        if (selectAllFavorites) {
                          setSelectedFavorites([]);
                        } else {
                          setSelectedFavorites(favorites.map((f) => f.id));
                        }
                        setSelectAllFavorites(!selectAllFavorites);
                      }}
                    />{" "}
                    Select All
                  </label>

                  <button className="delete-selected-btn" onClick={handleDeleteSelectedFavorites}>
                    🗑 Delete Selected
                  </button>
                </div>

                <div className="rental-grid">
                  {favorites.map((fav) => (
                    <div key={fav.id} className={`rental-card ${selectedFavorites.includes(fav.id) ? "selected" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedFavorites.includes(fav.id)}
                        onChange={() => {
                          if (selectedFavorites.includes(fav.id)) {
                            setSelectedFavorites(selectedFavorites.filter((id) => id !== fav.id));
                          } else {
                            setSelectedFavorites([...selectedFavorites, fav.id]);
                          }
                        }}
                      />

                      <img src={fav.imageUrl || "/no-image.png"} alt={fav.propertyName} className="rental-image" />
                      <h3>{fav.propertyName}</h3>
                      <p>
                        <strong>Added On:</strong> {fav.createdAt?.toDate?.().toLocaleString() || "N/A"}
                      </p>

                      <div className="rental-actions">
                        <button className="delete-btn" onClick={() => handleDelete("favorites", fav.id)}>
                          🗑 Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>You haven’t added any favorites yet.</p>
            )}
          </div>
        )}


       {activePage === "messages" && (
  <div className="messages-page">
    <h1>Messages</h1>
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
    </div>
  );
};
export default RenterDashboard;
