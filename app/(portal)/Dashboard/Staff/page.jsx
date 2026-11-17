
"use client";

// app/(portal)/Dashboard/Staff/page.jsx

import React, { useState, useEffect } from "react";
import {
  MdDashboard,
  MdSchool,
  MdPeople,
  MdSettings,
  MdLogout,
  MdMenu,
  MdNotificationsNone,
  MdClose,
  MdKeyboardArrowDown,
  MdAssignment,
  MdAccessTime,
  MdAssessment,
  MdPerson,
  MdEmail,
  MdBadge,
  MdWork,
} from "react-icons/md";

import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/app/components/ProtectedRoute";
// import LecturerTeachingAllocation from "../../../Dashboard/Staff/LecturerTeachingAllocation/page";
import LecturerTeachingAllocation from "../../Dashboard/Staff/LecturerTeachingAllocation/page";
import UploadGrades from "../../Dashboard/Staff/UploadGrades/page";
import StaffTeachingAttendancePage from "../../Dashboard/Staff/StaffTeachingAttendancePage/page";

import { db } from "@/app/lib/firebase";

import {
  collection,
  query,
  where,
  getDocs,
   doc,
} from "firebase/firestore";

// --------------------------------------------------
// STAFF NAVIGATION
// --------------------------------------------------

