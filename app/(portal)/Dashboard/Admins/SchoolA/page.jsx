"use client";
//app/(portal)/Dashboard/Admins/SchoolA/page.jsx
import React, { useState } from "react";
import { 
  MdDashboard, MdSchool, MdPeople, MdAccountBalance, 
  MdSettings, MdLogout, MdMenu, MdNotificationsNone, 
  MdClose, MdKeyboardArrowDown 
} from "react-icons/md";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/app/components/ProtectedRoute";
import AcademicStructure from "../../../Institution/AcademicStructure/page"
import AcademicModulesPage from "../../../Institution/AcademicModulesPage/page"
import AcademicReport from "../../../Institution/AcademicReport/page"
import RegisterInstitute from "../../../setup/RegisterInstitute/page"
import RegisterAdmin from "../../../setup/RegisterAdmin/page"
import StaffRegistrationPage from "../../../Staff/Registeration/page";
import LecturerTeachingAllocationPage from "../../../Staff/lecturerAllocation/page";
import TeacherIDCards from "../../../Staff/TeacherIDCards/page";
import StaffIDCardBackPage from "../../../Staff/StaffIDCardBackPage/page";
import StaffAttendanceScanner from "../../../Staff/StaffAttendanceScanner/page";
import StaffAttendanceRecords from "../../../Staff/StaffAttendanceRecords/page";
import ClassTeachingAttendance from "../../../Staff/ClassTeachingAttendance/page";
import AttendanceAnalyticsDashboard from "../../../Staff/AttendanceAnalyticsDashboard/page";
import ReportPage from "../../../Staff/lecturerAllocation/ReportPage/page";
import StudentRegistrationPage from "../../../Students/Registeration/page";
import StudentIDCardsPage from "../../../Students/StudentIDCardsPage/page";
import IdCardsBack from "../../../Students/IdCardsBack/page";
import StudentAttendanceScannerPage from "../../../Students/StudentAttendanceScannerPage/page";
import StudentAttendanceRecordsPage from "../../../Students/StudentAttendanceRecordsPage/page";
import Results from "../../../Students/Results/page";
import GradingScale from "../../../Exams/GradingScale/page";
import UploadGrades from "../../../Exams/UploadGrades/page";
import ExamAnalyticsDashboardPage from "../../../Exams/ExamAnalyticsDashboardPage/page";
import FeesPayment from "../../../FeesPayment/page";

