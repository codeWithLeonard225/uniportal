'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  FaChalkboardTeacher,
  FaSearch,
  FaBookOpen,
  FaUsers,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaFileAlt,
  FaEnvelope,
  FaPhone,
  FaLayerGroup,
  FaCalendarAlt,
} from 'react-icons/fa';

export default function StaffTeachingReportPage() {
  const { user } = useAuth();

  // Retrieve institution ID from Auth Context or stored session
  const [localUserData, setLocalUserData] = useState(null);

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('schoolUser') ||
        localStorage.getItem('user') ||
        localStorage.getItem('authUser') ||
        localStorage.getItem('session');
      if (stored) setLocalUserData(JSON.parse(stored));
    } catch (e) {
      console.error('Error loading session:', e);
    }
  }, []);

  const schoolId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    '';

  const schoolName =
    user?.institutionName ||
    user?.schoolName ||
    localUserData?.institutionName ||
    'LeoTech Academy';

  // Data States
  const [staffList, setStaffList] = useState([]);
  const [sessionsList, setSessionsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection & Filter States
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('All');
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState('All');
  const [selectedTopicSessionId, setSelectedTopicSessionId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Present' | 'Late' | 'Absent' | 'Excused'

  // ============================================================
  // 1. FETCH STAFF & TEACHING ATTENDANCE SESSIONS
  // ============================================================
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [staffSnap, sessionsSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'staff'),
              where('institutionID', '==', schoolId)
            )
          ),
          getDocs(
            query(
              collection(db, 'TeachingAttendanceSessions'),
              where('institutionID', '==', schoolId)
            )
          ),
        ]);

        const rawStaff = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rawStaff.sort((a, b) =>
          (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '')
        );
        setStaffList(rawStaff);

        const rawSessions = sessionsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        rawSessions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setSessionsList(rawSessions);

        if (rawStaff.length > 0) {
          setSelectedStaffId(rawStaff[0].id);
        }
      } catch (err) {
        console.error('Error loading staff teaching report data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolId]);

  // ============================================================
  // 2. EXTRACT UNIQUE ACADEMIC YEARS & SEMESTERS FROM SESSIONS
  // ============================================================
  const availableAcademicYears = useMemo(() => {
    const years = new Set();
    sessionsList.forEach((s) => {
      if (s.academicYear) years.add(s.academicYear);
    });
    return ['All', ...Array.from(years).sort().reverse()];
  }, [sessionsList]);

  const availableSemesters = useMemo(() => {
    const sems = new Set();
    sessionsList.forEach((s) => {
      if (selectedAcademicYear === 'All' || s.academicYear === selectedAcademicYear) {
        if (s.semesterName) sems.add(s.semesterName);
      }
    });
    return ['All', ...Array.from(sems).sort()];
  }, [sessionsList, selectedAcademicYear]);

  // ============================================================
  // 3. RESOLVE SELECTED TEACHER & THEIR SESSIONS (Filtered by Year & Semester)
  // ============================================================
  const selectedStaffObj = useMemo(() => {
    return staffList.find((s) => s.id === selectedStaffId);
  }, [staffList, selectedStaffId]);

  const teacherSessions = useMemo(() => {
    if (!selectedStaffObj) return [];
    const docId = selectedStaffObj.id;
    const staffCode = selectedStaffObj.staffId || selectedStaffObj.staffID || '';
    const staffFullName = `${selectedStaffObj.title || ''} ${
      selectedStaffObj.fullName || selectedStaffObj.name || ''
    }`
      .trim()
      .toLowerCase();

    return sessionsList.filter((session) => {
      const matchDocId =
        session.staffDocId === docId || session.staffId === docId;
      const matchCode = staffCode && session.staffId === staffCode;
      const matchName =
        session.staffName &&
        staffFullName &&
        session.staffName.toLowerCase().includes(staffFullName);

      if (!matchDocId && !matchCode && !matchName) return false;

      // Academic Year Filter
      if (
        selectedAcademicYear !== 'All' &&
        session.academicYear !== selectedAcademicYear
      ) {
        return false;
      }

      // Semester Filter
      if (
        selectedSemester !== 'All' &&
        session.semesterName !== selectedSemester
      ) {
        return false;
      }

      return true;
    });
  }, [selectedStaffObj, sessionsList, selectedAcademicYear, selectedSemester]);

  // ============================================================
  // 4. EXTRACT UNIQUE MODULES FOR THE SELECTED TEACHER
  // ============================================================
  const teacherModules = useMemo(() => {
    const modMap = new Map();
    teacherSessions.forEach((s) => {
      const modKey = s.moduleId || s.moduleName || 'General';
      if (!modMap.has(modKey)) {
        modMap.set(modKey, {
          key: modKey,
          moduleCode: s.moduleCode || '',
          moduleName: s.moduleName || 'Unnamed Module',
          programmeName: s.programmeName || '',
        });
      }
    });
    return Array.from(modMap.values());
  }, [teacherSessions]);

  // ============================================================
  // 5. FILTER SESSIONS BY MODULE & SEARCH TERM
  // ============================================================
  const filteredSessions = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return teacherSessions.filter((s) => {
      const modKey = s.moduleId || s.moduleName || 'General';
      const matchesModule =
        selectedModuleFilter === 'All' || modKey === selectedModuleFilter;

      if (!matchesModule) return false;
      if (!search) return true;

      const combined = [
        s.topicTaught,
        s.moduleName,
        s.moduleCode,
        s.programmeName,
        s.date,
      ]
        .join(' ')
        .toLowerCase();
      return combined.includes(search);
    });
  }, [teacherSessions, selectedModuleFilter, searchTerm]);

  // Keep topic dropdown synced when module, year, semester, or lecturer changes
  useEffect(() => {
    if (filteredSessions.length > 0) {
      if (
        !selectedTopicSessionId ||
        !filteredSessions.some((s) => s.id === selectedTopicSessionId)
      ) {
        setSelectedTopicSessionId(filteredSessions[0].id);
      }
    } else {
      setSelectedTopicSessionId('');
    }
  }, [filteredSessions, selectedTopicSessionId]);

  // Active selected session object for viewing student breakdown
  const activeSessionObj = useMemo(() => {
    if (!selectedTopicSessionId) return filteredSessions[0] || null;
    return (
      filteredSessions.find((s) => s.id === selectedTopicSessionId) ||
      filteredSessions[0] ||
      null
    );
  }, [selectedTopicSessionId, filteredSessions]);

  // Student roll call list filtered by status pill
  const displayedStudentRecords = useMemo(() => {
    if (!activeSessionObj?.records) return [];
    const allRecords = Object.values(activeSessionObj.records);
    if (statusFilter === 'All') return allRecords;
    return allRecords.filter(
      (r) => (r.status || 'Present').toLowerCase() === statusFilter.toLowerCase()
    );
  }, [activeSessionObj, statusFilter]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-10 h-10 rounded-xl border-4 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-xs font-bold text-slate-600">
          Loading Staff Teaching Reports...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
            {schoolName} • Faculty Lecture Audit &amp; Delivery Tracking
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2 mt-0.5">
            <FaChalkboardTeacher className="text-indigo-600" />
            <span>Staff Teaching &amp; Lecture Reports</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Filter by academic term, instructor, module, and topic to inspect attendance roll call.
          </p>
        </div>

        {/* Filters Group: Academic Year & Semester */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Academic Year Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
            <FaCalendarAlt className="text-indigo-600 text-xs" />
            <span className="text-[11px] font-bold text-slate-600">Year:</span>
            <select
              value={selectedAcademicYear}
              onChange={(e) => {
                setSelectedAcademicYear(e.target.value);
                setSelectedSemester('All');
                setSelectedModuleFilter('All');
                setSelectedTopicSessionId('');
              }}
              className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer"
            >
              {availableAcademicYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600">Sem:</span>
            <select
              value={selectedSemester}
              onChange={(e) => {
                setSelectedSemester(e.target.value);
                setSelectedModuleFilter('All');
                setSelectedTopicSessionId('');
              }}
              className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer"
            >
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lecturer Selection Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
            Select Lecturer:
          </label>
          <select
            value={selectedStaffId}
            onChange={(e) => {
              setSelectedStaffId(e.target.value);
              setSelectedModuleFilter('All');
              setSelectedTopicSessionId('');
              setSearchTerm('');
              setStatusFilter('All');
            }}
            className="bg-slate-50 px-3.5 py-2.5 rounded-2xl text-xs font-black text-indigo-700 border border-slate-200 outline-none cursor-pointer w-full md:w-80"
          >
            {staffList.map((st) => (
              <option key={st.id} value={st.id}>
                {st.title || ''} {st.fullName || st.name} (
                {st.staffId || st.role || 'Staff'})
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <strong className="text-indigo-600 font-bold">{teacherSessions.length}</strong> sessions for selected filters.
        </div>
      </div>

      {/* Selected Teacher Details Card */}
      {selectedStaffObj && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
          <div className="flex items-center gap-4 md:col-span-2">
            {selectedStaffObj.passportPhotoUrl ? (
              <img
                src={selectedStaffObj.passportPhotoUrl}
                alt=""
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-xs"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xl">
                {selectedStaffObj.fullName?.charAt(0) || 'T'}
              </div>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900">
                {selectedStaffObj.title || ''}{' '}
                {selectedStaffObj.fullName || selectedStaffObj.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono">
                  ID: {selectedStaffObj.staffId || selectedStaffObj.id}
                </span>
                <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">
                  Role: {selectedStaffObj.role || 'Lecturer / Staff'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
            <div className="flex items-center gap-2">
              <FaEnvelope className="text-indigo-600" />
              <span className="truncate">
                {selectedStaffObj.email || 'No email recorded'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FaPhone className="text-indigo-600" />
              <span>
                {selectedStaffObj.phone ||
                  selectedStaffObj.phoneNumber ||
                  'No phone recorded'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-around bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400">
                Filtered Lectures
              </span>
              <p className="text-xl font-black text-indigo-600 mt-0.5">
                {teacherSessions.length}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400">
                Modules Taught
              </span>
              <p className="text-xl font-black text-emerald-600 mt-0.5">
                {teacherModules.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Module & Lecture Lesson Cascading Dropdown Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <FaBookOpen className="text-indigo-600" />
              <span>
                Filter by Module &amp; Lecture Topic ({filteredSessions.length}{' '}
                Sessions)
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Filter by module first, then pick the specific topic/lesson to inspect attendance
            </p>
          </div>

          {/* Search keyword */}
          <div className="relative w-full md:w-72">
            <FaSearch className="absolute left-3.5 top-3.5 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="Search topic keyword or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:bg-white"
            />
          </div>
        </div>

        {/* 2-Column Cascading Dropdowns: Module -> Lecture Topic */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Module Dropdown (5 cols) */}
          <div className="md:col-span-5">
            <label className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FaLayerGroup className="text-indigo-600 text-[10px]" />
              <span>1. Filter Module</span>
            </label>
            <select
              value={selectedModuleFilter}
              onChange={(e) => {
                setSelectedModuleFilter(e.target.value);
                setSelectedTopicSessionId('');
                setStatusFilter('All');
              }}
              disabled={teacherModules.length === 0}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              <option value="All">
                All Modules ({teacherModules.length})
              </option>
              {teacherModules.map((mod) => (
                <option key={mod.key} value={mod.key}>
                  {mod.moduleCode ? `${mod.moduleCode} - ` : ''}
                  {mod.moduleName}
                </option>
              ))}
            </select>
          </div>

          {/* Topic / Lecture Lesson Dropdown (7 cols) */}
          <div className="md:col-span-7">
            <label className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FaBookOpen className="text-indigo-600 text-[10px]" />
              <span>2. Select Lecture Lesson / Topic</span>
            </label>
            <select
              value={selectedTopicSessionId}
              onChange={(e) => {
                setSelectedTopicSessionId(e.target.value);
                setStatusFilter('All');
              }}
              disabled={filteredSessions.length === 0}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              {filteredSessions.length === 0 ? (
                <option value="">
                  -- No lecture sessions match this term/module filter --
                </option>
              ) : (
                filteredSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    📅 {s.date} | 🎯 {s.topicTaught || 'General Lecture'} (
                    {s.moduleCode || s.moduleName} • {s.totalStudents || 0}{' '}
                    Students)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Student Roll Call Breakdown for Selected Lesson */}
      {activeSessionObj && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  Active Lesson Roll Call
                </span>
                {activeSessionObj.academicYear && (
                  <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
                    {activeSessionObj.academicYear}
                  </span>
                )}
                {activeSessionObj.semesterName && (
                  <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
                    {activeSessionObj.semesterName}
                  </span>
                )}
              </div>
              <h2 className="text-base font-black text-slate-900 mt-2">
                {activeSessionObj.topicTaught || 'General Lecture Session'}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                <strong className="text-slate-800">Module:</strong>{' '}
                {activeSessionObj.moduleName} (
                {activeSessionObj.moduleCode || 'N/A'}) •{' '}
                <strong className="text-slate-800">Programme:</strong>{' '}
                {activeSessionObj.programmeName} •{' '}
                <strong className="text-slate-800">Date:</strong>{' '}
                {activeSessionObj.date}
              </p>
            </div>

            {/* Interactive Summary Filter Pills */}
            {activeSessionObj.summary && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter('All')}
                  className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    statusFilter === 'All'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All ({activeSessionObj.totalStudents || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Present')}
                  className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    statusFilter === 'Present'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  Present ({activeSessionObj.summary.present || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Late')}
                  className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    statusFilter === 'Late'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  Late ({activeSessionObj.summary.late || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Absent')}
                  className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    statusFilter === 'Absent'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  Absent ({activeSessionObj.summary.absent || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Excused')}
                  className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    statusFilter === 'Excused'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  Excused ({activeSessionObj.summary.excused || 0})
                </button>
              </div>
            )}
          </div>

          {/* Students Table */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <FaUsers className="text-indigo-600" />
              <span>
                Student Roll Call ({displayedStudentRecords.length}{' '}
                {statusFilter === 'All' ? 'Total' : statusFilter})
              </span>
            </h3>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left">Student Name</th>
                    <th className="px-4 py-3 text-left">ID</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Behavioral Remark / Note</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {displayedStudentRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="py-12 text-center text-slate-400 font-bold"
                      >
                        No students found under &quot;{statusFilter}&quot; for
                        this lesson.
                      </td>
                    </tr>
                  ) : (
                    displayedStudentRecords.map((stRecord) => {
                      const status = (
                        stRecord.status || 'Present'
                      ).toLowerCase();
                      let statusBadge =
                        'bg-emerald-50 text-emerald-700 border-emerald-200';
                      let StatusIcon = FaCheckCircle;

                      if (status === 'late') {
                        statusBadge =
                          'bg-amber-50 text-amber-700 border-amber-200';
                        StatusIcon = FaClock;
                      } else if (status === 'absent') {
                        statusBadge =
                          'bg-rose-50 text-rose-700 border-rose-200';
                        StatusIcon = FaTimesCircle;
                      } else if (status === 'excused') {
                        statusBadge =
                          'bg-indigo-50 text-indigo-700 border-indigo-200';
                        StatusIcon = FaFileAlt;
                      }

                      return (
                        <tr
                          key={stRecord.studentId}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="px-4 py-3 font-extrabold text-slate-900">
                            {stRecord.studentName}
                          </td>

                          <td className="px-4 py-3 font-mono font-bold text-slate-600">
                            {stRecord.studentId}
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-3 py-1 rounded-xl text-[10px] font-black border inline-flex items-center gap-1.5 ${statusBadge}`}
                            >
                              <StatusIcon size={10} />
                              <span className="capitalize">
                                {stRecord.status}
                              </span>
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-600 font-medium">
                            {stRecord.note ? (
                              <span className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 block">
                                {stRecord.note}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}