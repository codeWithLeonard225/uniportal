"use client";

// app/(portal)/Dashboard/Student/page.jsx

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
  MdAccountBalanceWallet,
  MdVerified,
} from "react-icons/md";

import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/app/components/ProtectedRoute";
import { db } from "@/app/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import Results from "../../Dashboard/Students/Results/page";


// --------------------------------------------------
// STUDENT NAVIGATION
// --------------------------------------------------

const STUDENT_NAV = [
  {
    key: "overview",
    label: "Dashboard",
    icon: <MdDashboard size={20} />,
  },
  {
    key: "academics",
    label: "Academics & Courses",
    icon: <MdSchool size={20} />,
    children: [
      { key: "MyModules", label: "My Modules" },
      { key: "CourseRegistration", label: "Course Registration" },
    ],
  },
  {
    key: "assignment",
    label: "Assignment & Notes",
    icon: <MdSchool size={20} />,
    children: [
      { key: "assignment", label: "Assignment Submission" },
      { key: "notes", label: "notes" },
    ],
  },
  {
    key: "results",
    label: "Grades & Results",
    icon: <MdAssessment size={20} />,
    children: [
      { key: "ContinuousAssessment", label: "Assessment Scores" },
      { key: "Results", label: "Semester Results" },
      { key: "AcademicTranscript", label: "Academic Transcript" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    icon: <MdPeople size={20} />,
    children: [
      { key: "ClassAttendance", label: "My Class Attendance" },
    ],
  },
  {
    key: "timetable",
    label: "Time Table",
    icon: <MdAccessTime size={20} />,
    children: [
      { key: "StudentTimetable", label: "Lecture Timetable" },
    ],
  },
  {
    key: "finance",
    label: "Fees & Payments",
    icon: <MdAccountBalanceWallet size={20} />,
    children: [
      { key: "FeeStatement", label: "Fee Statement" },
      { key: "PaymentHistory", label: "Payment Receipts" },
    ],
  },
  {
    key: "settings",
    label: "My Profile",
    icon: <MdSettings size={20} />,
  },
];

// --------------------------------------------------
// MAIN STUDENT DASHBOARD
// --------------------------------------------------

export default function StudentDashboard() {
  const { user, setUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  // --------------------------------------------------
  // STUDENT PROFILE STATES
  // --------------------------------------------------

  const [studentProfile, setStudentProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

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
          setInstitutionInfo(snapshot.docs[0].data());
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
  // IDENTIFY LOGGED-IN STUDENT
  // --------------------------------------------------

  const authData = user?.data || user || {};

  const loggedInStudentId =
    authData?.studentId ||
    authData?.studentID ||
    user?.studentId ||
    user?.studentID ||
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
  // FETCH STUDENT PROFILE FROM FIRESTORE ('students')
  // --------------------------------------------------

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const fetchStudentProfile = async () => {
      setLoadingProfile(true);
      setProfileError("");
      setStudentProfile(null);

      if (!user) {
        setLoadingProfile(false);
        return;
      }

      const identifiers = [];

      if (loggedInStudentId) {
        identifiers.push({
          field: "studentId",
          value: String(loggedInStudentId).trim(),
        });
      }

      if (loggedInEmail) {
        identifiers.push({
          field: "email",
          value: String(loggedInEmail).trim(),
        });

        const normalizedEmail = String(loggedInEmail).trim().toLowerCase();
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
          "Unable to identify your student account. Your login session does not contain a Student ID or email address."
        );
        setLoadingProfile(false);
        return;
      }

      try {
        const studentsCollection = collection(db, "students");
        let matchedStudent = null;

        for (const identifier of identifiers) {
          const studentQuery = query(
            studentsCollection,
            where(identifier.field, "==", identifier.value)
          );

          const snapshot = await getDocs(studentQuery);
          if (cancelled) return;
          if (snapshot.empty) continue;

          let matchingRecords = snapshot.docs.map((studentDoc) => ({
            id: studentDoc.id,
            ...studentDoc.data(),
          }));

          if (currentInstitutionId) {
            matchingRecords = matchingRecords.filter(
              (record) => record.institutionID === currentInstitutionId
            );
          }

          if (matchingRecords.length > 1) {
            throw new Error(
              "Multiple student records matched your login details. Please contact the registry office."
            );
          }

          if (matchingRecords.length === 1) {
            matchedStudent = matchingRecords[0];
            break;
          }
        }

        if (cancelled) return;

        if (!matchedStudent) {
          setProfileError(
            "Your student profile could not be found. Please ensure your login email or Student ID matches your Student Registration record."
          );
          setStudentProfile(null);
          return;
        }

        if (
          currentInstitutionId &&
          matchedStudent.institutionID !== currentInstitutionId
        ) {
          setProfileError(
            "Your student profile does not belong to your logged-in institution."
          );
          return;
        }

        setStudentProfile(matchedStudent);
        setProfileError("");
      } catch (error) {
        console.error("Student profile retrieval error:", error);
        if (!cancelled) {
          setProfileError(
            error.message || "Unable to retrieve your student profile. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };

    fetchStudentProfile();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    user,
    loggedInStudentId,
    loggedInEmail,
    loggedInUid,
    currentInstitutionId,
  ]);

  // --------------------------------------------------
  // STUDENT PROFILE DERIVED FIELDS
  // --------------------------------------------------

  const titlePrefix = studentProfile?.title ? `${studentProfile.title} ` : "";
  const rawName =
    studentProfile?.fullName ||
    authData?.fullName ||
    authData?.studentName ||
    authData?.name ||
    user?.displayName ||
    "Student";

  const studentName = `${titlePrefix}${rawName}`.trim();

  const studentPhotoUrl =
    studentProfile?.passportPhotoUrl ||
    authData?.passportPhotoUrl ||
    authData?.photoUrl ||
    authData?.profileImage ||
    user?.photoURL ||
    null;

  const studentId =
    studentProfile?.studentId ||
    loggedInStudentId ||
    "N/A";

  const programmeName =
    studentProfile?.programmeName ||
    authData?.programmeName ||
    "Unassigned Programme";

  const awardType =
    studentProfile?.awardType ||
    authData?.awardType ||
    "";

  const studyLevel =
    studentProfile?.studyLevel ||
    authData?.studyLevel ||
    "Year 1";

  const academicYear =
    studentProfile?.academicYear ||
    authData?.academicYear ||
    "2025/2026";

  const studentStatus =
    studentProfile?.status ||
    authData?.status ||
    "Active";

  const studentEmail =
    studentProfile?.email ||
    loggedInEmail ||
    "";

  const studentPhone =
    studentProfile?.phone ||
    authData?.phone ||
    "N/A";

  const initials =
    rawName
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center shrink-0">
                    {studentPhotoUrl ? (
                      <img
                        src={studentPhotoUrl}
                        alt={studentName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-black text-indigo-700">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="text-center sm:text-left min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">
                      Student Portal
                    </p>
                    <h3 className="text-xl md:text-2xl font-black text-slate-800">
                      {loadingProfile ? "Loading your profile..." : studentName}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {programmeName} {awardType ? `(${awardType})` : ""} · {institutionName}
                    </p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                      <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md">
                        ID: {studentId}
                      </span>
                      <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md">
                        {studyLevel}
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                          studentStatus === "Active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {studentStatus}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PROFILE ERROR */}
            {profileError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-bold mb-1">Student Profile Information</p>
                {profileError}
              </div>
            )}

            {/* STUDENT ACADEMIC & PERSONAL CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <MdBadge size={22} />
                  </div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Student ID
                  </p>
                </div>
                <h4 className="font-bold text-slate-800 font-mono">{studentId}</h4>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <MdSchool size={22} />
                  </div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Programme &amp; Award
                  </p>
                </div>
                <h4 className="font-bold text-slate-800">
                  {programmeName} {awardType ? `(${awardType})` : ""}
                </h4>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <MdAssignment size={22} />
                  </div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Level &amp; Academic Year
                  </p>
                </div>
                <h4 className="font-bold text-slate-800">
                  {studyLevel} · {academicYear}
                </h4>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <MdVerified size={22} />
                  </div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Enrollment Status
                  </p>
                </div>
                <h4 className="font-bold text-slate-800">{studentStatus}</h4>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <MdPerson size={22} />
                  </div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Phone Contact
                  </p>
                </div>
                <h4 className="font-bold text-slate-800">{studentPhone}</h4>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <MdEmail size={22} />
                  </div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Email Address
                  </p>
                </div>
                <h4 className="font-bold text-slate-800 break-all">
                  {studentEmail || "No email available"}
                </h4>
              </div>
            </div>
          </div>
        );

      case "MyModules":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">My Enrolled Modules</h2>
            <p className="text-sm text-slate-500 mt-1">
              View modules assigned to {programmeName} ({studyLevel}).
            </p>
          </div>
        );

      case "CourseRegistration":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Semester Course Registration</h2>
            <p className="text-sm text-slate-500 mt-1">Register your modules for {academicYear}.</p>
          </div>
        );

      case "ContinuousAssessment":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Continuous Assessment Scores</h2>
            <p className="text-sm text-slate-500 mt-1">Assignments, tests, and mid-semester scores.</p>
          </div>
        );

         case "Results":
        return <Results/>;

      case "AcademicTranscript":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Unofficial Academic Transcript</h2>
            <p className="text-sm text-slate-500 mt-1">Cumulative academic record across all study levels.</p>
          </div>
        );

      case "ClassAttendance":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">My Class Attendance</h2>
            <p className="text-sm text-slate-500 mt-1">Attendance breakdown per module and lecture session.</p>
          </div>
        );

      case "StudentTimetable":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Weekly Lecture Timetable</h2>
            <p className="text-sm text-slate-500 mt-1">Scheduled lectures for {programmeName} · {studyLevel}.</p>
          </div>
        );

      case "FeeStatement":
      case "PaymentHistory":
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Tuition &amp; Fee Records</h2>
            <p className="text-sm text-slate-500 mt-1">Fee balances and payment receipts for {studentId}.</p>
          </div>
        );

      default:
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-700 uppercase">
              {activeTab.replace(/([A-Z])/g, " $1").trim()}
            </h2>
            <p className="mt-2 text-slate-500 text-sm">Module under development.</p>
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
        INITIATING STUDENT PORTAL...
      </div>
    );
  }

  // --------------------------------------------------
  // DASHBOARD UI
  // --------------------------------------------------

  return (
    <ProtectedRoute allowedRoles={["student"]}>
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
          <div className="p-6 pl-2 flex flex-col h-full">
            {/* INSTITUTION HEADER */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-indigo-600/20 shrink-0 border border-indigo-500/30">
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
                  <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                    Student Portal
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
              {STUDENT_NAV.map((item) => (
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
                          openDropdown === item.key ? "max-h-48 mt-1" : "max-h-0"
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
                                  ? "text-indigo-400"
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
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
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

            {/* LOGGED-IN STUDENT PROFILE FOOTER */}
            <div className="pt-6 border-t border-slate-800">
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl mb-4 border border-slate-800">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black border border-slate-600 shrink-0 overflow-hidden shadow-sm">
                  {studentPhotoUrl ? (
                    <img
                      src={studentPhotoUrl}
                      alt={studentName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-slate-200">{initials}</span>
                  )}
                </div>

                <div className="overflow-hidden text-left">
                  <p className="text-xs font-bold text-slate-100 truncate">
                    {loadingProfile ? "Loading profile..." : studentName}
                  </p>
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider truncate">
                    {studentId} · {studyLevel}
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
              <button className="p-2 bg-slate-50 text-slate-400 rounded-full hover:text-indigo-600 transition-colors">
                <MdNotificationsNone size={24} />
              </button>

              {/* TOP PROFILE */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center border border-indigo-200">
                  {studentPhotoUrl ? (
                    <img
                      src={studentPhotoUrl}
                      alt={studentName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-indigo-700">
                      {initials}
                    </span>
                  )}
                </div>

                <div className="max-w-[160px]">
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {studentName}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {programmeName}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* PAGE CONTENT */}
          <main className="flex-1 p-4 md:p-10 overflow-y-auto bg-slate-50/50">
            <div className="max-w-7xl mx-auto">{renderContent()}</div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}