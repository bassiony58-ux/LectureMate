// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCU7np22JR1i_UgQOZGbrDEV6TG68qq3CY",
  authDomain: "lecturemate-project.firebaseapp.com",
  projectId: "lecturemate-project",
  storageBucket: "lecturemate-project.firebasestorage.app",
  messagingSenderId: "511145074132",
  appId: "1:511145074132:web:f37d2860059ab87cca0a41",
  measurementId: "G-EGVZD520X3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser environment)
let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// Initialize Firebase Auth
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Firestore
const db = getFirestore(app);

export { app, analytics, auth, googleProvider, db };