const ADMIN_NAV = [
  { key: "overview", label: "Dashboard", icon: <MdDashboard size={20} /> },
  { 
    key: "setup", 
    label: "Setup", 
    icon: <MdSchool size={20} />,
    children: [
      { key: "RegisterInstitute", label: "RegisterInstitute" },
      { key: "RegisterAdmin", label: "RegisterAdmin" },
      { key: "AcademicReport", label: "Academic Report" },
    ]
  },
  { 
    key: "academics", 
    label: "Academics", 
    icon: <MdSchool size={20} />,
    children: [
      { key: "AcademicStructure", label: "Academic Structure" },
      { key: "AcademicModulesPage", label: "Academic Modules" },
      { key: "AcademicReport", label: "Academic Report" },
    ]
  },
  { 
    key: "users", 
    label: "User Management", 
    icon: <MdPeople size={20} />,
    children: [
      { key: "StudentRegistrationPage", label: "Student Registry" },
      { key: "StaffReg", label: "Staff/Lecturers" },
      { key: "ModuleAllocation", label: "Module Allocation" },
      { key: "ReportPage", label: "Allocation Report" },
    ]
  },
  { 
    key: "results", 
    label: "Exams", 
    icon: <MdPeople size={20} />,
    children: [
      { key: "GradingScale", label: "Grading Scale" },
      { key: "UploadGrades", label: "Upload Grades" },
      { key: "Results", label: "Results" },
      { key: "ExamAnalyticsDashboardPage", label: "Exam Analytics" },
      { key: "modifyGrades", label: "Modify Grades" },
      { key: "semeterResults", label: "Semeter Results" },
    ]
  },
  { 
    key: "idcards", 
    label: "Id Cards", 
    icon: <MdPeople size={20} />,
    children: [
      { key: "TeacherIDCards", label: "Staff ID CardFront" },
      { key: "StaffIDCardBackPage", label: "Staff ID CardBack" },
      { key: "StudentIDCardsPage", label: "Student ID CardsFront" },
      { key: "IdCardsBack", label: "Student ID CardsBAck" },
  
    ]
  },
  { 
    key: "attendance", 
    label: "Attendance Report", 
    icon: <MdPeople size={20} />,
    children: [
      { key: "StaffAttendanceScanner", label: "StaffAttendanceScanner" },
      { key: "StaffAttendanceRecords", label: "StaffAttendanceRecords" },
      { key: "StudentAttendanceScannerPage", label: "Student Attendance" },
      { key: "StudentAttendanceRecordsPage", label: "Student Report" },
      { key: "ClassTeachingAttendance", label: "Student Teaching Attendance" },
   
  
    ]
  },
  { 
    key: "fees", 
    label: "Fees", 
    icon: <MdPeople size={20} />,
    children: [
         { key: "FeesPayment", label: "Fees Payment" },
      { key: "TimeTableEntry", label: "Time Table Entry" },
      { key: "TimeTablereport", label: "Time Table Report" },
  
    ]
  },
  { 
    key: "timetable", 
    label: "Time Table", 
    icon: <MdPeople size={20} />,
    children: [
         { key: "AttendanceAnalyticsDashboard", label: "Staff Teaching Report" },
      { key: "TimeTableEntry", label: "Time Table Entry" },
      { key: "TimeTablereport", label: "Time Table Report" },
  
    ]
  },
  { key: "finance", label: "Finances", icon: <MdAccountBalance size={20} /> },
  { key: "settings", label: "System Settings", icon: <MdSettings size={20} /> },
];

