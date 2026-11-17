'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { useAuth } from '@/app/context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  FaChalkboardTeacher,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaFileAlt,
  FaSave,
  FaUsers,
  FaCheckDouble,
  FaLock,
} from 'react-icons/fa';

export default function StaffTeachingAttendancePage() {
  const { user } = useAuth();

  // Retrieve institution ID from Auth Context or fallback session
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

  // Reference Data States
  const [staffList, setStaffList] = useState([]);
  const [semestersList, setSemestersList] = useState([]);
  const [programmesList, setProgrammesList] = useState([]);
  const [allModulesMap, setAllModulesMap] = useState(new Map());
  const [allAllocations, setAllAllocations] = useState([]);
  const [studentsList, setStudentsList] = useState([]);

  // Form Selection States
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('Year 1');
  const [sessionDate, setSessionDate] = useState(() =>
    new Date().toLocaleDateString('en-CA')
  );
  const [topicTaught, setTopicTaught] = useState('');

  // Attendance Map: { [studentId]: { status: 'Present' | 'Late' | 'Absent' | 'Excused', note: '' } }
  const [attendanceMap, setAttendanceMap] = useState({});

  // Loading & Lock States
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [checkingLock, setCheckingLock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [isLockedSubmitted, setIsLockedSubmitted] = useState(false);
  const [lockedSessionMeta, setLockedSessionMeta] = useState(null);

  // Available Academic Years derived from semesters/allocations
  const academicYearOptions = useMemo(() => {
    const years = [...new Set(semestersList.map((s) => s.academicYear).filter(Boolean))];
    return years.length > 0 ? years : ['2025/2026', '2026/2027'];
  }, [semestersList]);

  // Semesters filtered by chosen Academic Year
  const filteredSemesters = useMemo(() => {
    if (!academicYear) return semestersList;
    return semestersList.filter((s) => s.academicYear === academicYear);
  }, [semestersList, academicYear]);

  // ============================================================
  // 1. LOAD BASELINE DATA
  // ============================================================
  useEffect(() => {
    if (!schoolId) {
      setLoadingInit(false);
      return;
    }

    const loadReferenceData = async () => {
      setLoadingInit(true);
      try {
        const [
          staffSnap,
          semSnap,
          progSnap,
          moduleSnap,
          progModuleSnap,
          allocSnap,
        ] = await Promise.all([
          getDocs(
            query(
              collection(db, 'staff'),
              where('institutionID', '==', schoolId),
              where('staffType', '==', 'Academic Staff')
            )
          ),
          getDocs(
            query(
              collection(db, 'semesters'),
              where('institutionId', '==', schoolId)
            )
          ),
          getDocs(
            query(
              collection(db, 'programmes'),
              where('institutionId', '==', schoolId)
            )
          ),
          getDocs(
            query(
              collection(db, 'modules'),
              where('institutionId', '==', schoolId)
            )
          ),
          getDocs(
            query(
              collection(db, 'programme_modules'),
              where('institutionId', '==', schoolId)
            )
          ),
          getDocs(
            query(
              collection(db, 'lecturer_module_allocations'),
              where('institutionId', '==', schoolId)
            )
          ),
        ]);

        const staffData = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const semData = semSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const progData = progSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const allocData = allocSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setStaffList(staffData);
        setSemestersList(semData);
        setProgrammesList(progData);
        setAllAllocations(allocData);

        const combinedModules = [
          ...moduleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...progModuleSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];
        const modMap = new Map();
        combinedModules.forEach((m) => {
          modMap.set(m.id, m);
        });
        setAllModulesMap(modMap);

        if (staffData.length > 0) setSelectedStaffId(staffData[0].id);
        if (semData.length > 0) {
          setAcademicYear(semData[0].academicYear || '2025/2026');
          setSemesterId(semData[0].id);
        } else {
          setAcademicYear('2025/2026');
        }
      } catch (err) {
        console.error('Error loading baseline data:', err);
        setFeedback({
          type: 'error',
          text: 'Failed to load reference data from database.',
        });
      } finally {
        setLoadingInit(false);
      }
    };

    loadReferenceData();
  }, [schoolId]);

  // ============================================================
  // 2. RESOLVE ALLOCATIONS FOR SELECTED STAFF
  // ============================================================
  const selectedStaffObj = useMemo(
    () =>
      staffList.find(
        (s) => s.id === selectedStaffId || s.staffId === selectedStaffId
      ),
    [staffList, selectedStaffId]
  );

  const staffAllocations = useMemo(() => {
    if (!selectedStaffObj) return [];
    const docId = selectedStaffObj.id;
    const codeId = selectedStaffObj.staffId || selectedStaffObj.staffID || '';
    const email = (selectedStaffObj.email || '').toLowerCase();

    return allAllocations.filter((alloc) => {
      const matchDoc = docId && alloc.lecturerId === docId;
      const matchStaff =
        codeId && (alloc.staffId === codeId || alloc.lecturerId === codeId);
      const matchEmail = email && alloc.email?.toLowerCase() === email;

      const matchYear = !academicYear || !alloc.academicYear || alloc.academicYear === academicYear;
      const matchSem = !semesterId || !alloc.semesterId || alloc.semesterId === semesterId;

      return (matchDoc || matchStaff || matchEmail) && matchYear && matchSem;
    });
  }, [selectedStaffObj, allAllocations, academicYear, semesterId]);

  const availableProgrammes = useMemo(() => {
    if (staffAllocations.length > 0) {
      const allocatedProgIds = new Set(
        staffAllocations.map((a) => a.programmeId).filter(Boolean)
      );
      const filtered = programmesList.filter((p) => allocatedProgIds.has(p.id));
      if (filtered.length > 0) return filtered;
    }
    return programmesList;
  }, [staffAllocations, programmesList]);

  const availableModules = useMemo(() => {
    if (!selectedProgrammeId) return [];

    if (staffAllocations.length > 0) {
      const matchingAllocs = staffAllocations.filter(
        (a) =>
          a.programmeId === selectedProgrammeId &&
          (!selectedLevel || a.studyLevel === selectedLevel)
      );
      const allocatedModIds = matchingAllocs.flatMap((a) => a.moduleIds || []);
      if (allocatedModIds.length > 0) {
        const resolved = Array.from(new Set(allocatedModIds))
          .map((id) => allModulesMap.get(id))
          .filter(Boolean);
        if (resolved.length > 0) return resolved;
      }
    }

    const allModsArray = Array.from(allModulesMap.values());
    const progModules = allModsArray.filter(
      (m) =>
        m.programmeId === selectedProgrammeId ||
        m.programmeID === selectedProgrammeId ||
        (Array.isArray(m.programmeIds) &&
          m.programmeIds.includes(selectedProgrammeId))
    );

    return progModules.length > 0 ? progModules : allModsArray;
  }, [selectedProgrammeId, selectedLevel, staffAllocations, allModulesMap]);

  useEffect(() => {
    if (availableModules.length === 0) {
      setSelectedModuleId('');
      return;
    }
    const stillValid = availableModules.some((m) => m.id === selectedModuleId);
    if (!stillValid) {
      setSelectedModuleId(availableModules[0].id);
    }
  }, [availableModules, selectedModuleId]);

  // ============================================================
  // 3. LOAD ENROLLED STUDENTS
  // ============================================================
  useEffect(() => {
    if (!schoolId || !selectedProgrammeId) {
      setStudentsList([]);
      setAttendanceMap({});
      return;
    }

    const loadProgrammeStudents = async () => {
      setLoadingRoster(true);
      setFeedback({ type: '', text: '' });

      try {
        const studQ = query(
          collection(db, 'students'),
          where('institutionID', '==', schoolId),
          where('programmeId', '==', selectedProgrammeId)
        );
        const studSnap = await getDocs(studQ);

        const rawStudents = studSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => !s.status || s.status === 'Active');

        rawStudents.sort((a, b) =>
          (a.fullName || '').localeCompare(b.fullName || '')
        );

        setStudentsList(rawStudents);
      } catch (err) {
        console.error('Error loading students:', err);
        setFeedback({
          type: 'error',
          text: 'Failed to load student roster for this programme.',
        });
      } finally {
        setLoadingRoster(false);
      }
    };

    loadProgrammeStudents();
  }, [schoolId, selectedProgrammeId]);

  const filteredStudents = useMemo(() => {
    return studentsList.filter(
      (s) => !selectedLevel || s.studyLevel === selectedLevel
    );
  }, [studentsList, selectedLevel]);

  // ============================================================
  // 4. DUPLICATE SUBMISSION LOCK CHECK & FRESH ATTENDANCE RESET
  // ============================================================
  const sanitizeKeyPart = (val) =>
    String(val || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-');

  const buildSessionDocId = () => {
    const staffKey = sanitizeKeyPart(
      selectedStaffObj?.staffId || selectedStaffObj?.staffID || selectedStaffId
    );
    const yearKey = sanitizeKeyPart(academicYear);
    const semKey = sanitizeKeyPart(semesterId || 'sem');
    const levelKey = sanitizeKeyPart(selectedLevel || 'Year-1');

    return `${schoolId}_${yearKey}_${semKey}_${staffKey}_${selectedProgrammeId}_${selectedModuleId}_${levelKey}_${sessionDate}`;
  };

  useEffect(() => {
    if (
      !schoolId ||
      !selectedStaffId ||
      !selectedProgrammeId ||
      !selectedModuleId ||
      !sessionDate ||
      !academicYear ||
      filteredStudents.length === 0
    ) {
      setIsLockedSubmitted(false);
      setLockedSessionMeta(null);
      return;
    }

    let cancelled = false;

    const checkExistingSession = async () => {
      setCheckingLock(true);
      try {
        const sessionDocId = buildSessionDocId();
        const sessionRef = doc(db, 'TeachingAttendanceSessions', sessionDocId);
        const sessionSnap = await getDoc(sessionRef);

        if (cancelled) return;

        if (sessionSnap.exists()) {
          const data = sessionSnap.data();
          setIsLockedSubmitted(true);
          setLockedSessionMeta(data);
          setTopicTaught(data.topicTaught || '');

          if (data.records) {
            const loadedMap = {};
            filteredStudents.forEach((st) => {
              const stKey = st.studentId || st.id;
              const rec = data.records[stKey];
              loadedMap[stKey] = {
                status: rec?.status || 'Present',
                note: rec?.note || '',
              };
            });
            setAttendanceMap(loadedMap);
          }
        } else {
          setIsLockedSubmitted(false);
          setLockedSessionMeta(null);
          setTopicTaught('');

          const freshMap = {};
          filteredStudents.forEach((st) => {
            const stKey = st.studentId || st.id;
            freshMap[stKey] = { status: 'Present', note: '' };
          });
          setAttendanceMap(freshMap);
        }
      } catch (err) {
        console.error('Error checking duplicate session:', err);
      } finally {
        if (!cancelled) setCheckingLock(false);
      }
    };

    checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [
    schoolId,
    selectedStaffId,
    selectedProgrammeId,
    selectedModuleId,
    selectedLevel,
    academicYear,
    semesterId,
    sessionDate,
    filteredStudents.length,
  ]);

  // ============================================================
  // 5. STATUS & BULK HANDLERS
  // ============================================================
  const handleStatusChange = (studentKey, newStatus) => {
    if (isLockedSubmitted) return;
    setAttendanceMap((prev) => ({
      ...prev,
      [studentKey]: {
        ...(prev[studentKey] || { note: '' }),
        status: newStatus,
      },
    }));
  };

  const handleNoteChange = (studentKey, noteText) => {
    if (isLockedSubmitted) return;
    setAttendanceMap((prev) => ({
      ...prev,
      [studentKey]: {
        ...(prev[studentKey] || { status: 'Present' }),
        note: noteText,
      },
    }));
  };

  const handleMarkAll = (bulkStatus) => {
    if (isLockedSubmitted) return;
    const updated = { ...attendanceMap };
    filteredStudents.forEach((st) => {
      const key = st.studentId || st.id;
      updated[key] = {
        ...(updated[key] || { note: '' }),
        status: bulkStatus,
      };
    });
    setAttendanceMap(updated);
  };

  const counts = filteredStudents.reduce(
    (acc, st) => {
      const key = st.studentId || st.id;
      const stStatus = attendanceMap[key]?.status || 'Present';
      if (stStatus === 'Present') acc.present += 1;
      else if (stStatus === 'Late') acc.late += 1;
      else if (stStatus === 'Absent') acc.absent += 1;
      else if (stStatus === 'Excused') acc.excused += 1;
      return acc;
    },
    { present: 0, late: 0, absent: 0, excused: 0 }
  );

  // ============================================================
  // 6. SAVE ATTENDANCE WITH TOPIC & DUPLICATE BLOCKING GUARD
  // ============================================================
  const handleSaveAttendance = async (e) => {
    e.preventDefault();

    if (isLockedSubmitted) {
      setFeedback({
        type: 'error',
        text: 'Attendance for this module, academic year, semester, study level, and date has already been submitted and cannot be submitted again.',
      });
      return;
    }

    if (!topicTaught.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please enter the Topic / Lesson Covered before submitting.',
      });
      return;
    }

    if (
      !schoolId ||
      !selectedStaffId ||
      !selectedProgrammeId ||
      !selectedModuleId ||
      !academicYear
    ) {
      setFeedback({
        type: 'error',
        text: 'Please complete all required fields (Academic Year, Staff, Programme, Module).',
      });
      return;
    }

    if (filteredStudents.length === 0) {
      setFeedback({
        type: 'error',
        text: 'No students found matching the selected study level.',
      });
      return;
    }

    setSaving(true);
    setFeedback({ type: '', text: '' });

    try {
      const sessionDocId = buildSessionDocId();
      const sessionRef = doc(db, 'TeachingAttendanceSessions', sessionDocId);

      const existingCheck = await getDoc(sessionRef);
      if (existingCheck.exists()) {
        setIsLockedSubmitted(true);
        setLockedSessionMeta(existingCheck.data());
        setFeedback({
          type: 'error',
          text: 'Duplicate blocked: Attendance for this session has already been recorded.',
        });
        setSaving(false);
        return;
      }

      const progObj = programmesList.find((p) => p.id === selectedProgrammeId);
      const modObj = allModulesMap.get(selectedModuleId);
      const semObj = semestersList.find((s) => s.id === semesterId);

      const titleStr = selectedStaffObj?.title ? `${selectedStaffObj.title} ` : '';
      const staffName = selectedStaffObj
        ? `${titleStr}${selectedStaffObj.fullName || selectedStaffObj.name || ''}`.trim()
        : 'Staff Member';
      const staffCode =
        selectedStaffObj?.staffId || selectedStaffObj?.staffID || selectedStaffId;
      const programmeName =
        progObj?.programmeName || progObj?.title || progObj?.name || 'General';
      const moduleCode = modObj?.moduleCode || modObj?.code || '';
      const moduleTitle =
        modObj?.moduleTitle || modObj?.title || modObj?.moduleName || 'Module';
      const semesterName = semObj?.semesterName || semObj?.name || semesterId;

      const batch = writeBatch(db);
      const recordsSnapshot = {};

      filteredStudents.forEach((student) => {
        const stKey = student.studentId || student.id;
        const fullName = `${student.title || ''} ${student.fullName || ''}`.trim();
        const entry = attendanceMap[stKey] || { status: 'Present', note: '' };

        recordsSnapshot[stKey] = {
          studentId: stKey,
          studentName: fullName,
          studyLevel: student.studyLevel || selectedLevel,
          status: entry.status,
          note: entry.note || '',
        };

        const studentRecordId = `${sessionDocId}_${stKey}`;
        const studentRecordRef = doc(db, 'ModuleAttendance', studentRecordId);

        batch.set(studentRecordRef, {
          institutionID: schoolId,
          sessionId: sessionDocId,
          academicYear,
          semesterId,
          semesterName,
          date: sessionDate,
          staffId: staffCode,
          staffDocId: selectedStaffId,
          staffName,
          programmeId: selectedProgrammeId,
          programmeName,
          moduleId: selectedModuleId,
          moduleCode,
          moduleName: moduleTitle,
          studyLevel: selectedLevel,
          topicTaught: topicTaught.trim(),
          studentId: stKey,
          studentName: fullName,
          status: entry.status,
          note: entry.note || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      const sessionPayload = {
        institutionID: schoolId,
        academicYear,
        semesterId,
        semesterName,
        date: sessionDate,
        staffId: staffCode,
        staffDocId: selectedStaffId,
        staffName,
        programmeId: selectedProgrammeId,
        programmeName,
        moduleId: selectedModuleId,
        moduleCode,
        moduleName: moduleTitle,
        studyLevel: selectedLevel,
        topicTaught: topicTaught.trim(),
        totalStudents: filteredStudents.length,
        summary: counts,
        records: recordsSnapshot,
        locked: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(sessionRef, sessionPayload);
      await batch.commit();

      setIsLockedSubmitted(true);
      setLockedSessionMeta(sessionPayload);
      setFeedback({
        type: 'success',
        text: `Teaching attendance successfully submitted and locked for ${moduleTitle} — "${topicTaught}" (${academicYear}, ${semesterName}, ${sessionDate}).`,
      });
    } catch (err) {
      console.error('Error saving teaching attendance:', err);
      setFeedback({
        type: 'error',
        text: 'Failed to save teaching attendance. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 sm:p-12 space-y-3">
        <div className="w-10 h-10 rounded-xl border-4 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-xs font-bold text-slate-600">
          Loading Academic Terms &amp; Reference Data...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 font-sans bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
            {schoolName} • Lecture &amp; Class Roll Call
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2 mt-0.5">
            <FaChalkboardTeacher className="text-indigo-600 shrink-0" />
            <span>Staff Teaching Attendance</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Record student roll call by academic year, semester, lecturer, programme, and study level.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200 self-start md:self-auto w-full md:w-auto">
          <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Session Date:</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer w-full"
          />
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback.text && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Duplicate Submission Lock Banner */}
      {isLockedSubmitted && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
            <FaLock size={13} />
          </div>
          <div className="text-xs space-y-1">
            <p className="font-black uppercase tracking-wide text-amber-900">
              Attendance Already Submitted &amp; Locked for This Session
            </p>
            <p className="font-medium text-amber-800">
              Attendance for{' '}
              <strong>{lockedSessionMeta?.moduleName || 'this module'}</strong>{' '}
              ({academicYear} • {lockedSessionMeta?.semesterName || 'Semester'} • Level: {selectedLevel}) by{' '}
              <strong>{lockedSessionMeta?.staffName || 'this lecturer'}</strong>{' '}
              on <strong>{sessionDate}</strong> has already been recorded.
              Duplicate submissions for this combination are blocked.
            </p>
          </div>
        </div>
      )}

      {/* Selection Form Card */}
      <form onSubmit={handleSaveAttendance} className="space-y-6">
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
              1. Academic Term, Lecturer &amp; Course Selection
            </h2>
            {checkingLock ? (
              <span className="text-[10px] font-bold text-slate-400">
                Checking submission status...
              </span>
            ) : isLockedSubmitted ? (
              <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 px-3 py-1 rounded-full inline-flex items-center gap-1 self-start">
                <FaLock size={9} /> Submitted (Read-Only)
              </span>
            ) : (
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full self-start">
                ● Open for Submission
              </span>
            )}
          </div>

          {/* Row 1: Academic Year, Semester, Study Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Academic Year <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
              >
                {academicYearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Semester / Term
              </label>
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
              >
                <option value="">-- All Semesters --</option>
                {filteredSemesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.semesterName || s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Study Level <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
              >
                {['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Diploma', 'Certificate', 'Postgraduate / Masters'].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Teacher, Programme, Module */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Teacher / Staff Name <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={selectedStaffId}
                onChange={(e) => {
                  setSelectedStaffId(e.target.value);
                  setSelectedProgrammeId('');
                  setSelectedModuleId('');
                }}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
              >
                <option value="">-- Select Teacher / Staff --</option>
                {staffList.map((st) => {
                  const titleStr = st.title ? `${st.title} ` : '';
                  const displayName = st.fullName
                    ? `${titleStr}${st.fullName}`
                    : `${st.firstName || ''} ${st.lastName || ''}`.trim() || 'Unnamed Staff';
                  return (
                    <option key={st.id} value={st.id}>
                      {displayName} ({st.staffId || st.designation || 'Lecturer'})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Programme / Course <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={selectedProgrammeId}
                onChange={(e) => setSelectedProgrammeId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
              >
                <option value="">-- Select Programme --</option>
                {availableProgrammes.map((prog) => (
                  <option key={prog.id} value={prog.id}>
                    {prog.programmeName || prog.title || prog.name} (
                    {prog.awardType || prog.award || 'General'})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Module / Subject <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                disabled={!selectedProgrammeId || availableModules.length === 0}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="">
                  {!selectedProgrammeId
                    ? '-- Select Programme First --'
                    : availableModules.length === 0
                    ? '-- No Modules Found --'
                    : '-- Select Module --'}
                </option>
                {availableModules.map((mod) => {
                  const code = mod.moduleCode || mod.code || '';
                  const title =
                    mod.moduleTitle ||
                    mod.title ||
                    mod.moduleName ||
                    'Untitled Module';
                  return (
                    <option key={mod.id} value={mod.id}>
                      {code ? `${code} - ` : ''}
                      {title}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Row 3: Mandatory Topic Covered */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Topic / Lesson Covered <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isLockedSubmitted}
              value={topicTaught}
              onChange={(e) => setTopicTaught(e.target.value)}
              placeholder="e.g., Week 4: Relational Database Normalization & SQL Joins"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-60"
            />
          </div>
        </div>

        {/* Student Roster Section */}
        {selectedProgrammeId && (
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <FaUsers />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    2. Student Roll Call ({filteredStudents.length} Students for {selectedLevel})
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {isLockedSubmitted
                      ? 'Submitted roll call record (read-only)'
                      : "Mark attendance status and optionally write behavioral notes for each student"}
                  </p>
                </div>
              </div>

              {filteredStudents.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl">
                    Present: {counts.present}
                  </span>
                  <span className="text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl">
                    Late: {counts.late}
                  </span>
                  <span className="text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-xl">
                    Absent: {counts.absent}
                  </span>
                  <span className="text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-xl">
                    Excused: {counts.excused}
                  </span>

                  {!isLockedSubmitted && (
                    <button
                      type="button"
                      onClick={() => handleMarkAll('Present')}
                      className="ml-auto sm:ml-1 text-[11px] font-extrabold bg-slate-900 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <FaCheckDouble size={10} /> Mark All Present
                    </button>
                  )}
                </div>
              )}
            </div>

            {loadingRoster ? (
              <div className="py-12 text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                Loading enrolled students...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                No active students found matching {selectedLevel} under this programme.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Student Name &amp; ID</th>
                      {/* <th className="px-4 py-3 text-left">Level</th> */}
                      <th className="px-4 py-3 text-center">Attendance Action</th>
                      <th className="px-4 py-3 text-left">Behavioral Remark / Note (Optional)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredStudents.map((student) => {
                      const stKey = student.studentId || student.id;
                      const currentEntry = attendanceMap[stKey] || {
                        status: 'Present',
                        note: '',
                      };

                      return (
                        <tr
                          key={student.id}
                          className="hover:bg-slate-50/70 transition-colors align-top"
                        >
                          <td className="px-4 py-3.5 flex items-center gap-3">
                            {student.passportPhotoUrl ? (
                              <img
                                src={student.passportPhotoUrl}
                                alt={student.fullName}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 mt-0.5 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs mt-0.5 shrink-0">
                                {student.fullName?.charAt(0) || 'S'}
                              </div>
                            )}
                            <div className="min-w-[180px]">
                              <div className="font-extrabold text-slate-900 whitespace-normal break-words">
                                {student.title || ''} {student.fullName}
                              </div>
                              <div className="font-mono text-[10px] font-bold text-slate-500 mt-0.5">
                                ID: {stKey}
                              </div>
                            </div>
                          </td>

                          {/* <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                              {student.studyLevel || selectedLevel}
                            </span>
                          </td> */}

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                disabled={isLockedSubmitted}
                                onClick={() =>
                                  handleStatusChange(stKey, 'Present')
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition ${
                                  isLockedSubmitted
                                    ? 'cursor-not-allowed opacity-80'
                                    : 'cursor-pointer'
                                } ${
                                  currentEntry.status === 'Present'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                                }`}
                              >
                                <FaCheckCircle size={10} /> Present
                              </button>

                              <button
                                type="button"
                                disabled={isLockedSubmitted}
                                onClick={() => handleStatusChange(stKey, 'Late')}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition ${
                                  isLockedSubmitted
                                    ? 'cursor-not-allowed opacity-80'
                                    : 'cursor-pointer'
                                } ${
                                  currentEntry.status === 'Late'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                                }`}
                              >
                                <FaClock size={10} /> Late
                              </button>

                              <button
                                type="button"
                                disabled={isLockedSubmitted}
                                onClick={() =>
                                  handleStatusChange(stKey, 'Absent')
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition ${
                                  isLockedSubmitted
                                    ? 'cursor-not-allowed opacity-80'
                                    : 'cursor-pointer'
                                } ${
                                  currentEntry.status === 'Absent'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                }`}
                              >
                                <FaTimesCircle size={10} /> Absent
                              </button>

                              <button
                                type="button"
                                disabled={isLockedSubmitted}
                                onClick={() =>
                                  handleStatusChange(stKey, 'Excused')
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition ${
                                  isLockedSubmitted
                                    ? 'cursor-not-allowed opacity-80'
                                    : 'cursor-pointer'
                                } ${
                                  currentEntry.status === 'Excused'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                                }`}
                              >
                                <FaFileAlt size={10} /> Excuse
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 min-w-[220px]">
                            <textarea
                              rows={2}
                              disabled={isLockedSubmitted}
                              value={currentEntry.note || ''}
                              onChange={(e) =>
                                handleNoteChange(stKey, e.target.value)
                              }
                              placeholder={
                                isLockedSubmitted
                                  ? '—'
                                  : 'Write notes on class participation, behavior, attitude...'
                              }
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-800 outline-none focus:bg-white focus:border-indigo-400 disabled:opacity-60 resize-y"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredStudents.length > 0 && (
              <div className="flex justify-end pt-3 border-t border-slate-100">
                {isLockedSubmitted ? (
                  <div className="bg-slate-200 text-slate-600 text-xs font-extrabold px-6 py-3.5 rounded-2xl flex items-center gap-2 select-none w-full sm:w-auto justify-center">
                    <FaLock />
                    <span>Already Submitted for {sessionDate}</span>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={saving || checkingLock}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-8 py-3.5 rounded-2xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving Attendance...</span>
                      </>
                    ) : (
                      <>
                        <FaSave />
                        <span>Submit Teaching Attendance</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}