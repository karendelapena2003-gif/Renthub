import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";



const firebaseConfig = {
  apiKey: "AIzaSyCPlko6wi-CKR_gDyslMD-I05uy2wbtuhM",
  authDomain: "renthub-system.firebaseapp.com",
  projectId: "renthub-system",
  storageBucket: "renthub-system.appspot.com",
  messagingSenderId: "938918233576",
  appId: "1:938918233576:web:2867d1fc17f56dd216105d",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