export default function AdminDashboard() {
  const { user, setUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Track which dropdown is open
  const [openDropdown, setOpenDropdown] = useState(null);

  const toggleDropdown = (key) => {
    setOpenDropdown(openDropdown === key ? null : key);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("schoolUser");
    router.replace("/login");
  };

  // Content switcher handler
  const renderContent = () => {
    switch (activeTab) {
      case "overview":
      case "dashboard": 
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800">Dashboard Overview</h3>
            <p className="text-slate-500 text-sm mt-1">Welcome to the main dashboard module.</p>
          </div>
        );
      case "RegisterInstitute": 
        return <RegisterInstitute />;
      case "RegisterAdmin": 
        return <RegisterAdmin />;
      case "AcademicStructure": 
        return <AcademicStructure />;
      case "AcademicModulesPage": 
        return <AcademicModulesPage />;
      case "AcademicReport": 
        return <AcademicReport />;
        case "StaffReg": 
        return <StaffRegistrationPage />;
        case "ModuleAllocation": 
        return <LecturerTeachingAllocationPage />;
        case "TeacherIDCards": 
        return <TeacherIDCards />;
        case "StaffIDCardBackPage": 
        return <StaffIDCardBackPage />;
        case "StaffAttendanceScanner": 
        return <StaffAttendanceScanner />;
        case "StaffAttendanceRecords": 
        return <StaffAttendanceRecords />;
        case "ReportPage": 
        return <ReportPage />;
        case "StudentRegistrationPage": 
        return <StudentRegistrationPage />;
        case "StudentIDCardsPage": 
        return <StudentIDCardsPage />;
        case "IdCardsBack": 
        return <IdCardsBack />;
        case "StudentAttendanceScannerPage": 
        return <StudentAttendanceScannerPage />;
        case "StudentAttendanceRecordsPage": 
        return <StudentAttendanceRecordsPage />;
        case "GradingScale": 
        return <GradingScale />;
        case "UploadGrades": 
        return <UploadGrades />;
        case "Results": 
        return <Results />;
        case "ExamAnalyticsDashboardPage": 
        return <ExamAnalyticsDashboardPage />;
        case "ClassTeachingAttendance": 
        return <ClassTeachingAttendance />;
        case "AttendanceAnalyticsDashboard": 
        return <AttendanceAnalyticsDashboard />;
        case "FeesPayment": 
        return <FeesPayment />;
  
      case "SubmittedGrades": 
        return <div>SubmittedGrades</div>;
      case "GradeSheet": 
        return <div>SubGradeMatrixPage</div>;
      case "TermResult": 
        return <div>TermResult</div>;
      case "YearlyResult": 
        return <div>YearlyResult</div>;
      case "GradesAuditPage": 
        return <div>GradesAuditPage</div>;
      case "ReportCard": 
        return <div>ReportCard</div>;
      default:
        return (
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-700 uppercase">{activeTab}</h2>
            <p className="mt-2 text-slate-500 text-sm">Module under development.</p>
          </div>
        );
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse">INITIATING SECURE ADMIN PROTOCOL...</div>;

  const { institutionName, logoUrl, data: adminData } = user || {};
  const adminName = adminData?.adminName || "Administrator";
  const initials = adminName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
        
        {/* MOBILE OVERLAY */}
        <div 
          className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] transition-opacity duration-300 lg:hidden ${
            sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`} 
          onClick={() => setSidebarOpen(false)} 
        />

        {/* SIDEBAR */}
        <aside className={`fixed inset-y-0 left-0 z-[70] w-80 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}>
          
          <div className="p-6 pl-2 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-blue-500/20">
                  {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" /> : <MdSchool size={24}/>}
                </div>
                <div className="overflow-hidden text-left">
                  <h1 className="text-sm font-black uppercase tracking-tighter truncate">{institutionName || "UniPortal"}</h1>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Admin Terminal</p>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white">
                <MdClose size={24} />
              </button>
            </div>

            {/* Navigation with Dropdown support */}
            <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
              {ADMIN_NAV.map((item) => (
                <div key={item.key} className="w-full">
                  {item.children ? (
                    <>
                      <button
                        onClick={() => toggleDropdown(item.key)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-wider
                          ${openDropdown === item.key || activeTab.startsWith(item.key) ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          {item.label}
                        </div>
                        <MdKeyboardArrowDown 
                          size={18} 
                          className={`transition-transform duration-200 ${openDropdown === item.key ? "rotate-180" : ""}`} 
                        />
                      </button>
                      
                      {/* SUB-MENU ITEMS */}
                      <div className={`overflow-hidden transition-all duration-300 ${openDropdown === item.key ? "max-h-48 mt-1" : "max-h-0"}`}>
                        <div className="ml-9 flex flex-col gap-1 border-l border-slate-700 pl-4 py-1">
                          {item.children.map((child) => (
                            <button
                              key={child.key}
                              onClick={() => { setActiveTab(child.key); setSidebarOpen(false); }}
                              className={`w-full text-left py-2 text-[11px] font-bold uppercase tracking-widest transition-colors
                                ${activeTab === child.key ? "text-blue-400" : "text-slate-500 hover:text-slate-200"}`}
                            >
                              {child.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => { setActiveTab(item.key); setSidebarOpen(false); setOpenDropdown(null); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-wider
                        ${activeTab === item.key 
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" 
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  )}
                </div>
              ))}
            </nav>

            {/* Profile Footer */}
            <div className="pt-6 border-t border-slate-800">
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl mb-4">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black border border-slate-600 shrink-0">
                  {initials}
                </div>
                <div className="overflow-hidden text-left">
                  <p className="text-xs font-bold truncate">{adminName}</p>
                  <p className="text-[9px] text-blue-400 font-bold uppercase">System Master</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <MdLogout size={18}/> End Session
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN BODY */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 bg-slate-100 rounded-lg text-slate-600">
                <MdMenu size={24}/>
              </button>
              <h2 className="text-sm md:text-lg font-black text-slate-800 uppercase tracking-tight truncate">
                {activeTab.replace(/([A-Z])/g, ' $1').trim()}
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="p-2 bg-slate-50 text-slate-400 rounded-full hover:text-blue-600 transition-colors">
                <MdNotificationsNone size={24}/>
              </button>
            </div>
          </header>

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