const STAFF_NAV = [
  {
    key: "overview",
    label: "Dashboard",
    icon: <MdDashboard size={20} />,
  },
  {
    key: "academics",
    label: "Teaching & Classes",
    icon: <MdSchool size={20} />,
    children: [
      { key: "LecturerTeachingAllocation", label: "Module Allocation" },
      { key: "ClassList", label: "My Students" },
    ],
  },
  {
    key: "grades",
    label: "Grades Management",
    icon: <MdAssignment size={20} />,
    children: [
      { key: "UploadGrades", label: "Upload Grades" },
      { key: "SubmittedGrades", label: "Submitted Grades" },
      { key: "GradeSheet", label: "Grade Sheet" },
      { key: "modifyGrades", label: "Modify Grades" },
    ],
  },
  {
    key: "results",
    label: "Student Results",
    icon: <MdAssessment size={20} />,
    children: [
      { key: "TermResult", label: "Term Results" },
      { key: "YearlyResult", label: "Yearly Results" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    icon: <MdPeople size={20} />,
    children: [
      { key: "StaffAttendance", label: "My Attendance" },
      { key: "StaffTeachingAttendancePage", label: "Class Attendance" },
    ],
  },
  {
    key: "timetable",
    label: "Time Table",
    icon: <MdAccessTime size={20} />,
    children: [
      { key: "TeacherTimetable", label: "Teaching Schedule" },
    ],
  },
  {
    key: "settings",
    label: "Profile Settings",
    icon: <MdSettings size={20} />,
  },
];

// --------------------------------------------------
// MAIN STAFF DASHBOARD
// --------------------------------------------------

export default function StaffDashboard() {
  const { user, setUser, loading: authLoading } = useAuth();

  const router = useRouter();

  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  // --------------------------------------------------
  // STAFF PROFILE STATES
  // --------------------------------------------------

  const [staffProfile, setStaffProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  // --------------------------------------------------
  // GET INSTITUTION INFORMATION FROM AUTH CONTEXT
  // --------------------------------------------------

  // --------------------------------------------------
// GET INSTITUTION INFORMATION FROM FIRESTORE
// --------------------------------------------------

const currentInstitutionId =
  user?.institutionID ||
  user?.schoolId ||
  user?.data?.institutionID ||
  user?.data?.schoolId ||
  "";

const [institutionInfo, setInstitutionInfo] = useState(null);

useEffect(() => {
  if (!currentInstitutionId) return;

  let cancelled = false;

  const fetchInstitutionInfo = async () => {
    try {
      const institutionsRef = collection(db, "Institutions");

      const institutionQuery = query(
        institutionsRef,
        where("institutionID", "==", currentInstitutionId)
      );

      const snapshot = await getDocs(institutionQuery);

      if (cancelled) return;

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();

        setInstitutionInfo(data);
      } else {
        setInstitutionInfo(null);
      }
    } catch (error) {
      console.error("Error fetching institution information:", error);
    }
  };

  fetchInstitutionInfo();

  return () => {
    cancelled = true;
  };
}, [currentInstitutionId]);

const institutionName =
  institutionInfo?.institutionName ||
  user?.institutionName ||
  user?.schoolName ||
  user?.data?.institutionName ||
  "UniPortal";

const institutionLogoUrl =
  institutionInfo?.logoUrl ||
  institutionInfo?.institutionLogo ||
  institutionInfo?.institutionLogoUrl ||
  user?.logoUrl ||
  user?.institutionLogo ||
  user?.schoolLogo ||
  user?.data?.logoUrl ||
  user?.data?.institutionLogo ||
  null;

  // --------------------------------------------------
  // IDENTIFY LOGGED-IN STAFF MEMBER
  // --------------------------------------------------

  const authData = user?.data || user || {};

  const loggedInStaffId =
    authData?.staffId ||
    authData?.staffID ||
    user?.staffId ||
    user?.staffID ||
    "";

  const loggedInEmail =
    authData?.email ||
    user?.email ||
    user?.userEmail ||
    "";

  const loggedInUid =
    user?.uid ||
    user?.data?.uid ||
    "";

  // --------------------------------------------------
  // FETCH STAFF PROFILE FROM FIRESTORE
  //
  // Collection: staff
  //
  // Match using:
  // 1. staffId
  // 2. email
  // 3. Firebase UID (if saved in staff document)
  //
  // Institution ID is checked before displaying profile.
  // --------------------------------------------------

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const fetchStaffProfile = async () => {
      setLoadingProfile(true);
      setProfileError("");
      setStaffProfile(null);

      if (!user) {
        setLoadingProfile(false);
        return;
      }

      const identifiers = [];

      if (loggedInStaffId) {
        identifiers.push({
          field: "staffId",
          value: String(loggedInStaffId).trim(),
        });
      }

      if (loggedInEmail) {
        identifiers.push({
          field: "email",
          value: String(loggedInEmail).trim(),
        });

        // Also try lowercase email in case it was saved that way.
        const normalizedEmail = String(loggedInEmail)
          .trim()
          .toLowerCase();

        if (normalizedEmail !== String(loggedInEmail).trim()) {
          identifiers.push({
            field: "email",
            value: normalizedEmail,
          });
        }
      }

      if (loggedInUid) {
        identifiers.push({
          field: "uid",
          value: String(loggedInUid).trim(),
        });
      }

      if (identifiers.length === 0) {
        setProfileError(
          "Unable to identify your staff account. Your login session does not contain a Staff ID or email address."
        );

        setLoadingProfile(false);
        return;
      }

      try {
        const staffCollection = collection(db, "staff");

        let matchedStaff = null;

        // Try the available identifiers in priority order.
        for (const identifier of identifiers) {
          const staffQuery = query(
            staffCollection,
            where(identifier.field, "==", identifier.value)
          );

          const snapshot = await getDocs(staffQuery);

          if (cancelled) return;

          if (snapshot.empty) continue;

          let matchingRecords = snapshot.docs.map((staffDoc) => ({
            id: staffDoc.id,
            ...staffDoc.data(),
          }));

          // Enforce institution matching when the login
          // session contains an institution ID.
          if (currentInstitutionId) {
            matchingRecords = matchingRecords.filter(
              (record) =>
                record.institutionID === currentInstitutionId
            );
          }

          // Do not arbitrarily select between multiple records.
          if (matchingRecords.length > 1) {
            throw new Error(
              "Multiple staff records matched your login details. Please contact your institution administrator."
            );
          }

          if (matchingRecords.length === 1) {
            matchedStaff = matchingRecords[0];
            break;
          }
        }

        if (cancelled) return;

        if (!matchedStaff) {
          setProfileError(
            "Your staff profile could not be found. Please ensure your login email or Staff ID matches the information in Staff Registration."
          );

          setStaffProfile(null);
          return;
        }

        // Final institution verification.
        if (
          currentInstitutionId &&
          matchedStaff.institutionID !== currentInstitutionId
        ) {
          setProfileError(
            "Your staff profile does not belong to your logged-in institution."
          );

          return;
        }

        setStaffProfile(matchedStaff);
        setProfileError("");

      } catch (error) {
        console.error("Staff profile retrieval error:", error);

        if (!cancelled) {
          setProfileError(
            error.message ||
            "Unable to retrieve your staff profile. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };

    fetchStaffProfile();

    return () => {
      cancelled = true;
    };

  }, [
    authLoading,
    user,
    loggedInStaffId,
    loggedInEmail,
    loggedInUid,
    currentInstitutionId,
  ]);

  // --------------------------------------------------
  // STAFF PROFILE INFORMATION
  // --------------------------------------------------

  const staffName =
    staffProfile?.fullName ||
    authData?.fullName ||
    authData?.staffName ||
    authData?.name ||
    user?.displayName ||
    "Faculty Member";

  const staffPhotoUrl =
    staffProfile?.passportPhotoUrl ||
    authData?.passportPhotoUrl ||
    authData?.photoUrl ||
    authData?.profileImage ||
    authData?.avatar ||
    user?.photoURL ||
    null;

  const staffDesignation =
    staffProfile?.designation ||
    authData?.designation ||
    "Staff Member";

  const staffType =
    staffProfile?.staffType ||
    authData?.staffType ||
    "Faculty";

  const staffId =
    staffProfile?.staffId ||
    loggedInStaffId ||
    "N/A";

  const staffEmail =
    staffProfile?.email ||
    loggedInEmail ||
    "";

  const initials = staffName
    .split(" ")
    .filter(Boolean)
    .map((name) => name[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "ST";

  // --------------------------------------------------
  // NAVIGATION HANDLERS
  // --------------------------------------------------

  const toggleDropdown = (key) => {
    setOpenDropdown(openDropdown === key ? null : key);
  };

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = () => {
    setUser(null);

    localStorage.removeItem("schoolUser");

    router.replace("/login");
  };

  // --------------------------------------------------
  // CONTENT SWITCHER
  // --------------------------------------------------

  const renderContent = () => {
    switch (activeTab) {

      case "overview":
      case "dashboard":

        return (
          <div className="space-y-6">

            {/* WELCOME HEADER */}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">

              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5">

                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center shrink-0">

                  {staffPhotoUrl ? (
                    <img
                      src={staffPhotoUrl}
                      alt={staffName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-black text-emerald-700">
                      {initials}
                    </span>
                  )}

                </div>

                <div className="text-center sm:text-left min-w-0">

                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-1">
                    Welcome Back
                  </p>

                  <h3 className="text-xl md:text-2xl font-black text-slate-800">
                    {loadingProfile
                      ? "Loading your profile..."
                      : staffName}
                  </h3>

                  <p className="text-sm text-slate-500 mt-1">
                    {staffDesignation} · {institutionName}
                  </p>

                  {staffProfile && (
                    <p className="text-xs text-slate-400 mt-2">
                      Staff ID: {staffId}
                    </p>
                  )}

                </div>

              </div>

            </div>

            {/* PROFILE ERROR */}

            {profileError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-bold mb-1">
                  Staff Profile Information
                </p>

                {profileError}
              </div>
            )}

            {/* DASHBOARD OVERVIEW */}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">

              <h3 className="text-lg font-bold text-slate-800">
                Lecturer Dashboard Overview
              </h3>

              <p className="text-slate-500 text-sm mt-1">
                Welcome to your academic faculty portal.
              </p>

            </div>

            {/* STAFF INFORMATION CARDS */}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">

                <div className="flex items-center gap-3 mb-4">

                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <MdPerson size={22} />
                  </div>

                  <p className="text-xs font-bold uppercase text-slate-500">
                    Staff Name
                  </p>

                </div>

                <h4 className="font-bold text-slate-800">
                  {loadingProfile ? "Loading..." : staffName}
                </h4>

              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">

                <div className="flex items-center gap-3 mb-4">

                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <MdBadge size={22} />
                  </div>

                  <p className="text-xs font-bold uppercase text-slate-500">
                    Staff ID
                  </p>

                </div>

                <h4 className="font-bold text-slate-800 font-mono">
                  {staffId}
                </h4>

              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">

                <div className="flex items-center gap-3 mb-4">

                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <MdWork size={22} />
                  </div>

                  <p className="text-xs font-bold uppercase text-slate-500">
                    Designation
                  </p>

                </div>

                <h4 className="font-bold text-slate-800">
                  {staffDesignation}
                </h4>

              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">

                <div className="flex items-center gap-3 mb-4">

                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <MdSchool size={22} />
                  </div>

                  <p className="text-xs font-bold uppercase text-slate-500">
                    Staff Category
                  </p>

                </div>

                <h4 className="font-bold text-slate-800">
                  {staffType}
                </h4>

              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm md:col-span-2">

                <div className="flex items-center gap-3 mb-4">

                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <MdEmail size={22} />
                  </div>

                  <p className="text-xs font-bold uppercase text-slate-500">
                    Email Address
                  </p>

                </div>

                <h4 className="font-bold text-slate-800 break-all">
                  {staffEmail || "No email available"}
                </h4>

              </div>

            </div>

          </div>
        );

      case "ClassList":
        return <div>Class List & Student Directory</div>;

      case "LecturerTeachingAllocation":
        return <LecturerTeachingAllocation/>;
        
      case "UploadGrades":
        return <UploadGrades/>;
      case "StaffTeachingAttendancePage":
        return <StaffTeachingAttendancePage/>;

      case "SubmittedGrades":
        return <div>Submitted Grades Overview</div>;

      case "GradeSheet":
        return <div>SubGradeMatrixPage</div>;

      case "modifyGrades":
        return <div>Modify Grades Request</div>;

      case "TermResult":
        return <div>Term Results Viewer</div>;

      case "YearlyResult":
        return <div>Yearly Results Viewer</div>;

      case "StaffAttendance":
        return <div>Staff Attendance Logs</div>;

      case "StudentTeachAtt":
        return <div>Student Teaching Attendance Logs</div>;

      case "TeacherTimetable":
        return <div>Teacher Timetable Report</div>;

      default:

        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">

            <h2 className="text-xl font-bold text-slate-700 uppercase">
              {activeTab}
            </h2>

            <p className="mt-2 text-slate-500 text-sm">
              Module under development.
            </p>

          </div>
        );
    }
  };

  // --------------------------------------------------
  // AUTH LOADING
  // --------------------------------------------------

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse">
        INITIATING LECTURER PORTAL...
      </div>
    );
  }

  // --------------------------------------------------
  // DASHBOARD UI
  // --------------------------------------------------

  return (
    <ProtectedRoute allowedRoles={["staff", "lecturer"]}>

      <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">

        {/* MOBILE OVERLAY */}

        <div
          className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] transition-opacity duration-300 lg:hidden ${
            sidebarOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* SIDEBAR */}

        <aside
          className={`fixed inset-y-0 left-0 z-[70] w-72 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >

          <div className="p-6 flex flex-col h-full">

            {/* INSTITUTION HEADER */}

            <div className="flex items-center justify-between mb-8">

              <div className="flex items-center gap-3">

                <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-emerald-600/20 shrink-0 border border-emerald-500/30">

                  {institutionLogoUrl ? (
                    <img
                      src={institutionLogoUrl}
                      alt={institutionName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <MdSchool size={24} className="text-white" />
                  )}

                </div>

                <div className="overflow-hidden text-left">

                  <h1 className="text-sm font-black uppercase tracking-tighter truncate text-slate-100">
                    {institutionName}
                  </h1>

                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                    Faculty Portal
                  </p>

                </div>

              </div>

              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 text-slate-400 hover:text-white"
              >
                <MdClose size={24} />
              </button>

            </div>

            {/* NAVIGATION */}

            <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">

              {STAFF_NAV.map((item) => (

                <div key={item.key} className="w-full">

                  {item.children ? (

                    <>

                      <button
                        onClick={() => toggleDropdown(item.key)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-wider ${
                          openDropdown === item.key
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        }`}
                      >

                        <div className="flex items-center gap-3">
                          {item.icon}
                          {item.label}
                        </div>

                        <MdKeyboardArrowDown
                          size={18}
                          className={`transition-transform duration-200 ${
                            openDropdown === item.key ? "rotate-180" : ""
                          }`}
                        />

                      </button>

                      {/* SUB-MENU */}

                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          openDropdown === item.key
                            ? "max-h-48 mt-1"
                            : "max-h-0"
                        }`}
                      >

                        <div className="ml-9 flex flex-col gap-1 border-l border-slate-700 pl-4 py-1">

                          {item.children.map((child) => (

                            <button
                              key={child.key}
                              onClick={() => {
                                setActiveTab(child.key);
                                setSidebarOpen(false);
                              }}
                              className={`w-full text-left py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                                activeTab === child.key
                                  ? "text-emerald-400"
                                  : "text-slate-500 hover:text-slate-200"
                              }`}
                            >
                              {child.label}
                            </button>

                          ))}

                        </div>

                      </div>

                    </>

                  ) : (

                    <button
                      onClick={() => {
                        setActiveTab(item.key);
                        setSidebarOpen(false);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-wider ${
                        activeTab === item.key
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>

                  )}

                </div>

              ))}

            </nav>

            {/* LOGGED-IN STAFF PROFILE FOOTER */}

            <div className="pt-6 border-t border-slate-800">

              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl mb-4 border border-slate-800">

                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black border border-slate-600 shrink-0 overflow-hidden shadow-sm">

                  {staffPhotoUrl ? (

                    <img
                      src={staffPhotoUrl}
                      alt={staffName}
                      className="w-full h-full object-cover"
                    />

                  ) : (

                    <span className="text-slate-200">
                      {initials}
                    </span>

                  )}

                </div>

                <div className="overflow-hidden text-left">

                  <p className="text-xs font-bold text-slate-100 truncate">
                    {loadingProfile ? "Loading profile..." : staffName}
                  </p>

                  <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider truncate">
                    {staffDesignation}
                  </p>

                </div>

              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <MdLogout size={18} />
                End Session
              </button>

            </div>

          </div>

        </aside>

        {/* MAIN BODY */}

        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* TOP HEADER */}

          <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">

            <div className="flex items-center gap-4">

              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 bg-slate-100 rounded-lg text-slate-600"
              >
                <MdMenu size={24} />
              </button>

              <h2 className="text-sm md:text-lg font-black text-slate-800 uppercase tracking-tight truncate">
                {activeTab.replace(/([A-Z])/g, " $1").trim()}
              </h2>

            </div>

            <div className="flex items-center gap-4">

              <button className="p-2 bg-slate-50 text-slate-400 rounded-full hover:text-emerald-600 transition-colors">
                <MdNotificationsNone size={24} />
              </button>

              {/* TOP PROFILE */}

              <div className="hidden sm:flex items-center gap-2">

                <div className="w-9 h-9 rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center border border-emerald-200">

                  {staffPhotoUrl ? (

                    <img
                      src={staffPhotoUrl}
                      alt={staffName}
                      className="w-full h-full object-cover"
                    />

                  ) : (

                    <span className="text-xs font-bold text-emerald-700">
                      {initials}
                    </span>

                  )}

                </div>

                <div className="max-w-[140px]">

                  <p className="text-xs font-bold text-slate-800 truncate">
                    {staffName}
                  </p>

                  <p className="text-[10px] text-slate-400 truncate">
                    {staffDesignation}
                  </p>

                </div>

              </div>

            </div>

          </header>

          {/* PAGE CONTENT */}

          <main className="flex-1 p-4 md:p-10 overflow-y-auto bg-slate-50/50">

            <div className="max-w-7xl mx-auto">
              {renderContent()}
            </div>

          </main>

        </div>

      </div>

    </ProtectedRoute>
  );
}
