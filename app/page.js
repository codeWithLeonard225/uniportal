"use client";
//app/page.jsx
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const normalizeName = (name) => {
  if (!name) return "";
  return name.trim().split(/\s+/).join(" ").toLowerCase();
};

const LoginPage = () => {
  const [userID, setUserID] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const { user, setUser, loading: authLoading } = useAuth();

  // 🔍 Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(user.navigationRoute || "/");
    }
  }, [user, authLoading, router]);

 const collectionsToCheck = [
    { name: "students", idField: "studentId", nameField: "fullName", role: "student" },
    { name: "staff", idField: "staffId", nameField: "fullName", role: "staff" },
    { name: "Admins", idField: "adminID", nameField: "adminName", role: "admin" },
    { name: "CEOs", idField: "ceoID", nameField: "ceoName", role: "ceo", route: "/developer" },
    { name: "Classes", idField: "classId", nameField: "className", role: "class", route: "/PupilUpdate" },
  ];
  const getAdminRoute = (type) => {
    switch (type) {
      case "Gov": return "/Dashboard/Admins/SchoolA";
      case "Private": return "/Dashboard/Admins/SchoolA";
      case "Fees": return "/Dashboard/Admins/SchoolA";
      case "Special": return "/Dashboard/Admins/SchoolA";
      case "PupilAttendance": return "/Dashboard/Admins/SchoolA";
      default: return "/admin";
    }
  };

 

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoadingLogin(true);

    const trimmedUserID = userID.trim();
    const trimmedUserName = userName.trim();
    const inputNameNormalized = normalizeName(trimmedUserName);

    if (!trimmedUserID || !inputNameNormalized) {
      setError("Please enter valid ID and Name.");
      setLoadingLogin(false);
      return;
    }

    try {
      let foundUser = null;
      let userRole = null;
      let institutionID = null;
      let navigationRoute = null;
      let schoolInfo = {
        institutionName: "",
        logoUrl: "/images/default.png",
        institutionAddress: "Address not found",
        institutionMotto: "No motto",
        institutionContact: "No contact info",
        email: "No email",
        institutionType: "Unknown",
        headName: "N/A",
      };

      for (const { name, idField, nameField, role } of collectionsToCheck) {
        const q = query(collection(db, name), where(idField, "==", trimmedUserID));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const matchedDoc = snap.docs.find(doc => normalizeName(doc.data()[nameField]) === inputNameNormalized);
          if (matchedDoc) {
            foundUser = matchedDoc.data();
            userRole = role;
            
            // Support both institutionID and legacy schoolId fields in DB documents
            institutionID = foundUser.institutionID || foundUser.schoolId;

            if (name === "CEOs") navigationRoute = "/developer";
            else if (name === "Classes") navigationRoute = "/PupilUpdate";
            else if (name === "Admins") navigationRoute = getAdminRoute(foundUser.adminType);
            else if (name === "students") navigationRoute = "/Dashboard/Students";
            else if (name === "staff") navigationRoute = "/Dashboard/Staff";

            break;
          }
        }
      }

      if (!foundUser) {
        setError("Invalid credentials. Please check your ID and Name.");
        setLoadingLogin(false);
        return;
      }

      if (institutionID) {
        // ✅ Fixed collection name from "Institutions" to "institutions" to match setup page
        const instSnap = await getDocs(
          query(collection(db, "institutions"), where("institutionID", "==", institutionID))
        );

        if (!instSnap.empty) {
          const instData = instSnap.docs[0].data();

          schoolInfo = {
            institutionName: instData.institutionName || foundUser.institutionName || "",
            logoUrl: instData.logoUrl || "/images/default.png",
            institutionAddress: instData.institutionAddress || "Address not found",
            institutionMotto: instData.institutionMotto || "No motto",
            institutionContact: instData.institutionContact || "No contact info",
            email: instData.email || "No email",
            institutionType: instData.institutionType || "Unknown",
            headName: instData.headName || "N/A",
          };
        }
      }

      // ✅ Flattened userSession so all institution fields are directly accessible on `user` object
      const userSession = {
        role: userRole,
        data: foundUser,
        institutionID,
        schoolId: institutionID,
        navigationRoute,
        ...schoolInfo,
      };

      localStorage.setItem("schoolUser", JSON.stringify(userSession));
      setUser(userSession);
      router.replace(userSession.navigationRoute);

    } catch (err) {
      console.error("Login error:", err);
      setError("A system error occurred. Please try again.");
    } finally {
      setLoadingLogin(false);
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400 uppercase tracking-widest animate-pulse">Establishing Secure Connection...</div>;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-200">
        
        {/* HEADER SECTION */}
        <header className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">LeoTech Portal</h2>
          <p className="text-blue-600 font-bold text-[9px] tracking-widest uppercase">Sierra Leone ICT Infrastructure</p>
        </header>

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* ID FIELD */}
          <div className="space-y-1 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Verification ID</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={userID}
                onChange={(e) => setUserID(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none transition-all font-mono text-sm pr-12"
                placeholder="Personal ID"
                required
                disabled={loadingLogin}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
              >
                {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
              </button>
            </div>
          </div>

          {/* NAME FIELD */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Registered Name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:ring-2 ring-blue-500 outline-none transition-all text-sm"
              placeholder="Full Name"
              required
              disabled={loadingLogin}
            />
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div className="bg-red-50 text-red-600 text-[11px] font-bold p-3 rounded-xl border border-red-100 text-center uppercase tracking-tight">
              {error}
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={loadingLogin}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-blue-600 transition-all uppercase tracking-widest text-sm shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {loadingLogin ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Verifying...</span>
              </>
            ) : (
              "Authorize Entry"
            )}
          </button>
        </form>

        {/* FOOTER */}
        <footer className="mt-8 text-center border-t border-slate-50 pt-4">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest italic">
            Secured by LeoTech Academy SL
          </p>
        </footer>
      </div>
    </div>
  );
};

export default LoginPage;